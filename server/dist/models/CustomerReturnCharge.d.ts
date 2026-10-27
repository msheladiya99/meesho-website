import mongoose, { Document } from 'mongoose';
export type ReturnChargeType = 'fixed_order' | 'fixed_unit' | 'percentage';
export type ReturnChargeStatus = 'applied' | 'reversed' | 'adjusted';
export interface ICustomerReturnCharge extends Document {
    transactionId: string;
    order: mongoose.Types.ObjectId;
    returnOrder?: mongoose.Types.ObjectId;
    businessAccount: mongoose.Types.ObjectId;
    product: mongoose.Types.ObjectId;
    sku: string;
    productName?: string;
    category?: mongoose.Types.ObjectId;
    orderDate: Date;
    returnDate: Date;
    returnedQuantity: number;
    originalOrderValue: number;
    chargeType: ReturnChargeType;
    appliedRate: number;
    baseCharge: number;
    handlingCharge: number;
    totalCharge: number;
    transactionType: 'customer_return_charge';
    status: ReturnChargeStatus;
    reversalReason?: string;
    settingsVersion: number;
    calculationTimestamp: Date;
    calculationDetails?: string;
    createdBy?: mongoose.Types.ObjectId;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const CustomerReturnCharge: mongoose.Model<ICustomerReturnCharge, {}, {}, {}, Document<unknown, {}, ICustomerReturnCharge, {}, mongoose.DefaultSchemaOptions> & ICustomerReturnCharge & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, ICustomerReturnCharge & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}>;
//# sourceMappingURL=CustomerReturnCharge.d.ts.map