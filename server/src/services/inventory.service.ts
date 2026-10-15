import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { StockMovement } from '../models/StockMovement';

type MovementType = 'purchase' | 'sale' | 'return_in' | 'return_out' | 'adjustment' | 'opening';

interface RecordMovementParams {
  businessAccount: string;
  productId: string;
  movementType: MovementType;
  quantity: number;      // positive = IN, negative = OUT
  unitCost?: number;     // paise
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
export const recordStockMovement = async (params: RecordMovementParams): Promise<void> => {
  const {
    businessAccount, productId, movementType, quantity,
    unitCost = 0, referenceType, referenceId, reason, createdBy, session,
  } = params;

  const product = await Product.findById(productId).session(session || null);
  if (!product) throw new Error(`Product ${productId} not found`);

  // Compute new stock balance
  const newBalance = product.currentStock + quantity;
  if (newBalance < 0) {
    throw new Error(`Insufficient stock for product "${product.name}". Available: ${product.currentStock}, Requested: ${Math.abs(quantity)}`);
  }

  // Update weighted average cost on stock IN
  let newWeightedAvgCost = product.weightedAvgCost;
  if (quantity > 0 && unitCost > 0) {
    const currentValue = product.currentStock * product.weightedAvgCost;
    const incomingValue = quantity * unitCost;
    newWeightedAvgCost = Math.round((currentValue + incomingValue) / newBalance);
  }

  // Create ledger entry
  await StockMovement.create([{
    businessAccount: new mongoose.Types.ObjectId(businessAccount),
    product: new mongoose.Types.ObjectId(productId),
    movementType,
    quantity,
    unitCost: unitCost || newWeightedAvgCost,
    referenceType,
    referenceId: referenceId ? new mongoose.Types.ObjectId(referenceId) : undefined,
    reason,
    runningBalance: newBalance,
    createdBy: createdBy ? new mongoose.Types.ObjectId(createdBy) : undefined,
  }], { session });

  // Update product stock and WAC (and defaultPurchaseCost if purchase)
  const productUpdate: Record<string, any> = {
    currentStock: newBalance,
    weightedAvgCost: newWeightedAvgCost,
  };
  if (movementType === 'purchase' && unitCost > 0) {
    productUpdate.defaultPurchaseCost = unitCost;
  }

  await Product.findByIdAndUpdate(
    productId,
    productUpdate,
    { session }
  );
};

/**
 * Reverse a movement (e.g., when an order or purchase is deleted).
 * Finds movements linked to the referenceId and creates reversal entries.
 */
export const reverseMovementsByReference = async (
  referenceId: string,
  createdBy?: string,
  session?: mongoose.ClientSession
): Promise<void> => {
  const movements = await StockMovement.find({ referenceId: new mongoose.Types.ObjectId(referenceId) }).session(session || null);

  for (const mv of movements) {
    // Directly reverse the stock without creating a new movement entry
    // This avoids double-counting when re-recording new movements
    const product = await Product.findById(mv.product).session(session || null);
    if (product) {
      // Calculate the reversal - subtract the movement quantity
      // But ensure we don't go below 0
      const reversalQuantity = mv.quantity;
      const newBalance = Math.max(0, product.currentStock - reversalQuantity);
      
      // Recalculate weighted average cost if it was an incoming movement (quantity > 0)
      let newWeightedAvgCost = product.weightedAvgCost;
      if (reversalQuantity > 0) {
        const currentValue = product.currentStock * product.weightedAvgCost;
        const reversedValue = reversalQuantity * mv.unitCost;
        newWeightedAvgCost = newBalance > 0 ? Math.max(0, Math.round((currentValue - reversedValue) / newBalance)) : product.weightedAvgCost;
      }

      await Product.findByIdAndUpdate(
        mv.product,
        { currentStock: newBalance, weightedAvgCost: newWeightedAvgCost },
        { session }
      );
    }

    // Delete the original movement
    await StockMovement.findByIdAndDelete(mv._id).session(session || null);
  }
};
