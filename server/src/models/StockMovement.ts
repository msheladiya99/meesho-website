import mongoose, { Schema, Document } from 'mongoose';

export type MovementType = 'purchase' | 'sale' | 'return_in' | 'return_out' | 'adjustment' | 'opening';

export interface IStockMovement extends Document {
  businessAccount: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  movementType: MovementType;
  quantity: number;       // positive = stock IN, negative = stock OUT
  unitCost: number;       // paise (cost at time of movement)
  referenceType?: string; // 'Order' | 'ReturnOrder' | 'StockPurchase' | 'Manual'
  referenceId?: mongoose.Types.ObjectId;
  reason?: string;
  runningBalance: number; // stock qty after this movement
  createdBy?: mongoose.Types.ObjectId;
}

const stockMovementSchema = new Schema<IStockMovement>({
  businessAccount: { type: Schema.Types.ObjectId, ref: 'BusinessAccount', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  movementType: {
    type: String,
    enum: ['purchase', 'sale', 'return_in', 'return_out', 'adjustment', 'opening'],
    required: true,
  },
  quantity: { type: Number, required: true },
  unitCost: { type: Number, default: 0 }, // paise
  referenceType: { type: String },
  referenceId: { type: Schema.Types.ObjectId },
  reason: { type: String },
  runningBalance: { type: Number, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

stockMovementSchema.index({ businessAccount: 1, product: 1, createdAt: -1 });
stockMovementSchema.index({ referenceId: 1 });

export const StockMovement = mongoose.model<IStockMovement>('StockMovement', stockMovementSchema);
