import mongoose from 'mongoose';
type MovementType = 'purchase' | 'sale' | 'return_in' | 'return_out' | 'adjustment' | 'opening';
interface RecordMovementParams {
    businessAccount: string;
    productId: string;
    movementType: MovementType;
    quantity: number;
    unitCost?: number;
    referenceType?: string;
    referenceId?: string;
    reason?: string;
    createdBy?: string;
    session?: mongoose.ClientSession;
}
/**
 * Record a stock movement and update the product's currentStock and weightedAvgCost.
 * Uses weighted-average cost method for inventory valuation.
 */
export declare const recordStockMovement: (params: RecordMovementParams) => Promise<void>;
/**
 * Reverse a movement (e.g., when an order or purchase is deleted).
 * Finds movements linked to the referenceId and creates reversal entries.
 */
export declare const reverseMovementsByReference: (referenceId: string, createdBy?: string, session?: mongoose.ClientSession) => Promise<void>;
export {};
//# sourceMappingURL=inventory.service.d.ts.map