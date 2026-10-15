"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const User_1 = require("../models/User");
const auth_1 = require("../middleware/auth");
const audit_service_1 = require("../services/audit.service");
const router = (0, express_1.Router)();
// All user routes require authentication
router.use(auth_1.authenticate);
// GET /api/users
router.get('/', auth_1.requireAdmin, async (_req, res) => {
    const users = await User_1.User.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, data: users });
});
// POST /api/users
router.post('/', auth_1.requireAdmin, async (req, res) => {
    try {
        const { name, email, password, role, allowedAccounts } = req.body;
        if (!name || !email || !password) {
            res.status(400).json({ success: false, message: 'Name, email, and password are required' });
            return;
        }
        const existing = await User_1.User.findOne({ email: email.toLowerCase() });
        if (existing) {
            res.status(400).json({ success: false, message: 'Email already in use' });
            return;
        }
        const user = await User_1.User.create({ name, email, password, role: role || 'viewer', allowedAccounts: allowedAccounts || [] });
        await (0, audit_service_1.createAuditLog)({ action: 'CREATE', resource: 'User', resourceId: user._id.toString(), userId: req.user?._id, details: `Created user ${email}` });
        res.status(201).json({ success: true, data: { _id: user._id, name: user.name, email: user.email, role: user.role } });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// PUT /api/users/:id
router.put('/:id', auth_1.requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const { name, email, role, allowedAccounts, isActive } = req.body;
        const user = await User_1.User.findByIdAndUpdate(id, { name, email, role, allowedAccounts, isActive }, { new: true, runValidators: true }).select('-password');
        if (!user) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }
        await (0, audit_service_1.createAuditLog)({ action: 'UPDATE', resource: 'User', resourceId: id, userId: req.user?._id, details: `Updated user ${user.email}` });
        res.json({ success: true, data: user });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// POST /api/users/:id/reset-password
router.post('/:id/reset-password', auth_1.requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const { password } = req.body;
        if (!password || password.length < 6) {
            res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
            return;
        }
        const user = await User_1.User.findById(id);
        if (!user) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }
        user.password = password;
        await user.save();
        await (0, audit_service_1.createAuditLog)({ action: 'UPDATE', resource: 'User', resourceId: id, userId: req.user?._id, details: `Password reset for user ${user.email}` });
        res.json({ success: true, message: 'Password reset successfully' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// DELETE /api/users/:id
router.delete('/:id', auth_1.requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        if (id === req.user?._id) {
            res.status(400).json({ success: false, message: 'Cannot delete your own account' });
            return;
        }
        await User_1.User.findByIdAndUpdate(id, { isActive: false });
        await (0, audit_service_1.createAuditLog)({ action: 'DELETE', resource: 'User', resourceId: id, userId: req.user?._id });
        res.json({ success: true, message: 'User deactivated' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=user.routes.js.map