"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Partner_1 = require("../models/Partner");
const Expense_1 = require("../models/Expense");
const auth_1 = require("../middleware/auth");
const audit_service_1 = require("../services/audit.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/', async (_req, res) => {
    const partners = await Partner_1.Partner.find({ isActive: true }).sort({ name: 1 });
    res.json({ success: true, data: partners });
});
router.get('/:id', async (req, res) => {
    try {
        const p = await Partner_1.Partner.findById(req.params.id);
        if (!p) {
            res.status(404).json({ success: false, message: 'Partner not found' });
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
        const p = await Partner_1.Partner.create(req.body);
        await (0, audit_service_1.createAuditLog)({ action: 'CREATE', resource: 'Partner', resourceId: p._id.toString(), userId: req.user?._id });
        res.status(201).json({ success: true, data: p });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
router.put('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const p = await Partner_1.Partner.findByIdAndUpdate(id, req.body, { new: true });
        if (!p) {
            res.status(404).json({ success: false, message: 'Partner not found' });
            return;
        }
        await (0, audit_service_1.createAuditLog)({ action: 'UPDATE', resource: 'Partner', resourceId: id, userId: req.user?._id });
        res.json({ success: true, data: p });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
// DELETE /api/partners/:id — soft-delete or remove partner
router.delete('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const p = await Partner_1.Partner.findByIdAndUpdate(id, { isActive: false }, { new: true });
        if (!p) {
            res.status(404).json({ success: false, message: 'Partner not found' });
            return;
        }
        await (0, audit_service_1.createAuditLog)({ action: 'DELETE', resource: 'Partner', resourceId: id, userId: req.user?._id });
        res.json({ success: true, message: 'Partner removed successfully' });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
// GET /api/partners/balance — partner expense balance summary
router.get('/balance', auth_1.authenticate, async (req, res) => {
    try {
        const { accountId, startDate, endDate } = req.query;
        const filter = { isDeleted: false };
        if (accountId && accountId !== 'all')
            filter.businessAccount = accountId;
        if (startDate || endDate) {
            filter.expenseDate = {};
            if (startDate)
                filter.expenseDate['$gte'] = new Date(startDate);
            if (endDate)
                filter.expenseDate['$lte'] = new Date(endDate + 'T23:59:59.999Z');
        }
        const [partners, expenses] = await Promise.all([
            Partner_1.Partner.find({ isActive: true }).sort({ createdAt: 1 }),
            Expense_1.Expense.find(filter).populate('paidByPartner', 'name').populate('allocations.partner', 'name').sort({ expenseDate: -1 }),
        ]);
        const balances = {};
        for (const partner of partners) {
            const pid = partner._id.toString();
            balances[pid] = {
                expensesPaid: 0,
                expensesAllocated: 0,
                balance: 0,
                paidExpenses: [],
            };
        }
        for (const expense of expenses) {
            // Resolve which partner paid this expense
            let paidPartnerId = expense.paidByPartner?._id ? expense.paidByPartner._id.toString() : expense.paidByPartner?.toString();
            if (!paidPartnerId && expense.paidBy) {
                if (expense.paidBy === 'partner1' && partners[0])
                    paidPartnerId = partners[0]._id.toString();
                else if (expense.paidBy === 'partner2' && partners[1])
                    paidPartnerId = partners[1]._id.toString();
                else if (expense.paidBy === 'partner3' && partners[2])
                    paidPartnerId = partners[2]._id.toString();
                else {
                    const matched = partners.find(p => p.name.toLowerCase() === expense.paidBy.toLowerCase());
                    if (matched)
                        paidPartnerId = matched._id.toString();
                }
            }
            if (paidPartnerId && balances[paidPartnerId]) {
                balances[paidPartnerId].expensesPaid += expense.amount;
                balances[paidPartnerId].paidExpenses.push({
                    _id: expense._id.toString(),
                    description: expense.description,
                    amount: expense.amount,
                    expenseDate: expense.expenseDate,
                    category: expense.category,
                });
            }
            // Resolve allocations
            if (expense.allocations && expense.allocations.length > 0) {
                for (const alloc of expense.allocations) {
                    const pid = alloc.partner?._id ? alloc.partner._id.toString() : alloc.partner?.toString();
                    if (pid && balances[pid])
                        balances[pid].expensesAllocated += alloc.amount;
                }
            }
            else if (expense.allocationMethod === 'equal' && partners.length > 0) {
                const share = Math.round(expense.amount / partners.length);
                for (const p of partners) {
                    const pid = p._id.toString();
                    if (balances[pid])
                        balances[pid].expensesAllocated += share;
                }
            }
        }
        for (const pid of Object.keys(balances)) {
            balances[pid].balance = balances[pid].expensesPaid - balances[pid].expensesAllocated;
        }
        res.json({ success: true, data: balances });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=partner.routes.js.map