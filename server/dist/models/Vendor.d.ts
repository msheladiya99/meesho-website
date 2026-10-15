import mongoose, { Document } from 'mongoose';
export interface IVendor extends Document {
    name: string;
    company?: string;
    phone?: string;
    email?: string;
    address?: string;
    gstin?: string;
    notes?: string;
    isActive: boolean;
}
export declare const Vendor: mongoose.Model<IVendor, {}, {}, {}, Document<unknown, {}, IVendor, {}, mongoose.DefaultSchemaOptions> & IVendor & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IVendor & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}>;
//# sourceMappingURL=Vendor.d.ts.map