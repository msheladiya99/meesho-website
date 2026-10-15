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
exports.Order = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const orderSchema = new mongoose_1.Schema({
    businessAccount: { type: mongoose_1.Schema.Types.ObjectId, ref: 'BusinessAccount', required: true },
    orderDate: { type: Date, required: true },
    meeshoOrderId: { type: String, trim: true },
    product: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, required: true, uppercase: true },
    sellingPrice: { type: Number, required: true }, // paise
    quantity: { type: Number, required: true, min: 1 },
    grossAmount: { type: Number, required: true }, // paise
    status: { type: String, enum: ['pending', 'dispatched', 'delivered', 'cancelled', 'returned'], default: 'pending' },
    notes: { type: String },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
// Prevent duplicate Meesho order IDs within the same business account
orderSchema.index({ businessAccount: 1, meeshoOrderId: 1 }, {
    unique: true,
    partialFilterExpression: { meeshoOrderId: { $exists: true, $ne: null }, isDeleted: false },
});
orderSchema.index({ businessAccount: 1, orderDate: -1 });
orderSchema.index({ product: 1 });
orderSchema.index({ isDeleted: 1 });
exports.Order = mongoose_1.default.model('Order', orderSchema);
//# sourceMappingURL=Order.js.map