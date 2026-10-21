import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { Order, IOrder } from '../models/Order';
import { PackingRecord } from '../models/PackingRecord';
import { authenticate, requireManagerOrAdmin, enforceAccountAccess, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit.service';
import {
  findOrderByScannedCode,
  generateInternalQrCode,
  recordScanException,
} from '../services/qrScanner.service';

const router = Router();
router.use(authenticate);

const generatePackingTransactionId = (): string => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `PCK-${dateStr}-${rand}`;
};

// Helper: build account filter
const accountFilter = (accountId?: string): Record<string, unknown> =>
  accountId && accountId !== 'all' ? { businessAccount: new mongoose.Types.ObjectId(accountId) } : {};

// POST /api/packing/lookup — Scan barcode / QR and look up order
router.post('/lookup', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code, accountId } = req.body;
    if (!code || typeof code !== 'string') {
      res.status(400).json({ success: false, message: 'Scan code is required' });
      return;
    }

    const { order, matchedBy, exception } = await findOrderByScannedCode(
      code,
      accountId,
      req.user?.allowedAccounts
    );

    if (!order) {
      await recordScanException({
        businessAccount: accountId !== 'all' ? accountId : undefined,
        scannedCode: code,
        module: 'packing',
        exceptionType: exception?.includes('belongs to') ? 'wrong_account' : 'order_not_found',
        attemptedAction: 'Lookup Order for Packing',
        operator: req.user?._id,
        details: exception || 'Order Not Found',
      });

      res.status(404).json({
        success: false,
        message: exception || 'Order Not Found',
      });
      return;
    }

    const previouslyPacked = order.packedQuantity || 0;
    const remainingQuantity = Math.max(0, order.quantity - previouslyPacked);

    res.json({
      success: true,
      data: {
        order,
        matchedBy,
        orderedQuantity: order.quantity,
        previouslyPacked,
        remainingQuantity,
        isFullyPacked: remainingQuantity === 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /api/packing/pack — Pack an order (partial or full)
router.post('/pack', requireManagerOrAdmin, enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderId, quantityToPack, scannedCode, scanType = 'carrier_label', notes } = req.body;

    if (!orderId) {
      res.status(400).json({ success: false, message: 'orderId is required' });
      return;
    }

    const packQty = parseInt(quantityToPack, 10);
    if (isNaN(packQty) || packQty <= 0) {
      res.status(400).json({ success: false, message: 'Quantity to pack must be a positive integer' });
      return;
    }

    const order = await Order.findById(orderId).populate('product').populate('items.product').populate('businessAccount');
    if (!order || order.isDeleted) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }

    if (order.status === 'cancelled') {
      res.status(400).json({ success: false, message: 'Cannot pack a cancelled order' });
      return;
    }

    // Check account permission
    if (req.user?.role !== 'admin') {
      const allowed = req.user?.allowedAccounts || [];
      if (!allowed.includes(order.businessAccount._id.toString())) {
        res.status(403).json({ success: false, message: 'Access to this GSTIN account is not permitted' });
        return;
      }
    }

    const currentPacked = order.packedQuantity || 0;
    const remaining = order.quantity - currentPacked;

    // Prevent duplicate or excess packing
    if (remaining <= 0) {
      await recordScanException({
        businessAccount: order.businessAccount._id.toString(),
        scannedCode: scannedCode || order.meeshoOrderId || order._id.toString(),
        module: 'packing',
        exceptionType: 'already_packed',
        attemptedAction: 'Pack Order',
        operator: req.user?._id,
        details: `Order ${order.meeshoOrderId || order._id} is already fully packed (${currentPacked}/${order.quantity}).`,
      });

      res.status(400).json({
        success: false,
        message: `Order is already fully packed (${currentPacked} of ${order.quantity} units). Duplicate packing prevented.`,
      });
      return;
    }

    if (packQty > remaining) {
      await recordScanException({
        businessAccount: order.businessAccount._id.toString(),
        scannedCode: scannedCode || order.meeshoOrderId || order._id.toString(),
        module: 'packing',
        exceptionType: 'qty_exceeded',
        attemptedAction: 'Pack Order',
        operator: req.user?._id,
        details: `Attempted to pack ${packQty} units but only ${remaining} remaining.`,
      });

      res.status(400).json({
        success: false,
        message: `Packed quantity (${packQty}) cannot exceed remaining unpicked quantity (${remaining}).`,
      });
      return;
    }

    const newPackedTotal = currentPacked + packQty;
    const newStatus = newPackedTotal >= order.quantity ? 'packed' : 'pending';

    // Create immutable packing record(s)
    let packingRecord;
    if (order.items && order.items.length > 0) {
      for (const it of order.items) {
        const packingTxId = generatePackingTransactionId();
        const rec = await PackingRecord.create({
          transactionId: packingTxId,
          businessAccount: order.businessAccount._id,
          order: order._id,
          product: (it.product as any)?._id || it.product,
          sku: it.sku,
          packedQuantity: it.quantity,
          scannedCode: scannedCode || order.shippingLabelId || order.meeshoOrderId || order._id.toString(),
          scanType,
          operator: req.user?._id,
          notes: notes || (order.isCombo ? `Combo item packed (${it.sku})` : undefined),
        });
        if (!packingRecord) packingRecord = rec;
      }
    } else {
      const packingTxId = generatePackingTransactionId();
      packingRecord = await PackingRecord.create({
        transactionId: packingTxId,
        businessAccount: order.businessAccount._id,
        order: order._id,
        product: (order.product as any)?._id || order.product,
        sku: order.sku,
        packedQuantity: packQty,
        scannedCode: scannedCode || order.shippingLabelId || order.meeshoOrderId || order._id.toString(),
        scanType,
        operator: req.user?._id,
        notes,
      });
    }

    // Update order
    order.packedQuantity = newPackedTotal;
    order.status = newStatus;
    order.packedAt = new Date();
    order.packedBy = new mongoose.Types.ObjectId(req.user?._id);
    await order.save();

    await createAuditLog({
      action: 'UPDATE',
      resource: 'PackingRecord',
      resourceId: packingRecord?._id?.toString() || order._id.toString(),
      userId: req.user?._id,
      details: `Packed ${packQty} units for order ${order.meeshoOrderId || order._id}`,
    });

    const populated = await Order.findById(order._id)
      .populate('product')
      .populate('items.product')
      .populate('businessAccount');

    res.json({
      success: true,
      message: `Successfully packed ${packQty} unit(s). Order status: ${newStatus.toUpperCase()}`,
      data: {
        order: populated,
        packingRecord,
        remainingQuantity: Math.max(0, order.quantity - newPackedTotal),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /api/packing/dispatch — Mark packed order as dispatched
router.post('/dispatch', requireManagerOrAdmin, enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderId, carrierName, shippingLabelId, notes } = req.body;
    if (!orderId) {
      res.status(400).json({ success: false, message: 'orderId is required' });
      return;
    }

    const order = await Order.findById(orderId).populate('product').populate('items.product').populate('businessAccount');
    if (!order || order.isDeleted) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }

    if (order.status === 'dispatched') {
      res.status(400).json({ success: false, message: 'Order has already been dispatched' });
      return;
    }

    if (order.status === 'cancelled') {
      res.status(400).json({ success: false, message: 'Cannot dispatch a cancelled order' });
      return;
    }

    // Check account permission
    if (req.user?.role !== 'admin') {
      const allowed = req.user?.allowedAccounts || [];
      if (!allowed.includes(order.businessAccount._id.toString())) {
        res.status(403).json({ success: false, message: 'Access to this GSTIN account is not permitted' });
        return;
      }
    }

    order.status = 'dispatched';
    order.dispatchedAt = new Date();
    order.dispatchedBy = new mongoose.Types.ObjectId(req.user?._id);
    if (carrierName) order.carrierName = carrierName;
    if (shippingLabelId) order.shippingLabelId = shippingLabelId;
    if (notes) order.notes = order.notes ? `${order.notes} | ${notes}` : notes;
    await order.save();

    await createAuditLog({
      action: 'UPDATE',
      resource: 'Order',
      resourceId: order._id.toString(),
      userId: req.user?._id,
      details: `Order ${order.meeshoOrderId || order._id} marked as DISPATCHED (Carrier: ${carrierName || 'N/A'}, Label: ${shippingLabelId || 'N/A'})`,
    });

    const populated = await Order.findById(order._id).populate('product').populate('businessAccount');
    res.json({ success: true, message: 'Order marked as DISPATCHED', data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /api/packing/assign-label — Link carrier shipping label ID or generate internal QR
router.post('/assign-label', requireManagerOrAdmin, enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderId, shippingLabelId, carrierName, generateInternalQr } = req.body;
    if (!orderId) {
      res.status(400).json({ success: false, message: 'orderId is required' });
      return;
    }

    const order = await Order.findById(orderId);
    if (!order || order.isDeleted) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }

    // If linking carrier shippingLabelId, ensure uniqueness within this businessAccount
    if (shippingLabelId && shippingLabelId.trim()) {
      const cleanLabel = shippingLabelId.trim();
      const existing = await Order.findOne({
        _id: { $ne: order._id },
        businessAccount: order.businessAccount,
        shippingLabelId: cleanLabel,
        isDeleted: false,
      });

      if (existing) {
        res.status(400).json({
          success: false,
          message: `Shipping label ID "${cleanLabel}" is already assigned to order ${existing.meeshoOrderId || existing._id}`,
        });
        return;
      }
      order.shippingLabelId = cleanLabel;
    }

    if (carrierName) {
      order.carrierName = carrierName.trim();
    }

    if (generateInternalQr || !order.internalQrCode) {
      order.internalQrCode = generateInternalQrCode(order._id.toString(), order.sku);
    }

    await order.save();

    await createAuditLog({
      action: 'UPDATE',
      resource: 'Order',
      resourceId: order._id.toString(),
      userId: req.user?._id,
      details: `Assigned label ${order.shippingLabelId || ''} / internal QR ${order.internalQrCode} to order ${order.meeshoOrderId || order._id}`,
    });

    const populated = await Order.findById(order._id)
      .populate('product')
      .populate('items.product')
      .populate('businessAccount');
    res.json({ success: true, message: 'Shipping label / QR assigned successfully', data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/packing/records — Packing register
router.get('/records', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate, search, page = '1', limit = '50', operatorId, productId } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { ...accountFilter(accountId) };

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) (filter.createdAt as Record<string, unknown>)['$gte'] = new Date(startDate);
      if (endDate) (filter.createdAt as Record<string, unknown>)['$lte'] = new Date(endDate + 'T23:59:59.999Z');
    }
    if (productId) filter.product = productId;
    if (operatorId) filter.operator = operatorId;
    if (search) {
      filter.$or = [
        { transactionId: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { scannedCode: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [records, total] = await Promise.all([
      PackingRecord.find(filter)
        .populate('product', 'name sku')
        .populate('order', 'meeshoOrderId quantity sellingPrice status shippingLabelId internalQrCode')
        .populate('operator', 'name email role')
        .populate('businessAccount', 'name tradeName gstin')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      PackingRecord.countDocuments(filter),
    ]);

    res.json({ success: true, data: records, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/packing/orders — List orders filtered by packing status
router.get('/orders', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, packingStatus, search, page = '1', limit = '50' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { isDeleted: false, ...accountFilter(accountId) };

    if (packingStatus === 'pending') {
      filter.status = 'pending';
      filter.$or = [
        { packedQuantity: 0 },
        { packedQuantity: { $exists: false } },
      ];
    } else if (packingStatus === 'partially_packed') {
      filter.status = 'pending';
      filter.$expr = {
        $and: [
          { $gt: ['$packedQuantity', 0] },
          { $lt: ['$packedQuantity', '$quantity'] },
        ],
      };
    } else if (packingStatus === 'packed') {
      filter.status = 'packed';
    } else if (packingStatus === 'dispatched') {
      filter.status = 'dispatched';
    }

    if (search) {
      filter.$or = [
        { meeshoOrderId: { $regex: search, $options: 'i' } },
        { shippingLabelId: { $regex: search, $options: 'i' } },
        { internalQrCode: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('product', 'name sku currentStock')
        .populate('items.product', 'name sku currentStock')
        .populate('businessAccount', 'name tradeName gstin')
        .populate('packedBy', 'name email')
        .populate('dispatchedBy', 'name email')
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

// GET /api/packing/summary — Metrics for today & pending status
router.get('/summary', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId } = req.query as Record<string, string>;
    const af = accountFilter(accountId);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [pendingPacking, partiallyPacked, packedToday, dispatchedToday] = await Promise.all([
      Order.countDocuments({
        isDeleted: false,
        status: 'pending',
        $or: [{ packedQuantity: 0 }, { packedQuantity: { $exists: false } }],
        ...af,
      }),
      Order.countDocuments({
        isDeleted: false,
        status: 'pending',
        $expr: {
          $and: [
            { $gt: ['$packedQuantity', 0] },
            { $lt: ['$packedQuantity', '$quantity'] },
          ],
        },
        ...af,
      }),
      PackingRecord.aggregate([
        { $match: { createdAt: { $gte: todayStart, $lte: todayEnd }, ...af } },
        { $group: { _id: null, totalPackedQty: { $sum: '$packedQuantity' }, totalScans: { $sum: 1 } } },
      ]),
      Order.countDocuments({
        isDeleted: false,
        status: 'dispatched',
        dispatchedAt: { $gte: todayStart, $lte: todayEnd },
        ...af,
      }),
    ]);

    res.json({
      success: true,
      data: {
        pendingPacking,
        partiallyPacked,
        packedToday: packedToday[0]?.totalPackedQty || 0,
        packedScansToday: packedToday[0]?.totalScans || 0,
        dispatchedToday,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
