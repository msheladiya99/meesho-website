import mongoose from 'mongoose';
import { CustomerReturnChargeSettings, ICustomerReturnChargeSettings } from '../models/CustomerReturnChargeSettings';
import { CustomerReturnCharge, ICustomerReturnCharge } from '../models/CustomerReturnCharge';
import { Order } from '../models/Order';
import { ReturnOrder } from '../models/ReturnOrder';
import { Product } from '../models/Product';
import { createAuditLog } from './audit.service';

export const generateChargeTransactionId = (): string => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `CRC-${dateStr}-${rand}`;
};

/**
 * Find the active settings for a given GST account, category, and return date.
 * Prioritizes account-specific settings, then falls back to global (all accounts).
 */
export const getActiveSettings = async (params: {
  accountId?: string;
  categoryId?: string;
  returnDate?: Date;
}): Promise<ICustomerReturnChargeSettings | null> => {
  const { accountId, categoryId, returnDate = new Date() } = params;

  // 1. Try account-specific setting if accountId is provided
  if (accountId && accountId !== 'all' && mongoose.Types.ObjectId.isValid(accountId)) {
    const accObjId = new mongoose.Types.ObjectId(accountId);
    const accountSpecific = await CustomerReturnChargeSettings.findOne({
      isDeleted: false,
      businessAccountScope: 'selected',
      applicableAccounts: accObjId,
      effectiveFrom: { $lte: returnDate },
    }).sort({ effectiveFrom: -1, createdAt: -1 });

    if (accountSpecific) {
      if (
        accountSpecific.categoryScope === 'selected' &&
        categoryId &&
        mongoose.Types.ObjectId.isValid(categoryId)
      ) {
        const catObjId = new mongoose.Types.ObjectId(categoryId);
        const matchesCat = accountSpecific.applicableCategories.some((c) => c.equals(catObjId));
        if (!matchesCat) return null;
      }
      return accountSpecific;
    }
  }

  // 2. Global setting for all accounts
  const globalSetting = await CustomerReturnChargeSettings.findOne({
    isDeleted: false,
    businessAccountScope: 'all',
    effectiveFrom: { $lte: returnDate },
  }).sort({ effectiveFrom: -1, createdAt: -1 });

  if (globalSetting) {
    if (
      globalSetting.categoryScope === 'selected' &&
      categoryId &&
      mongoose.Types.ObjectId.isValid(categoryId)
    ) {
      const catObjId = new mongoose.Types.ObjectId(categoryId);
      const matchesCat = globalSetting.applicableCategories.some((c) => c.equals(catObjId));
      if (!matchesCat) return null;
    }
    return globalSetting;
  }

  return null;
};

/**
 * Pure calculation function for Customer Return Charges.
 * All amounts are in paise.
 */
export const calculateCustomerReturnChargeAmounts = (
  settings: {
    isEnabled: boolean;
    calculationType: 'fixed_order' | 'fixed_unit' | 'percentage';
    chargeAmount: number;
    percentageRate: number;
    hasHandlingCharge: boolean;
    handlingCalculationType: 'fixed_order' | 'fixed_unit';
    handlingChargeAmount: number;
  },
  orderValuePaise: number,
  returnedQty: number
): {
  baseCharge: number;
  handlingCharge: number;
  totalCharge: number;
  calculationDetails: string;
} => {
  if (!settings.isEnabled) {
    return {
      baseCharge: 0,
      handlingCharge: 0,
      totalCharge: 0,
      calculationDetails: 'Customer Return Charges are disabled.',
    };
  }

  const qty = Math.max(1, returnedQty || 1);
  let baseCharge = 0;
  let baseDesc = '';

  switch (settings.calculationType) {
    case 'fixed_order':
      baseCharge = Math.max(0, Math.round(settings.chargeAmount || 0));
      baseDesc = `Fixed per-order charge ₹${(baseCharge / 100).toFixed(2)}`;
      break;

    case 'fixed_unit':
      baseCharge = Math.max(0, Math.round((settings.chargeAmount || 0) * qty));
      baseDesc = `Fixed per-unit charge ₹${((settings.chargeAmount || 0) / 100).toFixed(2)} × ${qty} unit(s) = ₹${(baseCharge / 100).toFixed(2)}`;
      break;

    case 'percentage':
      const rate = Math.max(0, Math.min(100, settings.percentageRate || 0));
      baseCharge = Math.max(0, Math.round((orderValuePaise * rate) / 100));
      baseDesc = `${rate}% of original order value (₹${(orderValuePaise / 100).toFixed(2)}) = ₹${(baseCharge / 100).toFixed(2)}`;
      break;
  }

  let handlingCharge = 0;
  let handlingDesc = '';

  if (settings.hasHandlingCharge && (settings.handlingChargeAmount || 0) > 0) {
    if (settings.handlingCalculationType === 'fixed_unit') {
      handlingCharge = Math.max(0, Math.round((settings.handlingChargeAmount || 0) * qty));
      handlingDesc = ` + Handling charge ₹${((settings.handlingChargeAmount || 0) / 100).toFixed(2)} × ${qty} = ₹${(handlingCharge / 100).toFixed(2)}`;
    } else {
      handlingCharge = Math.max(0, Math.round(settings.handlingChargeAmount || 0));
      handlingDesc = ` + Handling charge ₹${(handlingCharge / 100).toFixed(2)}`;
    }
  }

  const totalCharge = baseCharge + handlingCharge;
  const calculationDetails = `${baseDesc}${handlingDesc} (Total return expense: ₹${(totalCharge / 100).toFixed(2)})`;

  return {
    baseCharge,
    handlingCharge,
    totalCharge,
    calculationDetails,
  };
};

