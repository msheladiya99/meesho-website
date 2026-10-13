import mongoose, { Schema, Document } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  description?: string;
  isActive: boolean;
}

const categorySchema = new Schema<ICategory>({
  name: { type: String, required: true, trim: true, unique: true },
  description: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export const Category = mongoose.model<ICategory>('Category', categorySchema);
