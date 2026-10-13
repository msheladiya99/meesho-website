import mongoose, { Schema, Document } from 'mongoose';

export interface IStockPurchaseItem {
  product: mongoose.Types.ObjectId;
  quantityPurchased: number;
  purchasePricePerUnit: number; // paise
  totalAmount: number;           // paise
}

export interface IStockPurchase extends Document {
  businessAccount: mongoose.Types.ObjectId;
  purchaseDate: Date;
  vendor: mongoose.Types.ObjectId;
  vendorInvoiceNumber?: string;
  items: IStockPurchaseItem[];
  discount: number;             // paise
  additionalCosts: number;      // paise
  taxAmount: number;            // paise
  totalAmount: number;          // paise
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  notes?: string;
  isDeleted: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const stockPurchaseItemSchema = new Schema<IStockPurchaseItem>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  quantityPurchased: { type: Number, required: true, min: 1 },
  purchasePricePerUnit: { type: Number, required: true }, // paise
  totalAmount: { type: Number, required: true },           // paise
});

const stockPurchaseSchema = new Schema<IStockPurchase>({
  businessAccount: { type: Schema.Types.ObjectId, ref: 'BusinessAccount', required: true },
  purchaseDate: { type: Date, required: true },
  vendor: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true },
  vendorInvoiceNumber: { type: String, trim: true },
  items: { type: [stockPurchaseItemSchema], required: true, validate: {
    validator: (val: IStockPurchaseItem[]) => val.length > 0,
    message: 'At least one item is required'
  }},
  discount: { type: Number, default: 0 },
  additionalCosts: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },          // paise
  paymentStatus: { type: String, enum: ['paid', 'partial', 'unpaid'], default: 'paid' },
  notes: { type: String },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

stockPurchaseSchema.index({ businessAccount: 1, purchaseDate: -1 });
stockPurchaseSchema.index({ vendor: 1 });
stockPurchaseSchema.index({ 'items.product': 1 });

export const StockPurchase = mongoose.model<IStockPurchase>('StockPurchase', stockPurchaseSchema);
