import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { PackingRecord } from '../models/PackingRecord';
import { BusinessAccount } from '../models/BusinessAccount';
import { StockMovement } from '../models/StockMovement';
import { authenticate, requireManagerOrAdmin, enforceAccountAccess, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit.service';
import { recordStockMovement, reverseMovementsByReference, resolveStockAccountIds } from '../services/inventory.service';
import { generateInternalQrCode } from '../services/qrScanner.service';

const router = Router();
router.use(authenticate);

// Helper: build account filter
const accountFilter = (accountId?: string): Record<string, unknown> =>
  accountId && accountId !== 'all' ? { businessAccount: new mongoose.Types.ObjectId(accountId) } : {};

// GET /api/orders
router.get('/', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate, search, page = '1', limit = '100', productId } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { isDeleted: false, ...accountFilter(accountId) };

    if (startDate || endDate) {
      filter.orderDate = {};
      if (startDate) (filter.orderDate as Record<string, unknown>)['$gte'] = new Date(startDate);
      if (endDate) (filter.orderDate as Record<string, unknown>)['$lte'] = new Date(endDate + 'T23:59:59.999Z');
    }
    if (productId) filter.product = productId;
    if (search) {
      filter.$or = [
        { meeshoOrderId: { $regex: search, $options: 'i' } },
        { subOrderId: { $regex: search, $options: 'i' } },
        { shippingLabelId: { $regex: search, $options: 'i' } },
        { internalQrCode: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('product', 'name sku sellingPrice category')
        .populate('items.product', 'name sku sellingPrice category')
        .populate('businessAccount', 'name tradeName gstin')
        .sort({ orderDate: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Order.countDocuments(filter),
    ]);

    res.json({ success: true, data: orders, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/orders/:id
router.get('/:id', async (req, res: Response): Promise<void> => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('product')
      .populate('items.product')
      .populate('businessAccount');
    if (!order || order.isDeleted) { res.status(404).json({ success: false, message: 'Order not found' }); return; }
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /api/orders
router.post('/', requireManagerOrAdmin, enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      businessAccount, orderDate, meeshoOrderId, subOrderId, product: productId,
      sellingPrice, quantity, notes, status, shippingLabelId, carrierName,
      items, // array of { product, quantity, sellingPrice, sku }
    } = req.body;

    if (!businessAccount) { res.status(400).json({ success: false, message: 'businessAccount is required' }); return; }

    type OrderItemInput = {
      product: string;
      quantity: number;
      sellingPrice?: number;
      sku?: string;
    };

    let inputItems: OrderItemInput[] = [];
    if (Array.isArray(items) && items.length > 0) {
      inputItems = items.map((it: any) => ({
        product: (it.product || it.productId || '')?.toString(),
        quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
        sellingPrice: it.sellingPrice !== undefined ? Number(it.sellingPrice) : undefined,
        sku: it.sku,
      })).filter((it: OrderItemInput) => Boolean(it.product));
    } else if (productId) {
      inputItems = [{
        product: productId.toString(),
        quantity: Math.max(1, parseInt(quantity, 10) || 1),
        sellingPrice: sellingPrice !== undefined ? Number(sellingPrice) : undefined,
      }];
    }

    if (inputItems.length === 0) {
      res.status(400).json({ success: false, message: 'At least one product item is required' });
      return;
    }

    const isCombo = inputItems.length > 1;
    const account = await BusinessAccount.findById(businessAccount);
    const { targetAccountIds, isSharedStock } = await resolveStockAccountIds(businessAccount);

    const resolvedItems = [];
    let totalQuantity = 0;
    let totalGrossAmount = 0;
    const orderStatus = status || 'pending';

    for (const item of inputItems) {
      const prod = await Product.findById(item.product);
      if (!prod) {
        res.status(404).json({ success: false, message: `Product ${item.product} not found` });
        return;
      }

      const itemQty = item.quantity;
      const itemPrice = item.sellingPrice !== undefined ? item.sellingPrice : (sellingPrice || prod.sellingPrice || 0);

      // Validate stock if not cancelled
      if (orderStatus !== 'cancelled') {
        const stockAgg = await StockMovement.aggregate([
          {
            $match: {
              product: prod._id,
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

        const availableStock = stockAgg.length > 0 ? Math.max(0, stockAgg[0].totalStock) : 0;
        if (availableStock < itemQty) {
          const accLabel = account?.tradeName || account?.name || 'this account';
          const msg = isSharedStock
            ? `Insufficient shared stock for "${prod.name}". Available across shared accounts: ${availableStock}, Requested: ${itemQty}`
            : `Insufficient stock for "${prod.name}" in account "${accLabel}". Available own stock: ${availableStock}, Requested: ${itemQty}. (You can enable "Share Stock with other GST accounts" in GST Settings to use other account stock).`;
          res.status(400).json({ success: false, message: msg });
          return;
        }
      }

      totalQuantity += itemQty;
      totalGrossAmount += itemPrice * itemQty;

      resolvedItems.push({
        product: prod._id,
        sku: prod.sku,
        quantity: itemQty,
        sellingPrice: itemPrice,
        prodDoc: prod,
      });
    }

    const mainProduct = resolvedItems[0];
    const orderSku = isCombo
      ? `COMBO (${resolvedItems.map(i => `${i.quantity}x ${i.sku}`).join(' + ')})`
      : mainProduct.sku;
    const finalSellingPrice = isCombo
      ? Math.round(totalGrossAmount / (totalQuantity || 1))
      : (mainProduct.sellingPrice || sellingPrice || 0);

    const tempId = new mongoose.Types.ObjectId();
    const internalQrCode = generateInternalQrCode(tempId.toString(), mainProduct.sku);

    const order = await Order.create({
      _id: tempId,
      businessAccount,
      orderDate,
      meeshoOrderId: meeshoOrderId || undefined,
      subOrderId: subOrderId || undefined,
      shippingLabelId: shippingLabelId || undefined,
      carrierName: carrierName || undefined,
      internalQrCode,
      product: mainProduct.product,
      sku: orderSku,
      sellingPrice: finalSellingPrice,
      quantity: totalQuantity,
      grossAmount: totalGrossAmount,
      isCombo,
      items: resolvedItems.map(i => ({
        product: i.product,
        sku: i.sku,
        quantity: i.quantity,
        sellingPrice: i.sellingPrice,
      })),
      status: orderStatus,
      notes,
      createdBy: req.user?._id,
      packedQuantity: orderStatus === 'packed' ? totalQuantity : 0,
      packedAt: orderStatus === 'packed' ? new Date() : undefined,
      packedBy: orderStatus === 'packed' ? req.user?._id : undefined,
    });

    if (orderStatus === 'packed') {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      for (const item of resolvedItems) {
        const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
        await PackingRecord.create({
          transactionId: `PCK-${dateStr}-${rand}`,
          businessAccount,
          order: order._id,
          product: item.product,
          sku: item.sku,
          packedQuantity: item.quantity,
          scannedCode: shippingLabelId || meeshoOrderId || internalQrCode,
          scanType: shippingLabelId ? 'carrier_label' : meeshoOrderId ? 'meesho_order_id' : 'internal_qr',
          operator: req.user?._id,
          notes: notes || (isCombo ? `Combo item packed on order creation (${item.sku})` : 'Auto-packed on order creation'),
        });
      }
    }

    // Record stock deduction for each product if not cancelled
    if (orderStatus !== 'cancelled') {
      for (const item of resolvedItems) {
        await recordStockMovement({
          businessAccount,
          productId: item.product.toString(),
          movementType: 'sale',
          quantity: -item.quantity,
          unitCost: item.prodDoc.weightedAvgCost || item.prodDoc.defaultPurchaseCost,
          referenceType: 'Order',
          referenceId: order._id.toString(),
          reason: isCombo
            ? `Combo order placed: ${meeshoOrderId || order._id} (${item.sku} x${item.quantity})`
            : `Order placed: ${meeshoOrderId || order._id}`,
          createdBy: req.user?._id?.toString(),
        });
      }
    }

    await createAuditLog({ action: 'CREATE', resource: 'Order', resourceId: order._id.toString(), userId: req.user?._id?.toString(), details: `Order ${meeshoOrderId || order._id}${isCombo ? ' (COMBO)' : ''}` });

    const populated = await Order.findById(order._id)
      .populate('product', 'name sku')
      .populate('items.product', 'name sku')
      .populate('businessAccount', 'name gstin');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('duplicate') || msg.includes('11000')) {
      res.status(400).json({ success: false, message: 'This Meesho order ID or Shipping Label already exists for this account' });
    } else {
      res.status(400).json({ success: false, message: msg });
    }
  }
});

// PUT /api/orders/:id
router.put('/:id', requireManagerOrAdmin, enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await Order.findById(req.params.id);
    if (!existing || existing.isDeleted) { res.status(404).json({ success: false, message: 'Order not found' }); return; }

    const { sellingPrice, quantity } = req.body;
    if (sellingPrice && quantity) {
      req.body.grossAmount = sellingPrice * quantity;
    }

    // Reverse old stock movements for this order
    await reverseMovementsByReference(req.params.id as string, req.user?._id?.toString());

    const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('product', 'name sku')
      .populate('items.product', 'name sku')
      .populate('businessAccount', 'name gstin');

    if (!order) { res.status(404).json({ success: false, message: 'Order not found' }); return; }

    // Re-record stock deduction if not cancelled
    if (order.status !== 'cancelled') {
      if (order.items && order.items.length > 0) {
        for (const it of order.items) {
          const prod = await Product.findById(it.product);
          if (prod) {
            await recordStockMovement({
              businessAccount: order.businessAccount.toString(),
              productId: it.product.toString(),
              movementType: 'sale',
              quantity: -it.quantity,
              unitCost: prod.weightedAvgCost || prod.defaultPurchaseCost,
              referenceType: 'Order',
              referenceId: order._id.toString(),
              reason: `Order updated: ${order.meeshoOrderId || order._id} (${it.sku} x${it.quantity})`,
              createdBy: req.user?._id?.toString(),
            });
          }
        }
      } else {
        const prod = await Product.findById(order.product);
        if (prod) {
          await recordStockMovement({
            businessAccount: order.businessAccount.toString(),
            productId: order.product.toString(),
            movementType: 'sale',
            quantity: -order.quantity,
            unitCost: prod.weightedAvgCost || prod.defaultPurchaseCost,
            referenceType: 'Order',
            referenceId: order._id.toString(),
            reason: `Order updated: ${order.meeshoOrderId || order._id}`,
            createdBy: req.user?._id?.toString(),
          });
        }
      }
    }

    await createAuditLog({
      action: 'UPDATE', resource: 'Order', resourceId: req.params.id as string, userId: req.user?._id?.toString(),
      changes: { before: { sellingPrice: existing.sellingPrice, quantity: existing.quantity }, after: { sellingPrice, quantity } },
    });

    res.json({ success: true, data: order });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// DELETE /api/orders/:id (soft delete)
router.delete('/:id', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || order.isDeleted) { res.status(404).json({ success: false, message: 'Order not found' }); return; }

    // Restore stock by reversing movement
    await reverseMovementsByReference(req.params.id as string, req.user?._id?.toString());

    await Order.findByIdAndUpdate(req.params.id, { isDeleted: true, deletedAt: new Date() });
    await createAuditLog({ action: 'DELETE', resource: 'Order', resourceId: req.params.id as string, userId: req.user?._id?.toString(), details: `Soft deleted order ${order.meeshoOrderId || order._id}` });

    res.json({ success: true, message: 'Order deleted and stock restored' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/orders/summary/daily
router.get('/summary/daily', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, date } = req.query as Record<string, string>;
    const targetDate = date ? new Date(date) : new Date();
    const start = new Date(targetDate.setHours(0, 0, 0, 0));
    const end = new Date(targetDate.setHours(23, 59, 59, 999));

    const filter: Record<string, unknown> = { isDeleted: false, orderDate: { $gte: start, $lte: end }, ...accountFilter(accountId) };

    const result = await Order.aggregate([
      { $match: filter },
      { $group: { _id: null, totalOrders: { $sum: 1 }, totalQty: { $sum: '$quantity' }, totalAmount: { $sum: '$grossAmount' } } },
    ]);

    res.json({ success: true, data: result[0] || { totalOrders: 0, totalQty: 0, totalAmount: 0 } });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/orders/summary/category
router.get('/summary/category', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { isDeleted: false, ...accountFilter(accountId) };
    if (startDate || endDate) {
      filter.orderDate = {};
      if (startDate) (filter.orderDate as Record<string, unknown>)['$gte'] = new Date(startDate);
      if (endDate) (filter.orderDate as Record<string, unknown>)['$lte'] = new Date(endDate + 'T23:59:59.999Z');
    }

    const result = await Order.aggregate([
      { $match: filter },
      { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'productDoc' } },
      { $unwind: '$productDoc' },
      { $lookup: { from: 'categories', localField: 'productDoc.category', foreignField: '_id', as: 'categoryDoc' } },
      { $unwind: { path: '$categoryDoc', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$categoryDoc._id',
          category: { $first: '$categoryDoc.name' },
          orders: { $sum: 1 },
          qty: { $sum: '$quantity' },
          sales: { $sum: '$grossAmount' },
        }
      },
      { $sort: { sales: -1 } }
    ]);

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
