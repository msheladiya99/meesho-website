import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { StockMovement, MovementType, StockBucket } from '../models/StockMovement';
import { BusinessAccount } from '../models/BusinessAccount';

interface RecordMovementParams {
  businessAccount: string;
  productId?: string;
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
 * When productId is omitted, records a direct total warehouse stock movement.
 */
export const recordStockMovement = async (params: RecordMovementParams): Promise<void> => {
  const {
    businessAccount, productId, movementType, quantity,
    stockBucket = 'saleable',
    unitCost = 0, referenceType, referenceId, reason, createdBy, session,
  } = params;

  // Handle direct total quantity purchase (no specific perfume selected)
  if (!productId) {
    const transactionId = generateStockTransactionId();
    await StockMovement.create([{
      transactionId,
      businessAccount: new mongoose.Types.ObjectId(businessAccount),
      product: undefined,
      sku: 'TOTAL_STOCK',
      stockBucket,
      movementType,
      quantity,
      unitCost: unitCost || 0,
      referenceType,
      referenceId: referenceId && mongoose.Types.ObjectId.isValid(referenceId) ? new mongoose.Types.ObjectId(referenceId) : undefined,
      reason: reason || 'Direct total stock purchase',
      previousStock: 0,
      resultingStock: quantity,
      runningBalance: quantity,
      createdBy: createdBy ? new mongoose.Types.ObjectId(createdBy) : undefined,
    }], { session });
    return;
  }

  const product = await Product.findById(productId).session(session || null);
  if (!product) throw new Error(`Product ${productId} not found`);

  // Target bucket field mapping
  let targetField = 'currentStock';
  if (stockBucket === 'damaged') {
    targetField = 'damagedStock';
  } else if (stockBucket === 'pending') {
    targetField = 'pendingInspectionStock';
  }

  // Atomic conditional query guard for deductions to prevent negative stock and race conditions
  const filter: Record<string, any> = { _id: productId };
  if (quantity < 0) {
    filter[targetField] = { $gte: Math.abs(quantity) };
  }

  const update: Record<string, any> = {
    $inc: { [targetField]: quantity },
  };

  // If purchase with unit cost, update default purchase cost
  if (movementType === 'purchase' && unitCost > 0) {
    update.$set = update.$set || {};
    update.$set.defaultPurchaseCost = unitCost;
  }

  // Calculate weighted average cost on saleable stock addition
  if (stockBucket === 'saleable' && quantity > 0 && unitCost > 0) {
    const curStock = product.currentStock || 0;
    const curCost = product.weightedAvgCost || product.defaultPurchaseCost || 0;
    const incomingVal = quantity * unitCost;
    const newStock = curStock + quantity;
    const newAvg = Math.round(((curStock * curCost) + incomingVal) / (newStock > 0 ? newStock : 1));
    update.$set = update.$set || {};
    update.$set.weightedAvgCost = newAvg;
  }

  // Execute atomic MongoDB update with conditional guard
  const updatedProduct = await Product.findOneAndUpdate(filter, update, {
    new: true,
    session: session || undefined,
  });

  if (!updatedProduct) {
    const fresh = await Product.findById(productId).session(session || null);
    if (!fresh) throw new Error(`Product ${productId} not found`);
    const available = (fresh as any)[targetField] || 0;
    throw new Error(`Insufficient ${stockBucket} stock for "${fresh.name}". Available: ${available}, Requested deduction: ${Math.abs(quantity)}`);
  }

  const resultingStock = (updatedProduct as any)[targetField] ?? 0;
  const previousStock = resultingStock - quantity;
  const newWeightedAvgCost = updatedProduct.weightedAvgCost || updatedProduct.defaultPurchaseCost || 0;

  const transactionId = generateStockTransactionId();

  // Create immutable ledger entry
  await StockMovement.create([{
    transactionId,
    businessAccount: new mongoose.Types.ObjectId(businessAccount),
    product: new mongoose.Types.ObjectId(productId),
    sku: updatedProduct.sku,
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
    if (mv.product) {
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
    }

    // Delete the original movement
    await StockMovement.findByIdAndDelete(mv._id).session(session || null);
  }
};

/**
 * Calculate total available saleable stock across designated account(s).
 */
export const calculateTotalAvailableStock = async (
  targetAccountIds: mongoose.Types.ObjectId[]
): Promise<number> => {
  const agg = await StockMovement.aggregate([
    {
      $match: {
        businessAccount: { $in: targetAccountIds },
        stockBucket: 'saleable',
      }
    },
    {
      $group: {
        _id: null,
        totalStock: { $sum: '$quantity' }
      }
    }
  ]);
  return agg.length > 0 ? Math.max(0, agg[0].totalStock) : 0;
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
