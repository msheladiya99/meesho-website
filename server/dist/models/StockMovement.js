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
exports.StockMovement = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const stockMovementSchema = new mongoose_1.Schema({
    transactionId: { type: String, required: true, trim: true },
    businessAccount: { type: mongoose_1.Schema.Types.ObjectId, ref: 'BusinessAccount', required: true },
    product: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, required: true, uppercase: true },
    stockBucket: {
        type: String,
        enum: ['saleable', 'damaged', 'pending'],
        default: 'saleable',
    },
    movementType: {
        type: String,
        enum: [
            'purchase',
            'sale',
            'return_in',
            'return_out',
            'adjustment',
            'opening',
            'return_damaged',
            'damage_disposed',
            'damage_repaired',
            'damage_to_saleable',
        ],
        required: true,
    },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, default: 0 }, // paise
    referenceType: { type: String },
    referenceId: { type: mongoose_1.Schema.Types.ObjectId },
    reason: { type: String },
    previousStock: { type: Number, required: true, default: 0 },
    resultingStock: { type: Number, required: true },
    runningBalance: { type: Number, required: true },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
stockMovementSchema.index({ transactionId: 1 }, { unique: true });
stockMovementSchema.index({ businessAccount: 1, product: 1, createdAt: -1 });
stockMovementSchema.index({ businessAccount: 1, movementType: 1 });
stockMovementSchema.index({ referenceId: 1 });
exports.StockMovement = mongoose_1.default.model('StockMovement', stockMovementSchema);
//# sourceMappingURL=StockMovement.js.map