import mongoose, { Document } from 'mongoose';
export interface IBusinessAccount extends Document {
    name: string;
    tradeName: string;
    gstin: string;
    address?: string;
    phone?: string;
    email?: string;
    isActive: boolean;
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