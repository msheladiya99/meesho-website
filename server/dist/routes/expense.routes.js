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
        const [partners, [expenses, total]] = await Promise.all([
            Partner_1.Partner.find({ isActive: true }).sort({ createdAt: 1 }),
            Promise.all([
                Expense_1.Expense.find(filter)
                    .populate('paidByPartner', 'name')
                    .populate('allocations.partner', 'name')
                    .populate('businessAccount', 'name gstin')
                    .sort({ expenseDate: -1 })
                    .skip(skip)
                    .limit(parseInt(limit)),
                Expense_1.Expense.countDocuments(filter),
            ]),
        ]);
        // Attach resolved paidByPartner for legacy records
        const resolvedExpenses = expenses.map((e) => {
            const obj = e.toObject();
            if (!obj.paidByPartner && obj.paidBy && obj.paidBy !== 'business') {
                if (obj.paidBy === 'partner1' && partners[0])
                    obj.paidByPartner = { _id: partners[0]._id, name: partners[0].name };
                else if (obj.paidBy === 'partner2' && partners[1])
                    obj.paidByPartner = { _id: partners[1]._id, name: partners[1].name };
                else if (obj.paidBy === 'partner3' && partners[2])
                    obj.paidByPartner = { _id: partners[2]._id, name: partners[2].name };
                else {
                    const matched = partners.find(p => p.name.toLowerCase() === obj.paidBy.toLowerCase());
                    if (matched)
                        obj.paidByPartner = { _id: matched._id, name: matched.name };
                }
            }
            return obj;
        });
        res.json({ success: true, data: resolvedExpenses, total });
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
        const partners = await Partner_1.Partner.find({ isActive: true }).sort({ createdAt: 1 });
        // Determine actual paidByPartner
        let resolvedPartnerId = paidByPartner;
        if (!resolvedPartnerId && paidBy && paidBy !== 'business') {
            if (paidBy === 'partner1' && partners[0])
                resolvedPartnerId = partners[0]._id;
            else if (paidBy === 'partner2' && partners[1])
                resolvedPartnerId = partners[1]._id;
            else if (paidBy === 'partner3' && partners[2])
                resolvedPartnerId = partners[2]._id;
            else {
                const matched = partners.find(p => p._id.toString() === paidBy || p.name.toLowerCase() === paidBy.toLowerCase());
                if (matched)
                    resolvedPartnerId = matched._id;
            }
        }
        // Auto-generate equal allocations if method is equal and not provided
        let { allocations } = req.body;
        if ((allocationMethod === 'equal' || !allocationMethod) && (!allocations || allocations.length === 0)) {
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
            if (Math.abs(allocTotal - amount) > 20) { // allow 20 paise rounding tolerance
                res.status(400).json({ success: false, message: `Allocation total (₹${(allocTotal / 100).toFixed(2)}) does not match expense amount (₹${(amount / 100).toFixed(2)})` });
                return;
            }
        }
        const expense = await Expense_1.Expense.create({
            ...req.body,
            allocations,
            paidBy: paidBy || 'business',
            paidByPartner: resolvedPartnerId || undefined,
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
        const id = req.params.id;
        const { paidBy, paidByPartner } = req.body;
        let resolvedPartnerId = paidByPartner;
        if (!resolvedPartnerId && paidBy && paidBy !== 'business') {
            const partners = await Partner_1.Partner.find({ isActive: true }).sort({ createdAt: 1 });
            if (paidBy === 'partner1' && partners[0])
                resolvedPartnerId = partners[0]._id;
            else if (paidBy === 'partner2' && partners[1])
                resolvedPartnerId = partners[1]._id;
            else if (paidBy === 'partner3' && partners[2])
                resolvedPartnerId = partners[2]._id;
            else {
                const matched = partners.find(p => p._id.toString() === paidBy || p.name.toLowerCase() === paidBy.toLowerCase());
                if (matched)
                    resolvedPartnerId = matched._id;
            }
        }
        const updated = await Expense_1.Expense.findByIdAndUpdate(id, { ...req.body, paidByPartner: resolvedPartnerId || (paidBy === 'business' ? null : undefined) }, { new: true }).populate('paidByPartner', 'name').populate('allocations.partner', 'name').populate('businessAccount', 'name gstin');
        if (!updated) {
            res.status(404).json({ success: false, message: 'Expense not found' });
            return;
        }
        await (0, audit_service_1.createAuditLog)({ action: 'UPDATE', resource: 'Expense', resourceId: id, userId: req.user?._id });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
// DELETE /api/expenses/:id
router.delete('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        await Expense_1.Expense.findByIdAndUpdate(id, { isDeleted: true });
        await (0, audit_service_1.createAuditLog)({ action: 'DELETE', resource: 'Expense', resourceId: id, userId: req.user?._id });
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
            Partner_1.Partner.find({ isActive: true }).sort({ createdAt: 1 }),
            Expense_1.Expense.find(filter),
        ]);
        const summary = partners.map((p, pIdx) => {
            const pid = p._id.toString();
            let paid = 0;
            let allocated = 0;
            for (const e of expenses) {
                let paidPid = e.paidByPartner?.toString();
                if (!paidPid && e.paidBy) {
                    if (e.paidBy === `partner${pIdx + 1}`)
                        paidPid = pid;
                    else if (e.paidBy.toLowerCase() === p.name.toLowerCase())
                        paidPid = pid;
                }
                if (paidPid === pid)
                    paid += e.amount;
                const alloc = e.allocations.find(a => a.partner?.toString() === pid);
                if (alloc)
                    allocated += alloc.amount;
                else if (e.allocationMethod === 'equal' && (!e.allocations || e.allocations.length === 0)) {
                    allocated += Math.round(e.amount / partners.length);
                }
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