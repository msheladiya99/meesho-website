"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reverseMovementsByReference = exports.hasOrderDeductedStock = exports.recordStockMovement = exports.generateStockTransactionId = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Product_1 = require("../models/Product");
const StockMovement_1 = require("../models/StockMovement");
const generateStockTransactionId = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `STK-${dateStr}-${rand}`;
};
exports.generateStockTransactionId = generateStockTransactionId;
/**
 * Record a stock movement and update the product's stock buckets and weightedAvgCost.
 * Supports saleable, damaged, and pending buckets.
 */
const recordStockMovement = async (params) => {
    const { businessAccount, productId, movementType, quantity, stockBucket = 'saleable', unitCost = 0, referenceType, referenceId, reason, createdBy, session, } = params;
    const product = await Product_1.Product.findById(productId).session(session || null);
    if (!product)
        throw new Error(`Product ${productId} not found`);
    let previousStock = 0;
    let resultingStock = 0;
    let newWeightedAvgCost = product.weightedAvgCost;
    const productUpdate = {};
    if (stockBucket === 'damaged') {
        previousStock = product.damagedStock || 0;
        resultingStock = previousStock + quantity;
        if (resultingStock < 0) {
            throw new Error(`Insufficient damaged stock for "${product.name}". Available: ${previousStock}, Requested deduction: ${Math.abs(quantity)}`);
        }
        productUpdate.damagedStock = resultingStock;
    }
    else if (stockBucket === 'pending') {
        previousStock = product.pendingInspectionStock || 0;
        resultingStock = previousStock + quantity;
        if (resultingStock < 0) {
            throw new Error(`Insufficient pending stock for "${product.name}". Available: ${previousStock}, Requested deduction: ${Math.abs(quantity)}`);
        }
        productUpdate.pendingInspectionStock = resultingStock;
    }
    else {
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
    const transactionId = (0, exports.generateStockTransactionId)();
    // Create immutable ledger entry
    await StockMovement_1.StockMovement.create([{
            transactionId,
            businessAccount: new mongoose_1.default.Types.ObjectId(businessAccount),
            product: new mongoose_1.default.Types.ObjectId(productId),
            sku: product.sku,
            stockBucket,
            movementType,
            quantity,
            unitCost: unitCost || newWeightedAvgCost,
            referenceType,
            referenceId: referenceId && mongoose_1.default.Types.ObjectId.isValid(referenceId) ? new mongoose_1.default.Types.ObjectId(referenceId) : undefined,
            reason,
            previousStock,
            resultingStock,
            runningBalance: resultingStock,
            createdBy: createdBy ? new mongoose_1.default.Types.ObjectId(createdBy) : undefined,
        }], { session });
    // Update product model
    await Product_1.Product.findByIdAndUpdate(productId, productUpdate, { session });
};
exports.recordStockMovement = recordStockMovement;
/**
 * Check if an order has already had its stock deducted.
 */
const hasOrderDeductedStock = async (orderId, session) => {
    const existingMovement = await StockMovement_1.StockMovement.findOne({
        referenceType: 'Order',
        referenceId: new mongoose_1.default.Types.ObjectId(orderId),
        movementType: 'sale',
    }).session(session || null);
    return !!existingMovement;
};
exports.hasOrderDeductedStock = hasOrderDeductedStock;
/**
 * Reverse a movement (e.g., when an order or purchase is deleted).
 */
const reverseMovementsByReference = async (referenceId, createdBy, session) => {
    const movements = await StockMovement_1.StockMovement.find({
        referenceId: new mongoose_1.default.Types.ObjectId(referenceId),
    }).session(session || null);
    for (const mv of movements) {
        const product = await Product_1.Product.findById(mv.product).session(session || null);
        if (product) {
            const reversalQuantity = mv.quantity;
            if (mv.stockBucket === 'damaged') {
                const newBal = Math.max(0, (product.damagedStock || 0) - reversalQuantity);
                await Product_1.Product.findByIdAndUpdate(mv.product, { damagedStock: newBal }, { session });
            }
            else if (mv.stockBucket === 'pending') {
                const newBal = Math.max(0, (product.pendingInspectionStock || 0) - reversalQuantity);
                await Product_1.Product.findByIdAndUpdate(mv.product, { pendingInspectionStock: newBal }, { session });
            }
            else {
                const newBal = Math.max(0, product.currentStock - reversalQuantity);
                let newWeightedAvgCost = product.weightedAvgCost;
                if (reversalQuantity > 0 && mv.unitCost > 0) {
                    const currentValue = product.currentStock * product.weightedAvgCost;
                    const reversedValue = reversalQuantity * mv.unitCost;
                    newWeightedAvgCost = newBal > 0 ? Math.max(0, Math.round((currentValue - reversedValue) / newBal)) : product.weightedAvgCost;
                }
                await Product_1.Product.findByIdAndUpdate(mv.product, { currentStock: newBal, weightedAvgCost: newWeightedAvgCost }, { session });
            }
        }
        // Delete the original movement
        await StockMovement_1.StockMovement.findByIdAndDelete(mv._id).session(session || null);
    }
};
exports.reverseMovementsByReference = reverseMovementsByReference;
//# sourceMappingURL=inventory.service.js.map