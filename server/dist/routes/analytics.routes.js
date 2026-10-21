"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const Order_1 = require("../models/Order");
const ReturnOrder_1 = require("../models/ReturnOrder");
const Expense_1 = require("../models/Expense");
const Partner_1 = require("../models/Partner");
const BusinessAccount_1 = require("../models/BusinessAccount");
const Product_1 = require("../models/Product");
const StockMovement_1 = require("../models/StockMovement");
const inventory_service_1 = require("../services/inventory.service");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const af = (accountId) => accountId && accountId !== 'all' ? { businessAccount: new mongoose_1.default.Types.ObjectId(accountId) } : {};
const df = (startDate, endDate, field = 'orderDate') => {
    const f = {};
    if (startDate)
        f['$gte'] = new Date(startDate);
    if (endDate)
        f['$lte'] = new Date(endDate + 'T23:59:59.999Z');
    return Object.keys(f).length ? { [field]: f } : {};
};
// GET /api/analytics/top-products
router.get('/top-products', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate } = req.query;
        const result = await Order_1.Order.aggregate([
            { $match: { isDeleted: false, ...af(accountId), ...df(startDate, endDate) } },
            { $group: { _id: '$product', qty: { $sum: '$quantity' }, sales: { $sum: '$grossAmount' } } },
            { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
            { $unwind: '$product' },
            { $project: { name: '$product.name', sku: '$product.sku', qty: 1, sales: 1 } },
            { $sort: { qty: -1 } },
            { $limit: 15 },
        ]);
        res.json({ success: true, data: result });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/analytics/returns-by-category
router.get('/returns-by-category', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate } = req.query;
        const result = await ReturnOrder_1.ReturnOrder.aggregate([
            { $match: { isDeleted: false, ...af(accountId), ...df(startDate, endDate, 'returnDate') } },
            { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'prod' } },
            { $unwind: '$prod' },
            { $lookup: { from: 'categories', localField: 'prod.category', foreignField: '_id', as: 'cat' } },
            { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
            { $group: { _id: '$cat._id', category: { $first: { $ifNull: ['$cat.name', 'Uncategorized'] } }, qty: { $sum: '$returnedQuantity' }, amount: { $sum: '$returnAmount' } } },
            { $sort: { qty: -1 } },
        ]);
        res.json({ success: true, data: result });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/analytics/daily-trend
router.get('/daily-trend', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate } = req.query;
        const [salesTrend, returnTrend] = await Promise.all([
            Order_1.Order.aggregate([
                { $match: { isDeleted: false, ...af(accountId), ...df(startDate, endDate) } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$orderDate', timezone: 'Asia/Kolkata' } }, sales: { $sum: '$grossAmount' } } },
                { $sort: { _id: 1 } },
            ]),
            ReturnOrder_1.ReturnOrder.aggregate([
                { $match: { isDeleted: false, ...af(accountId), ...df(startDate, endDate, 'returnDate') } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$returnDate', timezone: 'Asia/Kolkata' } }, returns: { $sum: '$returnAmount' } } },
                { $sort: { _id: 1 } },
            ]),
        ]);
        const returnMap = Object.fromEntries(returnTrend.map((r) => [r._id, r.returns]));
        const merged = salesTrend.map((s) => ({
            date: s._id,
            sales: s.sales,
            returns: returnMap[s._id] || 0,
        }));
        res.json({ success: true, data: merged });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/analytics/monthly-comparison
router.get('/monthly-comparison', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, year } = req.query;
        const y = parseInt(year || String(new Date().getFullYear()));
        const start = new Date(y, 0, 1);
        const end = new Date(y, 11, 31, 23, 59, 59, 999);
        const [salesByMonth, returnsByMonth] = await Promise.all([
            Order_1.Order.aggregate([
                { $match: { isDeleted: false, orderDate: { $gte: start, $lte: end }, ...af(accountId) } },
                { $group: { _id: { $month: '$orderDate' }, sales: { $sum: '$grossAmount' } } },
                { $sort: { _id: 1 } },
            ]),
            ReturnOrder_1.ReturnOrder.aggregate([
                { $match: { isDeleted: false, returnDate: { $gte: start, $lte: end }, ...af(accountId) } },
                { $group: { _id: { $month: '$returnDate' }, returns: { $sum: '$returnAmount' } } },
                { $sort: { _id: 1 } },
            ]),
        ]);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const returnMap = Object.fromEntries(returnsByMonth.map((r) => [r._id, r.returns]));
        const data = salesByMonth.map((s) => ({
            month: months[s._id - 1],
            sales: s.sales,
            returns: returnMap[s._id] || 0,
        }));
        res.json({ success: true, data });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/analytics/inventory-snapshot
router.get('/inventory-snapshot', async (_req, res) => {
    try {
        const { Product } = await Promise.resolve().then(() => __importStar(require('../models/Product')));
        const products = await Product.find({ isActive: true }).populate('category', 'name');
        const data = products.map(p => ({ name: p.name, sku: p.sku, qty: p.currentStock, value: p.currentStock * p.weightedAvgCost }));
        res.json({ success: true, data });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/analytics/partner-expenses
router.get('/partner-expenses', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate } = req.query;
        const filter = { isDeleted: false, ...af(accountId), ...df(startDate, endDate, 'expenseDate') };
        const [partners, expenses] = await Promise.all([
            Partner_1.Partner.find({ isActive: true }),
            Expense_1.Expense.find(filter),
        ]);
        const data = partners.map(p => {
            const pid = p._id.toString();
            let paid = 0;
            let allocated = 0;
            for (const e of expenses) {
                if (e.paidByPartner?.toString() === pid)
                    paid += e.amount;
                const alloc = e.allocations.find(a => a.partner?.toString() === pid);
                if (alloc)
                    allocated += alloc.amount;
            }
            return { partner: p.name, paid, allocated };
        });
        res.json({ success: true, data });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/analytics/gstin-performance
router.get('/gstin-performance', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const accounts = await BusinessAccount_1.BusinessAccount.find({ isActive: true });
        const data = await Promise.all(accounts.map(async (acc) => {
            const accFilter = { businessAccount: acc._id };
            const [oAgg, rAgg] = await Promise.all([
                Order_1.Order.aggregate([{ $match: { isDeleted: false, ...accFilter, ...df(startDate, endDate) } }, { $group: { _id: null, sales: { $sum: '$grossAmount' }, orders: { $sum: 1 } } }]),
                ReturnOrder_1.ReturnOrder.aggregate([{ $match: { isDeleted: false, ...accFilter, ...df(startDate, endDate, 'returnDate') } }, { $group: { _id: null, returns: { $sum: '$returnAmount' } } }]),
            ]);
            return {
                name: acc.tradeName || acc.name,
                gstin: acc.gstin,
                sales: oAgg[0]?.sales || 0,
                orders: oAgg[0]?.orders || 0,
                returns: rAgg[0]?.returns || 0,
                netSales: (oAgg[0]?.sales || 0) - (rAgg[0]?.returns || 0),
            };
        }));
        res.json({ success: true, data });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/analytics/perfume-performance — perfume-wise sell & return counts and metrics
router.get('/perfume-performance', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate, categoryId, search } = req.query;
        // 1. Fetch active products with filters
        const productFilter = { isActive: true };
        if (categoryId && categoryId !== 'all' && mongoose_1.default.Types.ObjectId.isValid(categoryId)) {
            productFilter.category = new mongoose_1.default.Types.ObjectId(categoryId);
        }
        if (search && search.trim()) {
            const q = search.trim();
            productFilter.$or = [
                { name: { $regex: q, $options: 'i' } },
                { sku: { $regex: q, $options: 'i' } },
            ];
        }
        const products = await Product_1.Product.find(productFilter)
            .populate('category', 'name')
            .sort({ name: 1 })
            .lean();
        const productIds = products.map(p => p._id);
        // 2. Resolve account-specific stock if accountId is provided
        const accountStockMap = new Map();
        let isSharedStock = false;
        if (accountId && accountId !== 'all' && mongoose_1.default.Types.ObjectId.isValid(accountId)) {
            const resolved = await (0, inventory_service_1.resolveStockAccountIds)(accountId);
            isSharedStock = resolved.isSharedStock;
            const stockAgg = await StockMovement_1.StockMovement.aggregate([
                {
                    $match: {
                        product: { $in: productIds },
                        businessAccount: { $in: resolved.targetAccountIds },
                        stockBucket: 'saleable',
                    }
                },
                {
                    $group: {
                        _id: '$product',
                        qty: { $sum: '$quantity' }
                    }
                }
            ]);
            stockAgg.forEach(item => {
                accountStockMap.set(item._id.toString(), Math.max(0, item.qty));
            });
        }
        // 3. Orders matching account & date filter
        const orderFilter = {
            isDeleted: false,
            status: { $ne: 'cancelled' },
            ...af(accountId),
            ...df(startDate, endDate, 'orderDate'),
        };
        const orders = await Order_1.Order.find(orderFilter)
            .select('_id businessAccount orderDate isCombo items product sku quantity grossAmount sellingPrice status')
            .lean();
        // 4. Returns matching account & date filter
        const returnFilter = {
            isDeleted: false,
            ...af(accountId),
            ...df(startDate, endDate, 'returnDate'),
        };
        const returns = await ReturnOrder_1.ReturnOrder.find(returnFilter)
            .select('_id businessAccount returnDate returnType status originalOrder product returnedQuantity goodQuantity damagedQuantity returnAmount')
            .lean();
        // Map stats by product ID string
        const statsMap = new Map();
        for (const p of products) {
            const pIdStr = p._id.toString();
            const stock = accountId && accountId !== 'all'
                ? (accountStockMap.get(pIdStr) ?? 0)
                : Math.max(0, p.currentStock || 0);
            statsMap.set(pIdStr, {
                _id: pIdStr,
                name: p.name,
                sku: p.sku,
                category: p.category?.name || 'Uncategorized',
                sizeml: p.sizeml,
                fragranceType: p.fragranceType,
                brand: p.brand,
                currentStock: stock,
                isSharedStock,
                defaultPurchaseCost: p.defaultPurchaseCost || 0,
                sellingPrice: p.sellingPrice || 0,
                soldCount: 0,
                directSoldCount: 0,
                comboSoldCount: 0,
                soldOrdersCount: 0,
                salesRevenue: 0,
                returnCount: 0,
                customerReturnCount: 0,
                rtoReturnCount: 0,
                damagedReturnCount: 0,
                returnAmount: 0,
                netSoldCount: 0,
                returnRate: 0,
                netRevenue: 0,
            });
        }
        // Set of orders counted in ReturnOrder
        const returnOrderOriginalIds = new Set();
        for (const r of returns) {
            if (r.originalOrder) {
                returnOrderOriginalIds.add(r.originalOrder.toString());
            }
            const pid = r.product ? r.product.toString() : null;
            if (pid && statsMap.has(pid)) {
                const item = statsMap.get(pid);
                const qty = r.returnedQuantity || 1;
                item.returnCount += qty;
                if (r.returnType === 'rto_return') {
                    item.rtoReturnCount += qty;
                }
                else {
                    item.customerReturnCount += qty;
                }
                item.damagedReturnCount += (r.damagedQuantity || 0);
                item.returnAmount += (r.returnAmount || 0);
            }
        }
        // Aggregate Orders
        for (const o of orders) {
            if (o.isCombo && Array.isArray(o.items) && o.items.length > 0) {
                for (const it of o.items) {
                    const pid = it.product ? it.product.toString() : null;
                    if (pid && statsMap.has(pid)) {
                        const item = statsMap.get(pid);
                        const qty = it.quantity || 1;
                        item.soldCount += qty;
                        item.comboSoldCount += qty;
                        item.soldOrdersCount += 1;
                        const unitPrice = it.sellingPrice || Math.round((o.grossAmount || 0) / o.items.length);
                        item.salesRevenue += unitPrice * qty;
                        // If order itself is marked returned and not in ReturnOrder collection
                        if (['returned', 'rto_received'].includes(o.status) && !returnOrderOriginalIds.has(o._id.toString())) {
                            item.returnCount += qty;
                            if (o.status === 'rto_received')
                                item.rtoReturnCount += qty;
                            else
                                item.customerReturnCount += qty;
                            item.returnAmount += unitPrice * qty;
                        }
                    }
                }
            }
            else if (o.product) {
                const pid = o.product.toString();
                if (statsMap.has(pid)) {
                    const item = statsMap.get(pid);
                    const qty = o.quantity || 1;
                    item.soldCount += qty;
                    item.directSoldCount += qty;
                    item.soldOrdersCount += 1;
                    const rev = o.grossAmount || ((o.sellingPrice || 0) * qty) || 0;
                    item.salesRevenue += rev;
                    // If order itself is marked returned and not in ReturnOrder collection
                    if (['returned', 'rto_received'].includes(o.status) && !returnOrderOriginalIds.has(o._id.toString())) {
                        item.returnCount += qty;
                        if (o.status === 'rto_received')
                            item.rtoReturnCount += qty;
                        else
                            item.customerReturnCount += qty;
                        item.returnAmount += rev;
                    }
                }
            }
        }
        // Finalize calculated fields
        const perfumeList = Array.from(statsMap.values()).map(item => {
            const netSoldCount = item.soldCount - item.returnCount;
            const returnRate = item.soldCount > 0
                ? Number(((item.returnCount / item.soldCount) * 100).toFixed(1))
                : 0;
            const netRevenue = item.salesRevenue - item.returnAmount;
            return {
                ...item,
                netSoldCount,
                returnRate,
                netRevenue,
            };
        });
        // Summary totals
        const totals = perfumeList.reduce((acc, p) => {
            acc.totalSoldUnits += p.soldCount;
            acc.totalReturnUnits += p.returnCount;
            acc.totalNetSoldUnits += p.netSoldCount;
            acc.totalSalesRevenue += p.salesRevenue;
            acc.totalReturnAmount += p.returnAmount;
            acc.totalNetRevenue += p.netRevenue;
            acc.totalStockUnits += p.currentStock;
            return acc;
        }, {
            totalSoldUnits: 0,
            totalReturnUnits: 0,
            totalNetSoldUnits: 0,
            totalSalesRevenue: 0,
            totalReturnAmount: 0,
            totalNetRevenue: 0,
            totalStockUnits: 0,
        });
        const overallReturnRate = totals.totalSoldUnits > 0
            ? Number(((totals.totalReturnUnits / totals.totalSoldUnits) * 100).toFixed(1))
            : 0;
        res.json({
            success: true,
            data: {
                perfumes: perfumeList,
                summary: {
                    ...totals,
                    overallReturnRate,
                    totalPerfumes: perfumeList.length,
                }
            }
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=analytics.routes.js.map