import mongoose, { Schema, Document } from 'mongoose';

export interface IStockPurchaseItem {
  product?: mongoose.Types.ObjectId;
  quantityPurchased: number;
  purchasePricePerUnit: number; // paise
  totalAmount: number;           // paise
}

export type PaymentMode = 'upi' | 'bank_transfer' | 'cash' | 'cheque' | 'partner_out_of_pocket' | 'other';

export interface IStockPurchasePayment {
  _id?: mongoose.Types.ObjectId;
  amount: number;             // paise
  paymentDate: Date;
  paidBy: 'business' | 'partner';
  paymentMode: PaymentMode;
  paidByPartner?: mongoose.Types.ObjectId;
  referenceNumber?: string;   // UTR / Transaction ID / Cheque #
  notes?: string;
  recordedBy?: mongoose.Types.ObjectId;
  linkedExpenseId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface IStockPurchase extends Document {
  businessAccount: mongoose.Types.ObjectId;
  purchaseDate: Date;
  vendor: mongoose.Types.ObjectId;
  vendorInvoiceNumber?: string;
  totalQuantity: number;
  purchasePricePerUnit: number; // paise
  items?: IStockPurchaseItem[];
  discount: number;             // paise
  additionalCosts: number;      // paise
  taxAmount: number;            // paise
  totalAmount: number;          // paise
  paidAmount: number;           // paise
  dueAmount: number;            // paise
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  payments?: IStockPurchasePayment[];
  notes?: string;
  isDeleted: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const stockPurchasePaymentSchema = new Schema<IStockPurchasePayment>({
  amount: { type: Number, required: true, min: 1 },
  paymentDate: { type: Date, default: Date.now },
  paidBy: { type: String, enum: ['business', 'partner'], default: 'business' },
  paymentMode: {
    type: String,
    enum: ['upi', 'bank_transfer', 'cash', 'cheque', 'partner_out_of_pocket', 'other'],
    default: 'upi'
  },
  paidByPartner: { type: Schema.Types.ObjectId, ref: 'Partner' },
  referenceNumber: { type: String, trim: true },
  notes: { type: String, trim: true },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  linkedExpenseId: { type: Schema.Types.ObjectId, ref: 'Expense' },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const stockPurchaseItemSchema = new Schema<IStockPurchaseItem>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: false },
  quantityPurchased: { type: Number, required: true, min: 1 },
  purchasePricePerUnit: { type: Number, required: true }, // paise
  totalAmount: { type: Number, required: true },           // paise
}, { _id: false });

const stockPurchaseSchema = new Schema<IStockPurchase>({
  businessAccount: { type: Schema.Types.ObjectId, ref: 'BusinessAccount', required: true },
  purchaseDate: { type: Date, required: true },
  vendor: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true },
  vendorInvoiceNumber: { type: String, trim: true },
  totalQuantity: { type: Number, default: 0, min: 0 },
  purchasePricePerUnit: { type: Number, default: 0 }, // paise
  items: { type: [stockPurchaseItemSchema], default: [] },
  discount: { type: Number, default: 0 },
  additionalCosts: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },          // paise
  paidAmount: { type: Number, default: 0, min: 0 },       // paise
  dueAmount: { type: Number, default: 0, min: 0 },        // paise
  paymentStatus: { type: String, enum: ['paid', 'partial', 'unpaid'], default: 'unpaid' },
  payments: { type: [stockPurchasePaymentSchema], default: [] },
  notes: { type: String },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

stockPurchaseSchema.pre('save', function () {
  if (Array.isArray(this.payments) && this.payments.length > 0) {
    this.paidAmount = this.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  }
  this.dueAmount = Math.max(0, (this.totalAmount || 0) - (this.paidAmount || 0));
  if ((this.paidAmount || 0) <= 0) {
    this.paymentStatus = 'unpaid';
  } else if ((this.paidAmount || 0) >= (this.totalAmount || 0)) {
    this.paymentStatus = 'paid';
    this.dueAmount = 0;
  } else {
    this.paymentStatus = 'partial';
  }
});

stockPurchaseSchema.index({ businessAccount: 1, purchaseDate: -1 });
stockPurchaseSchema.index({ vendor: 1 });
stockPurchaseSchema.index({ 'items.product': 1 });

// No pre-save hooks - stock movements are recorded explicitly in the route

export const StockPurchase = mongoose.model<IStockPurchase>('StockPurchase', stockPurchaseSchema);
