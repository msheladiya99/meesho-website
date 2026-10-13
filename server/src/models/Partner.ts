import mongoose, { Schema, Document } from 'mongoose';

export interface IPartner extends Document {
  name: string;
  email?: string;
  phone?: string;
  profitSharePercent: number;
  capitalContributed: number; // stored in paise
  isActive: boolean;
}

const partnerSchema = new Schema<IPartner>({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  profitSharePercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
  capitalContributed: { type: Number, default: 0 }, // paise
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export const Partner = mongoose.model<IPartner>('Partner', partnerSchema);
