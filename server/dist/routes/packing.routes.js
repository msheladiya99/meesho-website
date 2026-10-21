"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const Order_1 = require("../models/Order");
const PackingRecord_1 = require("../models/PackingRecord");
const auth_1 = require("../middleware/auth");
const audit_service_1 = require("../services/audit.service");
const qrScanner_service_1 = require("../services/qrScanner.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const generatePackingTransactionId = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `PCK-${dateStr}-${rand}`;
};
// Helper: build account filter
const accountFilter = (accountId) => accountId && accountId !== 'all' ? { businessAccount: new mongoose_1.default.Types.ObjectId(accountId) } : {};
// POST /api/packing/lookup — Scan barcode / QR and look up order
router.post('/lookup', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { code, accountId } = req.body;
        if (!code || typeof code !== 'string') {
            res.status(400).json({ success: false, message: 'Scan code is required' });
            return;
        }
        const { order, matchedBy, exception } = await (0, qrScanner_service_1.findOrderByScannedCode)(code, accountId, req.user?.allowedAccounts);
        if (!order) {
            await (0, qrScanner_service_1.recordScanException)({
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
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/packing/pack — Pack an order (partial or full)
router.post('/pack', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, async (req, res) => {
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
        const order = await Order_1.Order.findById(orderId).populate('product').populate('items.product').populate('businessAccount');
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
            await (0, qrScanner_service_1.recordScanException)({
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
            await (0, qrScanner_service_1.recordScanException)({
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
                const rec = await PackingRecord_1.PackingRecord.create({
                    transactionId: packingTxId,
                    businessAccount: order.businessAccount._id,
                    order: order._id,
                    product: it.product?._id || it.product,
                    sku: it.sku,
                    packedQuantity: it.quantity,
                    scannedCode: scannedCode || order.shippingLabelId || order.meeshoOrderId || order._id.toString(),
                    scanType,
                    operator: req.user?._id,
                    notes: notes || (order.isCombo ? `Combo item packed (${it.sku})` : undefined),
                });
                if (!packingRecord)
                    packingRecord = rec;
            }
        }
        else {
            const packingTxId = generatePackingTransactionId();
            packingRecord = await PackingRecord_1.PackingRecord.create({
                transactionId: packingTxId,
                businessAccount: order.businessAccount._id,
                order: order._id,
                product: order.product?._id || order.product,
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
        order.packedBy = new mongoose_1.default.Types.ObjectId(req.user?._id);
        await order.save();
        await (0, audit_service_1.createAuditLog)({
            action: 'UPDATE',
            resource: 'PackingRecord',
            resourceId: packingRecord?._id?.toString() || order._id.toString(),
            userId: req.user?._id,
            details: `Packed ${packQty} units for order ${order.meeshoOrderId || order._id}`,
        });
        const populated = await Order_1.Order.findById(order._id)
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
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/packing/dispatch — Mark packed order as dispatched
router.post('/dispatch', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { orderId, carrierName, shippingLabelId, notes } = req.body;
        if (!orderId) {
            res.status(400).json({ success: false, message: 'orderId is required' });
            return;
        }
        const order = await Order_1.Order.findById(orderId).populate('product').populate('items.product').populate('businessAccount');
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
        order.dispatchedBy = new mongoose_1.default.Types.ObjectId(req.user?._id);
        if (carrierName)
            order.carrierName = carrierName;
        if (shippingLabelId)
            order.shippingLabelId = shippingLabelId;
        if (notes)
            order.notes = order.notes ? `${order.notes} | ${notes}` : notes;
        await order.save();
        await (0, audit_service_1.createAuditLog)({
            action: 'UPDATE',
            resource: 'Order',
            resourceId: order._id.toString(),
            userId: req.user?._id,
            details: `Order ${order.meeshoOrderId || order._id} marked as DISPATCHED (Carrier: ${carrierName || 'N/A'}, Label: ${shippingLabelId || 'N/A'})`,
        });
        const populated = await Order_1.Order.findById(order._id).populate('product').populate('businessAccount');
        res.json({ success: true, message: 'Order marked as DISPATCHED', data: populated });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/packing/assign-label — Link carrier shipping label ID or generate internal QR
router.post('/assign-label', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { orderId, shippingLabelId, carrierName, generateInternalQr } = req.body;
        if (!orderId) {
            res.status(400).json({ success: false, message: 'orderId is required' });
            return;
        }
        const order = await Order_1.Order.findById(orderId);
        if (!order || order.isDeleted) {
            res.status(404).json({ success: false, message: 'Order not found' });
            return;
        }
        // If linking carrier shippingLabelId, ensure uniqueness within this businessAccount
        if (shippingLabelId && shippingLabelId.trim()) {
            const cleanLabel = shippingLabelId.trim();
            const existing = await Order_1.Order.findOne({
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
            order.internalQrCode = (0, qrScanner_service_1.generateInternalQrCode)(order._id.toString(), order.sku);
        }
        await order.save();
        await (0, audit_service_1.createAuditLog)({
            action: 'UPDATE',
            resource: 'Order',
            resourceId: order._id.toString(),
            userId: req.user?._id,
            details: `Assigned label ${order.shippingLabelId || ''} / internal QR ${order.internalQrCode} to order ${order.meeshoOrderId || order._id}`,
        });
        const populated = await Order_1.Order.findById(order._id)
            .populate('product')
            .populate('items.product')
            .populate('businessAccount');
        res.json({ success: true, message: 'Shipping label / QR assigned successfully', data: populated });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/packing/records — Packing register
router.get('/records', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate, search, page = '1', limit = '50', operatorId, productId } = req.query;
        const filter = { ...accountFilter(accountId) };
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate)
                filter.createdAt['$gte'] = new Date(startDate);
            if (endDate)
                filter.createdAt['$lte'] = new Date(endDate + 'T23:59:59.999Z');
        }
        if (productId)
            filter.product = productId;
        if (operatorId)
            filter.operator = operatorId;
        if (search) {
            filter.$or = [
                { transactionId: { $regex: search, $options: 'i' } },
                { sku: { $regex: search, $options: 'i' } },
                { scannedCode: { $regex: search, $options: 'i' } },
            ];
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [records, total] = await Promise.all([
            PackingRecord_1.PackingRecord.find(filter)
                .populate('product', 'name sku')
                .populate('order', 'meeshoOrderId quantity sellingPrice status shippingLabelId internalQrCode')
                .populate('operator', 'name email role')
                .populate('businessAccount', 'name tradeName gstin')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            PackingRecord_1.PackingRecord.countDocuments(filter),
        ]);
        res.json({ success: true, data: records, total, page: parseInt(page), limit: parseInt(limit) });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/packing/orders — List orders filtered by packing status
router.get('/orders', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, packingStatus, search, page = '1', limit = '50' } = req.query;
        const filter = { isDeleted: false, ...accountFilter(accountId) };
        if (packingStatus === 'pending') {
            filter.status = 'pending';
            filter.$or = [
                { packedQuantity: 0 },
                { packedQuantity: { $exists: false } },
            ];
        }
        else if (packingStatus === 'partially_packed') {
            filter.status = 'pending';
            filter.$expr = {
                $and: [
                    { $gt: ['$packedQuantity', 0] },
                    { $lt: ['$packedQuantity', '$quantity'] },
                ],
            };
        }
        else if (packingStatus === 'packed') {
            filter.status = 'packed';
        }
        else if (packingStatus === 'dispatched') {
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
            Order_1.Order.find(filter)
                .populate('product', 'name sku currentStock')
                .populate('items.product', 'name sku currentStock')
                .populate('businessAccount', 'name tradeName gstin')
                .populate('packedBy', 'name email')
                .populate('dispatchedBy', 'name email')
                .sort({ orderDate: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Order_1.Order.countDocuments(filter),
        ]);
        res.json({ success: true, data: orders, total, page: parseInt(page), limit: parseInt(limit) });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/packing/summary — Metrics for today & pending status
router.get('/summary', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId } = req.query;
        const af = accountFilter(accountId);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const [pendingPacking, partiallyPacked, packedToday, dispatchedToday] = await Promise.all([
            Order_1.Order.countDocuments({
                isDeleted: false,
                status: 'pending',
                $or: [{ packedQuantity: 0 }, { packedQuantity: { $exists: false } }],
                ...af,
            }),
            Order_1.Order.countDocuments({
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
            PackingRecord_1.PackingRecord.aggregate([
                { $match: { createdAt: { $gte: todayStart, $lte: todayEnd }, ...af } },
                { $group: { _id: null, totalPackedQty: { $sum: '$packedQuantity' }, totalScans: { $sum: 1 } } },
            ]),
            Order_1.Order.countDocuments({
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
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=packing.routes.js.map