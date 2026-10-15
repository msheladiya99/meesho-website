import mongoose, { Schema, Document } from 'mongoose';

export type ScanType = 'internal_qr' | 'carrier_label' | 'meesho_order_id' | 'order_id' | 'manual';

export interface IPackingRecord extends Document {
  transactionId: string;
  businessAccount: mongoose.Types.ObjectId;
  order: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  sku: string;
  packedQuantity: number;
  scannedCode: string;
  scanType: ScanType;
  operator: mongoose.Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const packingRecordSchema = new Schema<IPackingRecord>({
  transactionId: { type: String, required: true, trim: true },
  businessAccount: { type: Schema.Types.ObjectId, ref: 'BusinessAccount', required: true },
  order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  sku: { type: String, required: true, uppercase: true },
  packedQuantity: { type: Number, required: true, min: 1 },
  scannedCode: { type: String, required: true, trim: true },
  scanType: {
    type: String,
    enum: ['internal_qr', 'carrier_label', 'meesho_order_id', 'order_id', 'manual'],
    default: 'carrier_label',
  },
  operator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  notes: { type: String },
}, { timestamps: true });

packingRecordSchema.index({ transactionId: 1 }, { unique: true });
packingRecordSchema.index({ businessAccount: 1, createdAt: -1 });
packingRecordSchema.index({ order: 1 });
packingRecordSchema.index({ product: 1 });

export const PackingRecord = mongoose.model<IPackingRecord>('PackingRecord', packingRecordSchema);
