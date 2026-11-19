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
exports.getPaymentReconciliation = exports.reconcilePaymentOrderRefs = exports.importMeeshoPaymentSheet = exports.recordPaymentReceive = exports.listPayments = exports.getPaymentsDashboard = exports.formatMeeshoDate = exports.formatCompactRupees = exports.formatRupees = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const XLSX = __importStar(require("xlsx"));
const Payment_1 = require("../models/Payment");
const Order_1 = require("../models/Order");
const ReturnOrder_1 = require("../models/ReturnOrder");
const audit_service_1 = require("./audit.service");
// Helper: Format paise to currency (e.g. 80386 -> ₹803.86, 122566 -> ₹1,225.66)
const formatRupees = (paise) => {
    const rupees = (paise || 0) / 100;
    return '₹' + rupees.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};
exports.formatRupees = formatRupees;
// Helper: Format paise to short compact currency (e.g. 553000 -> "₹5.53K", 122500 -> "₹1.22K")
const formatCompactRupees = (paise) => {
    const rupees = (paise || 0) / 100;
    if (Math.abs(rupees) >= 100000) {
        return '₹' + (rupees / 100000).toFixed(2) + 'L';
    }
    if (Math.abs(rupees) >= 1000) {
        return '₹' + (rupees / 1000).toFixed(2) + 'K';
    }
    return '₹' + rupees.toFixed(2);
};
exports.formatCompactRupees = formatCompactRupees;
// Helper: Format Date to Meesho style: "18 Nov, 26"
const formatMeeshoDate = (d) => {
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const yr = String(d.getFullYear()).slice(-2);
    return `${day} ${month}, ${yr}`;
};
exports.formatMeeshoDate = formatMeeshoDate;
/**
 * Fetch Payments Dashboard structured exactly like Meesho Seller Panel:
 * - Upcoming Payments (Next 7 days total & tabs)
 * - Completed Payments (Last 30 days total & tabs)
 * - Unscheduled Payments (dispatched orders pending delivery)
 * - Recent Credited Toast notifications
 */
