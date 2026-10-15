import mongoose, { Document } from 'mongoose';
export type ScanType = 'internal_qr' | 'carrier_label' | 'meesho_order_id' | 'order_id' | 'manual';
export interface IPackingRecord extends Document {
    transactionId: string;
    businessAccount: mongoose.Types.ObjectId;
    order: mongoose.Types.ObjectId;
    product: mongoose.Types.ObjectId;
    sku: string;
    packedQuantity: number;
    scannedCode: string;
    scanType: ScanType;
    operator: mongoose.Types.ObjectId;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const PackingRecord: mongoose.Model<IPackingRecord, {}, {}, {}, Document<unknown, {}, IPackingRecord, {}, mongoose.DefaultSchemaOptions> & IPackingRecord & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IPackingRecord & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}>;
//# sourceMappingURL=PackingRecord.d.ts.map