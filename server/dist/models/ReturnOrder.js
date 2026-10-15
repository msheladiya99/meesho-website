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
exports.ReturnOrder = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const returnOrderSchema = new mongoose_1.Schema({
    businessAccount: { type: mongoose_1.Schema.Types.ObjectId, ref: 'BusinessAccount', required: true },
    returnDate: { type: Date, required: true },
    originalOrder: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Order' },
    meeshoOrderId: { type: String, trim: true },
    product: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Product', required: true },
    returnedQuantity: { type: Number, required: true, min: 1 },
    originalSellingPrice: { type: Number, required: true }, // paise
    returnAmount: { type: Number, required: true }, // paise
    returnReason: { type: String },
    itemCondition: {
        type: String,
        enum: ['sellable', 'damaged', 'opened', 'pending_inspection'],
        default: 'pending_inspection',
    },
    stockDisposition: {
        type: String,
        enum: ['restock', 'discard', 'pending'],
        default: 'pending',
    },
    stockRestored: { type: Boolean, default: false },
    notes: { type: String },
    isProcessed: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
returnOrderSchema.index({ businessAccount: 1, returnDate: -1 });
returnOrderSchema.index({ product: 1 });
returnOrderSchema.index({ originalOrder: 1 });
exports.ReturnOrder = mongoose_1.default.model('ReturnOrder', returnOrderSchema);
//# sourceMappingURL=ReturnOrder.js.map