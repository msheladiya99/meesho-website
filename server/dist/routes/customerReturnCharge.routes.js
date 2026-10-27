"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const CustomerReturnChargeSettings_1 = require("../models/CustomerReturnChargeSettings");
const CustomerReturnCharge_1 = require("../models/CustomerReturnCharge");
const auth_1 = require("../middleware/auth");
const audit_service_1 = require("../services/audit.service");
const customerReturnCharge_service_1 = require("../services/customerReturnCharge.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// ─────────────────────────────────────────────────────────────────────────────
// 1. SETTINGS ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customer-return-charges/settings
router.get('/settings', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId } = req.query;
        const active = await (0, customerReturnCharge_service_1.getActiveSettings)({ accountId });
        // Also get all active setting documents for admin inspection
        const allSettings = await CustomerReturnChargeSettings_1.CustomerReturnChargeSettings.find({ isDeleted: false })
            .populate('applicableAccounts', 'name tradeName gstin')
            .populate('applicableCategories', 'name')
            .populate('updatedBy', 'name email')
            .sort({ createdAt: -1 });
        res.json({
            success: true,
            data: {
                activeSettings: active,
                allSettings,
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// PUT /api/customer-return-charges/settings (Admin Only)
router.put('/settings', auth_1.requireAdmin, async (req, res) => {
    try {
        const { settingsId, isEnabled = true, calculationType = 'fixed_order', chargeAmount = 0, // in paise
        percentageRate = 0, hasHandlingCharge = false, handlingCalculationType = 'fixed_order', handlingChargeAmount = 0, // in paise
        effectiveFrom, businessAccountScope = 'all', applicableAccounts = [], categoryScope = 'all', applicableCategories = [], notes, } = req.body;
        // Validate calculation type
        if (!['fixed_order', 'fixed_unit', 'percentage'].includes(calculationType)) {
            res.status(400).json({ success: false, message: 'Invalid calculation type.' });
            return;
        }
        // Validate handling calculation type
        if (hasHandlingCharge && !['fixed_order', 'fixed_unit'].includes(handlingCalculationType)) {
            res.status(400).json({ success: false, message: 'Invalid handling calculation type.' });
            return;
        }
        // Server-side monetary & rate validation
        const parsedChargeAmount = Math.max(0, Math.round(Number(chargeAmount) || 0));
        const parsedHandlingAmount = hasHandlingCharge ? Math.max(0, Math.round(Number(handlingChargeAmount) || 0)) : 0;
        const parsedPercentageRate = calculationType === 'percentage'
            ? Math.max(0, Math.min(100, Number(percentageRate) || 0))
            : 0;
        let targetDoc = settingsId && mongoose_1.default.Types.ObjectId.isValid(settingsId)
            ? await CustomerReturnChargeSettings_1.CustomerReturnChargeSettings.findById(settingsId)
            : null;
        let oldData = null;
        if (!targetDoc) {
            // Find latest default settings doc if exists, else create new
            targetDoc = await CustomerReturnChargeSettings_1.CustomerReturnChargeSettings.findOne({
                isDeleted: false,
                businessAccountScope,
            }).sort({ createdAt: -1 });
        }
        if (targetDoc) {
            oldData = targetDoc.toObject();
            targetDoc.isEnabled = isEnabled;
            targetDoc.calculationType = calculationType;
            targetDoc.chargeAmount = parsedChargeAmount;
            targetDoc.percentageRate = parsedPercentageRate;
            targetDoc.hasHandlingCharge = hasHandlingCharge;
            targetDoc.handlingCalculationType = handlingCalculationType;
            targetDoc.handlingChargeAmount = parsedHandlingAmount;
            if (effectiveFrom)
                targetDoc.effectiveFrom = new Date(effectiveFrom);
            targetDoc.businessAccountScope = businessAccountScope;
            targetDoc.applicableAccounts = applicableAccounts;
            targetDoc.categoryScope = categoryScope;
            targetDoc.applicableCategories = applicableCategories;
            targetDoc.notes = notes;
            targetDoc.settingsVersion = (targetDoc.settingsVersion || 1) + 1;
            targetDoc.updatedBy = req.user?._id;
            await targetDoc.save();
        }
        else {
            targetDoc = await CustomerReturnChargeSettings_1.CustomerReturnChargeSettings.create({
                isEnabled,
                calculationType,
                chargeAmount: parsedChargeAmount,
                percentageRate: parsedPercentageRate,
                hasHandlingCharge,
                handlingCalculationType,
                handlingChargeAmount: parsedHandlingAmount,
                effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
                businessAccountScope,
                applicableAccounts,
                categoryScope,
                applicableCategories,
                settingsVersion: 1,
                notes,
                updatedBy: req.user?._id,
            });
        }
        await (0, audit_service_1.createAuditLog)({
            action: oldData ? 'UPDATE' : 'CREATE',
            resource: 'CustomerReturnChargeSettings',
            resourceId: targetDoc._id.toString(),
            userId: req.user?._id,
            details: `Updated Customer Return Charge Settings to version ${targetDoc.settingsVersion} (Enabled: ${isEnabled}, Type: ${calculationType}, Base: ₹${(parsedChargeAmount / 100).toFixed(2)}, Handling: ₹${(parsedHandlingAmount / 100).toFixed(2)})`,
            changes: {
                previous: oldData,
                current: targetDoc.toObject(),
            },
        });
        const populated = await CustomerReturnChargeSettings_1.CustomerReturnChargeSettings.findById(targetDoc._id)
            .populate('applicableAccounts', 'name tradeName gstin')
            .populate('applicableCategories', 'name')
            .populate('updatedBy', 'name email');
        res.json({
            success: true,
            message: 'Customer return charge settings saved successfully.',
            data: populated,
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// 2. RECORDS & REPORTS ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customer-return-charges/records
router.get('/records', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, categoryId, startDate, endDate, search, status, page = '1', limit = '25', sortBy = 'returnDate', sortOrder = 'desc', } = req.query;
        const filter = { isDeleted: false };
        // Security check on accounts
        if (req.user?.role !== 'admin') {
            const allowed = req.user?.allowedAccounts || [];
            if (accountId && accountId !== 'all') {
                if (!allowed.includes(accountId)) {
                    res.status(403).json({ success: false, message: 'Access to this GSTIN account is not permitted' });
                    return;
                }
                filter.businessAccount = new mongoose_1.default.Types.ObjectId(accountId);
            }
            else {
                filter.businessAccount = { $in: allowed.map((id) => new mongoose_1.default.Types.ObjectId(id)) };
            }
        }
        else if (accountId && accountId !== 'all' && mongoose_1.default.Types.ObjectId.isValid(accountId)) {
            filter.businessAccount = new mongoose_1.default.Types.ObjectId(accountId);
        }
        if (categoryId && categoryId !== 'all' && mongoose_1.default.Types.ObjectId.isValid(categoryId)) {
            filter.category = new mongoose_1.default.Types.ObjectId(categoryId);
        }
        if (status && status !== 'all') {
            filter.status = status;
        }
        if (startDate || endDate) {
            filter.returnDate = {};
            if (startDate)
                filter.returnDate.$gte = new Date(startDate);
            if (endDate)
                filter.returnDate.$lte = new Date(endDate + 'T23:59:59.999Z');
        }
        if (search && search.trim()) {
            const term = search.trim();
            filter.$or = [
                { transactionId: { $regex: term, $options: 'i' } },
                { sku: { $regex: term, $options: 'i' } },
                { productName: { $regex: term, $options: 'i' } },
            ];
        }
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 25));
        const skip = (pageNum - 1) * limitNum;
        const sortObj = {
            [sortBy]: sortOrder === 'asc' ? 1 : -1,
        };
        const [records, total, summaryAgg] = await Promise.all([
            CustomerReturnCharge_1.CustomerReturnCharge.find(filter)
                .populate('businessAccount', 'name tradeName gstin')
                .populate('product', 'name sku currentStock')
                .populate('category', 'name')
                .populate('order', 'meeshoOrderId subOrderId orderDate grossAmount status')
                .sort(sortObj)
                .skip(skip)
                .limit(limitNum),
            CustomerReturnCharge_1.CustomerReturnCharge.countDocuments(filter),
            CustomerReturnCharge_1.CustomerReturnCharge.aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: null,
                        totalBaseCharge: { $sum: '$baseCharge' },
                        totalHandlingCharge: { $sum: '$handlingCharge' },
                        totalCharge: { $sum: '$totalCharge' },
                        appliedCount: {
                            $sum: { $cond: [{ $eq: ['$status', 'applied'] }, 1, 0] },
                        },
                        reversedCount: {
                            $sum: { $cond: [{ $eq: ['$status', 'reversed'] }, 1, 0] },
                        },
                    },
                },
            ]),
        ]);
        const summary = summaryAgg[0] || {
            totalBaseCharge: 0,
            totalHandlingCharge: 0,
            totalCharge: 0,
            appliedCount: 0,
            reversedCount: 0,
        };
        res.json({
            success: true,
            data: {
                records,
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
                summary,
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/customer-return-charges/export-csv
router.get('/export-csv', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, categoryId, startDate, endDate, search, status } = req.query;
        const filter = { isDeleted: false };
        if (accountId && accountId !== 'all' && mongoose_1.default.Types.ObjectId.isValid(accountId)) {
            filter.businessAccount = new mongoose_1.default.Types.ObjectId(accountId);
        }
        if (categoryId && categoryId !== 'all' && mongoose_1.default.Types.ObjectId.isValid(categoryId)) {
            filter.category = new mongoose_1.default.Types.ObjectId(categoryId);
        }
        if (status && status !== 'all') {
            filter.status = status;
        }
        if (startDate || endDate) {
            filter.returnDate = {};
            if (startDate)
                filter.returnDate.$gte = new Date(startDate);
            if (endDate)
                filter.returnDate.$lte = new Date(endDate + 'T23:59:59.999Z');
        }
        if (search && search.trim()) {
            filter.$or = [
                { transactionId: { $regex: search.trim(), $options: 'i' } },
                { sku: { $regex: search.trim(), $options: 'i' } },
                { productName: { $regex: search.trim(), $options: 'i' } },
            ];
        }
        const records = await CustomerReturnCharge_1.CustomerReturnCharge.find(filter)
            .populate('businessAccount', 'name tradeName gstin')
            .populate('product', 'name sku')
            .populate('order', 'meeshoOrderId subOrderId orderDate grossAmount')
            .sort({ returnDate: -1 });
        const headers = [
            'Transaction ID',
            'Order ID',
            'Order Date',
            'Customer Return Date',
            'GST Account',
            'Perfume Name',
            'SKU',
            'Returned Quantity',
            'Original Order Value (INR)',
            'Charge Type',
            'Applied Rate',
            'Customer Return Charge (INR)',
            'Handling Charge (INR)',
            'Total Return Expense (INR)',
            'Transaction Status',
            'Calculation Timestamp',
        ];
        const escapeCsv = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
        const rows = records.map((r) => {
            const ord = r.order;
            const acc = r.businessAccount;
            const orderId = ord?.meeshoOrderId || ord?.subOrderId || r.order?.toString();
            const orderDateStr = r.orderDate ? new Date(r.orderDate).toISOString().slice(0, 10) : '';
            const returnDateStr = r.returnDate ? new Date(r.returnDate).toISOString().slice(0, 10) : '';
            const calcTimestampStr = r.calculationTimestamp ? new Date(r.calculationTimestamp).toISOString() : '';
            const accName = acc?.tradeName || acc?.name || acc?.gstin || 'Default Account';
            return [
                escapeCsv(r.transactionId),
                escapeCsv(orderId),
                escapeCsv(orderDateStr),
                escapeCsv(returnDateStr),
                escapeCsv(accName),
                escapeCsv(r.productName || r.product?.name || 'Perfume'),
                escapeCsv(r.sku),
                r.returnedQuantity,
                (r.originalOrderValue / 100).toFixed(2),
                escapeCsv(r.chargeType),
                r.chargeType === 'percentage' ? `${r.appliedRate}%` : `₹${(r.appliedRate / 100).toFixed(2)}`,
                (r.baseCharge / 100).toFixed(2),
                (r.handlingCharge / 100).toFixed(2),
                (r.totalCharge / 100).toFixed(2),
                escapeCsv(r.status),
                escapeCsv(calcTimestampStr),
            ].join(',');
        });
        const csvContent = [headers.join(','), ...rows].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=Customer_Return_Charges_${new Date().toISOString().slice(0, 10)}.csv`);
        res.send(csvContent);
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// 3. HISTORICAL RECALCULATION (Admin Only)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customer-return-charges/recalculate/preview
router.post('/recalculate/preview', auth_1.requireAdmin, async (req, res) => {
    try {
        const { accountId, categoryId, startDate, endDate, targetSettings } = req.body;
        const preview = await (0, customerReturnCharge_service_1.previewHistoricalRecalculation)({
            accountId,
            categoryId,
            startDate,
            endDate,
            targetSettings,
        });
        res.json({
            success: true,
            data: preview,
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/customer-return-charges/recalculate/execute
router.post('/recalculate/execute', auth_1.requireAdmin, async (req, res) => {
    try {
        const { accountId, categoryId, startDate, endDate, confirm } = req.body;
        if (!confirm) {
            res.status(400).json({
                success: false,
                message: 'Explicit admin confirmation is required to execute historical recalculation.',
            });
            return;
        }
        const result = await (0, customerReturnCharge_service_1.executeHistoricalRecalculation)({
            accountId,
            categoryId,
            startDate,
            endDate,
            userId: req.user._id,
        });
        res.json({
            success: true,
            message: `Successfully recalculated ${result.updatedCount} customer return charge entries.`,
            data: result,
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=customerReturnCharge.routes.js.map