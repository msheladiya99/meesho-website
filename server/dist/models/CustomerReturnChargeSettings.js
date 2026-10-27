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
exports.CustomerReturnChargeSettings = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const customerReturnChargeSettingsSchema = new mongoose_1.Schema({
    isEnabled: { type: Boolean, default: true, required: true },
    calculationType: {
        type: String,
        enum: ['fixed_order', 'fixed_unit', 'percentage'],
        default: 'fixed_order',
        required: true,
    },
    chargeAmount: { type: Number, default: 0, min: 0 }, // in paise
    percentageRate: { type: Number, default: 0, min: 0, max: 100 },
    hasHandlingCharge: { type: Boolean, default: false },
    handlingCalculationType: {
        type: String,
        enum: ['fixed_order', 'fixed_unit'],
        default: 'fixed_order',
    },
    handlingChargeAmount: { type: Number, default: 0, min: 0 }, // in paise
    effectiveFrom: { type: Date, default: Date.now, required: true },
    businessAccountScope: {
        type: String,
        enum: ['all', 'selected'],
        default: 'all',
        required: true,
    },
    applicableAccounts: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'BusinessAccount' }],
    categoryScope: {
        type: String,
        enum: ['all', 'selected'],
        default: 'all',
        required: true,
    },
    applicableCategories: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'Category' }],
    settingsVersion: { type: Number, default: 1, required: true },
    notes: { type: String, trim: true },
    isDeleted: { type: Boolean, default: false },
    updatedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
customerReturnChargeSettingsSchema.index({ businessAccountScope: 1, isDeleted: 1, effectiveFrom: -1 });
exports.CustomerReturnChargeSettings = mongoose_1.default.model('CustomerReturnChargeSettings', customerReturnChargeSettingsSchema);
//# sourceMappingURL=CustomerReturnChargeSettings.js.map