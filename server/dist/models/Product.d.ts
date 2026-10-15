import mongoose, { Document } from 'mongoose';
export interface IProduct extends Document {
    name: string;
    sku: string;
    category: mongoose.Types.ObjectId;
    sizeml: number;
    fragranceType?: string;
    brand?: string;
    sellingPrice: number;
    defaultPurchaseCost: number;
    reorderThreshold: number;
    currentStock: number;
    damagedStock: number;
    pendingInspectionStock: number;
    weightedAvgCost: number;
    isActive: boolean;
}
export declare const Product: mongoose.Model<IProduct, {}, {}, {}, Document<unknown, {}, IProduct, {}, mongoose.DefaultSchemaOptions> & IProduct & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IProduct & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}>;
//# sourceMappingURL=Product.d.ts.map