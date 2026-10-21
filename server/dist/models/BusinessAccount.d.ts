import mongoose, { Document } from 'mongoose';
export interface IBusinessAccount extends Document {
    name: string;
    tradeName: string;
    gstin: string;
    address?: string;
    phone?: string;
    email?: string;
    isActive: boolean;
    /**
     * When false (default): This account only uses its own stock.
     * When true: This account can use stock from the accounts specified in sharedStockAccounts.
     */
    allowSharedStock: boolean;
    sharedStockAccounts: mongoose.Types.ObjectId[];
}
export declare const BusinessAccount: mongoose.Model<IBusinessAccount, {}, {}, {}, Document<unknown, {}, IBusinessAccount, {}, mongoose.DefaultSchemaOptions> & IBusinessAccount & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IBusinessAccount & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}>;
//# sourceMappingURL=BusinessAccount.d.ts.map