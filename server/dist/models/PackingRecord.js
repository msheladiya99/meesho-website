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
exports.PackingRecord = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const packingRecordSchema = new mongoose_1.Schema({
    transactionId: { type: String, required: true, trim: true },
    businessAccount: { type: mongoose_1.Schema.Types.ObjectId, ref: 'BusinessAccount', required: true },
    order: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Order', required: true },
    product: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, required: true, uppercase: true },
    packedQuantity: { type: Number, required: true, min: 1 },
    scannedCode: { type: String, required: true, trim: true },
    scanType: {
        type: String,
        enum: ['internal_qr', 'carrier_label', 'meesho_order_id', 'order_id', 'manual'],
        default: 'carrier_label',
    },
    operator: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String },
}, { timestamps: true });
packingRecordSchema.index({ transactionId: 1 }, { unique: true });
packingRecordSchema.index({ businessAccount: 1, createdAt: -1 });
packingRecordSchema.index({ order: 1 });
packingRecordSchema.index({ product: 1 });
exports.PackingRecord = mongoose_1.default.model('PackingRecord', packingRecordSchema);
//# sourceMappingURL=PackingRecord.js.map