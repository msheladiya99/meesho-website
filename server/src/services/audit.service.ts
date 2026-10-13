import { AuditLog } from '../models/AuditLog';
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

export const createAuditLog = async (params: AuditParams): Promise<void> => {
  try {
    await AuditLog.create({
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      user: params.userId,
      ip: params.ip,
      details: params.details,
      changes: params.changes,
    });
  } catch (err) {
    // Audit log failures should never crash the main request
    console.error('Audit log error:', err);
  }
};