const getPaymentsDashboard = async (params) => {
    const { businessAccount, selectedUpcomingDate, selectedCompletedDate } = params;
    const query = { isDeleted: false };
    if (businessAccount && businessAccount !== 'all' && mongoose_1.default.Types.ObjectId.isValid(businessAccount)) {
        query.businessAccount = new mongoose_1.default.Types.ObjectId(businessAccount);
    }
    // Fetch all active payments sorted by paymentDate desc
    const allPayments = await Payment_1.Payment.find(query).sort({ paymentDate: -1, createdAt: -1 }).lean();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Filter completed payments: status === 'completed'
    const completedList = allPayments.filter((p) => p.status === 'completed');
    // Filter upcoming payments: status === 'upcoming' or paymentDate >= todayStart
    const upcomingList = allPayments.filter((p) => p.status === 'upcoming' || (p.status !== 'completed' && new Date(p.paymentDate) >= todayStart));
    // Group or map day summaries
    const mapPaymentToSummary = (p) => {
        const pDate = new Date(p.paymentDate);
        return {
            _id: p._id.toString(),
            paymentDate: pDate.toISOString(),
            displayDate: (0, exports.formatMeeshoDate)(pDate),
            formattedAmount: (0, exports.formatRupees)(p.netAmount),
            rawAmount: p.netAmount,
            netAmount: p.netAmount,
            ordersAmount: p.ordersAmount || p.netAmount,
            adsCost: p.adsCost || 0,
            programCost: p.programCost || 0,
            programBenefits: p.programBenefits || 0,
            referralEarnings: p.referralEarnings || 0,
            neftId: p.neftId,
            bankName: p.bankName || 'Axis Bank',
            status: p.status,
            subOrdersCount: p.ordersCount || (p.subOrderIds ? p.subOrderIds.length : 0),
        };
    };
    const completedSummaries = completedList.map(mapPaymentToSummary);
    const upcomingSummaries = upcomingList.map(mapPaymentToSummary);
    const completedTotal = completedSummaries.reduce((sum, item) => sum + item.netAmount, 0);
    const upcomingTotal = upcomingSummaries.reduce((sum, item) => sum + item.netAmount, 0);
    // Select active day
    let selectedCompleted = completedSummaries[0];
    if (selectedCompletedDate) {
        const found = completedSummaries.find((s) => s.paymentDate.slice(0, 10) === selectedCompletedDate.slice(0, 10) || s._id === selectedCompletedDate);
        if (found)
            selectedCompleted = found;
    }
    let selectedUpcoming = upcomingSummaries[0];
    if (selectedUpcomingDate) {
        const found = upcomingSummaries.find((s) => s.paymentDate.slice(0, 10) === selectedUpcomingDate.slice(0, 10) || s._id === selectedUpcomingDate);
        if (found)
            selectedUpcoming = found;
    }
    // Calculate Unscheduled Payments from Dispatched orders not yet delivered
    const orderQuery = { isDeleted: false, status: 'dispatched' };
    if (businessAccount && businessAccount !== 'all' && mongoose_1.default.Types.ObjectId.isValid(businessAccount)) {
        orderQuery.businessAccount = new mongoose_1.default.Types.ObjectId(businessAccount);
    }
    const dispatchedOrders = await Order_1.Order.find(orderQuery).select('grossAmount sellingPrice quantity').lean();
    const unscheduledCount = dispatchedOrders.length;
    const unscheduledAmount = dispatchedOrders.reduce((sum, o) => sum + (o.grossAmount || (o.sellingPrice || 0) * (o.quantity || 1)), 0);
    // Recent credits for toast notifications
    const recentCredits = completedSummaries.slice(0, 3).map((c) => ({
        amount: c.netAmount,
        formattedAmount: (0, exports.formatRupees)(c.netAmount),
        date: c.paymentDate,
        displayDate: c.displayDate,
        neftId: c.neftId,
    }));
    return {
        upcoming: {
            totalAmount: upcomingTotal,
            formattedTotal: (0, exports.formatCompactRupees)(upcomingTotal),
            days: upcomingSummaries,
            selectedDay: selectedUpcoming,
        },
        completed: {
            totalAmount: completedTotal,
            formattedTotal: (0, exports.formatCompactRupees)(completedTotal),
            days: completedSummaries,
            selectedDay: selectedCompleted,
        },
        unscheduled: {
            count: unscheduledCount,
            estimatedAmount: unscheduledAmount,
            formattedAmount: (0, exports.formatRupees)(unscheduledAmount),
            description: 'Payments expected from your shipped orders. Once delivered, we will automatically move it to your upcoming payments.',
        },
        recentCredits,
    };
};
exports.getPaymentsDashboard = getPaymentsDashboard;
/**
 * List Payments with search, filters, and pagination
 */
const listPayments = async (params) => {
    const { businessAccount, status, search, startDate, endDate, page = 1, limit = 20, } = params;
    const query = { isDeleted: false };
    if (businessAccount && businessAccount !== 'all' && mongoose_1.default.Types.ObjectId.isValid(businessAccount)) {
        query.businessAccount = new mongoose_1.default.Types.ObjectId(businessAccount);
    }
    if (status && status !== 'all') {
        query.status = status;
    }
    if (startDate || endDate) {
        query.paymentDate = {};
        if (startDate)
            query.paymentDate.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.paymentDate.$lte = end;
        }
    }
    if (search && search.trim()) {
        const s = search.trim();
        query.$or = [
            { neftId: { $regex: s, $options: 'i' } },
            { subOrderIds: { $regex: s, $options: 'i' } },
            { notes: { $regex: s, $options: 'i' } },
            { bankName: { $regex: s, $options: 'i' } },
        ];
    }
    const skip = (Math.max(1, page) - 1) * limit;
    const [payments, total] = await Promise.all([
        Payment_1.Payment.find(query)
            .populate('businessAccount', 'name tradeName gstin')
            .populate('createdBy', 'name email')
            .sort({ paymentDate: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Payment_1.Payment.countDocuments(query),
    ]);
    return {
        data: payments,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit) || 1,
        },
    };
};
exports.listPayments = listPayments;
/**
 * Record a Payment Receive (Manual Entry)
 */
