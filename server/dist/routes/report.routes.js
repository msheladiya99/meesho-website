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
const StockMovement_1 = require("../models/StockMovement");
const CustomerReturnCharge_1 = require("../models/CustomerReturnCharge");
const Partner_1 = require("../models/Partner");
const auth_1 = require("../middleware/auth");
const inventory_service_1 = require("../services/inventory.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const acctFilter = (accountId) => accountId && accountId !== 'all' && mongoose_1.default.Types.ObjectId.isValid(accountId)
    ? { businessAccount: new mongoose_1.default.Types.ObjectId(accountId) }
    : {};
const dateFilter = (startDate, endDate, field = 'orderDate') => {
    if (!startDate && !endDate)
        return {};
    const f = {};
    if (startDate && !isNaN(new Date(startDate).getTime()))
        f['$gte'] = new Date(startDate);
    if (endDate && !isNaN(new Date(endDate).getTime()))
        f['$lte'] = new Date(endDate + 'T23:59:59.999Z');
    return Object.keys(f).length ? { [field]: f } : {};
};
const getAccountInventoryStats = async (accountId, products = []) => {
    if (accountId && accountId !== 'all' && mongoose_1.default.Types.ObjectId.isValid(accountId)) {
        const { targetAccountIds } = await (0, inventory_service_1.resolveStockAccountIds)(accountId);
        const movements = await StockMovement_1.StockMovement.aggregate([
            {
                $match: {
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
        ]);
        const productMap = new Map();
        products.forEach(p => productMap.set(p._id.toString(), p));
        let closingStockQty = 0;
        let inventoryValue = 0;
        movements.forEach(m => {
            const qty = Math.max(0, m.qty);
            const p = productMap.get(m._id.toString());
            closingStockQty += qty;
            if (p) {
                inventoryValue += qty * (p.weightedAvgCost || p.defaultPurchaseCost || 0);
            }
        });
        return { closingStockQty, inventoryValue };
    }
    return {
        closingStockQty: products.reduce((s, p) => s + p.currentStock, 0),
        inventoryValue: products.reduce((s, p) => s + p.currentStock * p.weightedAvgCost, 0),
    };
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
        const invStats = await getAccountInventoryStats(accountId, products);
        const inventoryQty = invStats.closingStockQty;
        const damagedStockTotal = products.reduce((s, p) => s + (p.damagedStock || 0), 0);
        const inventoryValue = invStats.inventoryValue;
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
        console.error('[Dashboard Report Error]:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/reports/pnl
router.get('/pnl', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, categoryId, startDate, endDate } = req.query;
        const af = acctFilter(accountId);
        const df = dateFilter(startDate, endDate, 'orderDate');
        const rdf = dateFilter(startDate, endDate, 'returnDate');
        const pdf = dateFilter(startDate, endDate, 'purchaseDate');
        const edf = dateFilter(startDate, endDate, 'expenseDate');
        let prodFilter = {};
        let catChargeFilter = {};
        if (categoryId && categoryId !== 'all' && mongoose_1.default.Types.ObjectId.isValid(categoryId)) {
            const catObjId = new mongoose_1.default.Types.ObjectId(categoryId);
            const matchedProducts = await Product_1.Product.find({ category: catObjId }).select('_id');
            const catProdIds = matchedProducts.map((p) => p._id);
            prodFilter = { product: { $in: catProdIds } };
            catChargeFilter = { $or: [{ category: catObjId }, { product: { $in: catProdIds } }] };
        }
        const [orderAgg, cancelAgg, returnAgg, purchaseAgg, expenseAgg, catExpenses, products, returnChargeAgg, eligibleOrders, adSpendList, activePartners, periodExpenses,] = await Promise.all([
            Order_1.Order.aggregate([{ $match: { isDeleted: false, ...af, ...df, ...prodFilter } }, { $group: { _id: null, gross: { $sum: '$grossAmount' }, qty: { $sum: '$quantity' } } }]),
            Order_1.Order.aggregate([{ $match: { isDeleted: false, status: 'cancelled', ...af, ...df, ...prodFilter } }, { $group: { _id: null, total: { $sum: '$grossAmount' } } }]),
            ReturnOrder_1.ReturnOrder.aggregate([{ $match: { isDeleted: false, ...af, ...rdf, ...prodFilter } }, { $group: { _id: null, total: { $sum: '$returnAmount' } } }]),
            StockPurchase_1.StockPurchase.aggregate([{ $match: { isDeleted: false, ...af, ...pdf } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
            Expense_1.Expense.aggregate([{ $match: { isDeleted: false, ...af, ...edf } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Expense_1.Expense.aggregate([
                { $match: { isDeleted: false, ...af, ...edf } },
                { $group: { _id: '$category', total: { $sum: '$amount' } } },
            ]),
            Product_1.Product.find(categoryId && categoryId !== 'all' ? { isActive: true, category: categoryId } : { isActive: true }).lean(),
            CustomerReturnCharge_1.CustomerReturnCharge.aggregate([
                { $match: { isDeleted: false, status: { $in: ['applied', 'adjusted'] }, ...af, ...rdf, ...catChargeFilter } },
                {
                    $group: {
                        _id: null,
                        totalBase: { $sum: '$baseCharge' },
                        totalHandling: { $sum: '$handlingCharge' },
                        total: { $sum: '$totalCharge' },
                        count: { $sum: 1 },
                    },
                },
            ]),
            Order_1.Order.find({
                isDeleted: false,
                status: { $nin: ['cancelled'] },
                ...af,
                ...df,
                ...prodFilter,
            }).select('quantity grossAmount sellingPrice product isCombo items').lean(),
            Expense_1.Expense.find({
                isDeleted: false,
                ...af,
                ...edf,
                $or: [
                    { category: { $regex: /adverti|ad spend|meesho ad|meta ad|facebook ad|google ad|^ads?$|marketing/i } },
                    { description: { $regex: /adverti|ad spend|meesho ad/i } },
                ],
            })
                .populate('paidByPartner', 'name')
                .populate('businessAccount', 'name gstin')
                .sort({ expenseDate: -1 })
                .lean(),
            Partner_1.Partner.find({ isActive: true }).sort({ createdAt: 1 }).lean(),
            Expense_1.Expense.find({ isDeleted: false, ...af, ...edf })
                .populate('paidByPartner', 'name')
                .populate('allocations.partner', 'name')
                .lean(),
        ]);
        const grossOrderValue = orderAgg[0]?.gross || 0;
        const salesCancellations = cancelAgg[0]?.total || 0;
        const returnsRefunds = returnAgg[0]?.total || 0;
        const netSales = grossOrderValue - salesCancellations - returnsRefunds;
        // Build product lookup map for accurate purchase and packaging calculations
        const allProducts = await Product_1.Product.find().lean();
        const productMap = new Map();
        allProducts.forEach((p) => productMap.set(p._id.toString(), p));
        let totalPurchaseCost = 0;
        let totalBoxCost = 0;
        let totalStickerCost = 0;
        let totalBagCardCost = 0;
        let totalPrintLabelCost = 0;
        let totalUnitsSold = 0;
        const totalOrdersCount = eligibleOrders.length;
        for (const o of eligibleOrders) {
            if (o.isCombo && Array.isArray(o.items) && o.items.length > 0) {
                // 1 print label per parcel
                totalPrintLabelCost += 100;
                for (const it of o.items) {
                    const pid = it.product ? it.product.toString() : '';
                    const prod = productMap.get(pid);
                    const qty = it.quantity || 1;
                    totalUnitsSold += qty;
                    const pCost = prod ? (prod.defaultPurchaseCost || prod.weightedAvgCost || 5500) : 5500;
                    const bCost = prod?.boxCost ?? 200;
                    const sCost = prod?.stickerCost ?? 100;
                    const bcCost = prod?.bagCardCost ?? 100;
                    totalPurchaseCost += pCost * qty;
                    totalBoxCost += bCost * qty;
                    totalStickerCost += sCost * qty;
                    totalBagCardCost += bcCost * qty;
                }
            }
            else {
                const pid = o.product ? o.product.toString() : '';
                const prod = productMap.get(pid);
                const qty = o.quantity || 1;
                totalUnitsSold += qty;
                const pCost = prod ? (prod.defaultPurchaseCost || prod.weightedAvgCost || 5500) : 5500;
                const bCost = prod?.boxCost ?? 200;
                const sCost = prod?.stickerCost ?? 100;
                const bcCost = prod?.bagCardCost ?? 100;
                const plCost = prod?.printLabelCost ?? 100;
                totalPurchaseCost += pCost * qty;
                totalBoxCost += bCost * qty;
                totalStickerCost += sCost * qty;
                totalBagCardCost += bcCost * qty;
                totalPrintLabelCost += plCost;
            }
        }
        // Packing charges = Box + Sticker + POP Bag & Review Card + Order Print Label
        const totalPackingCharges = totalBoxCost + totalStickerCost + totalBagCardCost + totalPrintLabelCost;
        const totalPurchaseAndPackingCost = totalPurchaseCost + totalPackingCharges;
        const costOfGoodsSold = totalPurchaseCost;
        const grossProfit = netSales - totalPurchaseAndPackingCost;
        const isAdCategory = (cat) => /adverti|ad spend|meesho ad|meta ad|facebook ad|google ad|^ads?$|marketing/i.test(cat || '');
        const isMeeshoFeeCategory = (cat) => /meesho fee|platform fee|marketplace fee/i.test(cat || '');
        const isShippingCategory = (cat) => /shipping|courier|transport/i.test(cat || '');
        let advertising = 0;
        let meeshoFees = 0;
        let shippingCosts = 0;
        catExpenses.forEach((c) => {
            const name = c._id || '';
            if (isAdCategory(name)) {
                advertising += c.total;
            }
            else if (isMeeshoFeeCategory(name)) {
                meeshoFees += c.total;
            }
            else if (isShippingCategory(name)) {
                shippingCosts += c.total;
            }
        });
        // RTO Returns strictly receive 0 charges (no penalty on Meesho)
        const totalRtoCharges = 0;
        // Customer returns charges (LESS customer returns, strictly excluding RTO)
        const totalCustomerReturnCharges = returnChargeAgg[0]?.totalBase || 0;
        const totalCustomerReturnHandlingCharges = returnChargeAgg[0]?.totalHandling || 0;
        const totalCustomerReturnExpenses = returnChargeAgg[0]?.total || 0;
        const otherExpenses = Math.max(0, (expenseAgg[0]?.total || 0) - meeshoFees - shippingCosts - advertising);
        const totalOperatingExpenses = meeshoFees + shippingCosts + advertising + totalCustomerReturnExpenses + otherExpenses;
        const operatingProfit = grossProfit - totalOperatingExpenses;
        // Calculate Partner-Wise Profit & Loss Distribution
        const partnerExpenseStats = {};
        for (const p of activePartners) {
            partnerExpenseStats[p._id.toString()] = { paid: 0, allocated: 0 };
        }
        for (const exp of periodExpenses) {
            // Determine who paid
            let paidPartnerId = exp.paidByPartner?._id
                ? exp.paidByPartner._id.toString()
                : exp.paidByPartner?.toString();
            if (!paidPartnerId && exp.paidBy && exp.paidBy !== 'business') {
                if (exp.paidBy === 'partner1' && activePartners[0])
                    paidPartnerId = activePartners[0]._id.toString();
                else if (exp.paidBy === 'partner2' && activePartners[1])
                    paidPartnerId = activePartners[1]._id.toString();
                else {
                    const matched = activePartners.find(p => p.name.toLowerCase() === exp.paidBy.toLowerCase());
                    if (matched)
                        paidPartnerId = matched._id.toString();
                }
            }
            if (paidPartnerId && partnerExpenseStats[paidPartnerId]) {
                partnerExpenseStats[paidPartnerId].paid += exp.amount || 0;
            }
            // Allocations
            if (exp.allocations && exp.allocations.length > 0) {
                for (const alloc of exp.allocations) {
                    const aId = alloc.partner?._id
                        ? alloc.partner._id.toString()
                        : alloc.partner?.toString();
                    if (aId && partnerExpenseStats[aId]) {
                        partnerExpenseStats[aId].allocated += alloc.amount || 0;
                    }
                }
            }
            else if (activePartners.length > 0) {
                const perP = Math.round((exp.amount || 0) / activePartners.length);
                for (const p of activePartners) {
                    const pid = p._id.toString();
                    if (partnerExpenseStats[pid])
                        partnerExpenseStats[pid].allocated += perP;
                }
            }
        }
        const partnerPnL = activePartners.map((p) => {
            const pid = p._id.toString();
            const sharePct = typeof p.profitSharePercent === 'number' && p.profitSharePercent > 0
                ? p.profitSharePercent
                : (activePartners.length > 0 ? Number((100 / activePartners.length).toFixed(2)) : 0);
            const ratio = sharePct / 100;
            const pNetSales = Math.round(netSales * ratio);
            const pPurchasePacking = Math.round(totalPurchaseAndPackingCost * ratio);
            const pGrossProfit = Math.round(grossProfit * ratio);
            const pAdSpend = Math.round(advertising * ratio);
            const pCustomerReturns = Math.round(totalCustomerReturnExpenses * ratio);
            const pOperatingExpenses = Math.round(totalOperatingExpenses * ratio);
            const pNetProfit = Math.round(operatingProfit * ratio);
            const pPaid = partnerExpenseStats[pid]?.paid || 0;
            const pAllocated = partnerExpenseStats[pid]?.allocated || 0;
            const expenseReimbursementBalance = pPaid - pAllocated;
            const netPayableOrReceivable = pNetProfit + expenseReimbursementBalance;
            return {
                _id: pid,
                name: p.name,
                email: p.email,
                phone: p.phone,
                profitSharePercent: sharePct,
                capitalContributed: p.capitalContributed || 0,
                netSalesShare: pNetSales,
                purchaseAndPackingShare: pPurchasePacking,
                grossProfitShare: pGrossProfit,
                adSpendShare: pAdSpend,
                customerReturnsShare: pCustomerReturns,
                operatingExpensesShare: pOperatingExpenses,
                netProfitShare: pNetProfit,
                expensesPaid: pPaid,
                expensesAllocated: pAllocated,
                expenseBalance: expenseReimbursementBalance,
                netReceivable: netPayableOrReceivable,
            };
        });
        res.json({
            success: true,
            data: {
                grossOrderValue,
                totalSales: grossOrderValue,
                salesCancellations,
                returnsRefunds,
                salesReturns: returnsRefunds,
                netSales,
                totalOrdersCount,
                totalUnitsSold,
                costOfGoodsSold,
                purchaseCost: totalPurchaseCost,
                totalPurchaseCost,
                totalBoxCost,
                totalStickerCost,
                totalBagCardCost,
                totalPrintLabelCost,
                totalPackingCharges,
                totalPurchaseAndPackingCost,
                grossProfit,
                meeshoFees,
                shippingCosts,
                advertising,
                totalCustomerReturnCharges,
                totalCustomerReturnHandlingCharges,
                totalCustomerReturnExpenses,
                totalRtoCharges,
                otherExpenses,
                totalOperatingExpenses,
                operatingProfit,
                netProfit: operatingProfit,
                profitMargin: netSales > 0 ? (operatingProfit / netSales) * 100 : 0,
                adSpendList,
                partnerPnL,
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
        const invStats = await getAccountInventoryStats(accountId, products);
        res.json({
            success: true,
            data: {
                totalOrders: o.orders || 0, totalQuantity: o.qty || 0, grossOrderValue: o.gross || 0,
                totalReturns: r.returns || 0, returnQuantity: r.qty || 0, returnValue: r.value || 0,
                netSales, stockPurchases: pAgg[0]?.total || 0, totalExpenses: eAgg[0]?.total || 0,
                estimatedGrossProfit: netSales - (pAgg[0]?.total || 0),
                estimatedNetProfit: netSales - (pAgg[0]?.total || 0) - (eAgg[0]?.total || 0),
                closingStockQty: invStats.closingStockQty,
                inventoryValue: invStats.inventoryValue,
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
        const invStats = await getAccountInventoryStats(accountId, products);
        res.json({ success: true, data: { totalOrders: o.orders || 0, grossOrderValue: o.gross || 0, returnValue: r.value || 0, netSales, stockPurchases: pAgg[0]?.total || 0, totalExpenses: eAgg[0]?.total || 0, estimatedNetProfit: netSales - (pAgg[0]?.total || 0) - (eAgg[0]?.total || 0), closingStockQty: invStats.closingStockQty, inventoryValue: invStats.inventoryValue } });
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
        const invStats = await getAccountInventoryStats(accountId, products);
        res.json({ success: true, data: { totalOrders: o.orders || 0, totalQuantity: o.qty || 0, grossOrderValue: o.gross || 0, totalReturns: r.returns || 0, returnQuantity: r.qty || 0, returnValue: r.value || 0, netSales, stockPurchases: pAgg[0]?.total || 0, totalExpenses: eAgg[0]?.total || 0, estimatedGrossProfit: netSales - (pAgg[0]?.total || 0), estimatedNetProfit: netSales - (pAgg[0]?.total || 0) - (eAgg[0]?.total || 0), closingStockQty: invStats.closingStockQty, inventoryValue: invStats.inventoryValue } });
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