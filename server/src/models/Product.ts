import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  sku: string;
  category: mongoose.Types.ObjectId;
  sizeml: number;
  fragranceType?: string;
  brand?: string;
  sellingPrice: number;       // paise
  defaultPurchaseCost: number; // paise
  boxCost: number;            // paise (default 200 = ₹2)
  stickerCost: number;        // paise (default 100 = ₹1, or 400 = ₹4 for perfume sticker)
  bagCardCost: number;        // paise (default 100 = ₹1 for 1 POP bag + review card)
  printLabelCost: number;     // paise (default 100 = ₹1 for order print label)
  packingCost: number;        // paise (sum of packaging costs)
  packingPreset?: string;     // 'standard' | 'special' | 'custom'
  reorderThreshold: number;
  currentStock: number;
  damagedStock: number;
  pendingInspectionStock: number;
  weightedAvgCost: number;    // paise — updated on each purchase
  isActive: boolean;
}

const productSchema = new Schema<IProduct>({
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, unique: true, trim: true, uppercase: true },
  category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  sizeml: { type: Number, required: true },
  fragranceType: { type: String, trim: true },
  brand: { type: String, trim: true },
  sellingPrice: { type: Number, required: true },       // paise
  defaultPurchaseCost: { type: Number, required: true }, // paise
  boxCost: { type: Number, default: 200, min: 0 },         // paise (₹2.00)
  stickerCost: { type: Number, default: 100, min: 0 },     // paise (₹1.00, or ₹4.00)
  bagCardCost: { type: Number, default: 100, min: 0 },     // paise (₹1.00 for POP bag + review card)
  printLabelCost: { type: Number, default: 100, min: 0 },  // paise (₹1.00 for order print label)
  packingCost: { type: Number, default: 500, min: 0 },     // paise (total packing charges)
  packingPreset: { type: String, default: 'standard', trim: true },
  reorderThreshold: { type: Number, default: 5 },
  currentStock: { type: Number, default: 0 },
  damagedStock: { type: Number, default: 0, min: 0 },
  pendingInspectionStock: { type: Number, default: 0, min: 0 },
  weightedAvgCost: { type: Number, default: 0 },        // paise
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

productSchema.pre('save', function () {
  const b = this.boxCost ?? 200;
  const s = this.stickerCost ?? 100;
  const bc = this.bagCardCost ?? 100;
  const pl = this.printLabelCost ?? 100;
  this.boxCost = b;
  this.stickerCost = s;
  this.bagCardCost = bc;
  this.printLabelCost = pl;
  this.packingCost = b + s + bc + pl;
});

// Note: sku already has a unique index from schema definition
productSchema.index({ category: 1 });

export const Product = mongoose.model<IProduct>('Product', productSchema);
