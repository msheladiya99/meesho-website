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
  reorderThreshold: { type: Number, default: 5 },
  currentStock: { type: Number, default: 0 },
  damagedStock: { type: Number, default: 0, min: 0 },
  pendingInspectionStock: { type: Number, default: 0, min: 0 },
  weightedAvgCost: { type: Number, default: 0 },        // paise
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Note: sku already has a unique index from schema definition
productSchema.index({ category: 1 });

export const Product = mongoose.model<IProduct>('Product', productSchema);