const recordPaymentReceive = async (data, userId) => {
    const { businessAccount, paymentDate, status = 'completed', neftId, bankName = 'Axis Bank', bankAccountNumber, ordersAmount = 0, salesAmount = ordersAmount, returnsDeduction = 0, adsCost = 0, programCost = 0, otherRecovery = 0, programBenefits = 0, referralEarnings = 0, otherCompensation = 0, ordersCount = 0, subOrderIds = [], notes, } = data;
    // Auto calculate net amount if not explicitly passed
    const calculatedNet = ordersAmount - (adsCost + programCost + otherRecovery) + (programBenefits + referralEarnings + otherCompensation);
    const finalNetAmount = data.netAmount !== undefined ? data.netAmount : calculatedNet;
    let orderRefs = [];
    if (subOrderIds && subOrderIds.length > 0) {
        orderRefs = await (0, exports.reconcilePaymentOrderRefs)(businessAccount, subOrderIds.map((s) => ({ subOrderId: s })));
    }
    const payment = await Payment_1.Payment.create({
        businessAccount: new mongoose_1.default.Types.ObjectId(businessAccount),
        paymentDate: new Date(paymentDate),
        status,
        neftId: neftId ? neftId.trim() : undefined,
        bankName: bankName.trim(),
        bankAccountNumber: bankAccountNumber ? bankAccountNumber.trim() : undefined,
        ordersAmount,
        salesAmount,
        returnsDeduction,
        adsCost,
        programCost,
        otherRecovery,
        programBenefits,
        referralEarnings,
        otherCompensation,
        netAmount: finalNetAmount,
        ordersCount: ordersCount || (subOrderIds ? subOrderIds.length : 0),
        subOrderIds,
        orderRefs,
        notes: notes ? notes.trim() : undefined,
        rawSource: 'manual',
        createdBy: userId ? new mongoose_1.default.Types.ObjectId(userId) : undefined,
    });
    if (userId) {
        await (0, audit_service_1.createAuditLog)({
            action: 'CREATE',
            resource: 'Payment',
            resourceId: payment._id.toString(),
            userId,
            details: `Recorded payment receive of ${(0, exports.formatRupees)(finalNetAmount)} (${status}) for ${paymentDate} with NEFT ID: ${neftId || 'N/A'}`,
        });
    }
    return payment;
};
exports.recordPaymentReceive = recordPaymentReceive;
/**
 * Import Meesho Payment Sheet (CSV / Excel)
 */
