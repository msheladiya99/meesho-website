"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AuditLog_1 = require("../models/AuditLog");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate, auth_1.requireAdmin);
// GET /api/audit-logs
router.get('/', async (req, res) => {
    try {
        const { page = '1', limit = '10', action, resource, search } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const skip = (pageNum - 1) * limitNum;
        const filter = {};
        if (action && action !== 'ALL') {
            filter.action = action;
        }
        if (resource && resource !== 'ALL') {
            filter.resource = resource;
        }
        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), 'i');
            filter.$or = [
                { resource: searchRegex },
                { details: searchRegex },
                { ip: searchRegex },
            ];
        }
        const [logs, total] = await Promise.all([
            AuditLog_1.AuditLog.find(filter)
                .populate('user', 'name email role')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum),
            AuditLog_1.AuditLog.countDocuments(filter),
        ]);
        const totalPages = Math.ceil(total / limitNum) || 1;
        res.json({
            success: true,
            data: logs,
            total,
            totalPages,
            page: pageNum,
            limit: limitNum,
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/audit-logs/:id
router.get('/:id', async (req, res) => {
    try {
        const log = await AuditLog_1.AuditLog.findById(req.params.id).populate('user', 'name email role');
        if (!log) {
            res.status(404).json({ success: false, message: 'Audit log not found' });
            return;
        }
        res.json({ success: true, data: log });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=audit.routes.js.map