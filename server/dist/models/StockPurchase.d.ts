import mongoose, { Document } from 'mongoose';
export interface IStockPurchaseItem {
    product?: mongoose.Types.ObjectId;
    quantityPurchased: number;
    purchasePricePerUnit: number;
    totalAmount: number;
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
    paymentStatus: 'paid' | 'partial' | 'unpaid';
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