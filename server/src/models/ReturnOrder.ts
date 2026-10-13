import mongoose, { Schema, Document } from 'mongoose';

export type ItemCondition = 'sellable' | 'damaged' | 'opened' | 'pending_inspection';
export type StockDisposition = 'restock' | 'discard' | 'pending';

export interface IReturnOrder extends Document {
  businessAccount: mongoose.Types.ObjectId;
  returnDate: Date;
  originalOrder?: mongoose.Types.ObjectId;
  meeshoOrderId?: string;
  product: mongoose.Types.ObjectId;
  returnedQuantity: number;
  originalSellingPrice: number; // paise
  returnAmount: number;         // paise
  returnReason?: string;
  itemCondition: ItemCondition;
  stockDisposition: StockDisposition;
  stockRestored: boolean;       // has stock actually been added back?
  notes?: string;
  isProcessed: boolean;
  isDeleted: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const returnOrderSchema = new Schema<IReturnOrder>({
  businessAccount: { type: Schema.Types.ObjectId, ref: 'BusinessAccount', required: true },
  returnDate: { type: Date, required: true },
  originalOrder: { type: Schema.Types.ObjectId, ref: 'Order' },
  meeshoOrderId: { type: String, trim: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  returnedQuantity: { type: Number, required: true, min: 1 },
  originalSellingPrice: { type: Number, required: true }, // paise
  returnAmount: { type: Number, required: true },         // paise
  returnReason: { type: String },
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
  notes: { type: String },
  isProcessed: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

returnOrderSchema.index({ businessAccount: 1, returnDate: -1 });
returnOrderSchema.index({ product: 1 });
returnOrderSchema.index({ originalOrder: 1 });

export const ReturnOrder = mongoose.model<IReturnOrder>('ReturnOrder', returnOrderSchema);
