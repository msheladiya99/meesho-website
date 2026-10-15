"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceAccountAccess = exports.requireManagerOrAdmin = exports.requireAdmin = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("../models/User");
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ success: false, message: 'No token provided' });
            return;
        }
        const token = authHeader.split(' ')[1];
        const secret = process.env.JWT_SECRET || 'fallback_secret';
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        const user = await User_1.User.findById(decoded.id).select('-password').lean();
        if (!user) {
            res.status(401).json({ success: false, message: 'User not found' });
            return;
        }
        req.user = {
            _id: user._id.toString(),
            role: user.role,
            allowedAccounts: (user.allowedAccounts || []).map(String),
            name: user.name,
            email: user.email,
        };
        next();
    }
    catch {
        res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};
exports.authenticate = authenticate;
const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        res.status(403).json({ success: false, message: 'Admin access required' });
        return;
    }
    next();
};
exports.requireAdmin = requireAdmin;
const requireManagerOrAdmin = (req, res, next) => {
    if (!['admin', 'manager'].includes(req.user?.role || '')) {
        res.status(403).json({ success: false, message: 'Insufficient permissions' });
        return;
    }
    next();
};
exports.requireManagerOrAdmin = requireManagerOrAdmin;
/**
 * Middleware that enforces the accountId from query/body matches
 * the user's allowed accounts (admins bypass this check).
 */
const enforceAccountAccess = (req, res, next) => {
    if (req.user?.role === 'admin') {
        next();
        return;
    }
    const accountId = req.query.accountId || req.body.businessAccount;
    if (accountId && accountId !== 'all') {
        const allowed = req.user?.allowedAccounts || [];
        if (!allowed.includes(accountId)) {
            res.status(403).json({ success: false, message: 'Access to this account is not permitted' });
            return;
        }
    }
    next();
};
exports.enforceAccountAccess = enforceAccountAccess;
//# sourceMappingURL=auth.js.map