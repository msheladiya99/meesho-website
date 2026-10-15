"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("../models/User");
const rateLimiter_1 = require("../middleware/rateLimiter");
const auth_1 = require("../middleware/auth");
const audit_service_1 = require("../services/audit.service");
const router = (0, express_1.Router)();
// POST /api/auth/login
router.post('/login', rateLimiter_1.authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ success: false, message: 'Email and password are required' });
            return;
        }
        const user = await User_1.User.findOne({ email: email.toLowerCase(), isActive: true });
        if (!user || !(await user.comparePassword(password))) {
            res.status(401).json({ success: false, message: 'Invalid email or password' });
            return;
        }
        const secret = process.env.JWT_SECRET || 'fallback_secret';
        const token = jsonwebtoken_1.default.sign({ id: user._id }, secret, {
            expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        });
        await (0, audit_service_1.createAuditLog)({
            action: 'LOGIN',
            resource: 'User',
            resourceId: user._id.toString(),
            userId: user._id.toString(),
            ip: req.ip,
            details: `User ${user.email} logged in`,
        });
        res.json({
            success: true,
            data: {
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    allowedAccounts: user.allowedAccounts,
                    createdAt: user.createdAt,
                },
                token,
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// GET /api/auth/me
router.get('/me', auth_1.authenticate, async (req, res) => {
    try {
        const user = await User_1.User.findById(req.user._id).select('-password');
        if (!user) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }
        res.json({ success: true, data: user });
    }
    catch {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// POST /api/auth/change-password
router.post('/change-password', auth_1.authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User_1.User.findById(req.user._id);
        if (!user || !(await user.comparePassword(currentPassword))) {
            res.status(401).json({ success: false, message: 'Current password is incorrect' });
            return;
        }
        if (!newPassword || newPassword.length < 6) {
            res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
            return;
        }
        user.password = newPassword;
        await user.save();
        res.json({ success: true, message: 'Password changed successfully' });
    }
    catch {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map