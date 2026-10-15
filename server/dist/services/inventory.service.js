"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reverseMovementsByReference = exports.recordStockMovement = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Product_1 = require("../models/Product");
const StockMovement_1 = require("../models/StockMovement");
/**
 * Record a stock movement and update the product's currentStock and weightedAvgCost.
 * Uses weighted-average cost method for inventory valuation.
 */
const recordStockMovement = async (params) => {
    const { businessAccount, productId, movementType, quantity, unitCost = 0, referenceType, referenceId, reason, createdBy, session, } = params;
    const product = await Product_1.Product.findById(productId).session(session || null);
    if (!product)
        throw new Error(`Product ${productId} not found`);
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
    await StockMovement_1.StockMovement.create([{
            businessAccount: new mongoose_1.default.Types.ObjectId(businessAccount),
            product: new mongoose_1.default.Types.ObjectId(productId),
            movementType,
            quantity,
            unitCost: unitCost || newWeightedAvgCost,
            referenceType,
            referenceId: referenceId ? new mongoose_1.default.Types.ObjectId(referenceId) : undefined,
            reason,
            runningBalance: newBalance,
            createdBy: createdBy ? new mongoose_1.default.Types.ObjectId(createdBy) : undefined,
        }], { session });
    // Update product stock and WAC (and defaultPurchaseCost if purchase)
    const productUpdate = {
        currentStock: newBalance,
        weightedAvgCost: newWeightedAvgCost,
    };
    if (movementType === 'purchase' && unitCost > 0) {
        productUpdate.defaultPurchaseCost = unitCost;
    }
    await Product_1.Product.findByIdAndUpdate(productId, productUpdate, { session });
};
exports.recordStockMovement = recordStockMovement;
/**
 * Reverse a movement (e.g., when an order or purchase is deleted).
 * Finds movements linked to the referenceId and creates reversal entries.
 */
const reverseMovementsByReference = async (referenceId, createdBy, session) => {
    const movements = await StockMovement_1.StockMovement.find({ referenceId: new mongoose_1.default.Types.ObjectId(referenceId) }).session(session || null);
    for (const mv of movements) {
        // Directly reverse the stock without creating a new movement entry
        // This avoids double-counting when re-recording new movements
        const product = await Product_1.Product.findById(mv.product).session(session || null);
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
            await Product_1.Product.findByIdAndUpdate(mv.product, { currentStock: newBalance, weightedAvgCost: newWeightedAvgCost }, { session });
        }
        // Delete the original movement
        await StockMovement_1.StockMovement.findByIdAndDelete(mv._id).session(session || null);
    }
};
exports.reverseMovementsByReference = reverseMovementsByReference;
//# sourceMappingURL=inventory.service.js.map