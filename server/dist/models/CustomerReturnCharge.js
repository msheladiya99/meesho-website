"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerReturnCharge = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const customerReturnChargeSchema = new mongoose_1.Schema({
    transactionId: { type: String, required: true, unique: true, index: true },
    order: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    returnOrder: { type: mongoose_1.Schema.Types.ObjectId, ref: 'ReturnOrder', index: true },
    businessAccount: { type: mongoose_1.Schema.Types.ObjectId, ref: 'BusinessAccount', required: true, index: true },
    product: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    sku: { type: String, required: true, trim: true },
    productName: { type: String, trim: true },
    category: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Category' },
    orderDate: { type: Date, required: true },
    returnDate: { type: Date, required: true, index: true },
    returnedQuantity: { type: Number, required: true, min: 1 },
    originalOrderValue: { type: Number, required: true, min: 0 }, // in paise
    chargeType: {
        type: String,
        enum: ['fixed_order', 'fixed_unit', 'percentage'],
        required: true,
    },
    appliedRate: { type: Number, required: true, min: 0 },
    baseCharge: { type: Number, required: true, min: 0 }, // in paise
    handlingCharge: { type: Number, required: true, min: 0 }, // in paise
    totalCharge: { type: Number, required: true, min: 0 }, // in paise
    transactionType: {
        type: String,
        enum: ['customer_return_charge'],
        default: 'customer_return_charge',
        required: true,
        index: true,
    },
    status: {
        type: String,
        enum: ['applied', 'reversed', 'adjusted'],
        default: 'applied',
        required: true,
        index: true,
    },
    reversalReason: { type: String, trim: true },
    settingsVersion: { type: Number, default: 1, required: true },
    calculationTimestamp: { type: Date, default: Date.now, required: true },
    calculationDetails: { type: String },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true });
// Idempotency: For a single order, there can only be ONE active ('applied') customer_return_charge
customerReturnChargeSchema.index({ order: 1, transactionType: 1 }, {
    unique: true,
    partialFilterExpression: { status: 'applied', isDeleted: false },
});
customerReturnChargeSchema.index({ businessAccount: 1, returnDate: -1 });
customerReturnChargeSchema.index({ category: 1, returnDate: -1 });
exports.CustomerReturnCharge = mongoose_1.default.model('CustomerReturnCharge', customerReturnChargeSchema);
//# sourceMappingURL=CustomerReturnCharge.js.map