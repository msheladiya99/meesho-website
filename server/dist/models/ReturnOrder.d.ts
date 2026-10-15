import mongoose, { Document } from 'mongoose';
export type ItemCondition = 'sellable' | 'damaged' | 'opened' | 'pending_inspection';
export type StockDisposition = 'restock' | 'discard' | 'pending';
export type ReturnType = 'customer_return' | 'rto_return';
export type ReturnStatus = 'return_initiated' | 'parcel_received' | 'inspection_pending' | 'inspected' | 'stock_updated';
export type DamageResolution = 'none' | 'repaired' | 'disposed' | 'resale_approved';
export interface IReturnOrder extends Document {
    returnTransactionId: string;
    businessAccount: mongoose.Types.ObjectId;
    returnDate: Date;
    returnType: ReturnType;
    status: ReturnStatus;
    originalOrder?: mongoose.Types.ObjectId;
    meeshoOrderId?: string;
    carrierTrackingId?: string;
    scannedQrCode?: string;
    product: mongoose.Types.ObjectId;
    returnedQuantity: number;
    goodQuantity: number;
    damagedQuantity: number;
    pendingInspectionQuantity: number;
    originalSellingPrice: number;
    returnAmount: number;
    returnReason?: string;
    damageReason?: string;
    damagePhotos: string[];
    damageResolution: DamageResolution;
    itemCondition: ItemCondition;
    stockDisposition: StockDisposition;
    stockRestored: boolean;
    damagedStockRestored: boolean;
    receivedAt?: Date;
    receivedBy?: mongoose.Types.ObjectId;
    inspectedAt?: Date;
    inspectedBy?: mongoose.Types.ObjectId;
    operator?: mongoose.Types.ObjectId;
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