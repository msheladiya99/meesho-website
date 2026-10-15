import mongoose, { Document } from 'mongoose';
export interface IPartner extends Document {
    name: string;
    email?: string;
    phone?: string;
    profitSharePercent: number;
    capitalContributed: number;
    isActive: boolean;
}
export declare const Partner: mongoose.Model<IPartner, {}, {}, {}, Document<unknown, {}, IPartner, {}, mongoose.DefaultSchemaOptions> & IPartner & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IPartner & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}>;
//# sourceMappingURL=Partner.d.ts.map