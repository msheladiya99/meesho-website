import { Router, Response } from 'express';
import { Product } from '../models/Product';
import { StockMovement } from '../models/StockMovement';
import { authenticate, requireManagerOrAdmin, AuthRequest } from '../middleware/auth';
import { recordStockMovement } from '../services/inventory.service';
import { createAuditLog } from '../services/audit.service';

const router = Router();
router.use(authenticate);

// GET /api/inventory — list products with current stock
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId: _acc, search, categoryId } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { isActive: true };
    if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { sku: { $regex: search, $options: 'i' } }];
    if (categoryId && categoryId !== 'all') filter.category = categoryId;

    const products = await Product.find(filter).populate('category', 'name').sort({ name: 1 });
    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/inventory/:productId/movements — stock ledger for a product
router.get('/:productId/movements', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = '1', limit = '50', accountId } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { product: req.params.productId };
    if (accountId && accountId !== 'all') filter.businessAccount = accountId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [movements, total] = await Promise.all([
      StockMovement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      StockMovement.countDocuments(filter),
    ]);
    res.json({ success: true, data: movements, total });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /api/inventory/:productId/adjust — manual adjustment
router.post('/:productId/adjust', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { quantity, reason, accountId } = req.body;
    if (!accountId) { res.status(400).json({ success: false, message: 'accountId is required for adjustments' }); return; }
    if (!quantity || quantity === 0) { res.status(400).json({ success: false, message: 'quantity cannot be zero' }); return; }

    await recordStockMovement({
      businessAccount: accountId,
      productId: req.params.productId,
      movementType: 'adjustment',
      quantity: parseInt(quantity),
      reason: reason || 'Manual adjustment',
      createdBy: req.user?._id,
    });

    await createAuditLog({
      action: 'UPDATE', resource: 'Inventory', resourceId: req.params.productId, userId: req.user?._id,
      details: `Manual stock adjustment: ${quantity > 0 ? '+' : ''}${quantity} — ${reason}`,
    });

    const updated = await Product.findById(req.params.productId).populate('category', 'name');
    res.json({ success: true, data: updated, message: 'Stock adjusted' });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

export default router;
