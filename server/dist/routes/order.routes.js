"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const Order_1 = require("../models/Order");
const Product_1 = require("../models/Product");
const PackingRecord_1 = require("../models/PackingRecord");
const BusinessAccount_1 = require("../models/BusinessAccount");
const StockMovement_1 = require("../models/StockMovement");
const auth_1 = require("../middleware/auth");
const audit_service_1 = require("../services/audit.service");
const inventory_service_1 = require("../services/inventory.service");
const qrScanner_service_1 = require("../services/qrScanner.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// Helper: build account filter
const accountFilter = (accountId) => accountId && accountId !== 'all' ? { businessAccount: new mongoose_1.default.Types.ObjectId(accountId) } : {};
// GET /api/orders
router.get('/', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate, search, page = '1', limit = '100', productId } = req.query;
        const filter = { isDeleted: false, ...accountFilter(accountId) };
        if (startDate || endDate) {
            filter.orderDate = {};
            if (startDate)
                filter.orderDate['$gte'] = new Date(startDate);
            if (endDate)
                filter.orderDate['$lte'] = new Date(endDate + 'T23:59:59.999Z');
        }
        if (productId)
            filter.product = productId;
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
            Order_1.Order.find(filter).populate('product', 'name sku sellingPrice category').populate('businessAccount', 'name tradeName gstin').sort({ orderDate: -1 }).skip(skip).limit(parseInt(limit)),
            Order_1.Order.countDocuments(filter),
        ]);
        res.json({ success: true, data: orders, total, page: parseInt(page), limit: parseInt(limit) });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/orders/:id
