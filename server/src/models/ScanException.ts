import mongoose, { Schema, Document } from 'mongoose';

export type ExceptionType =
  | 'order_not_found'
  | 'already_packed'
  | 'already_returned'
  | 'qty_exceeded'
  | 'wrong_account'
  | 'invalid_format'
  | 'system_error';

export interface IScanException extends Document {
  businessAccount?: mongoose.Types.ObjectId;
  scannedCode: string;
  module: 'packing' | 'return';
  exceptionType: ExceptionType;
  attemptedAction: string;
  operator?: mongoose.Types.ObjectId;
  details?: string;
  createdAt: Date;
  updatedAt: Date;
}

const scanExceptionSchema = new Schema<IScanException>({
  businessAccount: { type: Schema.Types.ObjectId, ref: 'BusinessAccount' },
  scannedCode: { type: String, required: true, trim: true },
  module: { type: String, enum: ['packing', 'return'], required: true },
  exceptionType: {
    type: String,
    enum: [
      'order_not_found',
      'already_packed',
      'already_returned',
      'qty_exceeded',
      'wrong_account',
      'invalid_format',
      'system_error',
    ],
    required: true,
  },
  attemptedAction: { type: String, required: true },
  operator: { type: Schema.Types.ObjectId, ref: 'User' },
  details: { type: String },
}, { timestamps: true });

scanExceptionSchema.index({ businessAccount: 1, createdAt: -1 });
scanExceptionSchema.index({ scannedCode: 1 });
scanExceptionSchema.index({ exceptionType: 1 });

export const ScanException = mongoose.model<IScanException>('ScanException', scanExceptionSchema);
