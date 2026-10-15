"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const Expense_1 = require("../models/Expense");
const Partner_1 = require("../models/Partner");
const auth_1 = require("../middleware/auth");
const audit_service_1 = require("../services/audit.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const accountFilter = (accountId) => accountId && accountId !== 'all' ? { businessAccount: new mongoose_1.default.Types.ObjectId(accountId) } : {};
// GET /api/expenses
router.get('/', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate, page = '1', limit = '100' } = req.query;
        const filter = { isDeleted: false, ...accountFilter(accountId) };
        if (startDate || endDate) {
            filter.expenseDate = {};
            if (startDate)
                filter.expenseDate['$gte'] = new Date(startDate);
            if (endDate)
                filter.expenseDate['$lte'] = new Date(endDate + 'T23:59:59.999Z');
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [expenses, total] = await Promise.all([
            Expense_1.Expense.find(filter).populate('paidByPartner', 'name').populate('allocations.partner', 'name').populate('businessAccount', 'name gstin').sort({ expenseDate: -1 }).skip(skip).limit(parseInt(limit)),
            Expense_1.Expense.countDocuments(filter),
        ]);
        res.json({ success: true, data: expenses, total });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/expenses
router.post('/', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { businessAccount, amount, allocationMethod, paidBy, paidByPartner } = req.body;
        if (!businessAccount) {
            res.status(400).json({ success: false, message: 'businessAccount is required' });
            return;
        }
        // Auto-generate equal allocations if method is equal
        let { allocations } = req.body;
        if (allocationMethod === 'equal' && (!allocations || allocations.length === 0)) {
            const partners = await Partner_1.Partner.find({ isActive: true });
            if (partners.length > 0) {
                const perPartner = Math.round(amount / partners.length);
                const rem = amount - perPartner * partners.length;
                allocations = partners.map((p, i) => ({
                    partner: p._id,
                    amount: i === 0 ? perPartner + rem : perPartner,
                    percent: Math.round(100 / partners.length),
                }));
            }
        }
        // Validate allocation total
        if (allocations && allocations.length > 0) {
            const allocTotal = allocations.reduce((s, a) => s + a.amount, 0);
            if (Math.abs(allocTotal - amount) > 5) { // allow 5 paise rounding tolerance
                res.status(400).json({ success: false, message: `Allocation total (${allocTotal}) does not match expense amount (${amount})` });
                return;
            }
        }
        const expense = await Expense_1.Expense.create({
            ...req.body,
            allocations,
            paidByPartner: paidByPartner || undefined,
            createdBy: req.user?._id,
        });
        await (0, audit_service_1.createAuditLog)({ action: 'CREATE', resource: 'Expense', resourceId: expense._id.toString(), userId: req.user?._id, details: `${req.body.category}: ₹${(amount / 100).toFixed(2)}` });
        const populated = await Expense_1.Expense.findById(expense._id).populate('paidByPartner', 'name').populate('allocations.partner', 'name').populate('businessAccount', 'name gstin');
        res.status(201).json({ success: true, data: populated });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
// PUT /api/expenses/:id
router.put('/:id', auth_1.requireManagerOrAdmin, auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const updated = await Expense_1.Expense.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('paidByPartner', 'name').populate('businessAccount', 'name gstin');
        if (!updated) {
            res.status(404).json({ success: false, message: 'Expense not found' });
            return;
        }
        await (0, audit_service_1.createAuditLog)({ action: 'UPDATE', resource: 'Expense', resourceId: req.params.id, userId: req.user?._id });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
// DELETE /api/expenses/:id
router.delete('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        await Expense_1.Expense.findByIdAndUpdate(req.params.id, { isDeleted: true });
        await (0, audit_service_1.createAuditLog)({ action: 'DELETE', resource: 'Expense', resourceId: req.params.id, userId: req.user?._id });
        res.json({ success: true, message: 'Expense deleted' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/expenses/summary/partner
router.get('/summary/partner', auth_1.enforceAccountAccess, async (req, res) => {
    try {
        const { accountId, startDate, endDate } = req.query;
        const filter = { isDeleted: false, ...accountFilter(accountId) };
        if (startDate || endDate) {
            filter.expenseDate = {};
            if (startDate)
                filter.expenseDate['$gte'] = new Date(startDate);
            if (endDate)
                filter.expenseDate['$lte'] = new Date(endDate + 'T23:59:59.999Z');
        }
        const [partners, expenses] = await Promise.all([
            Partner_1.Partner.find({ isActive: true }),
            Expense_1.Expense.find(filter),
        ]);
        const summary = partners.map(p => {
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
            return { partner: p.name, partnerId: pid, paid, allocated, balance: paid - allocated };
        });
        res.json({ success: true, data: summary });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=expense.routes.js.map