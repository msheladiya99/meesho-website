import mongoose, { Schema, Document } from 'mongoose';

export type PaymentStatus = 'completed' | 'upcoming' | 'unscheduled';

export type ReconciliationMatchStatus =
  | 'matched'
  | 'unmatched_order'
  | 'underpaid'
  | 'wrongful_return_deduction';

export interface IPaymentOrderRef {
  subOrderId: string;
  orderId?: mongoose.Types.ObjectId;
  saleAmount?: number; // paise
  returnAmount?: number; // paise
  shippingOrWeightDeduction?: number; // paise
  netAmount?: number; // paise
  matchStatus?: ReconciliationMatchStatus;
  weightDiscrepancy?: boolean;
  discrepancyReason?: string;
  expectedReceivable?: number; // paise
}

export interface IPayment extends Document {
  businessAccount: mongoose.Types.ObjectId;
  paymentDate: Date;
  status: PaymentStatus;
  neftId?: string; // e.g. AXISCN1536203342
  bankName?: string;
  bankAccountNumber?: string;

  // Breakdown amounts (all stored in paise)
  ordersAmount: number;        // Gross sales and returns
  salesAmount?: number;       // Gross sales
  returnsDeduction?: number;  // Returns subtracted

  // Net platform recovery
  adsCost: number;            // Ads cost recovery
  programCost: number;        // Program cost
  otherRecovery: number;      // Other deductions

  // Net platform compensation
  programBenefits: number;    // Program benefits
  referralEarnings: number;   // Referral earnings
  otherCompensation: number;  // Other additions

  netAmount: number;          // Final credited amount

  ordersCount?: number;
  subOrderIds?: string[];
  orderRefs?: IPaymentOrderRef[];

  notes?: string;
  rawSource: 'manual' | 'sheet_import' | 'auto_calculated';
  isDeleted: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const paymentOrderRefSchema = new Schema<IPaymentOrderRef>(
  {
    subOrderId: { type: String, required: true, trim: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    saleAmount: { type: Number, default: 0 },
    returnAmount: { type: Number, default: 0 },
    shippingOrWeightDeduction: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    matchStatus: {
      type: String,
      enum: ['matched', 'unmatched_order', 'underpaid', 'wrongful_return_deduction'],
      default: 'matched',
    },
    weightDiscrepancy: { type: Boolean, default: false },
    discrepancyReason: { type: String },
    expectedReceivable: { type: Number, default: 0 },
  },
  { _id: false }
);

const paymentSchema = new Schema<IPayment>(
  {
    businessAccount: {
      type: Schema.Types.ObjectId,
      ref: 'BusinessAccount',
      required: true,
      index: true,
    },
    paymentDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['completed', 'upcoming', 'unscheduled'],
      default: 'completed',
      index: true,
    },
    neftId: { type: String, trim: true },
    bankName: { type: String, trim: true, default: 'Axis Bank' },
    bankAccountNumber: { type: String, trim: true },

    // Amounts in paise
    ordersAmount: { type: Number, required: true, default: 0 },
    salesAmount: { type: Number, default: 0 },
    returnsDeduction: { type: Number, default: 0 },

    adsCost: { type: Number, default: 0 },
    programCost: { type: Number, default: 0 },
    otherRecovery: { type: Number, default: 0 },

    programBenefits: { type: Number, default: 0 },
    referralEarnings: { type: Number, default: 0 },
    otherCompensation: { type: Number, default: 0 },

    netAmount: { type: Number, required: true, default: 0 },

    ordersCount: { type: Number, default: 0 },
    subOrderIds: [{ type: String, trim: true }],
    orderRefs: [paymentOrderRefSchema],

    notes: { type: String, trim: true },
    rawSource: {
      type: String,
      enum: ['manual', 'sheet_import', 'auto_calculated'],
      default: 'manual',
    },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

paymentSchema.index({ businessAccount: 1, paymentDate: -1 });
paymentSchema.index({ businessAccount: 1, status: 1, paymentDate: -1 });
paymentSchema.index(
  { businessAccount: 1, neftId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      neftId: { $type: 'string', $gt: '' },
      isDeleted: false,
    },
  }
);

export const Payment = mongoose.model<IPayment>('Payment', paymentSchema);
