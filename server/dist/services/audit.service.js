"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuditLog = void 0;
const AuditLog_1 = require("../models/AuditLog");
const createAuditLog = async (params) => {
    try {
        await AuditLog_1.AuditLog.create({
            action: params.action,
            resource: params.resource,
            resourceId: params.resourceId,
            user: params.userId,
            ip: params.ip,
            details: params.details,
            changes: params.changes,
        });
    }
    catch (err) {
        // Audit log failures should never crash the main request
        console.error('Audit log error:', err);
    }
};
exports.createAuditLog = createAuditLog;
//# sourceMappingURL=audit.service.js.map