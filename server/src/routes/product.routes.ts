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

    // If accountId is provided, resolve target account stock
    if (accountId && accountId !== 'all' && mongoose.Types.ObjectId.isValid(accountId)) {
      const { targetAccountIds, isSharedStock } = await resolveStockAccountIds(accountId);

      const totalAgg = await StockMovement.aggregate([
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
      ]);
      const totalAvailableStock = totalAgg.length > 0 ? Math.max(0, totalAgg[0].totalStock) : 0;

      const adjustedProducts = products.map(p => {
        const pObj: any = p.toObject();
        pObj.currentStock = totalAvailableStock;
        pObj.totalAvailableStock = totalAvailableStock;
        pObj.isSharedStock = isSharedStock;
        return pObj;
      });

      res.json({ success: true, data: adjustedProducts, total, page: parseInt(page), limit: parseInt(limit), totalAvailableStock });
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

    const adjustedProducts = products.map(p => {
      const pObj: any = p.toObject();
      pObj.currentStock = totalAvailableStock;
      pObj.totalAvailableStock = totalAvailableStock;
      return pObj;
    });

    res.json({ success: true, data: adjustedProducts, total, page: parseInt(page), limit: parseInt(limit), totalAvailableStock });
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
    const data = { ...req.body };
    const b = data.boxCost !== undefined ? Number(data.boxCost) : 200;
    const s = data.stickerCost !== undefined ? Number(data.stickerCost) : 100;
    const bc = data.bagCardCost !== undefined ? Number(data.bagCardCost) : 100;
    const pl = data.printLabelCost !== undefined ? Number(data.printLabelCost) : 100;
    data.boxCost = b;
    data.stickerCost = s;
    data.bagCardCost = bc;
    data.printLabelCost = pl;
    data.packingCost = b + s + bc + pl;
    if (!data.packingPreset) {
      data.packingPreset = s === 400 ? 'special' : (s === 100 && b === 200 && bc === 100 && pl === 100 ? 'standard' : 'custom');
    }

    const p = await Product.create(data);
    await createAuditLog({ action: 'CREATE', resource: 'Product', resourceId: p._id.toString(), userId: req.user?._id, details: `Created product ${p.sku}` });
    res.status(201).json({ success: true, data: p });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.put('/:id', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const data = { ...req.body };
    if (data.boxCost !== undefined || data.stickerCost !== undefined || data.bagCardCost !== undefined || data.printLabelCost !== undefined) {
      const existing = await Product.findById(id);
      const b = data.boxCost !== undefined ? Number(data.boxCost) : (existing?.boxCost ?? 200);
      const s = data.stickerCost !== undefined ? Number(data.stickerCost) : (existing?.stickerCost ?? 100);
      const bc = data.bagCardCost !== undefined ? Number(data.bagCardCost) : (existing?.bagCardCost ?? 100);
      const pl = data.printLabelCost !== undefined ? Number(data.printLabelCost) : (existing?.printLabelCost ?? 100);
      data.boxCost = b;
      data.stickerCost = s;
      data.bagCardCost = bc;
      data.printLabelCost = pl;
      data.packingCost = b + s + bc + pl;
      if (!data.packingPreset) {
        data.packingPreset = s === 400 ? 'special' : (s === 100 && b === 200 && bc === 100 && pl === 100 ? 'standard' : 'custom');
      }
    }
    const p = await Product.findByIdAndUpdate(id, data, { new: true, runValidators: true }).populate('category');
    if (!p) { res.status(404).json({ success: false, message: 'Product not found' }); return; }
    await createAuditLog({ action: 'UPDATE', resource: 'Product', resourceId: id, userId: req.user?._id });
    res.json({ success: true, data: p });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.post('/bulk-update-packing', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { productIds, boxCost, stickerCost, bagCardCost, printLabelCost, packingPreset } = req.body;
    const b = Number(boxCost) || 0;
    const s = Number(stickerCost) || 0;
    const bc = Number(bagCardCost) || 0;
    const pl = Number(printLabelCost) || 0;
    const totalPacking = b + s + bc + pl;

    const filter: Record<string, any> = {};
    if (productIds === 'all') {
      filter.isActive = true;
    } else if (Array.isArray(productIds) && productIds.length > 0) {
      filter._id = { $in: productIds.map((pid: string) => new mongoose.Types.ObjectId(pid)) };
    } else {
      res.status(400).json({ success: false, message: 'productIds array or "all" is required' });
      return;
    }

    const updateData: Record<string, any> = {
      boxCost: b,
      stickerCost: s,
      bagCardCost: bc,
      printLabelCost: pl,
      packingCost: totalPacking,
      packingPreset: packingPreset || (s === 400 ? 'special' : (s === 100 && b === 200 && bc === 100 && pl === 100 ? 'standard' : 'custom')),
    };

    const result = await Product.updateMany(filter, { $set: updateData });

    await createAuditLog({
      action: 'UPDATE',
      resource: 'Product',
      userId: req.user?._id,
      details: `Bulk updated packaging charges for ${result.modifiedCount} products (Total: ₹${(totalPacking / 100).toFixed(2)}, Preset: ${updateData.packingPreset})`,
    });

    res.json({
      success: true,
      message: `Updated packaging charges for ${result.modifiedCount} product(s)`,
      modifiedCount: result.modifiedCount,
    });
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
