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
exports.importMeeshoPaymentSheet = exports.recordPaymentReceive = exports.listPayments = exports.getPaymentsDashboard = exports.formatMeeshoDate = exports.formatCompactRupees = exports.formatRupees = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const XLSX = __importStar(require("xlsx"));
const Payment_1 = require("../models/Payment");
const Order_1 = require("../models/Order");
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
        const subOrderIds = [];
        for (const r of rows) {
            const subId = String(r['suborderid'] || r['subordernumber'] || r['ordernumber'] || '').trim();
            if (subId)
                subOrderIds.push(subId);
            const netRupees = Number(r['finalsettlementamount'] || r['netamount'] || r['settlementamount'] || r['amount'] || 0);
            const orderRupees = Number(r['supplierdiscountedprice'] || r['ordersamount'] || r['orderamount'] || r['grossamount'] || netRupees);
            const adsRupees = Number(r['adscost'] || r['advertisementcost'] || r['recovery'] || 0);
            totalNetAmountPaise += Math.round(netRupees * 100);
            totalOrdersAmountPaise += Math.round(orderRupees * 100);
            totalAdsCostPaise += Math.round(adsRupees * 100);
        }
        if (totalNetAmountPaise === 0 && totalOrdersAmountPaise > 0) {
            totalNetAmountPaise = totalOrdersAmountPaise - totalAdsCostPaise;
        }
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
            existing.adsCost = totalAdsCostPaise;
            existing.ordersCount = subOrderIds.length || existing.ordersCount;
            if (subOrderIds.length > 0) {
                existing.subOrderIds = Array.from(new Set([...(existing.subOrderIds || []), ...subOrderIds]));
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
                    adsCost: totalAdsCostPaise,
                    netAmount: totalNetAmountPaise,
                    ordersCount: subOrderIds.length,
                    subOrderIds,
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
                        duplicate.adsCost = totalAdsCostPaise;
                        duplicate.ordersCount = subOrderIds.length || duplicate.ordersCount;
                        if (subOrderIds.length > 0) {
                            duplicate.subOrderIds = Array.from(new Set([...(duplicate.subOrderIds || []), ...subOrderIds]));
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
//# sourceMappingURL=payment.service.js.map