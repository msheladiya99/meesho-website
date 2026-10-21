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
const inventory_service_1 = require("../services/inventory.service");
const audit_service_1 = require("../services/audit.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// GET /api/inventory — list products with current stock
router.get('/', async (req, res) => {
    try {
        const { search, categoryId, accountId } = req.query;
        const filter = { isActive: true };
        if (search)
            filter.$or = [{ name: { $regex: search, $options: 'i' } }, { sku: { $regex: search, $options: 'i' } }];
        if (categoryId && categoryId !== 'all')
            filter.category = categoryId;
        const products = await Product_1.Product.find(filter).populate('category', 'name').sort({ name: 1 });
        // If accountId is provided and valid, calculate account-specific stock
        if (accountId && accountId !== 'all' && mongoose_1.default.Types.ObjectId.isValid(accountId)) {
            const { targetAccountIds, isSharedStock } = await (0, inventory_service_1.resolveStockAccountIds)(accountId);
            const productIds = products.map(p => p._id);
            // Aggregate movements for this account + shared accounts
            const [allTargetMovements, ownMovements] = await Promise.all([
                StockMovement_1.StockMovement.aggregate([
                    {
                        $match: {
                            product: { $in: productIds },
                            businessAccount: { $in: targetAccountIds },
                            stockBucket: 'saleable',
                        }
                    },
                    {
                        $group: {
                            _id: '$product',
                            qty: { $sum: '$quantity' }
                        }
                    }
                ]),
                StockMovement_1.StockMovement.aggregate([
                    {
                        $match: {
                            product: { $in: productIds },
                            businessAccount: new mongoose_1.default.Types.ObjectId(accountId),
                            stockBucket: 'saleable',
                        }
                    },
                    {
                        $group: {
                            _id: '$product',
                            qty: { $sum: '$quantity' }
                        }
                    }
                ])
            ]);
            const targetStockMap = new Map();
            allTargetMovements.forEach(item => {
                targetStockMap.set(item._id.toString(), item.qty);
            });
            const ownStockMap = new Map();
            ownMovements.forEach(item => {
                ownStockMap.set(item._id.toString(), item.qty);
            });
            const mappedProducts = products.map(p => {
                const pObj = p.toObject();
                const ownStock = ownStockMap.get(p._id.toString()) ?? 0;
                // STRICT INVENTORY ISOLATION:
                // Current stock is strictly the calculated stock for target accounts (own stock if unchecked, shared if checked).
                // If an account has 0 stock movements, it strictly shows 0. Never mix with other accounts!
                pObj.currentStock = Math.max(0, targetStockMap.get(p._id.toString()) ?? 0);
                pObj.ownStock = Math.max(0, ownStock);
                pObj.isSharedStock = isSharedStock;
                return pObj;
            });
            res.json({ success: true, data: mappedProducts });
            return;
        }
        res.json({ success: true, data: products });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/inventory/damaged — list products having damaged stock
router.get('/damaged', async (_req, res) => {
    try {
        const products = await Product_1.Product.find({ isActive: true, damagedStock: { $gt: 0 } })
            .populate('category', 'name')
            .sort({ damagedStock: -1 });
        res.json({ success: true, data: products });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/inventory/:productId/movements — stock ledger for a product
router.get('/:productId/movements', async (req, res) => {
    try {
        const productId = req.params.productId;
        const { page = '1', limit = '50', accountId, stockBucket } = req.query;
        const filter = { product: productId };
        if (accountId && accountId !== 'all')
            filter.businessAccount = accountId;
        if (stockBucket)
            filter.stockBucket = stockBucket;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [movements, total] = await Promise.all([
            StockMovement_1.StockMovement.find(filter)
                .populate('createdBy', 'name email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
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
        const productId = req.params.productId;
        const { quantity, reason, accountId, stockBucket = 'saleable' } = req.body;
        if (!accountId) {
            res.status(400).json({ success: false, message: 'accountId is required for adjustments' });
            return;
        }
        if (!quantity || quantity === 0) {
            res.status(400).json({ success: false, message: 'quantity cannot be zero' });
            return;
        }
        const parsedQty = parseInt(quantity, 10);
        const validBucket = ['saleable', 'damaged', 'pending'].includes(stockBucket) ? stockBucket : 'saleable';
        await (0, inventory_service_1.recordStockMovement)({
            businessAccount: String(accountId),
            productId,
            stockBucket: validBucket,
            movementType: 'adjustment',
            quantity: parsedQty,
            reason: reason || `Manual stock adjustment (${validBucket})`,
            createdBy: req.user?._id,
        });
        await (0, audit_service_1.createAuditLog)({
            action: 'UPDATE', resource: 'Inventory', resourceId: productId, userId: req.user?._id,
            details: `Manual ${validBucket} stock adjustment: ${parsedQty > 0 ? '+' : ''}${parsedQty} — ${reason}`,
        });
        const updated = await Product_1.Product.findById(productId).populate('category', 'name');
        res.json({ success: true, data: updated, message: 'Stock adjusted' });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=inventory.routes.js.map