const importMeeshoPaymentSheet = async (params) => {
    const { buffer, businessAccount, userId } = params;
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    if (!sheet)
        throw new Error('Uploaded file has no readable sheets');
    // Convert to 2D array to locate the header dynamically
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(25, rawRows.length); i++) {
        const row = rawRows[i];
        const rowStr = row.map((cell) => String(cell || '').toLowerCase()).join(' ');
        if (rowStr.includes('payment date') ||
            rowStr.includes('neft') ||
            rowStr.includes('utr') ||
            rowStr.includes('suborder') ||
            rowStr.includes('settlement') ||
            rowStr.includes('net amount')) {
            headerRowIndex = i;
            break;
        }
    }
    const rawJson = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: '' });
    if (rawJson.length === 0) {
        throw new Error('No valid payment data rows found in uploaded sheet');
    }
    let createdCount = 0;
    let updatedCount = 0;
    let totalRows = rawJson.length;
    // Group rows by NEFT ID or Payment Date
    const groups = new Map();
    for (const row of rawJson) {
        const normalized = {};
        for (const key of Object.keys(row)) {
            const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            normalized[cleanKey] = row[key];
        }
        const neftVal = String(normalized['neftid'] || normalized['neft'] || normalized['utr'] || normalized['referencenumber'] || '').trim();
        const dateVal = normalized['paymentdate'] || normalized['date'] || normalized['crediteddate'] || normalized['settlementdate'];
        const key = neftVal || (dateVal ? String(dateVal) : `ROW_${Math.random()}`);
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(normalized);
    }
    for (const [key, rows] of groups.entries()) {
        const sample = rows[0];
        // Parse date
        let paymentDate = new Date();
        const rawDate = sample['paymentdate'] || sample['date'] || sample['crediteddate'] || sample['settlementdate'];
        if (rawDate) {
            if (typeof rawDate === 'number') {
                paymentDate = new Date((rawDate - (25567 + 2)) * 86400 * 1000);
            }
            else {
                const parsed = new Date(rawDate);
                if (!isNaN(parsed.getTime()))
                    paymentDate = parsed;
            }
        }
        const rawNeft = sample['neftid'] || sample['neft'] || sample['utr'] || (key.startsWith('ROW_') ? undefined : key);
        const neftId = rawNeft ? String(rawNeft).trim() : undefined;
        const bankName = sample['bankname'] || sample['bank'] || 'Axis Bank';
        // Sum amounts
        let totalNetAmountPaise = 0;
        let totalOrdersAmountPaise = 0;
        let totalAdsCostPaise = 0;
        let totalReturnsDeductionPaise = 0;
        const subOrderIds = [];
        const rawRefs = [];
        for (const r of rows) {
            const subId = String(r['suborderid'] || r['subordernumber'] || r['ordernumber'] || '').trim();
            if (subId)
                subOrderIds.push(subId);
            const netRupees = Number(r['finalsettlementamount'] || r['netamount'] || r['settlementamount'] || r['amount'] || 0);
            const orderRupees = Number(r['supplierdiscountedprice'] || r['ordersamount'] || r['orderamount'] || r['grossamount'] || (netRupees > 0 ? netRupees : 0));
            const adsRupees = Number(r['adscost'] || r['advertisementcost'] || r['recovery'] || 0);
            const returnRupees = Number(r['returncompensation'] || r['returndeduction'] || r['returnamount'] || r['customerreturndeduction'] || 0);
            const shippingRupees = Number(r['shippingcharge'] || r['shippingfee'] || r['weightdeduction'] || r['shippingandweight'] || 0);
            const netPaise = Math.round(netRupees * 100);
            const orderPaise = Math.round(orderRupees * 100);
            const adsPaise = Math.round(adsRupees * 100);
            const returnPaise = Math.round(returnRupees * 100);
            const shippingPaise = Math.round(shippingRupees * 100);
            totalNetAmountPaise += netPaise;
            totalOrdersAmountPaise += orderPaise;
            totalAdsCostPaise += adsPaise;
            totalReturnsDeductionPaise += returnPaise;
            if (subId) {
                rawRefs.push({
                    subOrderId: subId,
                    saleAmount: orderPaise,
                    returnAmount: returnPaise,
                    shippingOrWeightDeduction: shippingPaise,
                    netAmount: netPaise,
                });
            }
        }
        if (totalNetAmountPaise === 0 && totalOrdersAmountPaise > 0) {
            totalNetAmountPaise = totalOrdersAmountPaise - totalAdsCostPaise - totalReturnsDeductionPaise;
        }
        const reconciledRefs = await (0, exports.reconcilePaymentOrderRefs)(businessAccount, rawRefs);
        // Check if payment already exists with this NEFT ID & businessAccount
        let existing = null;
        if (neftId) {
            existing = await Payment_1.Payment.findOne({
                businessAccount: new mongoose_1.default.Types.ObjectId(businessAccount),
                neftId,
                isDeleted: false,
            });
        }
        if (existing) {
            existing.paymentDate = paymentDate;
            existing.netAmount = totalNetAmountPaise;
            existing.ordersAmount = totalOrdersAmountPaise;
            existing.salesAmount = totalOrdersAmountPaise;
            existing.returnsDeduction = (existing.returnsDeduction || 0) + totalReturnsDeductionPaise;
            existing.adsCost = totalAdsCostPaise;
            existing.ordersCount = subOrderIds.length || existing.ordersCount;
            if (subOrderIds.length > 0) {
                existing.subOrderIds = Array.from(new Set([...(existing.subOrderIds || []), ...subOrderIds]));
            }
            if (reconciledRefs.length > 0) {
                existing.orderRefs = reconciledRefs;
            }
            await existing.save();
            updatedCount++;
        }
        else {
            try {
                await Payment_1.Payment.create({
                    businessAccount: new mongoose_1.default.Types.ObjectId(businessAccount),
                    paymentDate,
                    status: 'completed',
                    neftId,
                    bankName,
                    ordersAmount: totalOrdersAmountPaise,
                    salesAmount: totalOrdersAmountPaise,
                    returnsDeduction: totalReturnsDeductionPaise,
                    adsCost: totalAdsCostPaise,
                    netAmount: totalNetAmountPaise,
                    ordersCount: subOrderIds.length,
                    subOrderIds,
                    orderRefs: reconciledRefs,
                    rawSource: 'sheet_import',
                    createdBy: userId ? new mongoose_1.default.Types.ObjectId(userId) : undefined,
                });
                createdCount++;
            }
            catch (createErr) {
                if (createErr.code === 11000 && neftId) {
                    // Fallback in case of race condition: update existing
                    const duplicate = await Payment_1.Payment.findOne({
                        businessAccount: new mongoose_1.default.Types.ObjectId(businessAccount),
                        neftId,
                        isDeleted: false,
                    });
                    if (duplicate) {
                        duplicate.paymentDate = paymentDate;
                        duplicate.netAmount = totalNetAmountPaise;
                        duplicate.ordersAmount = totalOrdersAmountPaise;
                        duplicate.salesAmount = totalOrdersAmountPaise;
                        duplicate.returnsDeduction = (duplicate.returnsDeduction || 0) + totalReturnsDeductionPaise;
                        duplicate.adsCost = totalAdsCostPaise;
                        duplicate.ordersCount = subOrderIds.length || duplicate.ordersCount;
                        if (subOrderIds.length > 0) {
                            duplicate.subOrderIds = Array.from(new Set([...(duplicate.subOrderIds || []), ...subOrderIds]));
                        }
                        if (reconciledRefs.length > 0) {
                            duplicate.orderRefs = reconciledRefs;
                        }
                        await duplicate.save();
                        updatedCount++;
                    }
                }
                else {
                    throw createErr;
                }
            }
        }
    }
    return {
        totalRows,
        paymentsCreated: createdCount,
        paymentsUpdated: updatedCount,
    };
};
exports.importMeeshoPaymentSheet = importMeeshoPaymentSheet;
/**
 * Helper to reconcile order references against Order and ReturnOrder collections
 */
