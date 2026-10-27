import mongoose, { Document } from 'mongoose';
export type ChargeCalculationType = 'fixed_order' | 'fixed_unit' | 'percentage';
export type HandlingCalculationType = 'fixed_order' | 'fixed_unit';
export interface ICustomerReturnChargeSettings extends Document {
    isEnabled: boolean;
    calculationType: ChargeCalculationType;
    chargeAmount: number;
    percentageRate: number;
    hasHandlingCharge: boolean;
    handlingCalculationType: HandlingCalculationType;
    handlingChargeAmount: number;
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
export declare const CustomerReturnChargeSettings: mongoose.Model<ICustomerReturnChargeSettings, {}, {}, {}, Document<unknown, {}, ICustomerReturnChargeSettings, {}, mongoose.DefaultSchemaOptions> & ICustomerReturnChargeSettings & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, ICustomerReturnChargeSettings & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}>;
//# sourceMappingURL=CustomerReturnChargeSettings.d.ts.map