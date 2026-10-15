"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Product_1 = require("../models/Product");
const StockMovement_1 = require("../models/StockMovement");
const auth_1 = require("../middleware/auth");
const inventory_service_1 = require("../services/inventory.service");
const audit_service_1 = require("../services/audit.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// GET /api/inventory — list products with current stock
router.get('/', async (req, res) => {
    try {
        const { accountId: _acc, search, categoryId } = req.query;
        const filter = { isActive: true };
        if (search)
            filter.$or = [{ name: { $regex: search, $options: 'i' } }, { sku: { $regex: search, $options: 'i' } }];
        if (categoryId && categoryId !== 'all')
            filter.category = categoryId;
        const products = await Product_1.Product.find(filter).populate('category', 'name').sort({ name: 1 });
        res.json({ success: true, data: products });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/inventory/:productId/movements — stock ledger for a product
router.get('/:productId/movements', async (req, res) => {
    try {
        const { page = '1', limit = '50', accountId } = req.query;
        const filter = { product: req.params.productId };
        if (accountId && accountId !== 'all')
            filter.businessAccount = accountId;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [movements, total] = await Promise.all([
            StockMovement_1.StockMovement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            StockMovement_1.StockMovement.countDocuments(filter),
        ]);
        res.json({ success: true, data: movements, total });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/inventory/:productId/adjust — manual adjustment
router.post('/:productId/adjust', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const { quantity, reason, accountId } = req.body;
        if (!accountId) {
            res.status(400).json({ success: false, message: 'accountId is required for adjustments' });
            return;
        }
        if (!quantity || quantity === 0) {
            res.status(400).json({ success: false, message: 'quantity cannot be zero' });
            return;
        }
        await (0, inventory_service_1.recordStockMovement)({
            businessAccount: accountId,
            productId: req.params.productId,
            movementType: 'adjustment',
            quantity: parseInt(quantity),
            reason: reason || 'Manual adjustment',
            createdBy: req.user?._id,
        });
        await (0, audit_service_1.createAuditLog)({
            action: 'UPDATE', resource: 'Inventory', resourceId: req.params.productId, userId: req.user?._id,
            details: `Manual stock adjustment: ${quantity > 0 ? '+' : ''}${quantity} — ${reason}`,
        });
        const updated = await Product_1.Product.findById(req.params.productId).populate('category', 'name');
        res.json({ success: true, data: updated, message: 'Stock adjusted' });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=inventory.routes.js.map