const reconcilePaymentOrderRefs = async (businessAccount, rawRefs) => {
    if (!rawRefs || rawRefs.length === 0)
        return [];
    const distinctSubOrderIds = Array.from(new Set(rawRefs.map((r) => String(r.subOrderId || '').trim()).filter(Boolean)));
    if (distinctSubOrderIds.length === 0)
        return [];
    const bId = new mongoose_1.default.Types.ObjectId(businessAccount);
    // Find corresponding Orders
    const orders = await Order_1.Order.find({
        businessAccount: bId,
        isDeleted: false,
        $or: [
            { subOrderId: { $in: distinctSubOrderIds } },
            { meeshoOrderId: { $in: distinctSubOrderIds } },
        ],
    }).lean();
    const orderMap = new Map();
    const orderIds = [];
    for (const o of orders) {
        if (o.subOrderId)
            orderMap.set(o.subOrderId, o);
        if (o.meeshoOrderId)
            orderMap.set(o.meeshoOrderId, o);
        orderIds.push(o._id);
    }
    // Find corresponding ReturnOrders
    const returnOrders = await ReturnOrder_1.ReturnOrder.find({
        businessAccount: bId,
        isDeleted: false,
        $or: [
            { meeshoOrderId: { $in: distinctSubOrderIds } },
            { originalOrder: { $in: orderIds } },
        ],
    }).lean();
    const returnMap = new Map();
    for (const ret of returnOrders) {
        if (ret.meeshoOrderId)
            returnMap.set(ret.meeshoOrderId, ret);
        if (ret.originalOrder)
            returnMap.set(ret.originalOrder.toString(), ret);
    }
    const reconciledRefs = [];
    for (const ref of rawRefs) {
        const subId = String(ref.subOrderId || '').trim();
        const order = orderMap.get(subId);
        const returnDoc = order
            ? returnMap.get(subId) || returnMap.get(order._id.toString())
            : returnMap.get(subId);
        const saleAmount = ref.saleAmount !== undefined ? ref.saleAmount : (order ? order.grossAmount : 0);
        const returnAmount = ref.returnAmount !== undefined ? ref.returnAmount : (returnDoc ? returnDoc.returnAmount : 0);
        const shippingOrWeightDeduction = ref.shippingOrWeightDeduction || 0;
        const netAmount = ref.netAmount !== undefined ? ref.netAmount : saleAmount - returnAmount - shippingOrWeightDeduction;
        const expectedReceivable = order ? order.grossAmount : 0;
        let matchStatus = 'matched';
        let weightDiscrepancy = false;
        const reasons = [];
        if (!order) {
            matchStatus = 'unmatched_order';
            reasons.push('Sub Order ID not found in system orders');
        }
        else {
            // 1. Wrongful Return Deduction Check:
            // On Meesho, RTO parcels incur ₹0 return charges.
            // If Meesho deducts a return charge on an order whose ReturnOrder.returnType is 'rto_return'
            // or order status is 'rto_in_transit' / 'rto_received'
            const isRtoOrder = returnDoc?.returnType === 'rto_return' ||
                order.status === 'rto_in_transit' ||
                order.status === 'rto_received';
            if (returnAmount > 0 && isRtoOrder) {
                matchStatus = 'wrongful_return_deduction';
                reasons.push(`Wrongful return penalty (₹${(returnAmount / 100).toFixed(2)}) charged on RTO package`);
            }
            // 2. Weight Discrepancy Check:
            // Standard 500g shipping slab on Meesho is ₹50–₹90. If shipping/weight deduction > ₹140 (14000 paise):
            if (shippingOrWeightDeduction > 14000) {
                weightDiscrepancy = true;
                reasons.push(`Shipping/Weight deduction (₹${(shippingOrWeightDeduction / 100).toFixed(2)}) exceeds standard slab limit`);
            }
            // 3. Underpaid Check:
            if (matchStatus === 'matched') {
                if (netAmount < 0 && returnAmount === 0) {
                    matchStatus = 'underpaid';
                    reasons.push('Negative payout received without return deduction');
                }
                else if (order.grossAmount > 0 && returnAmount === 0 && netAmount < Math.round(order.grossAmount * 0.7)) {
                    matchStatus = 'underpaid';
                    reasons.push(`Underpaid: Received ₹${(netAmount / 100).toFixed(2)} on gross order ₹${(order.grossAmount / 100).toFixed(2)}`);
                }
            }
        }
        reconciledRefs.push({
            subOrderId: subId,
            orderId: order ? order._id : undefined,
            saleAmount,
            returnAmount,
            shippingOrWeightDeduction,
            netAmount,
            matchStatus,
            weightDiscrepancy,
            discrepancyReason: reasons.join('; ') || undefined,
            expectedReceivable,
        });
    }
    return reconciledRefs;
};
exports.reconcilePaymentOrderRefs = reconcilePaymentOrderRefs;
/**
 * Generate full Meesho bank settlement reconciliation report
 */
