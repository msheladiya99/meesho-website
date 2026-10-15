import mongoose, { Document } from 'mongoose';
export type MovementType = 'purchase' | 'sale' | 'return_in' | 'return_out' | 'adjustment' | 'opening' | 'return_damaged' | 'damage_disposed' | 'damage_repaired' | 'damage_to_saleable';
export type StockBucket = 'saleable' | 'damaged' | 'pending';
export interface IStockMovement extends Document {
    transactionId: string;
    businessAccount: mongoose.Types.ObjectId;
    product: mongoose.Types.ObjectId;
    sku: string;
    stockBucket: StockBucket;
    movementType: MovementType;
    quantity: number;
    unitCost: number;
    referenceType?: string;
    referenceId?: mongoose.Types.ObjectId;
    reason?: string;
    previousStock: number;
    resultingStock: number;
    runningBalance: number;
    createdBy?: mongoose.Types.ObjectId;
}
export declare const StockMovement: mongoose.Model<IStockMovement, {}, {}, {}, Document<unknown, {}, IStockMovement, {}, mongoose.DefaultSchemaOptions> & IStockMovement & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IStockMovement & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}>;
//# sourceMappingURL=StockMovement.d.ts.map