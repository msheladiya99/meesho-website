import mongoose, { Document } from 'mongoose';
export interface IExpenseAllocation {
    partner: mongoose.Types.ObjectId;
    amount: number;
    percent: number;
}
export interface IExpense extends Document {
    businessAccount: mongoose.Types.ObjectId;
    expenseDate: Date;
    category: string;
    description: string;
    amount: number;
    paidBy: string;
    paidByPartner?: mongoose.Types.ObjectId;
    allocationMethod: string;
    allocations: IExpenseAllocation[];
    vendor?: string;
    paymentMethod?: string;
    notes?: string;
    isDeleted: boolean;
    createdBy: mongoose.Types.ObjectId;
}
export declare const Expense: mongoose.Model<IExpense, {}, {}, {}, Document<unknown, {}, IExpense, {}, mongoose.DefaultSchemaOptions> & IExpense & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IExpense & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}>;
//# sourceMappingURL=Expense.d.ts.map