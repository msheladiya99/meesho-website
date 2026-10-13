import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { ReturnOrder } from '../models/ReturnOrder';
import { authenticate, requireManagerOrAdmin, enforceAccountAccess, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit.service';
import { recordStockMovement } from '../services/inventory.service';

const router = Router();
router.use(authenticate);

const accountFilter = (accountId?: string): Record<string, unknown> =>
  accountId && accountId !== 'all' ? { businessAccount: new mongoose.Types.ObjectId(accountId) } : {};

// GET /api/returns
router.get('/', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate, search, page = '1', limit = '100' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { isDeleted: false, ...accountFilter(accountId) };
    if (startDate || endDate) {
      filter.returnDate = {};
      if (startDate) (filter.returnDate as Record<string, unknown>)['$gte'] = new Date(startDate);
      if (endDate) (filter.returnDate as Record<string, unknown>)['$lte'] = new Date(endDate + 'T23:59:59.999Z');
    }
    if (search) filter.$or = [{ meeshoOrderId: { $regex: search, $options: 'i' } }];

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [returns, total] = await Promise.all([
      ReturnOrder.find(filter).populate('product', 'name sku').populate('businessAccount', 'name gstin').sort({ returnDate: -1 }).skip(skip).limit(parseInt(limit)),
      ReturnOrder.countDocuments(filter),
    ]);
    res.json({ success: true, data: returns, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/returns/:id
router.get('/:id', async (req, res: Response): Promise<void> => {
  try {
    const r = await ReturnOrder.findById(req.params.id).populate('product').populate('businessAccount');
    if (!r || r.isDeleted) { res.status(404).json({ success: false, message: 'Return not found' }); return; }
    res.json({ success: true, data: r });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /api/returns
router.post('/', requireManagerOrAdmin, enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      businessAccount, returnDate, originalOrder, meeshoOrderId, product,
      returnedQuantity, originalSellingPrice, returnAmount, returnReason,
      itemCondition, stockDisposition, notes,
    } = req.body;

    if (!businessAccount) { res.status(400).json({ success: false, message: 'businessAccount is required' }); return; }

    const returnOrder = await ReturnOrder.create({
      businessAccount, returnDate, originalOrder: originalOrder || undefined,
      meeshoOrderId: meeshoOrderId || undefined, product,
      returnedQuantity, originalSellingPrice, returnAmount,
      returnReason, itemCondition: itemCondition || 'pending_inspection',
      stockDisposition: stockDisposition || 'pending',
      stockRestored: false,
      notes, createdBy: req.user?._id,
    });

    // Only add stock back if condition is sellable AND disposition is restock
    if (itemCondition === 'sellable' && stockDisposition === 'restock') {
      await recordStockMovement({
        businessAccount,
        productId: product,
        movementType: 'return_in',
        quantity: returnedQuantity,
        referenceType: 'ReturnOrder',
        referenceId: returnOrder._id.toString(),
        reason: 'Sellable return restocked',
        createdBy: req.user?._id,
      });
      await ReturnOrder.findByIdAndUpdate(returnOrder._id, { stockRestored: true });
    }

    await createAuditLog({ action: 'CREATE', resource: 'ReturnOrder', resourceId: returnOrder._id.toString(), userId: req.user?._id });
    const populated = await ReturnOrder.findById(returnOrder._id).populate('product', 'name sku').populate('businessAccount', 'name gstin');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// PUT /api/returns/:id
router.put('/:id', requireManagerOrAdmin, enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await ReturnOrder.findById(req.params.id);
    if (!existing || existing.isDeleted) { res.status(404).json({ success: false, message: 'Return not found' }); return; }

    const { itemCondition, stockDisposition, returnedQuantity } = req.body;

    // Handle stock restoration change
    const shouldRestock = itemCondition === 'sellable' && stockDisposition === 'restock';
    const wasRestocked = existing.stockRestored;

    if (shouldRestock && !wasRestocked) {
      await recordStockMovement({
        businessAccount: existing.businessAccount.toString(),
        productId: existing.product.toString(),
        movementType: 'return_in',
        quantity: returnedQuantity || existing.returnedQuantity,
        referenceType: 'ReturnOrder',
        referenceId: existing._id.toString(),
        reason: 'Sellable return restocked after update',
        createdBy: req.user?._id,
      });
      req.body.stockRestored = true;
    } else if (!shouldRestock && wasRestocked) {
      // Remove the previously restocked stock
      await recordStockMovement({
        businessAccount: existing.businessAccount.toString(),
        productId: existing.product.toString(),
        movementType: 'return_out',
        quantity: -(existing.returnedQuantity),
        referenceType: 'ReturnOrder',
        referenceId: existing._id.toString(),
        reason: 'Return disposition changed — stock removed',
        createdBy: req.user?._id,
      });
      req.body.stockRestored = false;
    }

    const updated = await ReturnOrder.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('product', 'name sku').populate('businessAccount', 'name gstin');

    await createAuditLog({ action: 'UPDATE', resource: 'ReturnOrder', resourceId: req.params.id, userId: req.user?._id });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// DELETE /api/returns/:id
router.delete('/:id', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ret = await ReturnOrder.findById(req.params.id);
    if (!ret || ret.isDeleted) { res.status(404).json({ success: false, message: 'Return not found' }); return; }

    // Reverse stock restoration if it happened
    if (ret.stockRestored) {
      await recordStockMovement({
        businessAccount: ret.businessAccount.toString(),
        productId: ret.product.toString(),
        movementType: 'adjustment',
        quantity: -ret.returnedQuantity,
        referenceType: 'ReturnReversal',
        referenceId: ret._id.toString(),
        reason: 'Return deleted — reversing stock restoration',
        createdBy: req.user?._id,
      });
    }

    await ReturnOrder.findByIdAndUpdate(req.params.id, { isDeleted: true });
    await createAuditLog({ action: 'DELETE', resource: 'ReturnOrder', resourceId: req.params.id, userId: req.user?._id });
    res.json({ success: true, message: 'Return deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/returns/summary/category
router.get('/summary/category', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { isDeleted: false, ...accountFilter(accountId) };
    if (startDate || endDate) {
      filter.returnDate = {};
      if (startDate) (filter.returnDate as Record<string, unknown>)['$gte'] = new Date(startDate);
      if (endDate) (filter.returnDate as Record<string, unknown>)['$lte'] = new Date(endDate + 'T23:59:59.999Z');
    }

    const result = await ReturnOrder.aggregate([
      { $match: filter },
      { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'productDoc' } },
      { $unwind: '$productDoc' },
      { $lookup: { from: 'categories', localField: 'productDoc.category', foreignField: '_id', as: 'categoryDoc' } },
      { $unwind: { path: '$categoryDoc', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$categoryDoc._id', category: { $first: '$categoryDoc.name' }, qty: { $sum: '$returnedQuantity' }, amount: { $sum: '$returnAmount' } } },
      { $sort: { qty: -1 } },
    ]);

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
