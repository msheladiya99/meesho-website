"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const StockPurchase_1 = require("../models/StockPurchase");
const StockMovement_1 = require("../models/StockMovement");
const auth_1 = require("../middleware/auth");
const audit_service_1 = require("../services/audit.service");
const inventory_service_1 = require("../services/inventory.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// Concurrency locks to prevent duplicate submissions from rapid clicks
const activePurchaseLocks = new Set();
const recentPurchaseCreations = new Map();
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
        const { businessAccount, totalQuantity, purchasePricePerUnit, items, totalAmount } = req.body;
        if (!businessAccount) {
            res.status(400).json({ success: false, message: 'businessAccount is required' });
            return;
        }
        const parsedQty = Number(totalQuantity) || (Array.isArray(items) ? items.reduce((sum, it) => sum + (Number(it.quantityPurchased) || 0), 0) : 0);
        if (!parsedQty || parsedQty <= 0) {
            res.status(400).json({ success: false, message: 'Total quantity must be greater than 0' });
            return;
        }
        // Concurrency guard against rapid double clicks on Create
        const createKey = `${req.user?._id}_${businessAccount}_${req.body.vendorInvoiceNumber || ''}_${req.body.vendor || ''}`;
        const lastCreateTime = recentPurchaseCreations.get(createKey);
        if (lastCreateTime && Date.now() - lastCreateTime < 3000) {
            res.status(409).json({ success: false, message: 'Purchase creation already in progress. Please wait a moment.' });
            return;
        }
        recentPurchaseCreations.set(createKey, Date.now());
        if (recentPurchaseCreations.size > 100) {
            const now = Date.now();
            for (const [k, v] of recentPurchaseCreations.entries()) {
                if (now - v > 10000)
                    recentPurchaseCreations.delete(k);
            }
        }
        const calculatedUnitPrice = purchasePricePerUnit !== undefined && purchasePricePerUnit !== null
            ? Number(purchasePricePerUnit)
            : (parsedQty > 0 ? Math.round((Number(totalAmount) || 0) / parsedQty) : 0);
        const purchase = await StockPurchase_1.StockPurchase.create({
            ...req.body,
            totalQuantity: parsedQty,
            purchasePricePerUnit: calculatedUnitPrice,
            items: Array.isArray(items) ? items : [],
            createdBy: req.user?._id
        });
        // If items with specific products are provided (legacy mode), record per item;
        // Otherwise record direct total quantity warehouse movement
        if (Array.isArray(items) && items.length > 0 && items.some(it => it.product)) {
            for (const item of items) {
                const itemQty = Number(item.quantityPurchased) || 0;
                if (itemQty <= 0)
                    continue;
                const unitCostForMovement = itemQty > 0 ? Math.round((item.totalAmount || (itemQty * item.purchasePricePerUnit)) / itemQty) : item.purchasePricePerUnit;
                await (0, inventory_service_1.recordStockMovement)({
                    businessAccount,
                    productId: item.product,
                    movementType: 'purchase',
                    quantity: itemQty,
                    unitCost: unitCostForMovement,
                    referenceType: 'StockPurchase',
                    referenceId: purchase._id.toString(),
                    reason: `Stock purchase from vendor`,
                    createdBy: req.user?._id?.toString(),
                });
            }
        }
        else {
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount,
                movementType: 'purchase',
                quantity: parsedQty,
                unitCost: calculatedUnitPrice,
                referenceType: 'StockPurchase',
                referenceId: purchase._id.toString(),
                reason: `Direct stock purchase: ${parsedQty} units`,
                createdBy: req.user?._id?.toString(),
            });
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
        res.status(201).json({ success: true, data: populated });
    }
    catch (err) {
        console.error('Error creating stock purchase:', err);
        res.status(400).json({ success: false, message: err.message });
    }
});
// PUT /api/stock-purchases/:id
router.put('/:id', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, async (req, res) => {
    const purchaseId = req.params.id;
    if (activePurchaseLocks.has(purchaseId)) {
        res.status(409).json({ success: false, message: 'An update is already in progress for this purchase. Please wait.' });
        return;
    }
    activePurchaseLocks.add(purchaseId);
    try {
        const existing = await StockPurchase_1.StockPurchase.findById(purchaseId);
        if (!existing || existing.isDeleted) {
            res.status(404).json({ success: false, message: 'Purchase not found' });
            return;
        }
        const { items, totalQuantity, purchasePricePerUnit, purchaseDate, vendor, vendorInvoiceNumber, discount, additionalCosts, taxAmount, totalAmount, paymentStatus, notes } = req.body;
        const parsedQty = Number(totalQuantity) || (Array.isArray(items) ? items.reduce((sum, it) => sum + (Number(it.quantityPurchased) || 0), 0) : existing.totalQuantity || 0);
        if (!parsedQty || parsedQty <= 0) {
            res.status(400).json({ success: false, message: 'Total quantity must be greater than 0' });
            return;
        }
        const calculatedUnitPrice = purchasePricePerUnit !== undefined && purchasePricePerUnit !== null
            ? Number(purchasePricePerUnit)
            : (parsedQty > 0 ? Math.round((Number(totalAmount) || 0) / parsedQty) : 0);
        // Reverse old movements, then clean up any remaining movements with this referenceId
        await (0, inventory_service_1.reverseMovementsByReference)(purchaseId, req.user?._id?.toString());
        await StockMovement_1.StockMovement.deleteMany({
            referenceType: 'StockPurchase',
            referenceId: new mongoose_1.default.Types.ObjectId(purchaseId),
        });
        const updateData = {
            totalQuantity: parsedQty,
            purchasePricePerUnit: calculatedUnitPrice,
            items: Array.isArray(items) ? items : [],
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
        const updated = await StockPurchase_1.StockPurchase.findByIdAndUpdate(purchaseId, updateData, { new: true });
        if (!updated) {
            res.status(404).json({ success: false, message: 'Not found' });
            return;
        }
        // Re-record stock movements
        if (Array.isArray(items) && items.length > 0 && items.some(it => it.product)) {
            for (const item of items) {
                const itemQty = Number(item.quantityPurchased) || 0;
                if (itemQty <= 0)
                    continue;
                const unitCostForMovement = itemQty > 0 ? Math.round((item.totalAmount || (itemQty * item.purchasePricePerUnit)) / itemQty) : item.purchasePricePerUnit;
                await (0, inventory_service_1.recordStockMovement)({
                    businessAccount: updated.businessAccount.toString(),
                    productId: item.product.toString(),
                    movementType: 'purchase',
                    quantity: itemQty,
                    unitCost: unitCostForMovement,
                    referenceType: 'StockPurchase',
                    referenceId: updated._id.toString(),
                    reason: 'Stock purchase updated — re-recorded',
                    createdBy: req.user?._id?.toString(),
                });
            }
        }
        else {
            await (0, inventory_service_1.recordStockMovement)({
                businessAccount: updated.businessAccount.toString(),
                movementType: 'purchase',
                quantity: parsedQty,
                unitCost: calculatedUnitPrice,
                referenceType: 'StockPurchase',
                referenceId: updated._id.toString(),
                reason: `Direct stock purchase updated: ${parsedQty} units`,
                createdBy: req.user?._id?.toString(),
            });
        }
        await (0, audit_service_1.createAuditLog)({ action: 'UPDATE', resource: 'StockPurchase', resourceId: purchaseId, userId: req.user?._id?.toString() });
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
    finally {
        activePurchaseLocks.delete(purchaseId);
    }
});
// DELETE /api/stock-purchases/:id
router.delete('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    const purchaseId = req.params.id;
    if (activePurchaseLocks.has(purchaseId)) {
        res.status(409).json({ success: false, message: 'An operation is already in progress for this purchase.' });
        return;
    }
    activePurchaseLocks.add(purchaseId);
    try {
        const purchase = await StockPurchase_1.StockPurchase.findById(purchaseId);
        if (!purchase || purchase.isDeleted) {
            res.status(404).json({ success: false, message: 'Purchase not found' });
            return;
        }
        await (0, inventory_service_1.reverseMovementsByReference)(purchaseId, req.user?._id?.toString());
        await StockMovement_1.StockMovement.deleteMany({
            referenceType: 'StockPurchase',
            referenceId: new mongoose_1.default.Types.ObjectId(purchaseId),
        });
        await StockPurchase_1.StockPurchase.findByIdAndUpdate(purchaseId, { isDeleted: true });
        await (0, audit_service_1.createAuditLog)({ action: 'DELETE', resource: 'StockPurchase', resourceId: purchaseId, userId: req.user?._id?.toString() });
        res.json({ success: true, message: 'Purchase deleted and stock reversed' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
    finally {
        activePurchaseLocks.delete(purchaseId);
    }
});
exports.default = router;
//# sourceMappingURL=stockPurchase.routes.js.map