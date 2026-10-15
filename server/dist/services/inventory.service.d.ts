import mongoose from 'mongoose';
import { MovementType, StockBucket } from '../models/StockMovement';
interface RecordMovementParams {
    businessAccount: string;
    productId: string;
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
export {};
//# sourceMappingURL=inventory.service.d.ts.map