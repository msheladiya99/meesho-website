import mongoose, { Document } from 'mongoose';
export interface IStockPurchaseItem {
    product?: mongoose.Types.ObjectId;
    quantityPurchased: number;
    purchasePricePerUnit: number;
    totalAmount: number;
}
export type PaymentMode = 'upi' | 'bank_transfer' | 'cash' | 'cheque' | 'partner_out_of_pocket' | 'other';
export interface IStockPurchasePayment {
    _id?: mongoose.Types.ObjectId;
    amount: number;
    paymentDate: Date;
    paymentMode: PaymentMode;
    paidByPartner?: mongoose.Types.ObjectId;
    referenceNumber?: string;
    notes?: string;
    recordedBy?: mongoose.Types.ObjectId;
    linkedExpenseId?: mongoose.Types.ObjectId;
    createdAt: Date;
}
export interface IStockPurchase extends Document {
    businessAccount: mongoose.Types.ObjectId;
    purchaseDate: Date;
    vendor: mongoose.Types.ObjectId;
    vendorInvoiceNumber?: string;
    totalQuantity: number;
    purchasePricePerUnit: number;
    items?: IStockPurchaseItem[];
    discount: number;
    additionalCosts: number;
    taxAmount: number;
    totalAmount: number;
    paidAmount: number;
    dueAmount: number;
    paymentStatus: 'paid' | 'partial' | 'unpaid';
    payments?: IStockPurchasePayment[];
    notes?: string;
    isDeleted: boolean;
    createdBy: mongoose.Types.ObjectId;
}
export declare const StockPurchase: mongoose.Model<IStockPurchase, {}, {}, {}, Document<unknown, {}, IStockPurchase, {}, mongoose.DefaultSchemaOptions> & IStockPurchase & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IStockPurchase & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}>;
//# sourceMappingURL=StockPurchase.d.ts.map