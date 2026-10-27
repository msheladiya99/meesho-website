"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const ReturnOrder_1 = require("../models/ReturnOrder");
const Order_1 = require("../models/Order");
const Product_1 = require("../models/Product");
const ScanException_1 = require("../models/ScanException");
const auth_1 = require("../middleware/auth");
const audit_service_1 = require("../services/audit.service");
const inventory_service_1 = require("../services/inventory.service");
const qrScanner_service_1 = require("../services/qrScanner.service");
const customerReturnCharge_service_1 = require("../services/customerReturnCharge.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const generateReturnTransactionId = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `RET-${dateStr}-${rand}`;
};
const accountFilter = (accountId) => accountId && accountId !== 'all' ? { businessAccount: new mongoose_1.default.Types.ObjectId(accountId) } : {};
// POST /api/returns/lookup — Scan barcode / QR and fetch order with prior returns and eligible quantity
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
                module: 'return',
                exceptionType: exception?.includes('belongs to') ? 'wrong_account' : 'order_not_found',
                attemptedAction: 'Lookup Order for Return',
                operator: req.user?._id,
                details: exception || 'Order Not Found',
            });
            res.status(404).json({
                success: false,
                message: exception || 'Order Not Found',
            });
            return;
        }
        // Fetch prior returns for this order
        const priorReturns = await ReturnOrder_1.ReturnOrder.find({
            originalOrder: order._id,
            isDeleted: false,
        }).populate('operator', 'name email').sort({ returnDate: -1 });
        const totalPreviouslyReturned = priorReturns.reduce((sum, r) => sum + r.returnedQuantity, 0);
        const eligibleReturnQuantity = Math.max(0, order.quantity - totalPreviouslyReturned);
        res.json({
            success: true,
            data: {
                order,
                matchedBy,
                orderedQuantity: order.quantity,
                packedQuantity: order.packedQuantity || 0,
                totalPreviouslyReturned,
                eligibleReturnQuantity,
                priorReturns,
                canReturn: eligibleReturnQuantity > 0,
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/returns/process — Process scanned return parcel with full condition inspection and stock safety
router.post('/process', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { orderId, returnType = 'customer_return', // 'customer_return' | 'rto_return'
        receivedQuantity, goodQuantity = 0, damagedQuantity = 0, pendingInspectionQuantity = 0, returnReason, damageReason, notes, scannedQrCode, photos = [], receivedDate, allowAuthorizedOverride = false, } = req.body;
        if (!orderId) {
            res.status(400).json({ success: false, message: 'orderId is required' });
            return;
        }
        const recvQty = parseInt(receivedQuantity, 10);
        const goodQty = parseInt(goodQuantity || 0, 10);
        const dmgQty = parseInt(damagedQuantity || 0, 10);
        const pendQty = parseInt(pendingInspectionQuantity || 0, 10);
        if (isNaN(recvQty) || recvQty <= 0) {
            res.status(400).json({ success: false, message: 'Received quantity must be a positive integer' });
            return;
        }
        // Validate that condition breakdown adds up to receivedQuantity
        if (goodQty + dmgQty + pendQty !== recvQty) {
            res.status(400).json({
                success: false,
                message: `Condition quantities (Good: ${goodQty}, Damaged: ${dmgQty}, Pending: ${pendQty}) must sum exactly to received quantity (${recvQty}).`,
            });
            return;
        }
        // For Customer Return: condition inspection is required upfront (good + damaged == received)
        if (returnType === 'customer_return' && pendQty > 0) {
            res.status(400).json({
                success: false,
                message: 'Customer returns require condition inspection upfront (Good or Damaged). Pending inspection is only for RTO parcels.',
            });
            return;
        }
        const order = await Order_1.Order.findById(orderId).populate('product').populate('businessAccount');
        if (!order || order.isDeleted) {
            res.status(404).json({ success: false, message: 'Original order not found' });
            return;
        }
        // GSTIN Account security check
        if (req.user?.role !== 'admin') {
            const allowed = req.user?.allowedAccounts || [];
            if (!allowed.includes(order.businessAccount._id.toString())) {
                res.status(403).json({ success: false, message: 'Access to this GSTIN account is not permitted' });
                return;
            }
        }
        // Fetch prior returns for this order
        const priorReturns = await ReturnOrder_1.ReturnOrder.find({
            originalOrder: order._id,
            isDeleted: false,
        });
        const totalPreviouslyReturned = priorReturns.reduce((sum, r) => sum + r.returnedQuantity, 0);
        const eligibleReturnQuantity = Math.max(0, order.quantity - totalPreviouslyReturned);
        // Prevent duplicate return scan / over-return
        if (eligibleReturnQuantity === 0 && !allowAuthorizedOverride) {
            await (0, qrScanner_service_1.recordScanException)({
                businessAccount: order.businessAccount._id.toString(),
                scannedCode: scannedQrCode || order.shippingLabelId || order.meeshoOrderId || order._id.toString(),
                module: 'return',
                exceptionType: 'already_returned',
                attemptedAction: 'Process Return',
                operator: req.user?._id,
                details: `Order ${order.meeshoOrderId || order._id} has already been fully returned (${totalPreviouslyReturned}/${order.quantity}).`,
            });
            res.status(400).json({
                success: false,
                message: `This order has already been fully returned (${totalPreviouslyReturned} of ${order.quantity} units returned). Duplicate return scan prevented.`,
            });
            return;
        }
        if (recvQty > eligibleReturnQuantity && !allowAuthorizedOverride) {
            await (0, qrScanner_service_1.recordScanException)({
                businessAccount: order.businessAccount._id.toString(),
                scannedCode: scannedQrCode || order.shippingLabelId || order.meeshoOrderId || order._id.toString(),
                module: 'return',
                exceptionType: 'qty_exceeded',
                attemptedAction: 'Process Return',
                operator: req.user?._id,
                details: `Received return qty (${recvQty}) exceeds eligible unreturned qty (${eligibleReturnQuantity}).`,
            });
            res.status(400).json({
                success: false,
                message: `Returned quantity (${recvQty}) exceeds eligible unreturned quantity (${eligibleReturnQuantity}). Authorized override required.`,
            });
            return;
        }
        const returnTxId = generateReturnTransactionId();
        const returnAmount = order.sellingPrice * recvQty;
        // Determine high-level itemCondition & stockDisposition
        let itemCondition = 'pending_inspection';
        let stockDisposition = 'pending';
        let returnStatus = 'stock_updated';
        if (pendQty > 0) {
            itemCondition = 'pending_inspection';
            stockDisposition = 'pending';
            returnStatus = 'inspection_pending';
        }
        else if (dmgQty > 0 && goodQty === 0) {
            itemCondition = 'damaged';
            stockDisposition = 'discard';
            returnStatus = 'stock_updated';
        }
        else if (goodQty > 0 && dmgQty === 0) {
            itemCondition = 'sellable';
            stockDisposition = 'restock';
            returnStatus = 'stock_updated';
        }
        else {
            // Mixed
            itemCondition = 'sellable';
            stockDisposition = 'restock';
            returnStatus = 'stock_updated';
        }
        const prodId = (order.product?._id || order.product).toString();
        // 1. If good units accepted -> add to saleable inventory ledger
        let stockRestored = false;
        if (goodQty > 0) {
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount: order.businessAccount._id.toString(),
                productId: prodId,
                movementType: 'return_in',
                stockBucket: 'saleable',
                quantity: goodQty,
                referenceType: 'ReturnOrder',
                reason: `${returnType === 'rto_return' ? 'RTO' : 'Customer Return'} good condition approved (Tx: ${returnTxId})`,
                createdBy: req.user?._id,
            });
            stockRestored = true;
        }
        // 2. If damaged units -> add to separate damaged-stock bucket ONLY (never saleable)
        let damagedStockRestored = false;
        if (dmgQty > 0) {
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount: order.businessAccount._id.toString(),
                productId: prodId,
                movementType: 'return_damaged',
                stockBucket: 'damaged',
                quantity: dmgQty,
                referenceType: 'ReturnOrder',
                reason: `${returnType === 'rto_return' ? 'RTO' : 'Customer Return'} damaged: ${damageReason || 'Condition damaged'} (Tx: ${returnTxId})`,
                createdBy: req.user?._id,
            });
            damagedStockRestored = true;
        }
        // 3. If pending inspection (RTO) -> store in pending bucket (not saleable)
        if (pendQty > 0) {
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount: order.businessAccount._id.toString(),
                productId: prodId,
                movementType: 'return_in',
                stockBucket: 'pending',
                quantity: pendQty,
                referenceType: 'ReturnOrder',
                reason: `RTO parcel received awaiting inspection (Tx: ${returnTxId})`,
                createdBy: req.user?._id,
            });
        }
        // Create the ReturnOrder record
        const returnOrder = await ReturnOrder_1.ReturnOrder.create({
            returnTransactionId: returnTxId,
            businessAccount: order.businessAccount._id,
            returnDate: receivedDate ? new Date(receivedDate) : new Date(),
            returnType,
            status: returnStatus,
            originalOrder: order._id,
            meeshoOrderId: order.meeshoOrderId,
            carrierTrackingId: order.shippingLabelId,
            scannedQrCode,
            product: order.product?._id || order.product,
            returnedQuantity: recvQty,
            goodQuantity: goodQty,
            damagedQuantity: dmgQty,
            pendingInspectionQuantity: pendQty,
            originalSellingPrice: order.sellingPrice,
            returnAmount,
            returnReason: returnReason || (returnType === 'rto_return' ? 'Return to Origin' : 'Customer Return'),
            damageReason,
            damagePhotos: Array.isArray(photos) ? photos : [],
            damageResolution: 'none',
            itemCondition,
            stockDisposition,
            stockRestored,
            damagedStockRestored,
            receivedAt: new Date(),
            receivedBy: req.user?._id,
            inspectedAt: pendQty === 0 ? new Date() : undefined,
            inspectedBy: pendQty === 0 ? req.user?._id : undefined,
            operator: req.user?._id,
            notes,
            isProcessed: pendQty === 0,
            createdBy: req.user?._id,
        });
        // Update original order status appropriately
        const newTotalReturned = totalPreviouslyReturned + recvQty;
        if (newTotalReturned >= order.quantity) {
            order.status = returnType === 'rto_return' ? 'rto_received' : 'returned';
        }
        else {
            order.notes = order.notes
                ? `${order.notes} | Partially returned ${newTotalReturned}/${order.quantity}`
                : `Partially returned ${newTotalReturned}/${order.quantity}`;
        }
        await order.save();
        // If customer return, apply customer return charge expense
        if (returnType === 'customer_return') {
            await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({
                orderId: order._id,
                returnOrderId: returnOrder._id,
                returnedQuantity: recvQty,
                returnDate: returnOrder.returnDate,
                userId: req.user?._id,
            });
        }
        await (0, audit_service_1.createAuditLog)({
            action: 'CREATE',
            resource: 'ReturnOrder',
            resourceId: returnOrder._id.toString(),
            userId: req.user?._id,
            details: `${returnType.toUpperCase()} processed: ${recvQty} units (Good: ${goodQty}, Damaged: ${dmgQty}, Pending: ${pendQty}) for Order ${order.meeshoOrderId || order._id} (Tx: ${returnTxId})`,
        });
        const populated = await ReturnOrder_1.ReturnOrder.findById(returnOrder._id)
            .populate('product', 'name sku currentStock damagedStock pendingInspectionStock')
            .populate('businessAccount', 'name tradeName gstin')
            .populate('operator', 'name email');
        res.status(201).json({
            success: true,
            message: `${returnType === 'rto_return' ? 'RTO' : 'Customer Return'} processed successfully! Tx ID: ${returnTxId}`,
            data: populated,
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/returns/:id/inspect — Inspect pending inspection units (RTO)
router.post('/:id/inspect', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { goodQuantity = 0, damagedQuantity = 0, damageReason, damagePhotos = [] } = req.body;
        const goodQty = parseInt(goodQuantity, 10) || 0;
        const dmgQty = parseInt(damagedQuantity, 10) || 0;
        const returnOrder = await ReturnOrder_1.ReturnOrder.findById(req.params.id).populate('product').populate('businessAccount');
        if (!returnOrder || returnOrder.isDeleted) {
            res.status(404).json({ success: false, message: 'Return record not found' });
            return;
        }
        const pendingQty = returnOrder.pendingInspectionQuantity || 0;
        if (pendingQty <= 0) {
            res.status(400).json({ success: false, message: 'This return has no units pending inspection' });
            return;
        }
        if (goodQty + dmgQty !== pendingQty) {
            res.status(400).json({
                success: false,
                message: `Inspected units (Good: ${goodQty} + Damaged: ${dmgQty} = ${goodQty + dmgQty}) must equal pending units (${pendingQty}).`,
            });
            return;
        }
        const prodId = (returnOrder.product?._id || returnOrder.product).toString();
        const acctId = (returnOrder.businessAccount?._id || returnOrder.businessAccount).toString();
        // 1. Remove from pending stock bucket
        await (0, inventory_service_1.recordStockMovement)({
            businessAccount: acctId,
            productId: prodId,
            movementType: 'adjustment',
            stockBucket: 'pending',
            quantity: -pendingQty,
            referenceType: 'ReturnOrder',
            referenceId: returnOrder._id.toString(),
            reason: `Inspection completed for Return Tx ${returnOrder.returnTransactionId}`,
            createdBy: req.user?._id,
        });
        // 2. Add approved good units to saleable stock bucket
        if (goodQty > 0) {
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount: acctId,
                productId: prodId,
                movementType: 'return_in',
                stockBucket: 'saleable',
                quantity: goodQty,
                referenceType: 'ReturnOrder',
                referenceId: returnOrder._id.toString(),
                reason: `RTO inspected and approved as saleable (Tx: ${returnOrder.returnTransactionId})`,
                createdBy: req.user?._id,
            });
            returnOrder.stockRestored = true;
        }
        // 3. Add damaged units to damaged stock bucket
        if (dmgQty > 0) {
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount: acctId,
                productId: prodId,
                movementType: 'return_damaged',
                stockBucket: 'damaged',
                quantity: dmgQty,
                referenceType: 'ReturnOrder',
                referenceId: returnOrder._id.toString(),
                reason: `RTO inspected as damaged: ${damageReason || 'Inspection damaged'} (Tx: ${returnOrder.returnTransactionId})`,
                createdBy: req.user?._id,
            });
            returnOrder.damagedStockRestored = true;
        }
        returnOrder.goodQuantity += goodQty;
        returnOrder.damagedQuantity += dmgQty;
        returnOrder.pendingInspectionQuantity = 0;
        returnOrder.status = 'stock_updated';
        returnOrder.isProcessed = true;
        returnOrder.inspectedAt = new Date();
        returnOrder.inspectedBy = new mongoose_1.default.Types.ObjectId(req.user?._id);
        if (damageReason)
            returnOrder.damageReason = damageReason;
        if (damagePhotos.length > 0)
            returnOrder.damagePhotos.push(...damagePhotos);
        await returnOrder.save();
        await (0, audit_service_1.createAuditLog)({
            action: 'UPDATE',
            resource: 'ReturnOrder',
            resourceId: returnOrder._id.toString(),
            userId: req.user?._id,
            details: `Inspection finished for Return Tx ${returnOrder.returnTransactionId}: Good: ${goodQty}, Damaged: ${dmgQty}`,
        });
        const updated = await ReturnOrder_1.ReturnOrder.findById(returnOrder._id)
            .populate('product')
            .populate('businessAccount');
        res.json({ success: true, message: 'Inspection completed and stock updated!', data: updated });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/returns/damaged-action — Repair, dispose, or approve damaged stock for resale
