import mongoose, { Schema, Document } from 'mongoose';

export type OrderStatus =
  | 'pending'
  | 'packed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'rto_in_transit'
  | 'rto_received';

export interface IOrder extends Document {
  businessAccount: mongoose.Types.ObjectId;
  orderDate: Date;
  meeshoOrderId?: string;
  subOrderId?: string;      // Meesho Sub Order ID (alternative when shipping label not available)
  shippingLabelId?: string; // Carrier AWB or barcode identifier from label
  carrierName?: string;     // e.g. Shadowfax, Delhivery, Xpressbees, Ecom Express
  internalQrCode?: string;  // Unique internal QR code e.g. PKG-ORD-...
  product: mongoose.Types.ObjectId;
  sku: string;
  sellingPrice: number;     // paise
  quantity: number;
  packedQuantity: number;
  grossAmount: number;      // paise = sellingPrice × quantity
  status: OrderStatus;
  stockDeducted: boolean;
  packedAt?: Date;
  packedBy?: mongoose.Types.ObjectId;
  dispatchedAt?: Date;
  dispatchedBy?: mongoose.Types.ObjectId;
  notes?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
}

const orderSchema = new Schema<IOrder>({
  businessAccount: { type: Schema.Types.ObjectId, ref: 'BusinessAccount', required: true },
  orderDate: { type: Date, required: true },
  meeshoOrderId: { type: String, trim: true },
  subOrderId: { type: String, trim: true },
  shippingLabelId: { type: String, trim: true },
  carrierName: { type: String, trim: true },
  internalQrCode: { type: String, trim: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  sku: { type: String, required: true, uppercase: true },
  sellingPrice: { type: Number, required: true }, // paise
  quantity: { type: Number, required: true, min: 1 },
  packedQuantity: { type: Number, default: 0, min: 0 },
  grossAmount: { type: Number, required: true },  // paise
  status: {
    type: String,
    enum: [
      'pending',
      'packed',
      'dispatched',
      'delivered',
      'cancelled',
      'returned',
      'rto_in_transit',
      'rto_received',
    ],
    default: 'pending',
  },
  stockDeducted: { type: Boolean, default: true },
  packedAt: { type: Date },
  packedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  dispatchedAt: { type: Date },
  dispatchedBy: { type: Schema.Types.ObjectId, ref: 'User' },
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

// Index for shipping label and internal QR lookup
orderSchema.index({ businessAccount: 1, shippingLabelId: 1 }, {
  unique: true,
  partialFilterExpression: { shippingLabelId: { $exists: true, $ne: null }, isDeleted: false },
});
// Index for Sub Order ID lookup (used when shipping label is unavailable)
orderSchema.index({ businessAccount: 1, subOrderId: 1 }, {
  unique: true,
  partialFilterExpression: { subOrderId: { $exists: true, $ne: null }, isDeleted: false },
});
orderSchema.index({ internalQrCode: 1 }, {
  unique: true,
  partialFilterExpression: { internalQrCode: { $exists: true, $ne: null } },
});

orderSchema.index({ businessAccount: 1, orderDate: -1 });
orderSchema.index({ businessAccount: 1, status: 1 });
orderSchema.index({ product: 1 });
orderSchema.index({ isDeleted: 1 });

export const Order = mongoose.model<IOrder>('Order', orderSchema);
