import mongoose, { Schema, Document } from 'mongoose';

export interface IBusinessAccount extends Document {
  name: string;
  tradeName: string;
  gstin: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
}

const businessAccountSchema = new Schema<IBusinessAccount>({
  name: { type: String, required: true, trim: true },
  tradeName: { type: String, required: true, trim: true },
  gstin: { type: String, required: true, unique: true, uppercase: true, trim: true, minlength: 15, maxlength: 15 },
  address: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Note: gstin already has a unique index from schema definition

export const BusinessAccount = mongoose.model<IBusinessAccount>('BusinessAccount', businessAccountSchema);
