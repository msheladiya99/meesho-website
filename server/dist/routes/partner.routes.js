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
        const p = await Partner_1.Partner.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!p) {
            res.status(404).json({ success: false, message: 'Partner not found' });
            return;
        }
        await (0, audit_service_1.createAuditLog)({ action: 'UPDATE', resource: 'Partner', resourceId: req.params.id, userId: req.user?._id });
        res.json({ success: true, data: p });
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
            Partner_1.Partner.find({ isActive: true }),
            Expense_1.Expense.find(filter).populate('allocations.partner'),
        ]);
        const balances = {};
        for (const partner of partners) {
            const pid = partner._id.toString();
            balances[pid] = { expensesPaid: 0, expensesAllocated: 0, balance: 0 };
        }
        for (const expense of expenses) {
            if (expense.paidByPartner) {
                const pid = expense.paidByPartner.toString();
                if (balances[pid])
                    balances[pid].expensesPaid += expense.amount;
            }
            for (const alloc of expense.allocations) {
                const pid = alloc.partner?.toString();
                if (pid && balances[pid])
                    balances[pid].expensesAllocated += alloc.amount;
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