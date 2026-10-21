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
            Order_1.Order.find(filter)
                .populate('product', 'name sku sellingPrice category')
                .populate('items.product', 'name sku sellingPrice category')
                .populate('businessAccount', 'name tradeName gstin')
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
// GET /api/orders/:id
router.get('/:id', async (req, res) => {
    try {
        const order = await Order_1.Order.findById(req.params.id)
            .populate('product')
            .populate('items.product')
            .populate('businessAccount');
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
        const { businessAccount, orderDate, meeshoOrderId, subOrderId, product: productId, sellingPrice, quantity, notes, status, shippingLabelId, carrierName, items, // array of { product, quantity, sellingPrice, sku }
         } = req.body;
        if (!businessAccount) {
            res.status(400).json({ success: false, message: 'businessAccount is required' });
            return;
        }
        let inputItems = [];
        if (Array.isArray(items) && items.length > 0) {
            inputItems = items.map((it) => ({
                product: (it.product || it.productId || '')?.toString(),
                quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
                sellingPrice: it.sellingPrice !== undefined ? Number(it.sellingPrice) : undefined,
                sku: it.sku,
            })).filter((it) => Boolean(it.product));
        }
        else if (productId) {
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
        const account = await BusinessAccount_1.BusinessAccount.findById(businessAccount);
        const { targetAccountIds, isSharedStock } = await (0, inventory_service_1.resolveStockAccountIds)(businessAccount);
        const resolvedItems = [];
        let totalQuantity = 0;
        let totalGrossAmount = 0;
        const orderStatus = status || 'pending';
        for (const item of inputItems) {
            const prod = await Product_1.Product.findById(item.product);
            if (!prod) {
                res.status(404).json({ success: false, message: `Product ${item.product} not found` });
                return;
            }
            const itemQty = item.quantity;
            const itemPrice = item.sellingPrice !== undefined ? item.sellingPrice : (sellingPrice || prod.sellingPrice || 0);
            // Validate stock if not cancelled
            if (orderStatus !== 'cancelled') {
                const stockAgg = await StockMovement_1.StockMovement.aggregate([
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
        const tempId = new mongoose_1.default.Types.ObjectId();
        const internalQrCode = (0, qrScanner_service_1.generateInternalQrCode)(tempId.toString(), mainProduct.sku);
        const order = await Order_1.Order.create({
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
                await PackingRecord_1.PackingRecord.create({
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
                await (0, inventory_service_1.recordStockMovement)({
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
        await (0, audit_service_1.createAuditLog)({ action: 'CREATE', resource: 'Order', resourceId: order._id.toString(), userId: req.user?._id?.toString(), details: `Order ${meeshoOrderId || order._id}${isCombo ? ' (COMBO)' : ''}` });
        const populated = await Order_1.Order.findById(order._id)
            .populate('product', 'name sku')
            .populate('items.product', 'name sku')
            .populate('businessAccount', 'name gstin');
        res.status(201).json({ success: true, data: populated });
    }
    catch (err) {
        const msg = err.message;
        if (msg.includes('duplicate') || msg.includes('11000')) {
            res.status(400).json({ success: false, message: 'This Meesho order ID or Shipping Label already exists for this account' });
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
            .populate('product', 'name sku')
            .populate('items.product', 'name sku')
            .populate('businessAccount', 'name gstin');
        if (!order) {
            res.status(404).json({ success: false, message: 'Order not found' });
            return;
        }
        // Re-record stock deduction if not cancelled
        if (order.status !== 'cancelled') {
            if (order.items && order.items.length > 0) {
                for (const it of order.items) {
                    const prod = await Product_1.Product.findById(it.product);
                    if (prod) {
                        await (0, inventory_service_1.recordStockMovement)({
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
            }
            else {
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