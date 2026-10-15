import mongoose, { Document } from 'mongoose';
export interface IAuditLog extends Document {
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'EXPORT';
    resource: string;
    resourceId?: mongoose.Types.ObjectId;
    user?: mongoose.Types.ObjectId;
    ip?: string;
    userAgent?: string;
    details?: string;
    changes?: Record<string, unknown>;
}
export declare const AuditLog: mongoose.Model<IAuditLog, {}, {}, {}, Document<unknown, {}, IAuditLog, {}, mongoose.DefaultSchemaOptions> & IAuditLog & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IAuditLog & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}>;
//# sourceMappingURL=AuditLog.d.ts.map