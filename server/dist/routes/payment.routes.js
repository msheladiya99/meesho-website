"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const multer_1 = __importDefault(require("multer"));
const Payment_1 = require("../models/Payment");
const auth_1 = require("../middleware/auth");
const audit_service_1 = require("../services/audit.service");
const payment_service_1 = require("../services/payment.service");
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
});
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// GET /api/payments/dashboard
// Returns summary and day tabs for Upcoming, Completed, and Unscheduled payments
router.get('/dashboard', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, upcomingDate, completedDate } = req.query;
        const dashboardData = await (0, payment_service_1.getPaymentsDashboard)({
            businessAccount: accountId,
            selectedUpcomingDate: upcomingDate,
            selectedCompletedDate: completedDate,
        });
        res.json({ success: true, data: dashboardData });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/payments
// List payments with search, date range, status, and pagination
router.get('/', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, status, search, startDate, endDate, page, limit } = req.query;
        const result = await (0, payment_service_1.listPayments)({
            businessAccount: accountId,
            status,
            search,
            startDate,
            endDate,
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 25,
        });
        res.json({ success: true, ...result });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/payments
// Record a Payment Receive (Manual Entry)
router.post('/', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { businessAccount, paymentDate, status, neftId, bankName, bankAccountNumber, ordersAmount, salesAmount, returnsDeduction, adsCost, programCost, otherRecovery, programBenefits, referralEarnings, otherCompensation, netAmount, subOrderIds, notes, } = req.body;
        if (!businessAccount) {
            res.status(400).json({ success: false, message: 'businessAccount is required' });
            return;
        }
        if (!paymentDate) {
            res.status(400).json({ success: false, message: 'paymentDate is required' });
            return;
        }
        if (ordersAmount === undefined && netAmount === undefined) {
            res.status(400).json({ success: false, message: 'ordersAmount or netAmount is required' });
            return;
        }
        const payment = await (0, payment_service_1.recordPaymentReceive)({
            businessAccount,
            paymentDate,
            status,
            neftId,
            bankName,
            bankAccountNumber,
            ordersAmount: ordersAmount !== undefined ? Number(ordersAmount) : Number(netAmount),
            salesAmount: salesAmount !== undefined ? Number(salesAmount) : undefined,
            returnsDeduction: returnsDeduction !== undefined ? Number(returnsDeduction) : 0,
            adsCost: adsCost !== undefined ? Number(adsCost) : 0,
            programCost: programCost !== undefined ? Number(programCost) : 0,
            otherRecovery: otherRecovery !== undefined ? Number(otherRecovery) : 0,
            programBenefits: programBenefits !== undefined ? Number(programBenefits) : 0,
            referralEarnings: referralEarnings !== undefined ? Number(referralEarnings) : 0,
            otherCompensation: otherCompensation !== undefined ? Number(otherCompensation) : 0,
            netAmount: netAmount !== undefined ? Number(netAmount) : undefined,
            subOrderIds: Array.isArray(subOrderIds) ? subOrderIds : [],
            notes,
        }, req.user?._id?.toString());
        res.status(201).json({
            success: true,
            message: `Payment receive of ${(0, payment_service_1.formatRupees)(payment.netAmount)} recorded successfully.`,
            data: payment,
        });
    }
    catch (err) {
        if (err.code === 11000 || (err.message && err.message.includes('11000'))) {
            res.status(400).json({ success: false, message: 'A payment with this NEFT ID already exists for this business account.' });
            return;
        }
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/payments/reconciliation
// Returns unsettled dispatched orders (>15d), discrepancies, and reconciliation summary totals
router.get('/reconciliation', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate } = req.query;
        const reconciliationData = await (0, payment_service_1.getPaymentReconciliation)({
            businessAccount: accountId,
            allowedAccounts: req.allowedAccountIds,
            startDate,
            endDate,
        });
        res.json({ success: true, data: reconciliationData });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/payments/:id
router.get('/:id', async (req, res) => {
    try {
        const payment = await Payment_1.Payment.findById(req.params.id)
            .populate('businessAccount', 'name tradeName gstin')
            .populate('createdBy', 'name email');
        if (!payment || payment.isDeleted) {
            res.status(404).json({ success: false, message: 'Payment record not found' });
            return;
        }
        if (req.user?.role !== 'admin') {
            const payAccId = payment.businessAccount?._id?.toString() || payment.businessAccount?.toString();
            if (payAccId && !req.user?.allowedAccounts?.includes(payAccId)) {
                res.status(403).json({ success: false, message: 'Access to this account is not permitted' });
                return;
            }
        }
        res.json({ success: true, data: payment });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// PUT /api/payments/:id
router.put('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const payment = await Payment_1.Payment.findById(req.params.id);
        if (!payment || payment.isDeleted) {
            res.status(404).json({ success: false, message: 'Payment record not found' });
            return;
        }
        if (req.user?.role !== 'admin') {
            const payAccId = payment.businessAccount?._id?.toString() || payment.businessAccount?.toString();
            if (payAccId && !req.user?.allowedAccounts?.includes(payAccId)) {
                res.status(403).json({ success: false, message: 'Access to this account is not permitted' });
                return;
            }
        }
        const { businessAccount, paymentDate, status, neftId, bankName, bankAccountNumber, ordersAmount, salesAmount, returnsDeduction, adsCost, programCost, otherRecovery, programBenefits, referralEarnings, otherCompensation, netAmount, notes, } = req.body;
        if (businessAccount && mongoose_1.default.Types.ObjectId.isValid(businessAccount)) {
            payment.businessAccount = new mongoose_1.default.Types.ObjectId(businessAccount);
        }
        if (paymentDate)
            payment.paymentDate = new Date(paymentDate);
        if (status)
            payment.status = status;
        if (neftId !== undefined)
            payment.neftId = neftId.trim();
        if (bankName !== undefined)
            payment.bankName = bankName.trim();
        if (bankAccountNumber !== undefined)
            payment.bankAccountNumber = bankAccountNumber.trim();
        if (ordersAmount !== undefined)
            payment.ordersAmount = Number(ordersAmount);
        if (salesAmount !== undefined)
            payment.salesAmount = Number(salesAmount);
        if (returnsDeduction !== undefined)
            payment.returnsDeduction = Number(returnsDeduction);
        if (adsCost !== undefined)
            payment.adsCost = Number(adsCost);
        if (programCost !== undefined)
            payment.programCost = Number(programCost);
        if (otherRecovery !== undefined)
            payment.otherRecovery = Number(otherRecovery);
        if (programBenefits !== undefined)
            payment.programBenefits = Number(programBenefits);
        if (referralEarnings !== undefined)
            payment.referralEarnings = Number(referralEarnings);
        if (otherCompensation !== undefined)
            payment.otherCompensation = Number(otherCompensation);
        if (netAmount !== undefined) {
            payment.netAmount = Number(netAmount);
        }
        else {
            payment.netAmount =
                payment.ordersAmount -
                    (payment.adsCost + payment.programCost + payment.otherRecovery) +
                    (payment.programBenefits + payment.referralEarnings + payment.otherCompensation);
        }
        if (notes !== undefined)
            payment.notes = notes.trim();
        await payment.save();
        await payment.populate('businessAccount', 'name tradeName gstin');
        if (req.user?._id) {
            await (0, audit_service_1.createAuditLog)({
                action: 'UPDATE',
                resource: 'Payment',
                resourceId: payment._id.toString(),
                userId: req.user._id.toString(),
                details: `Updated payment ${payment._id} (${(0, payment_service_1.formatRupees)(payment.netAmount)})`,
            });
        }
        res.json({ success: true, message: 'Payment updated successfully', data: payment });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// DELETE /api/payments/:id
router.delete('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const payment = await Payment_1.Payment.findById(req.params.id);
        if (!payment || payment.isDeleted) {
            res.status(404).json({ success: false, message: 'Payment record not found' });
            return;
        }
        if (req.user?.role !== 'admin') {
            const payAccId = payment.businessAccount?._id?.toString() || payment.businessAccount?.toString();
            if (payAccId && !req.user?.allowedAccounts?.includes(payAccId)) {
                res.status(403).json({ success: false, message: 'Access to this account is not permitted' });
                return;
            }
        }
        payment.isDeleted = true;
        await payment.save();
        if (req.user?._id) {
            await (0, audit_service_1.createAuditLog)({
                action: 'DELETE',
                resource: 'Payment',
                resourceId: payment._id.toString(),
                userId: req.user._id.toString(),
                details: `Deleted payment record ${payment._id} (NEFT: ${payment.neftId || 'N/A'}, ${(0, payment_service_1.formatRupees)(payment.netAmount)})`,
            });
        }
        res.json({ success: true, message: 'Payment record deleted successfully' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/payments/import
// Import Meesho Payment Sheet (CSV / Excel)
router.post('/import', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ success: false, message: 'No file uploaded' });
            return;
        }
        const businessAccount = req.body.businessAccount || req.query.accountId;
        if (!businessAccount || businessAccount === 'all') {
            res.status(400).json({ success: false, message: 'Please select a specific GSTIN business account for import' });
            return;
        }
        const result = await (0, payment_service_1.importMeeshoPaymentSheet)({
            buffer: req.file.buffer,
            businessAccount,
            userId: req.user?._id?.toString(),
        });
        res.json({
            success: true,
            message: `Import completed: ${result.paymentsCreated} payment records created, ${result.paymentsUpdated} updated from ${result.totalRows} rows.`,
            data: result,
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=payment.routes.js.map