router.post('/damaged-action', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { productId, accountId, action, quantity, reason, notes } = req.body;
        if (!productId || !accountId || !action || !quantity) {
            res.status(400).json({ success: false, message: 'productId, accountId, action, and quantity are required' });
            return;
        }
        const qty = parseInt(quantity, 10);
        if (isNaN(qty) || qty <= 0) {
            res.status(400).json({ success: false, message: 'Quantity must be a positive integer' });
            return;
        }
        const product = await Product_1.Product.findById(productId);
        if (!product) {
            res.status(404).json({ success: false, message: 'Product not found' });
            return;
        }
        const currentDamaged = product.damagedStock || 0;
        if (qty > currentDamaged) {
            res.status(400).json({
                success: false,
                message: `Quantity (${qty}) exceeds available damaged stock (${currentDamaged}).`,
            });
            return;
        }
        if (action === 'repair' || action === 'approve_resale') {
            // Deduct from damaged bucket, add to saleable bucket
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount: accountId,
                productId,
                movementType: action === 'repair' ? 'damage_repaired' : 'damage_to_saleable',
                stockBucket: 'damaged',
                quantity: -qty,
                reason: `${action === 'repair' ? 'Repaired' : 'Reinspected and approved for resale'}: ${reason || notes || ''}`,
                createdBy: req.user?._id,
            });
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount: accountId,
                productId,
                movementType: action === 'repair' ? 'damage_repaired' : 'damage_to_saleable',
                stockBucket: 'saleable',
                quantity: qty,
                unitCost: product.weightedAvgCost || product.defaultPurchaseCost,
                reason: `${action === 'repair' ? 'Repaired item restored to saleable stock' : 'Approved for resale'}: ${reason || notes || ''}`,
                createdBy: req.user?._id,
            });
        }
        else if (action === 'dispose') {
            // Deduct from damaged bucket permanently
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount: accountId,
                productId,
                movementType: 'damage_disposed',
                stockBucket: 'damaged',
                quantity: -qty,
                reason: `Disposed damaged inventory: ${reason || notes || 'Scrapped'}`,
                createdBy: req.user?._id,
            });
        }
        else {
            res.status(400).json({ success: false, message: 'Invalid action. Supported: repair, dispose, approve_resale' });
            return;
        }
        await (0, audit_service_1.createAuditLog)({
            action: 'UPDATE',
            resource: 'ProductDamagedStock',
            resourceId: productId,
            userId: req.user?._id,
            details: `Damaged stock action "${action}" on ${qty} units of SKU ${product.sku}. Reason: ${reason || 'N/A'}`,
        });
        const updated = await Product_1.Product.findById(productId);
        res.json({
            success: true,
            message: `Damaged stock action (${action}) completed successfully`,
            data: updated,
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/returns/registers — Dedicated register reports with filters
router.get('/registers', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, returnType, condition, startDate, endDate, search, page = '1', limit = '50', operatorId, productId, } = req.query;
        const filter = { isDeleted: false, ...accountFilter(accountId) };
        if (returnType)
            filter.returnType = returnType;
        if (productId)
            filter.product = productId;
        if (operatorId)
            filter.operator = operatorId;
        if (condition === 'good') {
            filter.goodQuantity = { $gt: 0 };
        }
        else if (condition === 'damaged') {
            filter.damagedQuantity = { $gt: 0 };
        }
        else if (condition === 'pending_inspection') {
            filter.pendingInspectionQuantity = { $gt: 0 };
        }
        if (startDate || endDate) {
            filter.returnDate = {};
            if (startDate)
                filter.returnDate['$gte'] = new Date(startDate);
            if (endDate)
                filter.returnDate['$lte'] = new Date(endDate + 'T23:59:59.999Z');
        }
        if (search) {
            filter.$or = [
                { returnTransactionId: { $regex: search, $options: 'i' } },
                { meeshoOrderId: { $regex: search, $options: 'i' } },
                { carrierTrackingId: { $regex: search, $options: 'i' } },
                { scannedQrCode: { $regex: search, $options: 'i' } },
            ];
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [returns, total] = await Promise.all([
            ReturnOrder_1.ReturnOrder.find(filter)
                .populate('product', 'name sku currentStock damagedStock')
                .populate('businessAccount', 'name tradeName gstin')
                .populate('operator', 'name email')
                .populate('originalOrder', 'meeshoOrderId quantity sellingPrice status shippingLabelId internalQrCode')
                .sort({ returnDate: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            ReturnOrder_1.ReturnOrder.countDocuments(filter),
        ]);
        res.json({ success: true, data: returns, total, page: parseInt(page), limit: parseInt(limit) });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/returns/exceptions — Exception / Duplicate scan report
router.get('/exceptions', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, module, exceptionType, startDate, endDate, page = '1', limit = '50' } = req.query;
        const filter = { ...accountFilter(accountId) };
        if (module)
            filter.module = module;
        if (exceptionType)
            filter.exceptionType = exceptionType;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate)
                filter.createdAt['$gte'] = new Date(startDate);
            if (endDate)
                filter.createdAt['$lte'] = new Date(endDate + 'T23:59:59.999Z');
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [exceptions, total] = await Promise.all([
            ScanException_1.ScanException.find(filter)
                .populate('operator', 'name email')
                .populate('businessAccount', 'name tradeName gstin')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            ScanException_1.ScanException.countDocuments(filter),
        ]);
        res.json({ success: true, data: exceptions, total, page: parseInt(page), limit: parseInt(limit) });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/returns — standard list (backward compatible)
router.get('/', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate, search, returnType, page = '1', limit = '100' } = req.query;
        const filter = { isDeleted: false, ...accountFilter(accountId) };
        if (returnType)
            filter.returnType = returnType;
        if (startDate || endDate) {
            filter.returnDate = {};
            if (startDate)
                filter.returnDate['$gte'] = new Date(startDate);
            if (endDate)
                filter.returnDate['$lte'] = new Date(endDate + 'T23:59:59.999Z');
        }
        if (search) {
            filter.$or = [
                { meeshoOrderId: { $regex: search, $options: 'i' } },
                { returnTransactionId: { $regex: search, $options: 'i' } },
                { carrierTrackingId: { $regex: search, $options: 'i' } },
            ];
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [returns, total] = await Promise.all([
            ReturnOrder_1.ReturnOrder.find(filter)
                .populate('product', 'name sku currentStock damagedStock')
                .populate('businessAccount', 'name tradeName gstin')
                .populate('operator', 'name email')
                .sort({ returnDate: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            ReturnOrder_1.ReturnOrder.countDocuments(filter),
        ]);
        res.json({ success: true, data: returns, total, page: parseInt(page), limit: parseInt(limit) });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/returns/:id
router.get('/:id', async (req, res) => {
    try {
        const r = await ReturnOrder_1.ReturnOrder.findById(req.params.id)
            .populate('product')
            .populate('businessAccount')
            .populate('operator', 'name email');
        if (!r || r.isDeleted) {
            res.status(404).json({ success: false, message: 'Return not found' });
            return;
        }
        res.json({ success: true, data: r });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/returns (legacy standard create)
router.post('/', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { businessAccount, returnDate, originalOrder, meeshoOrderId, product, returnedQuantity, originalSellingPrice, returnAmount, returnReason, itemCondition, stockDisposition, notes, } = req.body;
        if (!businessAccount) {
            res.status(400).json({ success: false, message: 'businessAccount is required' });
            return;
        }
        const returnTxId = generateReturnTransactionId();
        const returnOrder = await ReturnOrder_1.ReturnOrder.create({
            returnTransactionId: returnTxId,
            businessAccount,
            returnDate: returnDate || new Date(),
            originalOrder: originalOrder || undefined,
            meeshoOrderId: meeshoOrderId || undefined,
            product,
            returnedQuantity,
            goodQuantity: itemCondition === 'sellable' && stockDisposition === 'restock' ? returnedQuantity : 0,
            damagedQuantity: itemCondition === 'damaged' ? returnedQuantity : 0,
            pendingInspectionQuantity: itemCondition === 'pending_inspection' ? returnedQuantity : 0,
            originalSellingPrice,
            returnAmount,
            returnReason,
            itemCondition: itemCondition || 'pending_inspection',
            stockDisposition: stockDisposition || 'pending',
            stockRestored: false,
            damagedStockRestored: false,
            notes,
            operator: req.user?._id,
            createdBy: req.user?._id,
        });
        if (itemCondition === 'sellable' && stockDisposition === 'restock') {
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount,
                productId: product,
                movementType: 'return_in',
                stockBucket: 'saleable',
                quantity: returnedQuantity,
                referenceType: 'ReturnOrder',
                referenceId: returnOrder._id.toString(),
                reason: 'Sellable return restocked',
                createdBy: req.user?._id,
            });
            await ReturnOrder_1.ReturnOrder.findByIdAndUpdate(returnOrder._id, { stockRestored: true });
        }
        else if (itemCondition === 'damaged') {
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount,
                productId: product,
                movementType: 'return_damaged',
                stockBucket: 'damaged',
                quantity: returnedQuantity,
                referenceType: 'ReturnOrder',
                referenceId: returnOrder._id.toString(),
                reason: 'Damaged return recorded',
                createdBy: req.user?._id,
            });
            await ReturnOrder_1.ReturnOrder.findByIdAndUpdate(returnOrder._id, { damagedStockRestored: true });
        }
        await (0, audit_service_1.createAuditLog)({
            action: 'CREATE',
            resource: 'ReturnOrder',
            resourceId: returnOrder._id.toString(),
            userId: req.user?._id,
            details: `Return created (Tx: ${returnTxId})`,
        });
        if (returnOrder.returnType === 'customer_return' && originalOrder) {
            await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({
                orderId: originalOrder,
                returnOrderId: returnOrder._id,
                returnedQuantity,
                returnDate: returnOrder.returnDate,
                userId: req.user?._id,
            });
        }
        const populated = await ReturnOrder_1.ReturnOrder.findById(returnOrder._id)
            .populate('product', 'name sku')
            .populate('businessAccount', 'name gstin');
        res.status(201).json({ success: true, data: populated });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
// DELETE /api/returns/:id
router.delete('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const ret = await ReturnOrder_1.ReturnOrder.findById(req.params.id);
        if (!ret || ret.isDeleted) {
            res.status(404).json({ success: false, message: 'Return not found' });
            return;
        }
        // Reverse stock restoration if it happened
        if (ret.stockRestored && ret.goodQuantity > 0) {
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount: ret.businessAccount.toString(),
                productId: ret.product.toString(),
                movementType: 'adjustment',
                stockBucket: 'saleable',
                quantity: -ret.goodQuantity,
                referenceType: 'ReturnReversal',
                referenceId: ret._id.toString(),
                reason: 'Return deleted — reversing saleable stock restoration',
                createdBy: req.user?._id,
            });
        }
        if (ret.damagedStockRestored && ret.damagedQuantity > 0) {
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount: ret.businessAccount.toString(),
                productId: ret.product.toString(),
                movementType: 'adjustment',
                stockBucket: 'damaged',
                quantity: -ret.damagedQuantity,
                referenceType: 'ReturnReversal',
                referenceId: ret._id.toString(),
                reason: 'Return deleted — reversing damaged stock restoration',
                createdBy: req.user?._id,
            });
        }
        const retId = req.params.id;
        await ReturnOrder_1.ReturnOrder.findByIdAndUpdate(retId, { isDeleted: true });
        if (ret.returnType === 'customer_return' && ret.originalOrder) {
            await (0, customerReturnCharge_service_1.reverseCustomerReturnCharge)({
                orderId: ret.originalOrder.toString(),
                reason: `Return order ${ret.returnTransactionId || ret._id} was deleted`,
                userId: req.user?._id,
            });
        }
        await (0, audit_service_1.createAuditLog)({
            action: 'DELETE',
            resource: 'ReturnOrder',
            resourceId: retId,
            userId: req.user?._id,
            details: `Deleted return ${ret.returnTransactionId || ret._id}`,
        });
        res.json({ success: true, message: 'Return deleted' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=return.routes.js.map