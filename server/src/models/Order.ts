import mongoose, { Schema, Document } from 'mongoose';

export type OrderStatus = 'pending' | 'dispatched' | 'delivered' | 'cancelled' | 'returned';

export interface IOrder extends Document {
  businessAccount: mongoose.Types.ObjectId;
  orderDate: Date;
  meeshoOrderId?: string;
  product: mongoose.Types.ObjectId;
  sku: string;
  sellingPrice: number;  // paise
  quantity: number;
  grossAmount: number;   // paise = sellingPrice × quantity
  status: OrderStatus;
  notes?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
}

const orderSchema = new Schema<IOrder>({
  businessAccount: { type: Schema.Types.ObjectId, ref: 'BusinessAccount', required: true },
  orderDate: { type: Date, required: true },
  meeshoOrderId: { type: String, trim: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  sku: { type: String, required: true, uppercase: true },
  sellingPrice: { type: Number, required: true }, // paise
  quantity: { type: Number, required: true, min: 1 },
  grossAmount: { type: Number, required: true },  // paise
  status: { type: String, enum: ['pending', 'dispatched', 'delivered', 'cancelled', 'returned'], default: 'pending' },
  notes: { type: String },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Prevent duplicate Meesho order IDs within the same business account
orderSchema.index({ businessAccount: 1, meeshoOrderId: 1 }, {
  unique: true,
  partialFilterExpression: { meeshoOrderId: { $exists: true, $ne: null }, isDeleted: false },
});
orderSchema.index({ businessAccount: 1, orderDate: -1 });
orderSchema.index({ product: 1 });
orderSchema.index({ isDeleted: 1 });

export const Order = mongoose.model<IOrder>('Order', orderSchema);