/**
 * Apply a customer return charge to an order.
 * - Idempotency guaranteed: if already applied, skips duplicate charge.
 * - RTO exclusion strictly enforced: never charges RTO orders.
 */
export const applyCustomerReturnCharge = async (params: {
  orderId: string | mongoose.Types.ObjectId;
  returnOrderId?: string | mongoose.Types.ObjectId;
  returnedQuantity?: number;
  returnDate?: Date;
  userId?: string | mongoose.Types.ObjectId;
}): Promise<{
  success: boolean;
  applied: boolean;
  reason?: string;
  charge?: ICustomerReturnCharge;
}> => {
  const { orderId, returnOrderId, returnedQuantity, returnDate = new Date(), userId } = params;

  const order = await Order.findById(orderId).populate('product');
  if (!order || order.isDeleted) {
    return { success: false, applied: false, reason: 'Order not found' };
  }

  // 1. Strict RTO Exclusion Rule: RTO orders must NEVER receive customer return charges
  const orderStatus = order.status;
  if (
    orderStatus === 'rto_in_transit' ||
    orderStatus === 'rto_received'
  ) {
    return {
      success: true,
      applied: false,
      reason: 'RTO orders are strictly excluded from customer return charges.',
    };
  }

  // Check ReturnOrder if linked
  let returnDoc = null;
  if (returnOrderId) {
    returnDoc = await ReturnOrder.findById(returnOrderId);
    if (returnDoc && returnDoc.returnType === 'rto_return') {
      return {
        success: true,
        applied: false,
        reason: 'RTO returns are strictly excluded from customer return charges.',
      };
    }
  }

  // Only apply if order is customer returned
  const isCustomerReturn =
    orderStatus === 'returned' ||
    (returnDoc && returnDoc.returnType === 'customer_return');

  if (!isCustomerReturn) {
    return {
      success: true,
      applied: false,
      reason: `Order status "${orderStatus}" is not a customer return. Customer return charge not applicable.`,
    };
  }

  // 2. Strict Idempotency Check: Do not apply charge twice
  const existingCharge = await CustomerReturnCharge.findOne({
    order: order._id,
    status: 'applied',
    isDeleted: false,
  });

  if (existingCharge) {
    return {
      success: true,
      applied: false,
      reason: 'Customer return charge has already been applied for this order.',
      charge: existingCharge,
    };
  }

  // 3. Resolve Product & Category
  const prodDoc = order.product as any;
  const productId = prodDoc?._id || order.product;
  const productCategory = prodDoc?.category;
  const sku = order.sku || prodDoc?.sku || 'UNKNOWN-SKU';
  const productName = prodDoc?.name || 'Perfume Item';

  // 4. Resolve Active Settings
  const settings = await getActiveSettings({
    accountId: order.businessAccount.toString(),
    categoryId: productCategory?.toString(),
    returnDate,
  });

  if (!settings || !settings.isEnabled) {
    return {
      success: true,
      applied: false,
      reason: 'Customer return charges are not enabled or no matching settings found for this account/category.',
    };
  }

  // 5. Calculate Charge
  const qty = returnedQuantity || returnDoc?.returnedQuantity || order.quantity || 1;
  const originalOrderValue = order.grossAmount || (order.sellingPrice * qty);

  const calc = calculateCustomerReturnChargeAmounts(
    {
      isEnabled: settings.isEnabled,
      calculationType: settings.calculationType,
      chargeAmount: settings.chargeAmount,
      percentageRate: settings.percentageRate,
      hasHandlingCharge: settings.hasHandlingCharge,
      handlingCalculationType: settings.handlingCalculationType,
      handlingChargeAmount: settings.handlingChargeAmount,
    },
    originalOrderValue,
    qty
  );

  const appliedRate =
    settings.calculationType === 'percentage'
      ? settings.percentageRate
      : settings.chargeAmount;

  // 6. Create Charge Record
  const transactionId = generateChargeTransactionId();
  const charge = await CustomerReturnCharge.create({
    transactionId,
    order: order._id,
    returnOrder: returnDoc?._id,
    businessAccount: order.businessAccount,
    product: productId,
    sku,
    productName,
    category: productCategory,
    orderDate: order.orderDate,
    returnDate,
    returnedQuantity: qty,
    originalOrderValue,
    chargeType: settings.calculationType,
    appliedRate,
    baseCharge: calc.baseCharge,
    handlingCharge: calc.handlingCharge,
    totalCharge: calc.totalCharge,
    transactionType: 'customer_return_charge',
    status: 'applied',
    settingsVersion: settings.settingsVersion || 1,
    calculationTimestamp: new Date(),
    calculationDetails: calc.calculationDetails,
    createdBy: userId,
  });

  await createAuditLog({
    action: 'CREATE',
    resource: 'CustomerReturnCharge',
    resourceId: charge._id.toString(),
    userId: userId?.toString(),
    details: `Applied customer return charge ₹${(calc.totalCharge / 100).toFixed(2)} for Order ${order.meeshoOrderId || order.subOrderId || order._id} (Tx: ${transactionId})`,
  });

  return {
    success: true,
    applied: true,
    charge,
  };
};

