"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Vendor_1 = require("../models/Vendor");
const auth_1 = require("../middleware/auth");
const audit_service_1 = require("../services/audit.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/', async (_req, res) => {
    const vendors = await Vendor_1.Vendor.find({ isActive: true }).sort({ name: 1 });
    res.json({ success: true, data: vendors });
});
router.post('/', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const v = await Vendor_1.Vendor.create(req.body);
        await (0, audit_service_1.createAuditLog)({ action: 'CREATE', resource: 'Vendor', resourceId: v._id.toString(), userId: req.user?._id });
        res.status(201).json({ success: true, data: v });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
router.put('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const v = await Vendor_1.Vendor.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!v) {
            res.status(404).json({ success: false, message: 'Vendor not found' });
            return;
        }
        await (0, audit_service_1.createAuditLog)({ action: 'UPDATE', resource: 'Vendor', resourceId: req.params.id, userId: req.user?._id });
        res.json({ success: true, data: v });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
router.delete('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        await Vendor_1.Vendor.findByIdAndUpdate(req.params.id, { isActive: false });
        await (0, audit_service_1.createAuditLog)({ action: 'DELETE', resource: 'Vendor', resourceId: req.params.id, userId: req.user?._id });
        res.json({ success: true, message: 'Vendor deactivated' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=vendor.routes.js.map