"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const Order_1 = require("../models/Order");
const ReturnOrder_1 = require("../models/ReturnOrder");
const StockPurchase_1 = require("../models/StockPurchase");
const Expense_1 = require("../models/Expense");
const Product_1 = require("../models/Product");
const PackingRecord_1 = require("../models/PackingRecord");
const ScanException_1 = require("../models/ScanException");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const acctFilter = (accountId) => accountId && accountId !== 'all' ? { businessAccount: new mongoose_1.default.Types.ObjectId(accountId) } : {};
const dateFilter = (startDate, endDate, field = 'orderDate') => {
    if (!startDate && !endDate)
        return {};
    const f = {};
    if (startDate)
        f['$gte'] = new Date(startDate);
    if (endDate)
        f['$lte'] = new Date(endDate + 'T23:59:59.999Z');
    return { [field]: f };
};
// GET /api/reports/dashboard
router.get('/dashboard', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate } = req.query;
        const af = acctFilter(accountId);
        const df = dateFilter(startDate, endDate, 'orderDate');
        const rdf = dateFilter(startDate, endDate, 'returnDate');
        const pdf = dateFilter(startDate, endDate, 'purchaseDate');
        const edf = dateFilter(startDate, endDate, 'expenseDate');
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const [orderAgg, returnAgg, purchaseAgg, expenseAgg, products, pendingPackingCount, packedTodayAgg, dispatchedTodayCount, rtoReturnAgg, customerReturnAgg, returnsAwaitingInspectionCount,] = await Promise.all([
            Order_1.Order.aggregate([{ $match: { isDeleted: false, ...af, ...df } }, { $group: { _id: null, totalSales: { $sum: '$grossAmount' }, totalOrders: { $sum: 1 }, totalQty: { $sum: '$quantity' } } }]),
            ReturnOrder_1.ReturnOrder.aggregate([
                { $match: { isDeleted: false, ...af, ...rdf } },
                {
                    $group: {
                        _id: null,
                        totalReturns: { $sum: 1 },
                        totalReturnQty: { $sum: '$returnedQuantity' },
                        totalReturnValue: { $sum: '$returnAmount' },
                        totalGoodStockRecovered: { $sum: '$goodQuantity' },
                    },
                },
            ]),
            StockPurchase_1.StockPurchase.aggregate([{ $match: { isDeleted: false, ...af, ...pdf } }, { $group: { _id: null, totalPurchases: { $sum: '$totalAmount' } } }]),
            Expense_1.Expense.aggregate([{ $match: { isDeleted: false, ...af, ...edf } }, { $group: { _id: null, totalExpenses: { $sum: '$amount' } } }]),
            Product_1.Product.find({ isActive: true }),
            Order_1.Order.countDocuments({
                isDeleted: false,
                status: 'pending',
                $or: [{ packedQuantity: 0 }, { packedQuantity: { $exists: false } }],
                ...af,
            }),
            PackingRecord_1.PackingRecord.aggregate([
                { $match: { createdAt: { $gte: todayStart, $lte: todayEnd }, ...af } },
                { $group: { _id: null, totalPacked: { $sum: '$packedQuantity' } } },
            ]),
            Order_1.Order.countDocuments({
                isDeleted: false,
                status: 'dispatched',
                dispatchedAt: { $gte: todayStart, $lte: todayEnd },
                ...af,
            }),
            ReturnOrder_1.ReturnOrder.aggregate([
                { $match: { isDeleted: false, returnType: 'rto_return', ...af, ...rdf } },
                { $group: { _id: null, count: { $sum: 1 }, qty: { $sum: '$returnedQuantity' } } },
            ]),
            ReturnOrder_1.ReturnOrder.aggregate([
                { $match: { isDeleted: false, returnType: 'customer_return', ...af, ...rdf } },
                { $group: { _id: null, count: { $sum: 1 }, qty: { $sum: '$returnedQuantity' } } },
            ]),
            ReturnOrder_1.ReturnOrder.countDocuments({
                isDeleted: false,
                $or: [
                    { status: 'inspection_pending' },
                    { pendingInspectionQuantity: { $gt: 0 } },
                ],
                ...af,
            }),
        ]);
        const orders = orderAgg[0] || { totalSales: 0, totalOrders: 0, totalQty: 0 };
        const returns = returnAgg[0] || { totalReturns: 0, totalReturnQty: 0, totalReturnValue: 0, totalGoodStockRecovered: 0 };
        const purchases = purchaseAgg[0] || { totalPurchases: 0 };
        const expenses = expenseAgg[0] || { totalExpenses: 0 };
        const netSales = orders.totalSales - returns.totalReturnValue;
        // COGS = qty_sold × weighted_avg_cost (simplified — uses current WAC as approximation)
        const cogs = orders.totalQty * (products.reduce((s, p) => s + p.weightedAvgCost, 0) / Math.max(products.length, 1));
        const grossProfit = netSales - cogs;
        const netProfit = grossProfit - expenses.totalExpenses;
        const inventoryQty = products.reduce((s, p) => s + p.currentStock, 0);
        const damagedStockTotal = products.reduce((s, p) => s + (p.damagedStock || 0), 0);
        const inventoryValue = products.reduce((s, p) => s + p.currentStock * p.weightedAvgCost, 0);
        res.json({
            success: true,
            data: {
                totalOrderSales: orders.totalSales,
                totalOrders: orders.totalOrders,
                totalQuantitySold: orders.totalQty,
                totalReturnedOrders: returns.totalReturns,
                totalReturnQuantity: returns.totalReturnQty,
                netSales,
                totalPurchaseCost: purchases.totalPurchases,
                totalExpenses: expenses.totalExpenses,
                estimatedGrossProfit: grossProfit,
                estimatedNetProfit: netProfit,
                currentInventoryQty: inventoryQty,
                inventoryValue,
                // MODULE 8 Cards
                pendingPacking: pendingPackingCount,
                packedToday: packedTodayAgg[0]?.totalPacked || 0,
                dispatchedToday: dispatchedTodayCount,
                rtoReturns: rtoReturnAgg[0]?.count || 0,
                rtoReturnQty: rtoReturnAgg[0]?.qty || 0,
                customerReturns: customerReturnAgg[0]?.count || 0,
                customerReturnQty: customerReturnAgg[0]?.qty || 0,
                goodStockRecovered: returns.totalGoodStockRecovered || 0,
                damagedStock: damagedStockTotal,
                returnsAwaitingInspection: returnsAwaitingInspectionCount,
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/reports/pnl
router.get('/pnl', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate } = req.query;
        const af = acctFilter(accountId);
        const df = dateFilter(startDate, endDate, 'orderDate');
        const rdf = dateFilter(startDate, endDate, 'returnDate');
        const pdf = dateFilter(startDate, endDate, 'purchaseDate');
        const edf = dateFilter(startDate, endDate, 'expenseDate');
        const EXPENSE_CATEGORIES = {
            meeshoFees: 'Meesho Fees',
            shipping: 'Shipping',
            advertising: 'Advertising',
        };
        const [orderAgg, cancelAgg, returnAgg, purchaseAgg, expenseAgg, catExpenses, products] = await Promise.all([
            Order_1.Order.aggregate([{ $match: { isDeleted: false, ...af, ...df } }, { $group: { _id: null, gross: { $sum: '$grossAmount' }, qty: { $sum: '$quantity' } } }]),
            Order_1.Order.aggregate([{ $match: { isDeleted: false, status: 'cancelled', ...af, ...df } }, { $group: { _id: null, total: { $sum: '$grossAmount' } } }]),
            ReturnOrder_1.ReturnOrder.aggregate([{ $match: { isDeleted: false, ...af, ...rdf } }, { $group: { _id: null, total: { $sum: '$returnAmount' } } }]),
            StockPurchase_1.StockPurchase.aggregate([{ $match: { isDeleted: false, ...af, ...pdf } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
            Expense_1.Expense.aggregate([{ $match: { isDeleted: false, ...af, ...edf } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Expense_1.Expense.aggregate([
                { $match: { isDeleted: false, ...af, ...edf } },
                { $group: { _id: '$category', total: { $sum: '$amount' } } },
            ]),
            Product_1.Product.find({ isActive: true }),
        ]);
        const grossOrderValue = orderAgg[0]?.gross || 0;
        const salesCancellations = cancelAgg[0]?.total || 0;
        const returnsRefunds = returnAgg[0]?.total || 0;
        const netSales = grossOrderValue - salesCancellations - returnsRefunds;
        const totalQtySold = orderAgg[0]?.qty || 0;
        // More accurate COGS: sum(qty_by_product × WAC_per_product)
        // Simplified: average WAC × total qty
        const avgWAC = products.length > 0
            ? products.reduce((s, p) => s + p.weightedAvgCost, 0) / products.length
            : 0;
        const costOfGoodsSold = Math.round(totalQtySold * avgWAC);
        const grossProfit = netSales - costOfGoodsSold;
        const getCatTotal = (cat) => {
            const found = catExpenses.find((c) => c._id === cat);
            return found ? found.total : 0;
        };
        const meeshoFees = getCatTotal(EXPENSE_CATEGORIES.meeshoFees);
        const shippingCosts = getCatTotal(EXPENSE_CATEGORIES.shipping) + getCatTotal('Return Shipping');
        const advertising = getCatTotal(EXPENSE_CATEGORIES.advertising) + getCatTotal('Marketing');
        const otherExpenses = (expenseAgg[0]?.total || 0) - meeshoFees - shippingCosts - advertising;
        const operatingProfit = grossProfit - meeshoFees - shippingCosts - advertising - Math.max(otherExpenses, 0);
        res.json({
            success: true,
            data: {
                grossOrderValue,
                salesCancellations,
                returnsRefunds,
                netSales,
                costOfGoodsSold,
                grossProfit,
                meeshoFees,
                shippingCosts,
                advertising,
                otherExpenses: Math.max(otherExpenses, 0),
                operatingProfit,
                profitMargin: netSales > 0 ? (operatingProfit / netSales) * 100 : 0,
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/reports/daily
router.get('/daily', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, date } = req.query;
        const targetDate = date ? new Date(date) : new Date();
        const start = new Date(targetDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(targetDate);
        end.setHours(23, 59, 59, 999);
        const af = acctFilter(accountId);
        const [oAgg, rAgg, pAgg, eAgg, products] = await Promise.all([
            Order_1.Order.aggregate([{ $match: { isDeleted: false, orderDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, orders: { $sum: 1 }, qty: { $sum: '$quantity' }, gross: { $sum: '$grossAmount' } } }]),
            ReturnOrder_1.ReturnOrder.aggregate([{ $match: { isDeleted: false, returnDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, returns: { $sum: 1 }, qty: { $sum: '$returnedQuantity' }, value: { $sum: '$returnAmount' } } }]),
            StockPurchase_1.StockPurchase.aggregate([{ $match: { isDeleted: false, purchaseDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
            Expense_1.Expense.aggregate([{ $match: { isDeleted: false, expenseDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Product_1.Product.find({ isActive: true }),
        ]);
        const o = oAgg[0] || {};
        const r = rAgg[0] || {};
        const netSales = (o.gross || 0) - (r.value || 0);
        const inventoryQty = products.reduce((s, p) => s + p.currentStock, 0);
        const inventoryValue = products.reduce((s, p) => s + p.currentStock * p.weightedAvgCost, 0);
        res.json({
            success: true,
            data: {
                totalOrders: o.orders || 0,
                totalQuantity: o.qty || 0,
                grossOrderValue: o.gross || 0,
                totalReturns: r.returns || 0,
                returnQuantity: r.qty || 0,
                returnValue: r.value || 0,
                netSales,
                stockPurchases: pAgg[0]?.total || 0,
                totalExpenses: eAgg[0]?.total || 0,
                estimatedGrossProfit: netSales - (pAgg[0]?.total || 0),
                estimatedNetProfit: netSales - (pAgg[0]?.total || 0) - (eAgg[0]?.total || 0),
                closingStockQty: inventoryQty,
                inventoryValue,
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/reports/monthly
router.get('/monthly', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, year, month } = req.query;
        const y = parseInt(year);
        const m = parseInt(month);
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 0, 23, 59, 59, 999);
        req.query.startDate = start.toISOString().split('T')[0];
        req.query.endDate = end.toISOString().split('T')[0];
        req.query.date = start.toISOString().split('T')[0];
        // Reuse daily logic by delegating
        const af = acctFilter(accountId);
        const [oAgg, rAgg, pAgg, eAgg, products] = await Promise.all([
            Order_1.Order.aggregate([{ $match: { isDeleted: false, orderDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, orders: { $sum: 1 }, qty: { $sum: '$quantity' }, gross: { $sum: '$grossAmount' } } }]),
            ReturnOrder_1.ReturnOrder.aggregate([{ $match: { isDeleted: false, returnDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, returns: { $sum: 1 }, qty: { $sum: '$returnedQuantity' }, value: { $sum: '$returnAmount' } } }]),
            StockPurchase_1.StockPurchase.aggregate([{ $match: { isDeleted: false, purchaseDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
            Expense_1.Expense.aggregate([{ $match: { isDeleted: false, expenseDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Product_1.Product.find({ isActive: true }),
        ]);
        const o = oAgg[0] || {};
        const r = rAgg[0] || {};
        const netSales = (o.gross || 0) - (r.value || 0);
        res.json({
            success: true,
            data: {
                totalOrders: o.orders || 0, totalQuantity: o.qty || 0, grossOrderValue: o.gross || 0,
                totalReturns: r.returns || 0, returnQuantity: r.qty || 0, returnValue: r.value || 0,
                netSales, stockPurchases: pAgg[0]?.total || 0, totalExpenses: eAgg[0]?.total || 0,
                estimatedGrossProfit: netSales - (pAgg[0]?.total || 0),
                estimatedNetProfit: netSales - (pAgg[0]?.total || 0) - (eAgg[0]?.total || 0),
                closingStockQty: products.reduce((s, p) => s + p.currentStock, 0),
                inventoryValue: products.reduce((s, p) => s + p.currentStock * p.weightedAvgCost, 0),
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/reports/yearly
router.get('/yearly', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, year } = req.query;
        const y = parseInt(year);
        const start = new Date(y, 0, 1);
        const end = new Date(y, 11, 31, 23, 59, 59, 999);
        const af = acctFilter(accountId);
        const [oAgg, rAgg, pAgg, eAgg, products] = await Promise.all([
            Order_1.Order.aggregate([{ $match: { isDeleted: false, orderDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, orders: { $sum: 1 }, qty: { $sum: '$quantity' }, gross: { $sum: '$grossAmount' } } }]),
            ReturnOrder_1.ReturnOrder.aggregate([{ $match: { isDeleted: false, returnDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, returns: { $sum: 1 }, qty: { $sum: '$returnedQuantity' }, value: { $sum: '$returnAmount' } } }]),
            StockPurchase_1.StockPurchase.aggregate([{ $match: { isDeleted: false, purchaseDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
            Expense_1.Expense.aggregate([{ $match: { isDeleted: false, expenseDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Product_1.Product.find({ isActive: true }),
        ]);
        const o = oAgg[0] || {};
        const r = rAgg[0] || {};
        const netSales = (o.gross || 0) - (r.value || 0);
        res.json({ success: true, data: { totalOrders: o.orders || 0, grossOrderValue: o.gross || 0, returnValue: r.value || 0, netSales, stockPurchases: pAgg[0]?.total || 0, totalExpenses: eAgg[0]?.total || 0, estimatedNetProfit: netSales - (pAgg[0]?.total || 0) - (eAgg[0]?.total || 0), closingStockQty: products.reduce((s, p) => s + p.currentStock, 0) } });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/reports/custom  — same as daily but with date range
router.get('/custom', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate } = req.query;
        const af = acctFilter(accountId);
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate + 'T23:59:59.999Z') : new Date();
        const [oAgg, rAgg, pAgg, eAgg, products] = await Promise.all([
            Order_1.Order.aggregate([{ $match: { isDeleted: false, orderDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, orders: { $sum: 1 }, qty: { $sum: '$quantity' }, gross: { $sum: '$grossAmount' } } }]),
            ReturnOrder_1.ReturnOrder.aggregate([{ $match: { isDeleted: false, returnDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, returns: { $sum: 1 }, qty: { $sum: '$returnedQuantity' }, value: { $sum: '$returnAmount' } } }]),
            StockPurchase_1.StockPurchase.aggregate([{ $match: { isDeleted: false, purchaseDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
            Expense_1.Expense.aggregate([{ $match: { isDeleted: false, expenseDate: { $gte: start, $lte: end }, ...af } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Product_1.Product.find({ isActive: true }),
        ]);
        const o = oAgg[0] || {};
        const r = rAgg[0] || {};
        const netSales = (o.gross || 0) - (r.value || 0);
        res.json({ success: true, data: { totalOrders: o.orders || 0, totalQuantity: o.qty || 0, grossOrderValue: o.gross || 0, totalReturns: r.returns || 0, returnQuantity: r.qty || 0, returnValue: r.value || 0, netSales, stockPurchases: pAgg[0]?.total || 0, totalExpenses: eAgg[0]?.total || 0, estimatedGrossProfit: netSales - (pAgg[0]?.total || 0), estimatedNetProfit: netSales - (pAgg[0]?.total || 0) - (eAgg[0]?.total || 0), closingStockQty: products.reduce((s, p) => s + p.currentStock, 0), inventoryValue: products.reduce((s, p) => s + p.currentStock * p.weightedAvgCost, 0) } });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/reports/export/:type
router.get('/export/:type', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { type } = req.params;
        const { accountId, startDate, endDate } = req.query;
        const af = acctFilter(accountId);
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate + 'T23:59:59.999Z') : new Date();
        let csvContent = '';
        let filename = `${type}_export.csv`;
        if (type === 'orders' || type === 'daily' || type === 'monthly' || type === 'custom') {
            const orders = await Order_1.Order.find({ isDeleted: false, orderDate: { $gte: start, $lte: end }, ...af })
                .populate('product', 'name sku').sort({ orderDate: -1 });
            csvContent = 'Order Date,Meesho Order ID,Product,SKU,Selling Price (₹),Quantity,Gross Amount (₹),Status\n';
            csvContent += orders.map(o => {
                const prod = typeof o.product === 'object' ? o.product : null;
                return [
                    new Date(o.orderDate).toLocaleDateString('en-IN'),
                    `"${(o.meeshoOrderId || '').replace(/"/g, '""')}"`,
                    `"${(prod?.name || '').replace(/"/g, '""')}"`,
                    o.sku,
                    (o.sellingPrice / 100).toFixed(2),
                    o.quantity,
                    (o.grossAmount / 100).toFixed(2),
                    o.status,
                ].join(',');
            }).join('\n');
            filename = `orders_${startDate || 'all'}_${endDate || 'all'}.csv`;
        }
        else if (type === 'packing') {
            const records = await PackingRecord_1.PackingRecord.find({ createdAt: { $gte: start, $lte: end }, ...af })
                .populate('product', 'name sku')
                .populate('order', 'meeshoOrderId quantity')
                .populate('operator', 'name email')
                .sort({ createdAt: -1 });
            csvContent = 'Timestamp,Transaction ID,Meesho Order ID,Product,SKU,Packed Quantity,Scanned Code,Scan Type,Operator\n';
            csvContent += records.map(r => {
                const prod = r.product?.name || '';
                const orderId = r.order?.meeshoOrderId || '';
                const opName = r.operator?.name || '';
                return [
                    new Date(r.createdAt).toISOString(),
                    r.transactionId,
                    `"${orderId.replace(/"/g, '""')}"`,
                    `"${prod.replace(/"/g, '""')}"`,
                    r.sku,
                    r.packedQuantity,
                    `"${r.scannedCode.replace(/"/g, '""')}"`,
                    r.scanType,
                    `"${opName.replace(/"/g, '""')}"`,
                ].join(',');
            }).join('\n');
            filename = `packing_register_${startDate || 'all'}_${endDate || 'all'}.csv`;
        }
        else if (type === 'returns' || type === 'rto' || type === 'customer_returns') {
            const retFilter = { isDeleted: false, returnDate: { $gte: start, $lte: end }, ...af };
            if (type === 'rto')
                retFilter.returnType = 'rto_return';
            if (type === 'customer_returns')
                retFilter.returnType = 'customer_return';
            const returns = await ReturnOrder_1.ReturnOrder.find(retFilter)
                .populate('product', 'name sku')
                .populate('operator', 'name email')
                .sort({ returnDate: -1 });
            csvContent = 'Return Date,Transaction ID,Type,Status,Meesho Order ID,Product,SKU,Returned Qty,Good Qty,Damaged Qty,Pending Qty,Return Amount (₹),Reason,Damage Reason,Operator\n';
            csvContent += returns.map(r => {
                const prod = r.product?.name || '';
                const opName = r.operator?.name || '';
                return [
                    new Date(r.returnDate).toLocaleDateString('en-IN'),
                    r.returnTransactionId || '',
                    r.returnType,
                    r.status,
                    `"${(r.meeshoOrderId || '').replace(/"/g, '""')}"`,
                    `"${prod.replace(/"/g, '""')}"`,
                    r.product?.sku || '',
                    r.returnedQuantity,
                    r.goodQuantity,
                    r.damagedQuantity,
                    r.pendingInspectionQuantity,
                    (r.returnAmount / 100).toFixed(2),
                    `"${(r.returnReason || '').replace(/"/g, '""')}"`,
                    `"${(r.damageReason || '').replace(/"/g, '""')}"`,
                    `"${opName.replace(/"/g, '""')}"`,
                ].join(',');
            }).join('\n');
            filename = `${type}_register_${startDate || 'all'}_${endDate || 'all'}.csv`;
        }
        else if (type === 'exceptions') {
            const exceptions = await ScanException_1.ScanException.find({ createdAt: { $gte: start, $lte: end }, ...af })
                .populate('operator', 'name email')
                .sort({ createdAt: -1 });
            csvContent = 'Timestamp,Module,Exception Type,Scanned Code,Attempted Action,Details,Operator\n';
            csvContent += exceptions.map(e => {
                const opName = e.operator?.name || '';
                return [
                    new Date(e.createdAt).toISOString(),
                    e.module,
                    e.exceptionType,
                    `"${e.scannedCode.replace(/"/g, '""')}"`,
                    `"${e.attemptedAction.replace(/"/g, '""')}"`,
                    `"${(e.details || '').replace(/"/g, '""')}"`,
                    `"${opName.replace(/"/g, '""')}"`,
                ].join(',');
            }).join('\n');
            filename = `scan_exceptions_${startDate || 'all'}_${endDate || 'all'}.csv`;
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=report.routes.js.map