import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { BusinessAccount } from '../models/BusinessAccount';
import { StockMovement } from '../models/StockMovement';
import { authenticate, requireManagerOrAdmin, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit.service';
import { resolveStockAccountIds } from '../services/inventory.service';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, categoryId, accountId, page = '1', limit = '100' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};
    if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { sku: { $regex: search, $options: 'i' } }];
    if (categoryId) filter.category = categoryId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [products, total] = await Promise.all([
      Product.find(filter).populate('category').skip(skip).limit(parseInt(limit)).sort({ name: 1 }),
      Product.countDocuments(filter),
    ]);

    // If accountId is provided, strictly isolate stock
    if (accountId && accountId !== 'all' && mongoose.Types.ObjectId.isValid(accountId)) {
      const { targetAccountIds, isSharedStock } = await resolveStockAccountIds(accountId);

      const productIds = products.map(p => p._id);
      const movements = await StockMovement.aggregate([
        {
          $match: {
            product: { $in: productIds },
            businessAccount: { $in: targetAccountIds },
            stockBucket: 'saleable',
          }
        },
        {
          $group: {
            _id: '$product',
            qty: { $sum: '$quantity' }
          }
        }
      ]);

      const stockMap = new Map<string, number>();
      movements.forEach(m => stockMap.set(m._id.toString(), Math.max(0, m.qty)));

      const adjustedProducts = products.map(p => {
        const pObj: any = p.toObject();
        pObj.currentStock = stockMap.get(p._id.toString()) ?? 0;
        pObj.isSharedStock = isSharedStock;
        return pObj;
      });

      res.json({ success: true, data: adjustedProducts, total, page: parseInt(page), limit: parseInt(limit) });
      return;
    }

    res.json({ success: true, data: products, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.get('/:id', async (req, res: Response): Promise<void> => {
  try {
    const p = await Product.findById(req.params.id).populate('category');
    if (!p) { res.status(404).json({ success: false, message: 'Product not found' }); return; }
    res.json({ success: true, data: p });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.post('/', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const p = await Product.create(req.body);
    await createAuditLog({ action: 'CREATE', resource: 'Product', resourceId: p._id.toString(), userId: req.user?._id, details: `Created product ${p.sku}` });
    res.status(201).json({ success: true, data: p });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.put('/:id', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const p = await Product.findByIdAndUpdate(id, req.body, { new: true, runValidators: true }).populate('category');
    if (!p) { res.status(404).json({ success: false, message: 'Product not found' }); return; }
    await createAuditLog({ action: 'UPDATE', resource: 'Product', resourceId: id, userId: req.user?._id });
    res.json({ success: true, data: p });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.delete('/:id', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const product = await Product.findByIdAndDelete(id);
    if (!product) { res.status(404).json({ success: false, message: 'Product not found' }); return; }
    await createAuditLog({ action: 'DELETE', resource: 'Product', resourceId: id, userId: req.user?._id, details: `Deleted product ${product.sku}` });
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
