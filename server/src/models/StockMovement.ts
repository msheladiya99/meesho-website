import mongoose, { Schema, Document } from 'mongoose';

export type MovementType =
  | 'purchase'
  | 'sale'
  | 'return_in'
  | 'return_out'
  | 'adjustment'
  | 'opening'
  | 'return_damaged'
  | 'damage_disposed'
  | 'damage_repaired'
  | 'damage_to_saleable';

export type StockBucket = 'saleable' | 'damaged' | 'pending';

export interface IStockMovement extends Document {
  transactionId: string;
  businessAccount: mongoose.Types.ObjectId;
  product?: mongoose.Types.ObjectId;
  sku?: string;
  stockBucket: StockBucket;
  movementType: MovementType;
  quantity: number;       // positive = stock IN, negative = stock OUT
  unitCost: number;       // paise (cost at time of movement)
  referenceType?: string; // 'Order' | 'ReturnOrder' | 'StockPurchase' | 'Manual'
  referenceId?: mongoose.Types.ObjectId;
  reason?: string;
  previousStock: number;
  resultingStock: number;
  runningBalance: number; // for backward compatibility, same as resultingStock
  createdBy?: mongoose.Types.ObjectId;
}

const stockMovementSchema = new Schema<IStockMovement>({
  transactionId: { type: String, required: true, trim: true },
  businessAccount: { type: Schema.Types.ObjectId, ref: 'BusinessAccount', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: false },
  sku: { type: String, required: false, uppercase: true },
  stockBucket: {
    type: String,
    enum: ['saleable', 'damaged', 'pending'],
    default: 'saleable',
  },
  movementType: {
    type: String,
    enum: [
      'purchase',
      'sale',
      'return_in',
      'return_out',
      'adjustment',
      'opening',
      'return_damaged',
      'damage_disposed',
      'damage_repaired',
      'damage_to_saleable',
    ],
    required: true,
  },
  quantity: { type: Number, required: true },
  unitCost: { type: Number, default: 0 }, // paise
  referenceType: { type: String },
  referenceId: { type: Schema.Types.ObjectId },
  reason: { type: String },
  previousStock: { type: Number, required: true, default: 0 },
  resultingStock: { type: Number, required: true },
  runningBalance: { type: Number, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

stockMovementSchema.index({ transactionId: 1 }, { unique: true });
stockMovementSchema.index({ businessAccount: 1, product: 1, createdAt: -1 });
stockMovementSchema.index({ businessAccount: 1, movementType: 1 });
stockMovementSchema.index({ referenceId: 1 });

export const StockMovement = mongoose.model<IStockMovement>('StockMovement', stockMovementSchema);
