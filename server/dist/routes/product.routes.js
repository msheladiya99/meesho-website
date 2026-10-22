"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const Product_1 = require("../models/Product");
const StockMovement_1 = require("../models/StockMovement");
const auth_1 = require("../middleware/auth");
const audit_service_1 = require("../services/audit.service");
const inventory_service_1 = require("../services/inventory.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/', async (req, res) => {
    try {
        const { search, categoryId, accountId, page = '1', limit = '100' } = req.query;
        const filter = {};
        if (search)
            filter.$or = [{ name: { $regex: search, $options: 'i' } }, { sku: { $regex: search, $options: 'i' } }];
        if (categoryId)
            filter.category = categoryId;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [products, total] = await Promise.all([
            Product_1.Product.find(filter).populate('category').skip(skip).limit(parseInt(limit)).sort({ name: 1 }),
            Product_1.Product.countDocuments(filter),
        ]);
        // If accountId is provided, resolve target account stock
        if (accountId && accountId !== 'all' && mongoose_1.default.Types.ObjectId.isValid(accountId)) {
            const { targetAccountIds, isSharedStock } = await (0, inventory_service_1.resolveStockAccountIds)(accountId);
            const totalAgg = await StockMovement_1.StockMovement.aggregate([
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
                const pObj = p.toObject();
                pObj.currentStock = totalAvailableStock;
                pObj.totalAvailableStock = totalAvailableStock;
                pObj.isSharedStock = isSharedStock;
                return pObj;
            });
            res.json({ success: true, data: adjustedProducts, total, page: parseInt(page), limit: parseInt(limit), totalAvailableStock });
            return;
        }
        const totalAgg = await StockMovement_1.StockMovement.aggregate([
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
            const pObj = p.toObject();
            pObj.currentStock = totalAvailableStock;
            pObj.totalAvailableStock = totalAvailableStock;
            return pObj;
        });
        res.json({ success: true, data: adjustedProducts, total, page: parseInt(page), limit: parseInt(limit), totalAvailableStock });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const p = await Product_1.Product.findById(req.params.id).populate('category');
        if (!p) {
            res.status(404).json({ success: false, message: 'Product not found' });
            return;
        }
        res.json({ success: true, data: p });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
router.post('/', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const p = await Product_1.Product.create(req.body);
        await (0, audit_service_1.createAuditLog)({ action: 'CREATE', resource: 'Product', resourceId: p._id.toString(), userId: req.user?._id, details: `Created product ${p.sku}` });
        res.status(201).json({ success: true, data: p });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
router.put('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const p = await Product_1.Product.findByIdAndUpdate(id, req.body, { new: true, runValidators: true }).populate('category');
        if (!p) {
            res.status(404).json({ success: false, message: 'Product not found' });
            return;
        }
        await (0, audit_service_1.createAuditLog)({ action: 'UPDATE', resource: 'Product', resourceId: id, userId: req.user?._id });
        res.json({ success: true, data: p });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
router.delete('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const product = await Product_1.Product.findByIdAndDelete(id);
        if (!product) {
            res.status(404).json({ success: false, message: 'Product not found' });
            return;
        }
        await (0, audit_service_1.createAuditLog)({ action: 'DELETE', resource: 'Product', resourceId: id, userId: req.user?._id, details: `Deleted product ${product.sku}` });
        res.json({ success: true, message: 'Product deleted' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=product.routes.js.map