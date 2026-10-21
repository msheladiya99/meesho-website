import mongoose, { Document } from 'mongoose';
export type OrderStatus = 'pending' | 'packed' | 'dispatched' | 'delivered' | 'cancelled' | 'returned' | 'rto_in_transit' | 'rto_received';
export interface IOrderItem {
    product: mongoose.Types.ObjectId;
    sku: string;
    quantity: number;
    sellingPrice?: number;
}
export interface IOrder extends Document {
    businessAccount: mongoose.Types.ObjectId;
    orderDate: Date;
    meeshoOrderId?: string;
    subOrderId?: string;
    shippingLabelId?: string;
    carrierName?: string;
    internalQrCode?: string;
    product: mongoose.Types.ObjectId;
    sku: string;
    items?: IOrderItem[];
    isCombo?: boolean;
    sellingPrice: number;
    quantity: number;
    packedQuantity: number;
    grossAmount: number;
    status: OrderStatus;
    stockDeducted: boolean;
    packedAt?: Date;
    packedBy?: mongoose.Types.ObjectId;
    dispatchedAt?: Date;
    dispatchedBy?: mongoose.Types.ObjectId;
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