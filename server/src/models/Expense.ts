import mongoose, { Schema, Document } from 'mongoose';

export interface IExpenseAllocation {
  partner: mongoose.Types.ObjectId;
  amount: number;  // paise
  percent: number;
}

export interface IExpense extends Document {
  businessAccount: mongoose.Types.ObjectId;
  expenseDate: Date;
  category: string;
  description: string;
  amount: number; // paise
  paidBy: 'partner1' | 'partner2' | 'partner3' | 'business';
  paidByPartner?: mongoose.Types.ObjectId;
  allocationMethod: 'equal' | 'custom';
  allocations: IExpenseAllocation[];
  vendor?: string;
  paymentMethod?: string;
  notes?: string;
  isDeleted: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const expenseSchema = new Schema<IExpense>({
  businessAccount: { type: Schema.Types.ObjectId, ref: 'BusinessAccount', required: true },
  expenseDate: { type: Date, required: true },
  category: { type: String, required: true },
  description: { type: String, required: true, trim: true },
  amount: { type: Number, required: true }, // paise
  paidBy: { type: String, enum: ['partner1', 'partner2', 'partner3', 'business'], required: true },
  paidByPartner: { type: Schema.Types.ObjectId, ref: 'Partner' },
  allocationMethod: { type: String, enum: ['equal', 'custom'], default: 'equal' },
  allocations: [{
    partner: { type: Schema.Types.ObjectId, ref: 'Partner' },
    amount: { type: Number },  // paise
    percent: { type: Number },
  }],
  vendor: { type: String, trim: true },
  paymentMethod: { type: String, trim: true },
  notes: { type: String },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

expenseSchema.index({ businessAccount: 1, expenseDate: -1 });
expenseSchema.index({ category: 1 });

export const Expense = mongoose.model<IExpense>('Expense', expenseSchema);
