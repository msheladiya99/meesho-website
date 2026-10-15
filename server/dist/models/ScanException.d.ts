import mongoose, { Document } from 'mongoose';
export type ExceptionType = 'order_not_found' | 'already_packed' | 'already_returned' | 'qty_exceeded' | 'wrong_account' | 'invalid_format' | 'system_error';
export interface IScanException extends Document {
    businessAccount?: mongoose.Types.ObjectId;
    scannedCode: string;
    module: 'packing' | 'return';
    exceptionType: ExceptionType;
    attemptedAction: string;
    operator?: mongoose.Types.ObjectId;
    details?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ScanException: mongoose.Model<IScanException, {}, {}, {}, Document<unknown, {}, IScanException, {}, mongoose.DefaultSchemaOptions> & IScanException & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IScanException & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}>;
//# sourceMappingURL=ScanException.d.ts.map