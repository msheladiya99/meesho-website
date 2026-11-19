import mongoose, { Document } from 'mongoose';
export type PaymentStatus = 'completed' | 'upcoming' | 'unscheduled';
export type ReconciliationMatchStatus = 'matched' | 'unmatched_order' | 'underpaid' | 'wrongful_return_deduction';
export interface IPaymentOrderRef {
    subOrderId: string;
    orderId?: mongoose.Types.ObjectId;
    saleAmount?: number;
    returnAmount?: number;
    shippingOrWeightDeduction?: number;
    netAmount?: number;
    matchStatus?: ReconciliationMatchStatus;
    weightDiscrepancy?: boolean;
    discrepancyReason?: string;
    expectedReceivable?: number;
}
export interface IPayment extends Document {
    businessAccount: mongoose.Types.ObjectId;
    paymentDate: Date;
    status: PaymentStatus;
    neftId?: string;
    bankName?: string;
    bankAccountNumber?: string;
    ordersAmount: number;
    salesAmount?: number;
    returnsDeduction?: number;
    adsCost: number;
    programCost: number;
    otherRecovery: number;
    programBenefits: number;
    referralEarnings: number;
    otherCompensation: number;
    netAmount: number;
    ordersCount?: number;
    subOrderIds?: string[];
    orderRefs?: IPaymentOrderRef[];
    notes?: string;
    rawSource: 'manual' | 'sheet_import' | 'auto_calculated';
    isDeleted: boolean;
    createdBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Payment: mongoose.Model<IPayment, {}, {}, {}, Document<unknown, {}, IPayment, {}, mongoose.DefaultSchemaOptions> & IPayment & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IPayment & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}>;
//# sourceMappingURL=Payment.d.ts.map