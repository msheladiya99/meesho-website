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
exports.Payment = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const paymentOrderRefSchema = new mongoose_1.Schema({
    subOrderId: { type: String, required: true, trim: true },
    orderId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Order' },
    saleAmount: { type: Number, default: 0 },
    returnAmount: { type: Number, default: 0 },
    shippingOrWeightDeduction: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    matchStatus: {
        type: String,
        enum: ['matched', 'unmatched_order', 'underpaid', 'wrongful_return_deduction'],
        default: 'matched',
    },
    weightDiscrepancy: { type: Boolean, default: false },
    discrepancyReason: { type: String },
    expectedReceivable: { type: Number, default: 0 },
}, { _id: false });
const paymentSchema = new mongoose_1.Schema({
    businessAccount: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'BusinessAccount',
        required: true,
        index: true,
    },
    paymentDate: { type: Date, required: true, index: true },
    status: {
        type: String,
        enum: ['completed', 'upcoming', 'unscheduled'],
        default: 'completed',
        index: true,
    },
    neftId: { type: String, trim: true },
    bankName: { type: String, trim: true, default: 'Axis Bank' },
    bankAccountNumber: { type: String, trim: true },
    // Amounts in paise
    ordersAmount: { type: Number, required: true, default: 0 },
    salesAmount: { type: Number, default: 0 },
    returnsDeduction: { type: Number, default: 0 },
    adsCost: { type: Number, default: 0 },
    programCost: { type: Number, default: 0 },
    otherRecovery: { type: Number, default: 0 },
    programBenefits: { type: Number, default: 0 },
    referralEarnings: { type: Number, default: 0 },
    otherCompensation: { type: Number, default: 0 },
    netAmount: { type: Number, required: true, default: 0 },
    ordersCount: { type: Number, default: 0 },
    subOrderIds: [{ type: String, trim: true }],
    orderRefs: [paymentOrderRefSchema],
    notes: { type: String, trim: true },
    rawSource: {
        type: String,
        enum: ['manual', 'sheet_import', 'auto_calculated'],
        default: 'manual',
    },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
paymentSchema.index({ businessAccount: 1, paymentDate: -1 });
paymentSchema.index({ businessAccount: 1, status: 1, paymentDate: -1 });
paymentSchema.index({ businessAccount: 1, neftId: 1 }, {
    unique: true,
    partialFilterExpression: {
        neftId: { $type: 'string', $gt: '' },
        isDeleted: false,
    },
});
exports.Payment = mongoose_1.default.model('Payment', paymentSchema);
//# sourceMappingURL=Payment.js.map