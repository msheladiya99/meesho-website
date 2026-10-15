import mongoose, { Document } from 'mongoose';
export type OrderStatus = 'pending' | 'dispatched' | 'delivered' | 'cancelled' | 'returned';
export interface IOrder extends Document {
    businessAccount: mongoose.Types.ObjectId;
    orderDate: Date;
    meeshoOrderId?: string;
    product: mongoose.Types.ObjectId;
    sku: string;
    sellingPrice: number;
    quantity: number;
    grossAmount: number;
    status: OrderStatus;
    notes?: string;
    isDeleted: boolean;
    deletedAt?: Date;
    createdBy: mongoose.Types.ObjectId;
}
export declare const Order: mongoose.Model<IOrder, {}, {}, {}, Document<unknown, {}, IOrder, {}, mongoose.DefaultSchemaOptions> & IOrder & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IOrder & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}>;
//# sourceMappingURL=Order.d.ts.map