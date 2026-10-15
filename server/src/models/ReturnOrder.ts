import mongoose, { Schema, Document } from 'mongoose';

export type ItemCondition = 'sellable' | 'damaged' | 'opened' | 'pending_inspection';
export type StockDisposition = 'restock' | 'discard' | 'pending';
export type ReturnType = 'customer_return' | 'rto_return';
export type ReturnStatus =
  | 'return_initiated'
  | 'parcel_received'
  | 'inspection_pending'
  | 'inspected'
  | 'stock_updated';
export type DamageResolution = 'none' | 'repaired' | 'disposed' | 'resale_approved';

export interface IReturnOrder extends Document {
  returnTransactionId: string;
  businessAccount: mongoose.Types.ObjectId;
  returnDate: Date;
  returnType: ReturnType;
  status: ReturnStatus;
  originalOrder?: mongoose.Types.ObjectId;
  meeshoOrderId?: string;
  carrierTrackingId?: string;
  scannedQrCode?: string;
  product: mongoose.Types.ObjectId;
  returnedQuantity: number;
  goodQuantity: number;
  damagedQuantity: number;
  pendingInspectionQuantity: number;
  originalSellingPrice: number; // paise
  returnAmount: number;         // paise
  returnReason?: string;
  damageReason?: string;
  damagePhotos: string[];
  damageResolution: DamageResolution;
  itemCondition: ItemCondition;
  stockDisposition: StockDisposition;
  stockRestored: boolean;       // has saleable stock actually been added back?
  damagedStockRestored: boolean; // has damaged stock been recorded in damaged bucket?
  receivedAt?: Date;
  receivedBy?: mongoose.Types.ObjectId;
  inspectedAt?: Date;
  inspectedBy?: mongoose.Types.ObjectId;
  operator?: mongoose.Types.ObjectId;
  notes?: string;
  isProcessed: boolean;
  isDeleted: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const returnOrderSchema = new Schema<IReturnOrder>({
  returnTransactionId: { type: String, required: true, trim: true },
  businessAccount: { type: Schema.Types.ObjectId, ref: 'BusinessAccount', required: true },
  returnDate: { type: Date, required: true },
  returnType: {
    type: String,
    enum: ['customer_return', 'rto_return'],
    default: 'customer_return',
  },
  status: {
    type: String,
    enum: ['return_initiated', 'parcel_received', 'inspection_pending', 'inspected', 'stock_updated'],
    default: 'inspection_pending',
  },
  originalOrder: { type: Schema.Types.ObjectId, ref: 'Order' },
  meeshoOrderId: { type: String, trim: true },
  carrierTrackingId: { type: String, trim: true },
  scannedQrCode: { type: String, trim: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  returnedQuantity: { type: Number, required: true, min: 1 },
  goodQuantity: { type: Number, default: 0, min: 0 },
  damagedQuantity: { type: Number, default: 0, min: 0 },
  pendingInspectionQuantity: { type: Number, default: 0, min: 0 },
  originalSellingPrice: { type: Number, required: true }, // paise
  returnAmount: { type: Number, required: true },         // paise
  returnReason: { type: String },
  damageReason: { type: String },
  damagePhotos: [{ type: String }],
  damageResolution: {
    type: String,
    enum: ['none', 'repaired', 'disposed', 'resale_approved'],
    default: 'none',
  },
  itemCondition: {
    type: String,
    enum: ['sellable', 'damaged', 'opened', 'pending_inspection'],
    default: 'pending_inspection',
  },
  stockDisposition: {
    type: String,
    enum: ['restock', 'discard', 'pending'],
    default: 'pending',
  },
  stockRestored: { type: Boolean, default: false },
  damagedStockRestored: { type: Boolean, default: false },
  receivedAt: { type: Date },
  receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  inspectedAt: { type: Date },
  inspectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  operator: { type: Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String },
  isProcessed: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

returnOrderSchema.index({ returnTransactionId: 1 }, { unique: true });
returnOrderSchema.index({ businessAccount: 1, returnDate: -1 });
returnOrderSchema.index({ businessAccount: 1, returnType: 1 });
returnOrderSchema.index({ businessAccount: 1, status: 1 });
returnOrderSchema.index({ product: 1 });
returnOrderSchema.index({ originalOrder: 1 });

export const ReturnOrder = mongoose.model<IReturnOrder>('ReturnOrder', returnOrderSchema);
