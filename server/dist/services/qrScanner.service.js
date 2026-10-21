"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordScanException = exports.generateInternalQrCode = exports.findOrderByScannedCode = exports.parseScannedCode = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Order_1 = require("../models/Order");
const ScanException_1 = require("../models/ScanException");
/**
 * Clean and parse scanned barcode or QR code strings from USB scanners,
 * camera streams, or mobile devices.
 */
const parseScannedCode = (input) => {
    if (!input) {
        return { rawCode: '', extractedIdentifier: '', format: 'plain', potentialOrderIds: [] };
    }
    // Remove USB scanner suffix characters (\r, \n) and whitespace
    const rawCode = input.replace(/[\r\n\t]/g, '').trim();
    const potentialOrderIds = new Set();
    potentialOrderIds.add(rawCode);
    // 1. Try parsing JSON (some marketplace QRs encode JSON metadata)
    if ((rawCode.startsWith('{') && rawCode.endsWith('}')) || (rawCode.startsWith('[') && rawCode.endsWith(']'))) {
        try {
            const parsed = JSON.parse(rawCode);
            if (typeof parsed === 'object' && parsed !== null) {
                const candidateKeys = [
                    'sub_order_no', 'subOrderNo', 'order_id', 'orderId',
                    'meesho_order_id', 'meeshoOrderId', 'awb', 'waybill',
                    'shipping_label_id', 'shippingLabelId', 'tracking_id', 'trackingId'
                ];
                for (const key of candidateKeys) {
                    if (parsed[key] && typeof parsed[key] === 'string') {
                        potentialOrderIds.add(parsed[key].trim());
                    }
                    else if (parsed[key] && typeof parsed[key] === 'number') {
                        potentialOrderIds.add(String(parsed[key]));
                    }
                }
                return {
                    rawCode,
                    extractedIdentifier: Array.from(potentialOrderIds)[1] || rawCode,
                    format: 'json',
                    potentialOrderIds: Array.from(potentialOrderIds),
                };
            }
        }
        catch {
            // Fall through if not valid JSON
        }
    }
    // 2. Try parsing URL (e.g., https://.../order?id=12345 or /tracking/12345)
    if (rawCode.startsWith('http://') || rawCode.startsWith('https://')) {
        try {
            const url = new URL(rawCode);
            const searchParams = url.searchParams;
            for (const [key, val] of searchParams.entries()) {
                if (/order|awb|track|id/i.test(key) && val) {
                    potentialOrderIds.add(val.trim());
                }
            }
            const segments = url.pathname.split('/').filter(Boolean);
            if (segments.length > 0) {
                potentialOrderIds.add(segments[segments.length - 1]);
            }
            return {
                rawCode,
                extractedIdentifier: Array.from(potentialOrderIds)[1] || rawCode,
                format: 'url',
                potentialOrderIds: Array.from(potentialOrderIds),
            };
        }
        catch {
            // Fall through
        }
    }
    // 3. Try parsing Delimited Key-Value strings (e.g. "ORD:12345|AWB:67890")
    if (rawCode.includes('|') || rawCode.includes(';') || rawCode.includes('#')) {
        const parts = rawCode.split(/[|;#]/);
        for (const part of parts) {
            const kv = part.split(/[:=]/);
            if (kv.length === 2) {
                potentialOrderIds.add(kv[1].trim());
            }
            else if (part.trim()) {
                potentialOrderIds.add(part.trim());
            }
        }
        return {
            rawCode,
            extractedIdentifier: Array.from(potentialOrderIds)[1] || rawCode,
            format: 'key_value',
            potentialOrderIds: Array.from(potentialOrderIds),
        };
    }
    return {
        rawCode,
        extractedIdentifier: rawCode,
        format: 'plain',
        potentialOrderIds: Array.from(potentialOrderIds),
    };
};
exports.parseScannedCode = parseScannedCode;
/**
 * Find order by scanned code with strict GSTIN account scoping.
 * Checks internal QR, shipping label ID, Meesho order ID, and internal Order ObjectId.
 * NEVER matches by product name or quantity alone.
 */
const findOrderByScannedCode = async (rawInput, businessAccountId, userAllowedAccounts) => {
    const parsed = (0, exports.parseScannedCode)(rawInput);
    const candidates = parsed.potentialOrderIds;
    // Build GSTIN account filter
    const accountFilter = {};
    if (businessAccountId && businessAccountId !== 'all') {
        accountFilter.businessAccount = new mongoose_1.default.Types.ObjectId(businessAccountId);
    }
    else if (userAllowedAccounts && userAllowedAccounts.length > 0) {
        accountFilter.businessAccount = {
            $in: userAllowedAccounts.map((id) => new mongoose_1.default.Types.ObjectId(id)),
        };
    }
    // 1. Check internal QR code
    let order = await Order_1.Order.findOne({
        isDeleted: false,
        internalQrCode: { $in: candidates },
        ...accountFilter,
    }).populate('product').populate('items.product').populate('businessAccount');
    if (order)
        return { order, matchedBy: 'internalQrCode' };
    // 2. Check shippingLabelId (AWB or barcode)
    order = await Order_1.Order.findOne({
        isDeleted: false,
        shippingLabelId: { $in: candidates },
        ...accountFilter,
    }).populate('product').populate('items.product').populate('businessAccount');
    if (order)
        return { order, matchedBy: 'shippingLabelId' };
    // 3. Check meeshoOrderId
    order = await Order_1.Order.findOne({
        isDeleted: false,
        meeshoOrderId: { $in: candidates },
        ...accountFilter,
    }).populate('product').populate('items.product').populate('businessAccount');
    if (order)
        return { order, matchedBy: 'meeshoOrderId' };
    // 3b. Check subOrderId
    order = await Order_1.Order.findOne({
        isDeleted: false,
        subOrderId: { $in: candidates },
        ...accountFilter,
    }).populate('product').populate('items.product').populate('businessAccount');
    if (order)
        return { order, matchedBy: 'subOrderId' };
    // 4. Check internal MongoDB _id if valid
    for (const cand of candidates) {
        if (mongoose_1.default.Types.ObjectId.isValid(cand) && cand.length === 24) {
            order = await Order_1.Order.findOne({
                _id: new mongoose_1.default.Types.ObjectId(cand),
                isDeleted: false,
                ...accountFilter,
            }).populate('product').populate('items.product').populate('businessAccount');
            if (order)
                return { order, matchedBy: '_id' };
        }
    }
    // Check if order exists in another account (wrong account scan)
    const orderInOtherAccount = await Order_1.Order.findOne({
        isDeleted: false,
        $or: [
            { internalQrCode: { $in: candidates } },
            { shippingLabelId: { $in: candidates } },
            { meeshoOrderId: { $in: candidates } },
            { subOrderId: { $in: candidates } },
        ],
    }).populate('businessAccount');
    if (orderInOtherAccount) {
        const otherAccount = orderInOtherAccount.businessAccount?.tradeName || orderInOtherAccount.businessAccount?.name || 'another account';
        return {
            order: null,
            matchedBy: null,
            exception: `Order belongs to ${otherAccount}. Switch to that GSTIN account to process this parcel.`,
        };
    }
    return { order: null, matchedBy: null, exception: 'Order Not Found' };
};
exports.findOrderByScannedCode = findOrderByScannedCode;
/**
 * Generate a unique internal QR code for an order.
 * Format: PKG-ORD-{shortId}-{timestamp}-{rand}
 */
const generateInternalQrCode = (orderId, sku) => {
    const shortId = orderId.toString().slice(-6).toUpperCase();
    const cleanSku = (sku || 'SKU').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `PKG-ORD-${cleanSku}-${shortId}-${rand}`;
};
exports.generateInternalQrCode = generateInternalQrCode;
/**
 * Log a scan exception for auditing and reports.
 */
const recordScanException = async (params) => {
    try {
        await ScanException_1.ScanException.create({
            businessAccount: params.businessAccount ? new mongoose_1.default.Types.ObjectId(params.businessAccount) : undefined,
            scannedCode: params.scannedCode,
            module: params.module,
            exceptionType: params.exceptionType,
            attemptedAction: params.attemptedAction,
            operator: params.operator ? new mongoose_1.default.Types.ObjectId(params.operator) : undefined,
            details: params.details,
        });
    }
    catch (err) {
        console.error('Failed to log scan exception:', err);
    }
};
exports.recordScanException = recordScanException;
//# sourceMappingURL=qrScanner.service.js.map