"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const BusinessAccount_1 = require("../models/BusinessAccount");
const auth_1 = require("../middleware/auth");
const audit_service_1 = require("../services/audit.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// GET /api/business-accounts
router.get('/', async (req, res) => {
    try {
        let query = {};
        // Non-admins only see their allowed accounts
        if (req.user?.role !== 'admin' && req.user?.allowedAccounts?.length) {
            query = { _id: { $in: req.user.allowedAccounts } };
        }
        const accounts = await BusinessAccount_1.BusinessAccount.find(query).sort({ name: 1 });
        res.json({ success: true, data: accounts });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/business-accounts
router.post('/', auth_1.requireAdmin, async (req, res) => {
    try {
        const account = await BusinessAccount_1.BusinessAccount.create(req.body);
        await (0, audit_service_1.createAuditLog)({ action: 'CREATE', resource: 'BusinessAccount', resourceId: account._id.toString(), userId: req.user?._id, details: `Created GSTIN account ${account.gstin}` });
        res.status(201).json({ success: true, data: account });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
// PUT /api/business-accounts/:id
router.put('/:id', auth_1.requireAdmin, async (req, res) => {
    try {
        const account = await BusinessAccount_1.BusinessAccount.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!account) {
            res.status(404).json({ success: false, message: 'Account not found' });
            return;
        }
        await (0, audit_service_1.createAuditLog)({ action: 'UPDATE', resource: 'BusinessAccount', resourceId: req.params.id, userId: req.user?._id });
        res.json({ success: true, data: account });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
// DELETE /api/business-accounts/:id
router.delete('/:id', auth_1.requireAdmin, async (req, res) => {
    try {
        await BusinessAccount_1.BusinessAccount.findByIdAndUpdate(req.params.id, { isActive: false });
        await (0, audit_service_1.createAuditLog)({ action: 'DELETE', resource: 'BusinessAccount', resourceId: req.params.id, userId: req.user?._id });
        res.json({ success: true, message: 'Account deactivated' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=account.routes.js.map