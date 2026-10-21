import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { StockMovement, MovementType, StockBucket } from '../models/StockMovement';
import { BusinessAccount } from '../models/BusinessAccount';

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
    if (resultingStock < 0 && movementType !== 'sale') {
      throw new Error(`Insufficient saleable stock for product "${product.name}". Available: ${product.currentStock}, Requested: ${Math.abs(quantity)}`);
    }
    productUpdate.currentStock = Math.max(0, resultingStock);

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

  // Ensure product.currentStock strictly mirrors the movement ledger for saleable stock
  if (stockBucket === 'saleable') {
    const agg = await StockMovement.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(productId), stockBucket: 'saleable' } },
      { $group: { _id: null, total: { $sum: '$quantity' } } }
    ]).session(session || null);
    productUpdate.currentStock = agg.length > 0 ? Math.max(0, agg[0].total) : 0;
  }

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

    // Recalculate true currentStock from remaining movements to prevent drift
    if (!mv.stockBucket || mv.stockBucket === 'saleable') {
      const agg = await StockMovement.aggregate([
        { $match: { product: mv.product, stockBucket: 'saleable' } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]).session(session || null);
      const actualStock = agg.length > 0 ? Math.max(0, agg[0].total) : 0;
      await Product.findByIdAndUpdate(mv.product, { currentStock: actualStock }, { session });
    }
  }
};

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
export const resolveStockAccountIds = async (
  accountId: string | mongoose.Types.ObjectId
): Promise<{ targetAccountIds: mongoose.Types.ObjectId[]; isSharedStock: boolean }> => {
  const currentObjId = typeof accountId === 'string' ? new mongoose.Types.ObjectId(accountId) : accountId;
  const targetMap = new Map<string, mongoose.Types.ObjectId>();
  targetMap.set(currentObjId.toString(), currentObjId);

  let isSharedStock = false;
  const currentAccount = await BusinessAccount.findById(currentObjId);

  // 1. If this account explicitly enabled shared stock, include its designated accounts
  if (currentAccount?.allowSharedStock && currentAccount.sharedStockAccounts?.length) {
    for (const accId of currentAccount.sharedStockAccounts) {
      const objId = new mongoose.Types.ObjectId(accId as any);
      targetMap.set(objId.toString(), objId);
      isSharedStock = true;
    }
  }

  // 2. Also check if any other active account has enabled shared stock with this account
  const accountsSharingWithThis = await BusinessAccount.find({
    _id: { $ne: currentObjId },
    isActive: true,
    allowSharedStock: true,
    sharedStockAccounts: currentObjId,
  });

  for (const acc of accountsSharingWithThis) {
    const objId = new mongoose.Types.ObjectId(acc._id as any);
    targetMap.set(objId.toString(), objId);
    isSharedStock = true;
  }

  return {
    targetAccountIds: Array.from(targetMap.values()),
    isSharedStock,
  };
};
