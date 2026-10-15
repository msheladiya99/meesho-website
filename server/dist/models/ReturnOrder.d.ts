import mongoose, { Document } from 'mongoose';
export type ItemCondition = 'sellable' | 'damaged' | 'opened' | 'pending_inspection';
export type StockDisposition = 'restock' | 'discard' | 'pending';
export interface IReturnOrder extends Document {
    businessAccount: mongoose.Types.ObjectId;
    returnDate: Date;
    originalOrder?: mongoose.Types.ObjectId;
    meeshoOrderId?: string;
    product: mongoose.Types.ObjectId;
    returnedQuantity: number;
    originalSellingPrice: number;
    returnAmount: number;
    returnReason?: string;
    itemCondition: ItemCondition;
    stockDisposition: StockDisposition;
    stockRestored: boolean;
    notes?: string;
    isProcessed: boolean;
    isDeleted: boolean;
    createdBy: mongoose.Types.ObjectId;
}
export declare const ReturnOrder: mongoose.Model<IReturnOrder, {}, {}, {}, Document<unknown, {}, IReturnOrder, {}, mongoose.DefaultSchemaOptions> & IReturnOrder & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IReturnOrder & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}>;
//# sourceMappingURL=ReturnOrder.d.ts.map