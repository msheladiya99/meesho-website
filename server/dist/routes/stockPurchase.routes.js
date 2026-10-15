"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const StockPurchase_1 = require("../models/StockPurchase");
const auth_1 = require("../middleware/auth");
const audit_service_1 = require("../services/audit.service");
const inventory_service_1 = require("../services/inventory.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const accountFilter = (accountId) => accountId && accountId !== 'all' ? { businessAccount: new mongoose_1.default.Types.ObjectId(accountId) } : {};
// GET /api/stock-purchases
router.get('/', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate, page = '1', limit = '100' } = req.query;
        const filter = { isDeleted: false, ...accountFilter(accountId) };
        if (startDate || endDate) {
            filter.purchaseDate = {};
            if (startDate)
                filter.purchaseDate['$gte'] = new Date(startDate);
            if (endDate)
                filter.purchaseDate['$lte'] = new Date(endDate + 'T23:59:59.999Z');
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [purchases, total] = await Promise.all([
            StockPurchase_1.StockPurchase.find(filter)
                .populate('vendor', 'name')
                .populate({
                path: 'items.product',
                select: 'name sku category defaultPurchaseCost weightedAvgCost currentStock',
                populate: { path: 'category', select: 'name' }
            })
                .populate('businessAccount', 'name gstin')
                .sort({ purchaseDate: -1 }).skip(skip).limit(parseInt(limit)),
            StockPurchase_1.StockPurchase.countDocuments(filter),
        ]);
        res.json({ success: true, data: purchases, total });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/stock-purchases/:id
router.get('/:id', async (req, res) => {
    try {
        const p = await StockPurchase_1.StockPurchase.findById(req.params.id)
            .populate('vendor')
            .populate({
            path: 'items.product',
            select: 'name sku category defaultPurchaseCost weightedAvgCost currentStock',
            populate: { path: 'category', select: 'name' }
        })
            .populate('businessAccount');
        if (!p || p.isDeleted) {
            res.status(404).json({ success: false, message: 'Purchase not found' });
            return;
        }
        res.json({ success: true, data: p });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/stock-purchases
router.post('/', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { businessAccount, items, totalAmount } = req.body;
        if (!businessAccount) {
            res.status(400).json({ success: false, message: 'businessAccount is required' });
            return;
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            res.status(400).json({ success: false, message: 'items array is required' });
            return;
        }
        console.log('=== STOCK PURCHASE CREATE ===');
        console.log('Items received:', items.length);
        console.log('Items data:', JSON.stringify(items, null, 2));
        // Check for duplicate products in items
        const productIds = items.map((i) => i.product);
        const uniqueIds = new Set(productIds);
        if (productIds.length !== uniqueIds.size) {
            console.error('DUPLICATE PRODUCTS DETECTED:', productIds);
            res.status(400).json({ success: false, message: 'Duplicate products in items list' });
            return;
        }
        const purchase = await StockPurchase_1.StockPurchase.create({ ...req.body, createdBy: req.user?._id });
        console.log('Purchase created with ID:', purchase._id.toString());
        // Record stock movement for each item
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            console.log(`[${i + 1}/${items.length}] Recording movement for product ${item.product}, quantity: ${item.quantityPurchased}`);
            const unitCostForMovement = item.quantityPurchased > 0 ? Math.round(item.totalAmount / item.quantityPurchased) : item.purchasePricePerUnit;
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount,
                productId: item.product,
                movementType: 'purchase',
                quantity: item.quantityPurchased,
                unitCost: unitCostForMovement,
                referenceType: 'StockPurchase',
                referenceId: purchase._id.toString(),
                reason: `Stock purchase from vendor`,
                createdBy: req.user?._id,
            });
            console.log(`[${i + 1}/${items.length}] Movement recorded for product ${item.product}`);
        }
        await (0, audit_service_1.createAuditLog)({ action: 'CREATE', resource: 'StockPurchase', resourceId: purchase._id.toString(), userId: req.user?._id });
        const populated = await StockPurchase_1.StockPurchase.findById(purchase._id)
            .populate('vendor', 'name')
            .populate({
            path: 'items.product',
            select: 'name sku category defaultPurchaseCost weightedAvgCost currentStock',
            populate: { path: 'category', select: 'name' }
        })
            .populate('businessAccount', 'name gstin');
        console.log('=== STOCK PURCHASE CREATE COMPLETE ===');
        res.status(201).json({ success: true, data: populated });
    }
    catch (err) {
        console.error('Error creating stock purchase:', err);
        res.status(400).json({ success: false, message: err.message });
    }
});
// PUT /api/stock-purchases/:id
router.put('/:id', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const existing = await StockPurchase_1.StockPurchase.findById(req.params.id);
        if (!existing || existing.isDeleted) {
            res.status(404).json({ success: false, message: 'Purchase not found' });
            return;
        }
        const { items, purchaseDate, vendor, vendorInvoiceNumber, discount, additionalCosts, taxAmount, totalAmount, paymentStatus, notes } = req.body;
        if (!items || !Array.isArray(items) || items.length === 0) {
            res.status(400).json({ success: false, message: 'items array is required' });
            return;
        }
        // Reverse old movements, then re-record with new values
        await (0, inventory_service_1.reverseMovementsByReference)(req.params.id, req.user?._id?.toString());
        const updateData = {
            items,
            purchaseDate,
            vendor,
            vendorInvoiceNumber,
            discount,
            additionalCosts,
            taxAmount,
            totalAmount,
            paymentStatus,
            notes,
        };
        const updated = await StockPurchase_1.StockPurchase.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!updated) {
            res.status(404).json({ success: false, message: 'Not found' });
            return;
        }
        // Record stock movement for each item
        for (const item of updated.items) {
            const unitCostForMovement = item.quantityPurchased > 0 ? Math.round(item.totalAmount / item.quantityPurchased) : item.purchasePricePerUnit;
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount: updated.businessAccount.toString(),
                productId: item.product.toString(),
                movementType: 'purchase',
                quantity: item.quantityPurchased,
                unitCost: unitCostForMovement,
                referenceType: 'StockPurchase',
                referenceId: updated._id.toString(),
                reason: 'Stock purchase updated — re-recorded',
                createdBy: req.user?._id?.toString(),
            });
        }
        await (0, audit_service_1.createAuditLog)({ action: 'UPDATE', resource: 'StockPurchase', resourceId: req.params.id, userId: req.user?._id?.toString() });
        const populated = await StockPurchase_1.StockPurchase.findById(updated._id)
            .populate('vendor', 'name')
            .populate({
            path: 'items.product',
            select: 'name sku category defaultPurchaseCost weightedAvgCost currentStock',
            populate: { path: 'category', select: 'name' }
        })
            .populate('businessAccount', 'name gstin');
        res.json({ success: true, data: populated });
    }
    catch (err) {
        console.error('Update error:', err);
        res.status(400).json({ success: false, message: err.message });
    }
});
// DELETE /api/stock-purchases/:id
router.delete('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const purchase = await StockPurchase_1.StockPurchase.findById(req.params.id);
        if (!purchase || purchase.isDeleted) {
            res.status(404).json({ success: false, message: 'Purchase not found' });
            return;
        }
        await (0, inventory_service_1.reverseMovementsByReference)(req.params.id, req.user?._id?.toString());
        await StockPurchase_1.StockPurchase.findByIdAndUpdate(req.params.id, { isDeleted: true });
        await (0, audit_service_1.createAuditLog)({ action: 'DELETE', resource: 'StockPurchase', resourceId: req.params.id, userId: req.user?._id?.toString() });
        res.json({ success: true, message: 'Purchase deleted and stock reversed' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=stockPurchase.routes.js.map