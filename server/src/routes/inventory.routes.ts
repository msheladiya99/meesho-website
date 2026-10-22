import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { StockMovement } from '../models/StockMovement';
import { BusinessAccount } from '../models/BusinessAccount';
import { authenticate, requireManagerOrAdmin, AuthRequest } from '../middleware/auth';
import { recordStockMovement, resolveStockAccountIds } from '../services/inventory.service';
import { createAuditLog } from '../services/audit.service';

const router = Router();
router.use(authenticate);

// GET /api/inventory — list products with current stock
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, categoryId, accountId } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { isActive: true };
    if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { sku: { $regex: search, $options: 'i' } }];
    if (categoryId && categoryId !== 'all') filter.category = categoryId;

    const products = await Product.find(filter).populate('category', 'name').sort({ name: 1 });

    // If accountId is provided and valid, calculate account-specific stock
    if (accountId && accountId !== 'all' && mongoose.Types.ObjectId.isValid(accountId)) {
      const { targetAccountIds, isSharedStock } = await resolveStockAccountIds(accountId);

      const productIds = products.map(p => p._id);

      // Aggregate movements for this account + shared accounts
      const [allTargetMovements, ownMovements, totalAgg] = await Promise.all([
        StockMovement.aggregate([
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
        ]),
        StockMovement.aggregate([
          {
            $match: {
              product: { $in: productIds },
              businessAccount: new mongoose.Types.ObjectId(accountId),
              stockBucket: 'saleable',
            }
          },
          {
            $group: {
              _id: '$product',
              qty: { $sum: '$quantity' }
            }
          }
        ]),
        StockMovement.aggregate([
          {
            $match: {
              businessAccount: { $in: targetAccountIds },
              stockBucket: 'saleable',
            }
          },
          {
            $group: {
              _id: null,
              totalStock: { $sum: '$quantity' }
            }
          }
        ])
      ]);

      const totalAvailableStock = totalAgg.length > 0 ? Math.max(0, totalAgg[0].totalStock) : 0;

      const targetStockMap = new Map<string, number>();
      allTargetMovements.forEach(item => {
        targetStockMap.set(item._id.toString(), item.qty);
      });

      const ownStockMap = new Map<string, number>();
      ownMovements.forEach(item => {
        ownStockMap.set(item._id.toString(), item.qty);
      });

      const mappedProducts = products.map(p => {
        const pObj: any = p.toObject();
        const ownStock = ownStockMap.get(p._id.toString()) ?? 0;
        
        // Products draw from the shared total quantity pool
        pObj.currentStock = totalAvailableStock;
        pObj.ownStock = Math.max(0, ownStock);
        pObj.totalAvailableStock = totalAvailableStock;
        pObj.isSharedStock = isSharedStock;
        return pObj;
      });

      res.json({ success: true, data: mappedProducts, totalAvailableStock });
      return;
    }

    const totalAgg = await StockMovement.aggregate([
      {
        $match: {
          stockBucket: 'saleable',
        }
      },
      {
        $group: {
          _id: null,
          totalStock: { $sum: '$quantity' }
        }
      }
    ]);
    const totalAvailableStock = totalAgg.length > 0 ? Math.max(0, totalAgg[0].totalStock) : 0;

    const mappedProducts = products.map(p => {
      const pObj: any = p.toObject();
      pObj.currentStock = totalAvailableStock;
      pObj.totalAvailableStock = totalAvailableStock;
      return pObj;
    });

    res.json({ success: true, data: mappedProducts, totalAvailableStock });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/inventory/damaged — list products having damaged stock
router.get('/damaged', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const products = await Product.find({ isActive: true, damagedStock: { $gt: 0 } })
      .populate('category', 'name')
      .sort({ damagedStock: -1 });
    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/inventory/:productId/movements — stock ledger for a product
router.get('/:productId/movements', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const productId = req.params.productId as string;
    const { page = '1', limit = '50', accountId, stockBucket } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { product: productId };
    if (accountId && accountId !== 'all') filter.businessAccount = accountId;
    if (stockBucket) filter.stockBucket = stockBucket;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [movements, total] = await Promise.all([
      StockMovement.find(filter)
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
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
    const productId = req.params.productId as string;
    const { quantity, reason, accountId, stockBucket = 'saleable' } = req.body;
    if (!accountId) { res.status(400).json({ success: false, message: 'accountId is required for adjustments' }); return; }
    if (!quantity || quantity === 0) { res.status(400).json({ success: false, message: 'quantity cannot be zero' }); return; }

    const parsedQty = parseInt(quantity as string, 10);
    const validBucket = ['saleable', 'damaged', 'pending'].includes(stockBucket) ? stockBucket : 'saleable';

    await recordStockMovement({
      businessAccount: String(accountId),
      productId,
      stockBucket: validBucket,
      movementType: 'adjustment',
      quantity: parsedQty,
      reason: reason || `Manual stock adjustment (${validBucket})`,
      createdBy: req.user?._id,
    });

    await createAuditLog({
      action: 'UPDATE', resource: 'Inventory', resourceId: productId, userId: req.user?._id,
      details: `Manual ${validBucket} stock adjustment: ${parsedQty > 0 ? '+' : ''}${parsedQty} — ${reason}`,
    });

    const updated = await Product.findById(productId).populate('category', 'name');
    res.json({ success: true, data: updated, message: 'Stock adjusted' });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

export default router;
