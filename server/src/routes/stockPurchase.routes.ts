import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { StockPurchase } from '../models/StockPurchase';
import { authenticate, requireManagerOrAdmin, enforceAccountAccess, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit.service';
import { recordStockMovement, reverseMovementsByReference } from '../services/inventory.service';

const router = Router();
router.use(authenticate);

const accountFilter = (accountId?: string): Record<string, unknown> =>
  accountId && accountId !== 'all' ? { businessAccount: new mongoose.Types.ObjectId(accountId) } : {};

// GET /api/stock-purchases
router.get('/', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate, page = '1', limit = '100' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { isDeleted: false, ...accountFilter(accountId) };
    if (startDate || endDate) {
      filter.purchaseDate = {};
      if (startDate) (filter.purchaseDate as Record<string, unknown>)['$gte'] = new Date(startDate);
      if (endDate) (filter.purchaseDate as Record<string, unknown>)['$lte'] = new Date(endDate + 'T23:59:59.999Z');
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [purchases, total] = await Promise.all([
      StockPurchase.find(filter)
        .populate('vendor', 'name')
        .populate('items.product', 'name sku')
        .populate('businessAccount', 'name gstin')
        .sort({ purchaseDate: -1 }).skip(skip).limit(parseInt(limit)),
      StockPurchase.countDocuments(filter),
    ]);
    res.json({ success: true, data: purchases, total });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/stock-purchases/:id
router.get('/:id', async (req, res: Response): Promise<void> => {
  try {
    const p = await StockPurchase.findById(req.params.id).populate('vendor').populate('items.product').populate('businessAccount');
    if (!p || p.isDeleted) { res.status(404).json({ success: false, message: 'Purchase not found' }); return; }
    res.json({ success: true, data: p });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /api/stock-purchases
router.post('/', requireManagerOrAdmin, enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { businessAccount, items, totalAmount } = req.body;
    if (!businessAccount) { res.status(400).json({ success: false, message: 'businessAccount is required' }); return; }
    if (!items || !Array.isArray(items) || items.length === 0) { res.status(400).json({ success: false, message: 'items array is required' }); return; }

    const purchase = await StockPurchase.create({ ...req.body, createdBy: req.user?._id });

    // Record stock movement for each item
    for (const item of items) {
      const unitCostForMovement = item.quantityPurchased > 0 ? Math.round(item.totalAmount / item.quantityPurchased) : item.purchasePricePerUnit;
      await recordStockMovement({
        businessAccount,
        productId: item.product,
        movementType: 'purchase',
        quantity: item.quantityPurchased,
        unitCost: unitCostForMovement,
        referenceType: 'StockPurchase',
        referenceId: purchase._id.toString(),
        reason: `Stock purchase from vendor`,
        createdBy: req.user?._id,
      });
    }

    await createAuditLog({ action: 'CREATE', resource: 'StockPurchase', resourceId: purchase._id.toString(), userId: req.user?._id });
    const populated = await StockPurchase.findById(purchase._id).populate('vendor', 'name').populate('items.product', 'name sku').populate('businessAccount', 'name gstin');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// PUT /api/stock-purchases/:id
router.put('/:id', requireManagerOrAdmin, enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await StockPurchase.findById(req.params.id);
    if (!existing || existing.isDeleted) { res.status(404).json({ success: false, message: 'Purchase not found' }); return; }

    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) { res.status(400).json({ success: false, message: 'items array is required' }); return; }

    // Reverse old movements, then re-record with new values
    await reverseMovementsByReference(req.params.id, req.user?._id);

    const updated = await StockPurchase.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) { res.status(404).json({ success: false, message: 'Not found' }); return; }

    // Record stock movement for each item
    for (const item of updated.items) {
      const unitCostForMovement = item.quantityPurchased > 0 ? Math.round(item.totalAmount / item.quantityPurchased) : item.purchasePricePerUnit;
      await recordStockMovement({
        businessAccount: updated.businessAccount.toString(),
        productId: item.product.toString(),
        movementType: 'purchase',
        quantity: item.quantityPurchased,
        unitCost: unitCostForMovement,
        referenceType: 'StockPurchase',
        referenceId: updated._id.toString(),
        reason: 'Stock purchase updated — re-recorded',
        createdBy: req.user?._id,
      });
    }

    await createAuditLog({ action: 'UPDATE', resource: 'StockPurchase', resourceId: req.params.id, userId: req.user?._id });
    const populated = await StockPurchase.findById(updated._id).populate('vendor', 'name').populate('items.product', 'name sku').populate('businessAccount', 'name gstin');
    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// DELETE /api/stock-purchases/:id
router.delete('/:id', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const purchase = await StockPurchase.findById(req.params.id);
    if (!purchase || purchase.isDeleted) { res.status(404).json({ success: false, message: 'Purchase not found' }); return; }

    await reverseMovementsByReference(req.params.id, req.user?._id);
    await StockPurchase.findByIdAndUpdate(req.params.id, { isDeleted: true });
    await createAuditLog({ action: 'DELETE', resource: 'StockPurchase', resourceId: req.params.id, userId: req.user?._id });
    res.json({ success: true, message: 'Purchase deleted and stock reversed' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
