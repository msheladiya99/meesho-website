import mongoose, { Schema, Document } from 'mongoose';

export interface IVendor extends Document {
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  notes?: string;
  isActive: boolean;
}

const vendorSchema = new Schema<IVendor>({
  name: { type: String, required: true, trim: true },
  company: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true },
  address: { type: String, trim: true },
  gstin: { type: String, trim: true, uppercase: true },
  notes: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export const Vendor = mongoose.model<IVendor>('Vendor', vendorSchema);
