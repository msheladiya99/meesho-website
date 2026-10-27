import mongoose from 'mongoose';
import { ICustomerReturnChargeSettings } from '../models/CustomerReturnChargeSettings';
import { ICustomerReturnCharge } from '../models/CustomerReturnCharge';
export declare const generateChargeTransactionId: () => string;
/**
 * Find the active settings for a given GST account, category, and return date.
 * Prioritizes account-specific settings, then falls back to global (all accounts).
 */
export declare const getActiveSettings: (params: {
    accountId?: string;
    categoryId?: string;
    returnDate?: Date;
}) => Promise<ICustomerReturnChargeSettings | null>;
/**
 * Pure calculation function for Customer Return Charges.
 * All amounts are in paise.
 */
export declare const calculateCustomerReturnChargeAmounts: (settings: {
    isEnabled: boolean;
    calculationType: 'fixed_order' | 'fixed_unit' | 'percentage';
    chargeAmount: number;
    percentageRate: number;
    hasHandlingCharge: boolean;
    handlingCalculationType: 'fixed_order' | 'fixed_unit';
    handlingChargeAmount: number;
}, orderValuePaise: number, returnedQty: number) => {
    baseCharge: number;
    handlingCharge: number;
    totalCharge: number;
    calculationDetails: string;
};
/**
 * Apply a customer return charge to an order.
 * - Idempotency guaranteed: if already applied, skips duplicate charge.
 * - RTO exclusion strictly enforced: never charges RTO orders.
 */
export declare const applyCustomerReturnCharge: (params: {
    orderId: string | mongoose.Types.ObjectId;
    returnOrderId?: string | mongoose.Types.ObjectId;
    returnedQuantity?: number;
    returnDate?: Date;
    userId?: string | mongoose.Types.ObjectId;
}) => Promise<{
    success: boolean;
    applied: boolean;
    reason?: string;
    charge?: ICustomerReturnCharge;
}>;
/**
 * Reverse an applied customer return charge when order status changes away from customer return
 * (e.g. changed to RTO, cancelled, or return record deleted).
 */
export declare const reverseCustomerReturnCharge: (params: {
    orderId: string | mongoose.Types.ObjectId;
    reason?: string;
    userId?: string | mongoose.Types.ObjectId;
}) => Promise<{
    reversed: boolean;
    count: number;
}>;
/**
 * Preview Historical Recalculation:
 * Computes difference in P&L without modifying any existing data.
 */
export declare const previewHistoricalRecalculation: (params: {
    accountId?: string;
    categoryId?: string;
    startDate?: string;
    endDate?: string;
    targetSettings?: Partial<ICustomerReturnChargeSettings>;
}) => Promise<{
    totalRecords: number;
    currentTotalExpense: number;
    newTotalExpense: number;
    difference: number;
    sampleItems: Array<{
        transactionId: string;
        orderId: string;
        returnDate: Date;
        returnedQuantity: number;
        originalOrderValue: number;
        currentCharge: number;
        newCharge: number;
        diff: number;
    }>;
}>;
/**
 * Execute Historical Recalculation:
 * Admin confirmed recalculation with audit logging.
 */
export declare const executeHistoricalRecalculation: (params: {
    accountId?: string;
    categoryId?: string;
    startDate?: string;
    endDate?: string;
    userId: string | mongoose.Types.ObjectId;
}) => Promise<{
    updatedCount: number;
    totalDifference: number;
}>;
//# sourceMappingURL=customerReturnCharge.service.d.ts.map