router.get('/:id', async (req, res) => {
    try {
        const order = await Order_1.Order.findById(req.params.id).populate('product').populate('businessAccount');
        if (!order || order.isDeleted) {
            res.status(404).json({ success: false, message: 'Order not found' });
            return;
        }
        res.json({ success: true, data: order });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/orders
router.post('/', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { businessAccount, orderDate, meeshoOrderId, subOrderId, product: productId, sellingPrice, quantity, notes, status, shippingLabelId, carrierName, } = req.body;
        if (!businessAccount) {
            res.status(400).json({ success: false, message: 'businessAccount is required' });
            return;
        }
        if (!productId) {
            res.status(400).json({ success: false, message: 'product is required' });
            return;
        }
        if (!quantity || quantity <= 0) {
            res.status(400).json({ success: false, message: 'quantity must be greater than 0' });
            return;
        }
        const product = await Product_1.Product.findById(productId);
        if (!product) {
            res.status(404).json({ success: false, message: 'Product not found' });
            return;
        }
        const orderStatus = status || 'pending';
        if (orderStatus !== 'cancelled') {
            const account = await BusinessAccount_1.BusinessAccount.findById(businessAccount);
            const { targetAccountIds, isSharedStock } = await (0, inventory_service_1.resolveStockAccountIds)(businessAccount);
            const stockAgg = await StockMovement_1.StockMovement.aggregate([
                {
                    $match: {
                        product: product._id,
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
            // STRICT: If no movements exist for this account (and shared stock is not checked), stock is 0.
            const availableStock = stockAgg.length > 0 ? Math.max(0, stockAgg[0].totalStock) : 0;
            if (availableStock < quantity) {
                const accLabel = account?.tradeName || account?.name || 'this account';
                const msg = isSharedStock
                    ? `Insufficient shared stock for "${product.name}". Available across shared accounts: ${availableStock}, Requested: ${quantity}`
                    : `Insufficient stock for "${product.name}" in account "${accLabel}". Available own stock: ${availableStock}, Requested: ${quantity}. (You can enable "Share Stock with other GST accounts" in GST Settings to use other account stock).`;
                res.status(400).json({ success: false, message: msg });
                return;
            }
        }
        const grossAmount = sellingPrice * quantity;
        const tempId = new mongoose_1.default.Types.ObjectId();
        const internalQrCode = (0, qrScanner_service_1.generateInternalQrCode)(tempId.toString(), product.sku);
        const order = await Order_1.Order.create({
            _id: tempId,
            businessAccount, orderDate, meeshoOrderId: meeshoOrderId || undefined,
            subOrderId: subOrderId || undefined,
            shippingLabelId: shippingLabelId || undefined,
            carrierName: carrierName || undefined,
            internalQrCode,
            product: productId, sku: product.sku, sellingPrice, quantity, grossAmount,
            status: orderStatus, notes, createdBy: req.user?._id,
            packedQuantity: orderStatus === 'packed' ? quantity : 0,
            packedAt: orderStatus === 'packed' ? new Date() : undefined,
            packedBy: orderStatus === 'packed' ? req.user?._id : undefined,
        });
        if (orderStatus === 'packed') {
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
            await PackingRecord_1.PackingRecord.create({
                transactionId: `PCK-${dateStr}-${rand}`,
                businessAccount,
                order: order._id,
                product: productId,
                sku: product.sku,
                packedQuantity: quantity,
                scannedCode: shippingLabelId || meeshoOrderId || internalQrCode,
                scanType: shippingLabelId ? 'carrier_label' : meeshoOrderId ? 'meesho_order_id' : 'internal_qr',
                operator: req.user?._id,
                notes: notes || 'Auto-packed on order creation',
            });
        }
        // Record stock deduction if not cancelled
        if (orderStatus !== 'cancelled') {
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount,
                productId,
                movementType: 'sale',
                quantity: -quantity,
                unitCost: product.weightedAvgCost || product.defaultPurchaseCost,
                referenceType: 'Order',
                referenceId: order._id.toString(),
                reason: `Order placed: ${meeshoOrderId || order._id}`,
                createdBy: req.user?._id?.toString(),
            });
        }
        await (0, audit_service_1.createAuditLog)({ action: 'CREATE', resource: 'Order', resourceId: order._id.toString(), userId: req.user?._id?.toString(), details: `Order ${meeshoOrderId || order._id}` });
        const populated = await Order_1.Order.findById(order._id).populate('product', 'name sku').populate('businessAccount', 'name gstin');
        res.status(201).json({ success: true, data: populated });
    }
    catch (err) {
        const msg = err.message;
        if (msg.includes('duplicate') || msg.includes('11000')) {
            res.status(400).json({ success: false, message: 'This Meesho order ID already exists for this account' });
        }
        else {
            res.status(400).json({ success: false, message: msg });
        }
    }
});
// PUT /api/orders/:id
router.put('/:id', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const existing = await Order_1.Order.findById(req.params.id);
        if (!existing || existing.isDeleted) {
            res.status(404).json({ success: false, message: 'Order not found' });
            return;
        }
        const { sellingPrice, quantity } = req.body;
        if (sellingPrice && quantity) {
            req.body.grossAmount = sellingPrice * quantity;
        }
        // Reverse old stock movements for this order
        await (0, inventory_service_1.reverseMovementsByReference)(req.params.id, req.user?._id?.toString());
        const order = await Order_1.Order.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
            .populate('product', 'name sku').populate('businessAccount', 'name gstin');
        if (!order) {
            res.status(404).json({ success: false, message: 'Order not found' });
            return;
        }
        // Re-record stock deduction if not cancelled
        if (order.status !== 'cancelled') {
            const prod = await Product_1.Product.findById(order.product);
            if (prod) {
                await (0, inventory_service_1.recordStockMovement)({
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
        await (0, audit_service_1.createAuditLog)({
            action: 'UPDATE', resource: 'Order', resourceId: req.params.id, userId: req.user?._id?.toString(),
            changes: { before: { sellingPrice: existing.sellingPrice, quantity: existing.quantity }, after: { sellingPrice, quantity } },
        });
        res.json({ success: true, data: order });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
// DELETE /api/orders/:id (soft delete)
router.delete('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const order = await Order_1.Order.findById(req.params.id);
        if (!order || order.isDeleted) {
            res.status(404).json({ success: false, message: 'Order not found' });
            return;
        }
        // Restore stock by reversing movement
        await (0, inventory_service_1.reverseMovementsByReference)(req.params.id, req.user?._id?.toString());
        await Order_1.Order.findByIdAndUpdate(req.params.id, { isDeleted: true, deletedAt: new Date() });
        await (0, audit_service_1.createAuditLog)({ action: 'DELETE', resource: 'Order', resourceId: req.params.id, userId: req.user?._id?.toString(), details: `Soft deleted order ${order.meeshoOrderId || order._id}` });
        res.json({ success: true, message: 'Order deleted and stock restored' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/orders/summary/daily
router.get('/summary/daily', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, date } = req.query;
        const targetDate = date ? new Date(date) : new Date();
        const start = new Date(targetDate.setHours(0, 0, 0, 0));
        const end = new Date(targetDate.setHours(23, 59, 59, 999));
        const filter = { isDeleted: false, orderDate: { $gte: start, $lte: end }, ...accountFilter(accountId) };
        const result = await Order_1.Order.aggregate([
            { $match: filter },
            { $group: { _id: null, totalOrders: { $sum: 1 }, totalQty: { $sum: '$quantity' }, totalAmount: { $sum: '$grossAmount' } } },
        ]);
        res.json({ success: true, data: result[0] || { totalOrders: 0, totalQty: 0, totalAmount: 0 } });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/orders/summary/category
router.get('/summary/category', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate } = req.query;
        const filter = { isDeleted: false, ...accountFilter(accountId) };
        if (startDate || endDate) {
            filter.orderDate = {};
            if (startDate)
                filter.orderDate['$gte'] = new Date(startDate);
            if (endDate)
                filter.orderDate['$lte'] = new Date(endDate + 'T23:59:59.999Z');
        }
        const result = await Order_1.Order.aggregate([
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
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=order.routes.js.map