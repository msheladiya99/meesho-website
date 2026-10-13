import mongoose, { Schema, Document } from 'mongoose';

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

const auditLogSchema = new Schema<IAuditLog>({
  action: { type: String, enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT'], required: true },
  resource: { type: String, required: true },
  resourceId: { type: Schema.Types.ObjectId },
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  ip: { type: String },
  userAgent: { type: String },
  details: { type: String },
  changes: { type: Schema.Types.Mixed },
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ resource: 1 });
auditLogSchema.index({ user: 1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
