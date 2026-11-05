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
        const data = { ...req.body };
        const b = data.boxCost !== undefined ? Number(data.boxCost) : 200;
        const s = data.stickerCost !== undefined ? Number(data.stickerCost) : 100;
        const bc = data.bagCardCost !== undefined ? Number(data.bagCardCost) : 100;
        const pl = data.printLabelCost !== undefined ? Number(data.printLabelCost) : 100;
        data.boxCost = b;
        data.stickerCost = s;
        data.bagCardCost = bc;
        data.printLabelCost = pl;
        data.packingCost = b + s + bc + pl;
        if (!data.packingPreset) {
            data.packingPreset = s === 400 ? 'special' : (s === 100 && b === 200 && bc === 100 && pl === 100 ? 'standard' : 'custom');
        }
        const p = await Product_1.Product.create(data);
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
        const data = { ...req.body };
        if (data.boxCost !== undefined || data.stickerCost !== undefined || data.bagCardCost !== undefined || data.printLabelCost !== undefined) {
            const existing = await Product_1.Product.findById(id);
            const b = data.boxCost !== undefined ? Number(data.boxCost) : (existing?.boxCost ?? 200);
            const s = data.stickerCost !== undefined ? Number(data.stickerCost) : (existing?.stickerCost ?? 100);
            const bc = data.bagCardCost !== undefined ? Number(data.bagCardCost) : (existing?.bagCardCost ?? 100);
            const pl = data.printLabelCost !== undefined ? Number(data.printLabelCost) : (existing?.printLabelCost ?? 100);
            data.boxCost = b;
            data.stickerCost = s;
            data.bagCardCost = bc;
            data.printLabelCost = pl;
            data.packingCost = b + s + bc + pl;
            if (!data.packingPreset) {
                data.packingPreset = s === 400 ? 'special' : (s === 100 && b === 200 && bc === 100 && pl === 100 ? 'standard' : 'custom');
            }
        }
        const p = await Product_1.Product.findByIdAndUpdate(id, data, { new: true, runValidators: true }).populate('category');
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
router.post('/bulk-update-packing', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const { productIds, boxCost, stickerCost, bagCardCost, printLabelCost, packingPreset } = req.body;
        const b = Number(boxCost) || 0;
        const s = Number(stickerCost) || 0;
        const bc = Number(bagCardCost) || 0;
        const pl = Number(printLabelCost) || 0;
        const totalPacking = b + s + bc + pl;
        const filter = {};
        if (productIds === 'all') {
            filter.isActive = true;
        }
        else if (Array.isArray(productIds) && productIds.length > 0) {
            filter._id = { $in: productIds.map((pid) => new mongoose_1.default.Types.ObjectId(pid)) };
        }
        else {
            res.status(400).json({ success: false, message: 'productIds array or "all" is required' });
            return;
        }
        const updateData = {
            boxCost: b,
            stickerCost: s,
            bagCardCost: bc,
            printLabelCost: pl,
            packingCost: totalPacking,
            packingPreset: packingPreset || (s === 400 ? 'special' : (s === 100 && b === 200 && bc === 100 && pl === 100 ? 'standard' : 'custom')),
        };
        const result = await Product_1.Product.updateMany(filter, { $set: updateData });
        await (0, audit_service_1.createAuditLog)({
            action: 'UPDATE',
            resource: 'Product',
            userId: req.user?._id,
            details: `Bulk updated packaging charges for ${result.modifiedCount} products (Total: ₹${(totalPacking / 100).toFixed(2)}, Preset: ${updateData.packingPreset})`,
        });
        res.json({
            success: true,
            message: `Updated packaging charges for ${result.modifiedCount} product(s)`,
            modifiedCount: result.modifiedCount,
        });
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