/**
 * Reverse an applied customer return charge when order status changes away from customer return
 * (e.g. changed to RTO, cancelled, or return record deleted).
 */
export const reverseCustomerReturnCharge = async (params: {
  orderId: string | mongoose.Types.ObjectId;
  reason?: string;
  userId?: string | mongoose.Types.ObjectId;
}): Promise<{ reversed: boolean; count: number }> => {
  const { orderId, reason, userId } = params;

  const existingCharges = await CustomerReturnCharge.find({
    order: orderId,
    status: 'applied',
    isDeleted: false,
  });

  if (existingCharges.length === 0) {
    return { reversed: false, count: 0 };
  }

  for (const ch of existingCharges) {
    ch.status = 'reversed';
    ch.reversalReason = reason || 'Order status changed away from customer returned';
    await ch.save();

    await createAuditLog({
      action: 'UPDATE',
      resource: 'CustomerReturnCharge',
      resourceId: ch._id.toString(),
      userId: userId?.toString(),
      details: `Reversed customer return charge ${ch.transactionId} for Order ${orderId}. Reason: ${ch.reversalReason}`,
    });
  }

  return { reversed: true, count: existingCharges.length };
};

/**
 * Preview Historical Recalculation:
 * Computes difference in P&L without modifying any existing data.
 */
export const previewHistoricalRecalculation = async (params: {
  accountId?: string;
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  targetSettings?: Partial<ICustomerReturnChargeSettings>;
}): Promise<{
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
}> => {
  const { accountId, categoryId, startDate, endDate, targetSettings } = params;

  const query: Record<string, any> = {
    isDeleted: false,
    status: { $in: ['applied', 'adjusted'] },
  };

  if (accountId && accountId !== 'all' && mongoose.Types.ObjectId.isValid(accountId)) {
    query.businessAccount = new mongoose.Types.ObjectId(accountId);
  }

  if (categoryId && categoryId !== 'all' && mongoose.Types.ObjectId.isValid(categoryId)) {
    query.category = new mongoose.Types.ObjectId(categoryId);
  }

  if (startDate || endDate) {
    query.returnDate = {};
    if (startDate) query.returnDate.$gte = new Date(startDate);
    if (endDate) query.returnDate.$lte = new Date(endDate + 'T23:59:59.999Z');
  }

  const existingCharges = await CustomerReturnCharge.find(query)
    .populate('order', 'meeshoOrderId subOrderId')
    .sort({ returnDate: -1 });

  let currentTotalExpense = 0;
  let newTotalExpense = 0;
  const sampleItems: any[] = [];

  // Determine active settings to use for recalculation
  const effectiveSettings =
    targetSettings ||
    (await getActiveSettings({ accountId, categoryId })) || {
      isEnabled: true,
      calculationType: 'fixed_order',
      chargeAmount: 6000,
      percentageRate: 0,
      hasHandlingCharge: false,
      handlingCalculationType: 'fixed_order',
      handlingChargeAmount: 0,
    };

  for (const ch of existingCharges) {
    currentTotalExpense += ch.totalCharge;

    const calc = calculateCustomerReturnChargeAmounts(
      {
        isEnabled: effectiveSettings.isEnabled !== false,
        calculationType: (effectiveSettings.calculationType as any) || 'fixed_order',
        chargeAmount: effectiveSettings.chargeAmount || 0,
        percentageRate: effectiveSettings.percentageRate || 0,
        hasHandlingCharge: !!effectiveSettings.hasHandlingCharge,
        handlingCalculationType: (effectiveSettings.handlingCalculationType as any) || 'fixed_order',
        handlingChargeAmount: effectiveSettings.handlingChargeAmount || 0,
      },
      ch.originalOrderValue,
      ch.returnedQuantity
    );

    newTotalExpense += calc.totalCharge;

    if (sampleItems.length < 10) {
      const ord = ch.order as any;
      sampleItems.push({
        transactionId: ch.transactionId,
        orderId: ord?.meeshoOrderId || ord?.subOrderId || ch.order.toString(),
        returnDate: ch.returnDate,
        returnedQuantity: ch.returnedQuantity,
        originalOrderValue: ch.originalOrderValue,
        currentCharge: ch.totalCharge,
        newCharge: calc.totalCharge,
        diff: calc.totalCharge - ch.totalCharge,
      });
    }
  }

  return {
    totalRecords: existingCharges.length,
    currentTotalExpense,
    newTotalExpense,
    difference: newTotalExpense - currentTotalExpense,
    sampleItems,
  };
};