const getPaymentReconciliation = async (params) => {
    const { businessAccount, allowedAccounts, startDate, endDate } = params;
    const queryAcc = {};
    if (businessAccount && businessAccount !== 'all' && mongoose_1.default.Types.ObjectId.isValid(businessAccount)) {
        queryAcc.businessAccount = new mongoose_1.default.Types.ObjectId(businessAccount);
    }
    else if (allowedAccounts && allowedAccounts.length > 0) {
        queryAcc.businessAccount = { $in: allowedAccounts.map((id) => new mongoose_1.default.Types.ObjectId(id)) };
    }
    const paymentDateFilter = {};
    if (startDate || endDate) {
        paymentDateFilter.paymentDate = {};
        if (startDate)
            paymentDateFilter.paymentDate.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            paymentDateFilter.paymentDate.$lte = end;
        }
    }
    // 1. Fetch completed payments
    const payments = await Payment_1.Payment.find({
        ...queryAcc,
        ...paymentDateFilter,
        status: 'completed',
        isDeleted: false,
    }).lean();
    const settledSubOrderIds = new Set();
    let totalSettledBankCash = 0;
    for (const p of payments) {
        totalSettledBankCash += p.netAmount || 0;
        if (p.subOrderIds) {
            for (const s of p.subOrderIds) {
                if (s)
                    settledSubOrderIds.add(String(s).trim());
            }
        }
        if (p.orderRefs) {
            for (const ref of p.orderRefs) {
                if (ref.subOrderId)
                    settledSubOrderIds.add(String(ref.subOrderId).trim());
            }
        }
    }
    // 2. Unsettled Dispatched Orders (> 15 days threshold)
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    fifteenDaysAgo.setHours(23, 59, 59, 999);
    const orderDateFilter = { $lte: fifteenDaysAgo };
    if (startDate) {
        orderDateFilter.$gte = new Date(startDate);
    }
    const dispatchedOrders = await Order_1.Order.find({
        ...queryAcc,
        isDeleted: false,
        status: { $in: ['dispatched', 'delivered'] },
        orderDate: orderDateFilter,
    })
        .populate('product', 'name sku')
        .sort({ orderDate: 1 })
        .lean();
    const unsettledOrders = [];
    let unsettledOrdersAmount = 0;
    const now = Date.now();
    for (const o of dispatchedOrders) {
        const subId = String(o.subOrderId || o.meeshoOrderId || '').trim();
        if (subId && settledSubOrderIds.has(subId)) {
            continue;
        }
        const orderTime = new Date(o.orderDate || o.createdAt || Date.now()).getTime();
        const daysSinceOrder = Math.max(0, Math.floor((now - orderTime) / (1000 * 60 * 60 * 24)));
        const daysOverdue = Math.max(0, daysSinceOrder - 15);
        unsettledOrdersAmount += o.grossAmount || 0;
        unsettledOrders.push({
            orderId: o._id.toString(),
            subOrderId: subId || o._id.toString(),
            orderDate: o.orderDate ? new Date(o.orderDate).toISOString() : new Date().toISOString(),
            sku: o.sku || o.product?.sku || 'N/A',
            productName: o.product?.name || 'Perfume Item',
            grossAmount: o.grossAmount || 0,
            sellingPrice: o.sellingPrice || 0,
            quantity: o.quantity || 1,
            status: o.status,
            carrierName: o.carrierName || 'Meesho Logistics',
            shippingLabelId: o.shippingLabelId || o.internalQrCode,
            daysOverdue,
        });
    }
    // 3. Discrepancies
    const discrepancies = [];
    let totalDiscrepancyAmount = 0;
    let wrongfulReturnsCount = 0;
    let weightDiscrepanciesCount = 0;
    for (const p of payments) {
        if (p.orderRefs && p.orderRefs.length > 0) {
            for (const ref of p.orderRefs) {
                const isWrongfulReturn = ref.matchStatus === 'wrongful_return_deduction';
                const isWeightDisc = Boolean(ref.weightDiscrepancy);
                const isUnderpaid = ref.matchStatus === 'underpaid';
                const isUnmatched = ref.matchStatus === 'unmatched_order';
                const isNegative = (ref.netAmount || 0) < 0;
                if (isWrongfulReturn || isWeightDisc || isUnderpaid || isUnmatched || isNegative) {
                    let discAmount = 0;
                    if (isWrongfulReturn) {
                        discAmount = ref.returnAmount || Math.abs(ref.netAmount || 0);
                        wrongfulReturnsCount++;
                    }
                    else if (isWeightDisc) {
                        discAmount = Math.max(0, (ref.shippingOrWeightDeduction || 0) - 9000);
                        weightDiscrepanciesCount++;
                    }
                    else if (isUnderpaid) {
                        discAmount = Math.max(0, (ref.expectedReceivable || 0) - (ref.netAmount || 0));
                    }
                    else {
                        discAmount = Math.abs(ref.netAmount || 0);
                    }
                    totalDiscrepancyAmount += discAmount;
                    discrepancies.push({
                        subOrderId: ref.subOrderId,
                        paymentId: p._id.toString(),
                        neftId: p.neftId,
                        paymentDate: p.paymentDate ? new Date(p.paymentDate).toISOString() : undefined,
                        orderId: ref.orderId ? ref.orderId.toString() : undefined,
                        matchStatus: ref.matchStatus || 'matched',
                        weightDiscrepancy: isWeightDisc,
                        discrepancyReason: ref.discrepancyReason ||
                            (isNegative ? 'Negative net payout amount' : 'Payment discrepancy flagged'),
                        saleAmount: ref.saleAmount || 0,
                        returnAmount: ref.returnAmount || 0,
                        shippingOrWeightDeduction: ref.shippingOrWeightDeduction || 0,
                        netAmount: ref.netAmount || 0,
                        expectedReceivable: ref.expectedReceivable || 0,
                        discrepancyAmount: discAmount,
                    });
                }
            }
        }
    }
    const totalExpectedReceivable = unsettledOrdersAmount + totalSettledBankCash;
    return {
        summary: {
            totalExpectedReceivable,
            totalSettledBankCash,
            totalDiscrepancyAmount,
            unsettledOrdersCount: unsettledOrders.length,
            unsettledOrdersAmount,
            wrongfulReturnsCount,
            weightDiscrepanciesCount,
        },
        unsettledOrders,
        discrepancies,
    };
};
exports.getPaymentReconciliation = getPaymentReconciliation;
//# sourceMappingURL=payment.service.js.map