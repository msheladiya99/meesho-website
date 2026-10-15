import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { StockMovement, MovementType, StockBucket } from '../models/StockMovement';

interface RecordMovementParams {
  businessAccount: string;
  productId: string;
  movementType: MovementType;
  quantity: number;      // positive = IN, negative = OUT
  stockBucket?: StockBucket; // 'saleable' | 'damaged' | 'pending', default: 'saleable'
  unitCost?: number;     // paise
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  createdBy?: string;
  session?: mongoose.ClientSession;
}

export const generateStockTransactionId = (): string => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `STK-${dateStr}-${rand}`;
};

/**
 * Record a stock movement and update the product's stock buckets and weightedAvgCost.
 * Supports saleable, damaged, and pending buckets.
 */
export const recordStockMovement = async (params: RecordMovementParams): Promise<void> => {
  const {
    businessAccount, productId, movementType, quantity,
    stockBucket = 'saleable',
    unitCost = 0, referenceType, referenceId, reason, createdBy, session,
  } = params;

  const product = await Product.findById(productId).session(session || null);
  if (!product) throw new Error(`Product ${productId} not found`);

  let previousStock = 0;
  let resultingStock = 0;
  let newWeightedAvgCost = product.weightedAvgCost;
  const productUpdate: Record<string, any> = {};

  if (stockBucket === 'damaged') {
    previousStock = product.damagedStock || 0;
    resultingStock = previousStock + quantity;
    if (resultingStock < 0) {
      throw new Error(`Insufficient damaged stock for "${product.name}". Available: ${previousStock}, Requested deduction: ${Math.abs(quantity)}`);
    }
    productUpdate.damagedStock = resultingStock;
  } else if (stockBucket === 'pending') {
    previousStock = product.pendingInspectionStock || 0;
    resultingStock = previousStock + quantity;
    if (resultingStock < 0) {
      throw new Error(`Insufficient pending stock for "${product.name}". Available: ${previousStock}, Requested deduction: ${Math.abs(quantity)}`);
    }
    productUpdate.pendingInspectionStock = resultingStock;
  } else {
    // Default: saleable stock
    previousStock = product.currentStock;
    resultingStock = previousStock + quantity;
    if (resultingStock < 0) {
      throw new Error(`Insufficient saleable stock for product "${product.name}". Available: ${product.currentStock}, Requested: ${Math.abs(quantity)}`);
    }
    productUpdate.currentStock = resultingStock;

    // Update weighted average cost on saleable stock IN
    if (quantity > 0 && unitCost > 0) {
      const currentValue = product.currentStock * product.weightedAvgCost;
      const incomingValue = quantity * unitCost;
      newWeightedAvgCost = Math.round((currentValue + incomingValue) / resultingStock);
      productUpdate.weightedAvgCost = newWeightedAvgCost;
    }
  }

  if (movementType === 'purchase' && unitCost > 0) {
    productUpdate.defaultPurchaseCost = unitCost;
  }

  const transactionId = generateStockTransactionId();

  // Create immutable ledger entry
  await StockMovement.create([{
    transactionId,
    businessAccount: new mongoose.Types.ObjectId(businessAccount),
    product: new mongoose.Types.ObjectId(productId),
    sku: product.sku,
    stockBucket,
    movementType,
    quantity,
    unitCost: unitCost || newWeightedAvgCost,
    referenceType,
    referenceId: referenceId && mongoose.Types.ObjectId.isValid(referenceId) ? new mongoose.Types.ObjectId(referenceId) : undefined,
    reason,
    previousStock,
    resultingStock,
    runningBalance: resultingStock,
    createdBy: createdBy ? new mongoose.Types.ObjectId(createdBy) : undefined,
  }], { session });

  // Update product model
  await Product.findByIdAndUpdate(productId, productUpdate, { session });
};

/**
 * Check if an order has already had its stock deducted.
 */
export const hasOrderDeductedStock = async (
  orderId: string,
  session?: mongoose.ClientSession
): Promise<boolean> => {
  const existingMovement = await StockMovement.findOne({
    referenceType: 'Order',
    referenceId: new mongoose.Types.ObjectId(orderId),
    movementType: 'sale',
  }).session(session || null);
  return !!existingMovement;
};

/**
 * Reverse a movement (e.g., when an order or purchase is deleted).
 */
export const reverseMovementsByReference = async (
  referenceId: string,
  createdBy?: string,
  session?: mongoose.ClientSession
): Promise<void> => {
  const movements = await StockMovement.find({
    referenceId: new mongoose.Types.ObjectId(referenceId),
  }).session(session || null);

  for (const mv of movements) {
    const product = await Product.findById(mv.product).session(session || null);
    if (product) {
      const reversalQuantity = mv.quantity;
      if (mv.stockBucket === 'damaged') {
        const newBal = Math.max(0, (product.damagedStock || 0) - reversalQuantity);
        await Product.findByIdAndUpdate(mv.product, { damagedStock: newBal }, { session });
      } else if (mv.stockBucket === 'pending') {
        const newBal = Math.max(0, (product.pendingInspectionStock || 0) - reversalQuantity);
        await Product.findByIdAndUpdate(mv.product, { pendingInspectionStock: newBal }, { session });
      } else {
        const newBal = Math.max(0, product.currentStock - reversalQuantity);
        let newWeightedAvgCost = product.weightedAvgCost;
        if (reversalQuantity > 0 && mv.unitCost > 0) {
          const currentValue = product.currentStock * product.weightedAvgCost;
          const reversedValue = reversalQuantity * mv.unitCost;
          newWeightedAvgCost = newBal > 0 ? Math.max(0, Math.round((currentValue - reversedValue) / newBal)) : product.weightedAvgCost;
        }
        await Product.findByIdAndUpdate(
          mv.product,
          { currentStock: newBal, weightedAvgCost: newWeightedAvgCost },
          { session }
        );
      }
    }

    // Delete the original movement
    await StockMovement.findByIdAndDelete(mv._id).session(session || null);
  }
};
