"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Category_1 = require("../models/Category");
const auth_1 = require("../middleware/auth");
const audit_service_1 = require("../services/audit.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/', async (_req, res) => {
    const cats = await Category_1.Category.find({ isActive: true }).sort({ name: 1 });
    res.json({ success: true, data: cats });
});
router.post('/', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const cat = await Category_1.Category.create(req.body);
        await (0, audit_service_1.createAuditLog)({ action: 'CREATE', resource: 'Category', resourceId: cat._id.toString(), userId: req.user?._id });
        res.status(201).json({ success: true, data: cat });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
router.put('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const cat = await Category_1.Category.findByIdAndUpdate(id, req.body, { new: true });
        if (!cat) {
            res.status(404).json({ success: false, message: 'Category not found' });
            return;
        }
        await (0, audit_service_1.createAuditLog)({ action: 'UPDATE', resource: 'Category', resourceId: id, userId: req.user?._id });
        res.json({ success: true, data: cat });
    }
    catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
router.delete('/:id', auth_1.requireManagerOrAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const category = await Category_1.Category.findByIdAndDelete(id);
        if (!category) {
            res.status(404).json({ success: false, message: 'Category not found' });
            return;
        }
        await (0, audit_service_1.createAuditLog)({ action: 'DELETE', resource: 'Category', resourceId: id, userId: req.user?._id, details: `Deleted category ${category.name}` });
        res.json({ success: true, message: 'Category deleted' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=category.routes.js.map