/**
 * Execute Historical Recalculation:
 * Admin confirmed recalculation with audit logging.
 */
export const executeHistoricalRecalculation = async (params: {
  accountId?: string;
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  userId: string | mongoose.Types.ObjectId;
}): Promise<{
  updatedCount: number;
  totalDifference: number;
}> => {
  const { accountId, categoryId, startDate, endDate, userId } = params;

  const query: Record<string, any> = {
    isDeleted: false,
    status: { $in: ['applied', 'adjusted'] },
  };

  if (accountId && accountId !== 'all' && mongoose.Types.ObjectId.isValid(accountId)) {
    query.businessAccount = new mongoose.Types.ObjectId(accountId);
  }

  if (categoryId && categoryId !== 'all' && mongoose.Types.ObjectId.isValid(categoryId)) {
    query.category = new mongoose.Types.ObjectId(categoryId);
  }

  if (startDate || endDate) {
    query.returnDate = {};
    if (startDate) query.returnDate.$gte = new Date(startDate);
    if (endDate) query.returnDate.$lte = new Date(endDate + 'T23:59:59.999Z');
  }

  const existingCharges = await CustomerReturnCharge.find(query);

  let updatedCount = 0;
  let totalDifference = 0;

  for (const ch of existingCharges) {
    const settings = await getActiveSettings({
      accountId: ch.businessAccount.toString(),
      categoryId: ch.category?.toString(),
      returnDate: ch.returnDate,
    });

    if (!settings) continue;

    const calc = calculateCustomerReturnChargeAmounts(
      {
        isEnabled: settings.isEnabled,
        calculationType: settings.calculationType,
        chargeAmount: settings.chargeAmount,
        percentageRate: settings.percentageRate,
        hasHandlingCharge: settings.hasHandlingCharge,
        handlingCalculationType: settings.handlingCalculationType,
        handlingChargeAmount: settings.handlingChargeAmount,
      },
      ch.originalOrderValue,
      ch.returnedQuantity
    );

    const oldTotal = ch.totalCharge;
    const diff = calc.totalCharge - oldTotal;

    ch.baseCharge = calc.baseCharge;
    ch.handlingCharge = calc.handlingCharge;
    ch.totalCharge = calc.totalCharge;
    ch.chargeType = settings.calculationType;
    ch.appliedRate =
      settings.calculationType === 'percentage'
        ? settings.percentageRate
        : settings.chargeAmount;
    ch.settingsVersion = settings.settingsVersion;
    ch.status = 'adjusted';
    ch.calculationDetails = `[Recalculated by Admin]: ${calc.calculationDetails}`;
    ch.calculationTimestamp = new Date();

    await ch.save();

    updatedCount++;
    totalDifference += diff;
  }

  await createAuditLog({
    action: 'UPDATE',
    resource: 'CustomerReturnChargeRecalculation',
    userId: userId.toString(),
    details: `Executed historical recalculation on ${updatedCount} return charges. Net P&L difference: ₹${(totalDifference / 100).toFixed(2)}`,
    changes: {
      updatedCount,
      totalDifference,
      scope: { accountId, categoryId, startDate, endDate },
    },
  });

  return {
    updatedCount,
    totalDifference,
  };
};
