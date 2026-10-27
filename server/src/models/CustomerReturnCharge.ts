import mongoose, { Schema, Document } from 'mongoose';

export type ReturnChargeType = 'fixed_order' | 'fixed_unit' | 'percentage';
export type ReturnChargeStatus = 'applied' | 'reversed' | 'adjusted';

export interface ICustomerReturnCharge extends Document {
  transactionId: string; // e.g. CRC-YYYYMMDD-XXXXX
  order: mongoose.Types.ObjectId;
  returnOrder?: mongoose.Types.ObjectId;
  businessAccount: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  sku: string;
  productName?: string;
  category?: mongoose.Types.ObjectId;
  orderDate: Date;
  returnDate: Date;
  returnedQuantity: number;
  originalOrderValue: number; // in paise
  chargeType: ReturnChargeType;
  appliedRate: number; // paise if fixed, percent number if percentage
  baseCharge: number; // in paise
  handlingCharge: number; // in paise
  totalCharge: number; // in paise
  transactionType: 'customer_return_charge';
  status: ReturnChargeStatus;
  reversalReason?: string;
  settingsVersion: number;
  calculationTimestamp: Date;
  calculationDetails?: string;
  createdBy?: mongoose.Types.ObjectId;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const customerReturnChargeSchema = new Schema<ICustomerReturnCharge>(
  {
    transactionId: { type: String, required: true, unique: true, index: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    returnOrder: { type: Schema.Types.ObjectId, ref: 'ReturnOrder', index: true },
    businessAccount: { type: Schema.Types.ObjectId, ref: 'BusinessAccount', required: true, index: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    sku: { type: String, required: true, trim: true },
    productName: { type: String, trim: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category' },
    orderDate: { type: Date, required: true },
    returnDate: { type: Date, required: true, index: true },
    returnedQuantity: { type: Number, required: true, min: 1 },
    originalOrderValue: { type: Number, required: true, min: 0 }, // in paise
    chargeType: {
      type: String,
      enum: ['fixed_order', 'fixed_unit', 'percentage'],
      required: true,
    },
    appliedRate: { type: Number, required: true, min: 0 },
    baseCharge: { type: Number, required: true, min: 0 }, // in paise
    handlingCharge: { type: Number, required: true, min: 0 }, // in paise
    totalCharge: { type: Number, required: true, min: 0 }, // in paise
    transactionType: {
      type: String,
      enum: ['customer_return_charge'],
      default: 'customer_return_charge',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['applied', 'reversed', 'adjusted'],
      default: 'applied',
      required: true,
      index: true,
    },
    reversalReason: { type: String, trim: true },
    settingsVersion: { type: Number, default: 1, required: true },
    calculationTimestamp: { type: Date, default: Date.now, required: true },
    calculationDetails: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Idempotency: For a single order, there can only be ONE active ('applied') customer_return_charge
customerReturnChargeSchema.index(
  { order: 1, transactionType: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'applied', isDeleted: false },
  }
);

customerReturnChargeSchema.index({ businessAccount: 1, returnDate: -1 });
customerReturnChargeSchema.index({ category: 1, returnDate: -1 });

export const CustomerReturnCharge = mongoose.model<ICustomerReturnCharge>(
  'CustomerReturnCharge',
  customerReturnChargeSchema
);
