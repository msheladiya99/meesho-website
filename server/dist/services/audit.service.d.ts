import mongoose from 'mongoose';
interface AuditParams {
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'EXPORT';
    resource: string;
    resourceId?: string | mongoose.Types.ObjectId;
    userId?: string;
    ip?: string;
    details?: string;
    changes?: Record<string, unknown>;
}
export declare const createAuditLog: (params: AuditParams) => Promise<void>;
export {};
//# sourceMappingURL=audit.service.d.ts.map