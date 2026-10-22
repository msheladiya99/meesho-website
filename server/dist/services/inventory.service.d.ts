import mongoose from 'mongoose';
import { MovementType, StockBucket } from '../models/StockMovement';
interface RecordMovementParams {
    businessAccount: string;
    productId?: string;
    movementType: MovementType;
    quantity: number;
    stockBucket?: StockBucket;
    unitCost?: number;
    referenceType?: string;
    referenceId?: string;
    reason?: string;
    createdBy?: string;
    session?: mongoose.ClientSession;
}
export declare const generateStockTransactionId: () => string;
/**
 * Record a stock movement and update the product's stock buckets and weightedAvgCost.
 * Supports saleable, damaged, and pending buckets.
 * When productId is omitted, records a direct total warehouse stock movement.
 */
export declare const recordStockMovement: (params: RecordMovementParams) => Promise<void>;
/**
 * Check if an order has already had its stock deducted.
 */
export declare const hasOrderDeductedStock: (orderId: string, session?: mongoose.ClientSession) => Promise<boolean>;
/**
 * Reverse a movement (e.g., when an order or purchase is deleted).
 */
export declare const reverseMovementsByReference: (referenceId: string, createdBy?: string, session?: mongoose.ClientSession) => Promise<void>;
/**
 * Calculate total available saleable stock across designated account(s).
 */
export declare const calculateTotalAvailableStock: (targetAccountIds: mongoose.Types.ObjectId[]) => Promise<number>;
/**
 * Resolve the account IDs whose stock the given account is entitled to access.
 * Returns { targetAccountIds, isSharedStock }.
 *
 * Rules:
 * 1. An account always has access to its own stock.
 * 2. If this account has allowSharedStock=true, it can access stock from accounts in its sharedStockAccounts.
 * 3. If any OTHER active account has allowSharedStock=true and included THIS account in its sharedStockAccounts,
 *    that other account has explicitly authorized this account to use its stock.
 * 4. If neither condition 2 nor 3 is met, only this account's own stock is used (strict account isolation).
 */
export declare const resolveStockAccountIds: (accountId: string | mongoose.Types.ObjectId) => Promise<{
    targetAccountIds: mongoose.Types.ObjectId[];
    isSharedStock: boolean;
}>;
export {};
//# sourceMappingURL=inventory.service.d.ts.map