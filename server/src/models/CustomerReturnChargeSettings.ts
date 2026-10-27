import mongoose, { Schema, Document } from 'mongoose';

export type ChargeCalculationType = 'fixed_order' | 'fixed_unit' | 'percentage';
export type HandlingCalculationType = 'fixed_order' | 'fixed_unit';

export interface ICustomerReturnChargeSettings extends Document {
  isEnabled: boolean;
  calculationType: ChargeCalculationType;
  chargeAmount: number; // in paise (e.g. 6000 for ₹60)
  percentageRate: number; // e.g. 5 for 5%
  hasHandlingCharge: boolean;
  handlingCalculationType: HandlingCalculationType;
  handlingChargeAmount: number; // in paise (e.g. 1000 for ₹10)
  effectiveFrom: Date;
  businessAccountScope: 'all' | 'selected';
  applicableAccounts: mongoose.Types.ObjectId[];
  categoryScope: 'all' | 'selected';
  applicableCategories: mongoose.Types.ObjectId[];
  settingsVersion: number;
  notes?: string;
  isDeleted: boolean;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const customerReturnChargeSettingsSchema = new Schema<ICustomerReturnChargeSettings>(
  {
    isEnabled: { type: Boolean, default: true, required: true },
    calculationType: {
      type: String,
      enum: ['fixed_order', 'fixed_unit', 'percentage'],
      default: 'fixed_order',
      required: true,
    },
    chargeAmount: { type: Number, default: 0, min: 0 }, // in paise
    percentageRate: { type: Number, default: 0, min: 0, max: 100 },
    hasHandlingCharge: { type: Boolean, default: false },
    handlingCalculationType: {
      type: String,
      enum: ['fixed_order', 'fixed_unit'],
      default: 'fixed_order',
    },
    handlingChargeAmount: { type: Number, default: 0, min: 0 }, // in paise
    effectiveFrom: { type: Date, default: Date.now, required: true },
    businessAccountScope: {
      type: String,
      enum: ['all', 'selected'],
      default: 'all',
      required: true,
    },
    applicableAccounts: [{ type: Schema.Types.ObjectId, ref: 'BusinessAccount' }],
    categoryScope: {
      type: String,
      enum: ['all', 'selected'],
      default: 'all',
      required: true,
    },
    applicableCategories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    settingsVersion: { type: Number, default: 1, required: true },
    notes: { type: String, trim: true },
    isDeleted: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

customerReturnChargeSettingsSchema.index({ businessAccountScope: 1, isDeleted: 1, effectiveFrom: -1 });

export const CustomerReturnChargeSettings = mongoose.model<ICustomerReturnChargeSettings>(
  'CustomerReturnChargeSettings',
  customerReturnChargeSettingsSchema
);
