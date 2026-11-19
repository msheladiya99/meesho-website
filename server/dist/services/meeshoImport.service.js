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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMeeshoSampleTemplate = exports.importMeeshoOrdersAndReturns = exports.parseMeeshoWorkbook = exports.parseMeeshoRawRows = exports.mapMeeshoStatus = exports.parsePriceToPaise = exports.parseFlexibleDate = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const XLSX = __importStar(require("xlsx"));
const Order_1 = require("../models/Order");
const ReturnOrder_1 = require("../models/ReturnOrder");
const Product_1 = require("../models/Product");
const StockPurchase_1 = require("../models/StockPurchase");
const Category_1 = require("../models/Category");
const PackingRecord_1 = require("../models/PackingRecord");
const inventory_service_1 = require("./inventory.service");
const qrScanner_service_1 = require("./qrScanner.service");
const audit_service_1 = require("./audit.service");
const customerReturnCharge_service_1 = require("./customerReturnCharge.service");
// Generate return transaction ID (RET-YYYYMMDD-XXXXX)
const generateReturnTxId = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `RET-${dateStr}-${rand}`;
};
// Normalize header strings for flexible matching
const normalizeHeader = (header) => header
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
// Parse dates across various Excel and string formats
const parseFlexibleDate = (raw) => {
    if (!raw)
        return new Date();
    // Excel serial date number (e.g. 45231)
    if (typeof raw === 'number' && raw > 30000 && raw < 80000) {
        const epoch = new Date(Math.round((raw - 25569) * 86400 * 1000));
        if (!isNaN(epoch.getTime()))
            return epoch;
    }
    const str = String(raw).trim();
    if (!str)
        return new Date();
    // Format: DD-MM-YYYY or DD/MM/YYYY with optional time
    const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10) - 1;
        const year = parseInt(dmyMatch[3], 10);
        const hour = parseInt(dmyMatch[4] || '0', 10);
        const min = parseInt(dmyMatch[5] || '0', 10);
        const sec = parseInt(dmyMatch[6] || '0', 10);
        const d = new Date(year, month, day, hour, min, sec);
        if (!isNaN(d.getTime()))
            return d;
    }
    // Standard JS Date parse (handles ISO, YYYY-MM-DD, etc.)
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime()))
        return parsed;
    return new Date();
};
exports.parseFlexibleDate = parseFlexibleDate;
// Parse price from string/number to paise
const parsePriceToPaise = (raw) => {
    if (typeof raw === 'number') {
        return Math.max(0, Math.round(raw * 100));
    }
    if (!raw)
        return 0;
    const cleaned = String(raw).replace(/[^0-9.]/g, '');
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : Math.max(0, Math.round(val * 100));
};
exports.parsePriceToPaise = parsePriceToPaise;
// Map Meesho raw status and return hints to internal OrderStatus and Return metadata
const mapMeeshoStatus = (rawStatusStr, rawReturnTypeStr, rawReturnStatusStr, deliveredDateVal, returnReasonStr) => {
    const combined = `${rawStatusStr || ''} ${rawReturnTypeStr || ''} ${rawReturnStatusStr || ''}`.toLowerCase();
    const hasDeliveredDate = deliveredDateVal !== undefined &&
        deliveredDateVal !== null &&
        String(deliveredDateVal).trim() !== '' &&
        !['na', 'null', 'n/a', 'undefined', '-'].includes(String(deliveredDateVal).trim().toLowerCase());
    // Check RTO return hints
    if (combined.includes('rto') ||
        combined.includes('courier return') ||
        combined.includes('undelivered') ||
        (rawReturnTypeStr && /rto|courier/i.test(rawReturnTypeStr))) {
        const isCompleted = hasDeliveredDate ||
            combined.includes('deliver') ||
            combined.includes('received') ||
            combined.includes('complete') ||
            combined.includes('closed');
        return {
            orderStatus: isCompleted ? 'rto_received' : 'rto_in_transit',
            isReturn: true,
            returnType: 'rto_return',
            returnStatus: isCompleted ? 'stock_updated' : 'return_initiated',
            itemCondition: isCompleted ? 'sellable' : 'pending_inspection',
        };
    }
    // Check Customer Return hints
    if (combined.includes('customer return') ||
        combined.includes('cust return') ||
        combined.includes('returned') ||
        combined.includes('return received') ||
        combined.includes('return delivered') ||
        combined.includes('return initiated') ||
        (rawReturnTypeStr && /customer/i.test(rawReturnTypeStr)) ||
        (rawReturnStatusStr && rawReturnStatusStr.trim() !== '')) {
        const isCompleted = hasDeliveredDate ||
            combined.includes('deliver') ||
            combined.includes('received') ||
            combined.includes('complete');
        // Check if reason indicates defective / damaged product
        const combinedReason = `${returnReasonStr || ''} ${combined}`.toLowerCase();
        const isDamagedReason = /defect|damag|broken|torn|stain|dirty|wrong/i.test(combinedReason);
        return {
            orderStatus: 'returned',
            isReturn: true,
            returnType: 'customer_return',
            returnStatus: isCompleted ? 'stock_updated' : 'return_initiated',
            itemCondition: isCompleted ? (isDamagedReason ? 'damaged' : 'sellable') : 'pending_inspection',
        };
    }
    // Cancelled orders
    if (combined.includes('cancel')) {
        return { orderStatus: 'cancelled', isReturn: false };
    }
    // Delivered orders
    if (combined.includes('deliver')) {
        return { orderStatus: 'delivered', isReturn: false };
    }
    // Shipped / In Transit / Dispatched orders
    if (combined.includes('shipped') ||
        combined.includes('transit') ||
        combined.includes('dispatched') ||
        combined.includes('out for delivery')) {
        return { orderStatus: 'dispatched', isReturn: false };
    }
    // Packed / Ready to Ship orders
    if (combined.includes('packed') ||
        combined.includes('ready to ship') ||
        combined.includes('ready_to_ship') ||
        combined.includes('manifested')) {
        return { orderStatus: 'packed', isReturn: false };
    }
    // Default: Pending
    return { orderStatus: 'pending', isReturn: false };
};
exports.mapMeeshoStatus = mapMeeshoStatus;
// Column alias mappings for Meesho reports
const COLUMN_ALIASES = {
    subOrderId: [
        'suborderno',
        'suborderid',
        'subordernumber',
        'suborder',
        'suborderref',
        'orderno',
        'orderid',
        'meeshoorderid',
        'suborders',
    ],
    meeshoOrderId: [
        'meeshoorderid',
        'ordernumber',
        'parentorderid',
        'orderid',
        'orderno',
    ],
    orderDate: [
        'orderdate',
        'orderdatetime',
        'orderplaceddate',
        'ordercreateddate',
        'createddate',
        'dispatchdate',
        'date',
        'orderedon',
    ],
    sku: [
        'sku',
        'productsku',
        'suppliersku',
        'skuid',
        'itemsku',
        'merchantsku',
        'catalogsku',
    ],
    productName: [
        'productname',
        'producttitle',
        'catalogname',
        'itemname',
        'title',
        'description',
        'itemdescription',
    ],
    quantity: [
        'quantity',
        'qty',
        'productquantity',
        'orderqty',
        'itemqty',
        'orderquantity',
    ],
    sellingPrice: [
        'supplierdiscountedpriceinclgstandcommision',
        'supplierdiscountedpriceinclgstandcommission',
        'supplierdiscountedprice',
        'supplierlistedpriceinclgstcommission',
        'supplierlistedprice',
        'discountedprice',
        'listedprice',
        'totalamount',
        'supplierprice',
        'sellingprice',
        'productprice',
        'customerprice',
        'customerfinalprice',
        'amount',
        'ordervalue',
        'price',
        'grossamount',
        'finalamount',
    ],
    status: [
        'reasonforcreditentry',
        'reasonforcredit',
        'creditentryreason',
        'suborderstatus',
        'orderstatus',
        'status',
        'currentstatus',
        'itemstatus',
        'trackingstatus',
    ],
    shippingLabelId: [
        'packetid',
        'awbno',
        'awbnumber',
        'awb',
        'waybillno',
        'waybill',
        'trackingid',
        'trackingnumber',
        'trackingno',
        'shippinglabelid',
        'shippinglabel',
        'barcode',
    ],
    carrierName: [
        'courierpartner',
        'logisticspartner',
        'courier',
        'carrier',
        'carriername',
        'deliverypartner',
        'logistics',
        '3plpartner',
    ],
    returnType: [
        'returntype',
        'typeofreturn',
        'returntypename',
    ],
    returnStatus: [
        'returnstatus',
        'returntrackingstatus',
        'returnorderstatus',
        'subtype',
    ],
    returnDate: [
        'delivereddate',
        'returndate',
        'returncreateddate',
        'returndeliverydate',
        'rtodelivereddate',
        'rtodate',
        'dispatchdate',
    ],
    deliveredDate: [
        'delivereddate',
        'returndeliverydate',
        'rtodelivereddate',
        'otpverifiedat',
    ],
    returnCreatedDate: [
        'returncreateddate',
        'returndate',
    ],
    returnReason: [
        'returnreason',
        'detailedreturnreason',
        'reasonforreturn',
        'reason',
    ],
    detailedReturnReason: [
        'detailedreturnreason',
    ],
};
// Find matching key in raw row using aliases
const findMatchingField = (rawRow, aliases) => {
    const keys = Object.keys(rawRow);
    for (const alias of aliases) {
        for (const key of keys) {
            if (normalizeHeader(key) === alias) {
                const val = rawRow[key];
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                    return val;
                }
            }
        }
    }
    return undefined;
};
// Convert raw row array (e.g. from XLSX.utils.sheet_to_json) into ParsedMeeshoRow[]
const parseMeeshoRawRows = (rawRows, options) => {
    const parsedRows = [];
    const skipHoldAndReady = options?.skipHoldAndReadyToShip !== false;
    for (let i = 0; i < rawRows.length; i++) {
        const raw = rawRows[i];
        const rowNum = i + 2; // assuming row 1 is header
        const subOrderVal = findMatchingField(raw, COLUMN_ALIASES.subOrderId);
        if (!subOrderVal)
            continue; // Skip blank or invalid rows
        const statusVal = findMatchingField(raw, COLUMN_ALIASES.status);
        const rawStatus = statusVal ? String(statusVal).trim() : undefined;
        // Filter out HOLD, READY_TO_SHIP, and CANCELLED orders by default (only add shipped, delivered, and returns)
        if (skipHoldAndReady && rawStatus) {
            const upper = rawStatus.toUpperCase();
            if (upper === 'HOLD' ||
                upper.includes('HOLD') ||
                upper === 'READY_TO_SHIP' ||
                upper.includes('READY TO SHIP') ||
                upper.includes('READY_TO_SHIP') ||
                upper === 'CANCELLED' ||
                upper.includes('CANCEL')) {
                continue;
            }
        }
        const subOrderId = String(subOrderVal).trim();
        const meeshoOrderVal = findMatchingField(raw, COLUMN_ALIASES.meeshoOrderId);
        const meeshoOrderId = meeshoOrderVal ? String(meeshoOrderVal).trim() : subOrderId.split('_')[0];
        const skuVal = findMatchingField(raw, COLUMN_ALIASES.sku);
        const prodNameVal = findMatchingField(raw, COLUMN_ALIASES.productName);
        const sku = skuVal ? String(skuVal).trim().toUpperCase() : 'MEESHO-ITEM';
        const productName = prodNameVal ? String(prodNameVal).trim() : sku;
        const qtyVal = findMatchingField(raw, COLUMN_ALIASES.quantity);
        const quantity = qtyVal ? Math.max(1, parseInt(String(qtyVal), 10) || 1) : 1;
        const priceVal = findMatchingField(raw, COLUMN_ALIASES.sellingPrice);
        const sellingPrice = (0, exports.parsePriceToPaise)(priceVal);
        const dateVal = findMatchingField(raw, COLUMN_ALIASES.orderDate);
        const orderDate = (0, exports.parseFlexibleDate)(dateVal);
        const awbVal = findMatchingField(raw, COLUMN_ALIASES.shippingLabelId);
        const shippingLabelId = awbVal ? String(awbVal).trim() : undefined;
        const carrierVal = findMatchingField(raw, COLUMN_ALIASES.carrierName);
        const carrierName = carrierVal ? String(carrierVal).trim() : undefined;
        const returnTypeVal = findMatchingField(raw, COLUMN_ALIASES.returnType);
        const returnStatusVal = findMatchingField(raw, COLUMN_ALIASES.returnStatus);
        const returnReasonVal = findMatchingField(raw, COLUMN_ALIASES.returnReason);
        const detailedReasonVal = findMatchingField(raw, COLUMN_ALIASES.detailedReturnReason);
        const deliveredDateVal = findMatchingField(raw, COLUMN_ALIASES.deliveredDate);
        const returnCreatedDateVal = findMatchingField(raw, COLUMN_ALIASES.returnCreatedDate);
        const returnDateVal = findMatchingField(raw, COLUMN_ALIASES.returnDate);
        // Combine return reasons cleanly
        const rReason = returnReasonVal && String(returnReasonVal).trim().toUpperCase() !== 'NA'
            ? String(returnReasonVal).trim()
            : '';
        const dReason = detailedReasonVal && String(detailedReasonVal).trim().toUpperCase() !== 'NA'
            ? String(detailedReasonVal).trim()
            : '';
        const combinedReason = rReason && dReason && rReason !== dReason
            ? `${rReason} - ${dReason}`
            : rReason || dReason || undefined;
        // Filter out HOLD, READY_TO_SHIP, and CANCELLED orders by default (only add shipped, delivered, and returns)
        // IMPORTANT: If row has return hints, NEVER skip it!
        const hasReturnHint = Boolean(returnTypeVal) ||
            (rawStatus && /return|rto|courier/i.test(rawStatus)) ||
            Boolean(deliveredDateVal && !['na', 'null', 'n/a', '-'].includes(String(deliveredDateVal).toLowerCase().trim()));
        if (skipHoldAndReady && rawStatus && !hasReturnHint) {
            const upper = rawStatus.toUpperCase();
            if (upper === 'HOLD' ||
                upper.includes('HOLD') ||
                upper === 'READY_TO_SHIP' ||
                upper.includes('READY TO SHIP') ||
                upper.includes('READY_TO_SHIP') ||
                upper === 'CANCELLED' ||
                upper.includes('CANCEL')) {
                continue;
            }
        }
        const { orderStatus, isReturn, returnType, returnStatus, itemCondition } = (0, exports.mapMeeshoStatus)(rawStatus, returnTypeVal ? String(returnTypeVal) : undefined, returnStatusVal ? String(returnStatusVal) : undefined, deliveredDateVal, combinedReason);
        // Determine the most accurate return date
        let returnDate = undefined;
        if (isReturn) {
            if (deliveredDateVal && !['na', 'null', 'n/a', '-'].includes(String(deliveredDateVal).toLowerCase().trim())) {
                returnDate = (0, exports.parseFlexibleDate)(deliveredDateVal);
            }
            else if (returnCreatedDateVal && !['na', 'null', 'n/a', '-'].includes(String(returnCreatedDateVal).toLowerCase().trim())) {
                returnDate = (0, exports.parseFlexibleDate)(returnCreatedDateVal);
            }
            else if (returnDateVal && !['na', 'null', 'n/a', '-'].includes(String(returnDateVal).toLowerCase().trim())) {
                returnDate = (0, exports.parseFlexibleDate)(returnDateVal);
            }
            else {
                returnDate = orderDate;
            }
        }
        parsedRows.push({
            rowNumber: rowNum,
            subOrderId,
            meeshoOrderId,
            orderDate,
            sku,
            productName,
            quantity,
            sellingPrice,
            status: orderStatus,
            carrierName,
            shippingLabelId,
            isReturn,
            returnType,
            returnStatus,
            returnDate,
            returnReason: combinedReason,
            itemCondition,
            rawStatus,
        });
    }
    return parsedRows;
};
exports.parseMeeshoRawRows = parseMeeshoRawRows;
// Parse an Excel Buffer (xlsx, xls, csv) into ParsedMeeshoRow[]
const parseMeeshoWorkbook = (buffer, options) => {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName)
        return [];
    const worksheet = workbook.Sheets[firstSheetName];
    const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!aoa || aoa.length === 0)
        return [];
    // Dynamic header detection: scans up to the first 25 rows
    // to find the actual table header row (e.g. skips top metadata rows in Meesho Return sheets)
    let headerRowIndex = 0;
    for (let r = 0; r < Math.min(aoa.length, 25); r++) {
        const row = aoa[r];
        if (!Array.isArray(row))
            continue;
        const normalizedCells = row.map((c) => String(c)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, ''));
        const hasSubOrder = normalizedCells.some((c) => c.includes('suborder') || c === 'orderno' || c === 'orderid' || c === 'subordernumber');
        const hasSkuOrProduct = normalizedCells.some((c) => c.includes('sku') || c.includes('product') || c.includes('item'));
        const hasReturnOrStatus = normalizedCells.some((c) => c.includes('return') || c.includes('status') || c.includes('awb') || c.includes('courier'));
        if ((hasSubOrder && (hasSkuOrProduct || hasReturnOrStatus)) ||
            (hasSkuOrProduct && hasReturnOrStatus)) {
            headerRowIndex = r;
            break;
        }
    }
    const headers = (aoa[headerRowIndex] || []).map((h) => String(h).trim());
    const rawRows = [];
    for (let r = headerRowIndex + 1; r < aoa.length; r++) {
        const row = aoa[r];
        if (!Array.isArray(row) || row.every((c) => String(c).trim() === ''))
            continue;
        const obj = {};
        headers.forEach((h, idx) => {
            if (h)
                obj[h] = row[idx] !== undefined ? row[idx] : '';
        });
        rawRows.push(obj);
    }
    return (0, exports.parseMeeshoRawRows)(rawRows, options);
};
exports.parseMeeshoWorkbook = parseMeeshoWorkbook;
// Core Execution: Process parsed Meesho rows into Database (Orders & Returns)
const importMeeshoOrdersAndReturns = async (params) => {
    const { businessAccount, rows, userId, skipHoldAndReadyToShip = true } = params;
    // Filter out HOLD, READY_TO_SHIP, and CANCELLED rows if enabled
    const activeRows = skipHoldAndReadyToShip
        ? rows.filter((r) => {
            if (r.isReturn)
                return true; // Always process returns
            const upper = (r.rawStatus || '').toUpperCase();
            return !(upper === 'HOLD' ||
                upper.includes('HOLD') ||
                upper === 'READY_TO_SHIP' ||
                upper.includes('READY TO SHIP') ||
                upper.includes('READY_TO_SHIP') ||
                upper === 'CANCELLED' ||
                upper.includes('CANCEL'));
        })
        : rows;
    const summary = {
        totalRows: activeRows.length,
        ordersCreated: 0,
        ordersUpdated: 0,
        ordersSkipped: rows.length - activeRows.length,
        returnsCreated: 0,
        rtoCreated: 0,
        customerReturnsCreated: 0,
        productsAutoCreated: 0,
        errors: [],
    };
    // Default category resolution for new products
    let defaultCategory = await Category_1.Category.findOne({ isActive: true });
    if (!defaultCategory) {
        defaultCategory = await Category_1.Category.create({ name: 'Perfumes', isActive: true });
    }
    // Fetch latest stock purchase price as baseline for auto-created products
    const latestPurchase = await StockPurchase_1.StockPurchase.findOne({
        isDeleted: false,
        purchasePricePerUnit: { $gt: 0 },
    }).sort({ purchaseDate: -1, createdAt: -1 }).select('purchasePricePerUnit').lean();
    const fallbackStockPurchaseCost = latestPurchase?.purchasePricePerUnit || 5500;
    // Product cache to minimize DB queries
    const productCache = new Map();
    for (const row of activeRows) {
        try {
            // 1. Resolve Product by SKU or Name (or Auto-Create)
            const skuKey = row.sku.toUpperCase();
            let product = productCache.get(skuKey);
            if (!product) {
                product = await Product_1.Product.findOne({
                    sku: { $regex: `^${skuKey.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, $options: 'i' },
                });
                // Flexible alphanumeric matching (e.g. 'Choco Musk-01' matches 'CHOCO_MUSK01')
                if (!product) {
                    const stripped = skuKey.replace(/[^A-Z0-9]/g, '');
                    if (stripped.length >= 4) {
                        const flexPattern = stripped.split('').join('[-_\\s]?');
                        product = await Product_1.Product.findOne({
                            sku: { $regex: `^${flexPattern}$`, $options: 'i' },
                        });
                    }
                }
                if (!product && row.productName) {
                    product = await Product_1.Product.findOne({
                        name: { $regex: `^${row.productName.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, $options: 'i' },
                    });
                }
                // Auto-create product if not yet in database
                if (!product) {
                    const sizeMatch = (row.productName + ' ' + row.sku).match(/(\d+)\s*ml/i);
                    const sizeml = sizeMatch ? parseInt(sizeMatch[1], 10) : 50;
                    // Scale cost if it's a 2-bottle combo (e.g. 100ml = 2x 50ml) or standard 50ml
                    const bottleMultiplier = sizeml > 50 ? Math.round(sizeml / 50) : 1;
                    const actualCost = fallbackStockPurchaseCost * bottleMultiplier;
                    product = await Product_1.Product.create({
                        name: row.productName || row.sku,
                        sku: skuKey,
                        category: defaultCategory._id,
                        sizeml: sizeml || 50,
                        sellingPrice: row.sellingPrice || 11000,
                        defaultPurchaseCost: actualCost,
                        weightedAvgCost: actualCost,
                        currentStock: 0,
                        isActive: true,
                    });
                    summary.productsAutoCreated++;
                }
                productCache.set(skuKey, product);
            }
            // 2. Resolve Existing Order by Sub Order ID (or shipping label)
            let orderDoc = await Order_1.Order.findOne({
                isDeleted: false,
                subOrderId: row.subOrderId,
            });
            if (!orderDoc && row.shippingLabelId) {
                orderDoc = await Order_1.Order.findOne({
                    isDeleted: false,
                    businessAccount,
                    shippingLabelId: row.shippingLabelId,
                });
            }
            let orderJustCreated = false;
            if (!orderDoc) {
                // Create New Order
                const tempId = new mongoose_1.default.Types.ObjectId();
                const internalQrCode = (0, qrScanner_service_1.generateInternalQrCode)(tempId.toString(), product.sku);
                orderDoc = await Order_1.Order.create({
                    _id: tempId,
                    businessAccount,
                    orderDate: row.orderDate,
                    subOrderId: row.subOrderId,
                    meeshoOrderId: row.meeshoOrderId || row.subOrderId.split('_')[0],
                    shippingLabelId: row.shippingLabelId,
                    carrierName: row.carrierName,
                    internalQrCode,
                    product: product._id,
                    sku: product.sku,
                    quantity: row.quantity,
                    sellingPrice: row.sellingPrice || product.sellingPrice,
                    grossAmount: (row.sellingPrice || product.sellingPrice) * row.quantity,
                    status: row.status,
                    stockDeducted: row.status !== 'cancelled',
                    packedQuantity: ['packed', 'dispatched', 'delivered'].includes(row.status) ? row.quantity : 0,
                    packedAt: row.status !== 'pending' && row.status !== 'cancelled' ? row.orderDate : undefined,
                    dispatchedAt: ['dispatched', 'delivered'].includes(row.status) ? row.orderDate : undefined,
                    createdBy: userId,
                });
                // Record stock movement for new order if not cancelled
                if (row.status !== 'cancelled') {
                    await (0, inventory_service_1.recordStockMovement)({
                        businessAccount,
                        productId: product._id.toString(),
                        movementType: 'sale',
                        quantity: -row.quantity,
                        unitCost: product.weightedAvgCost || product.defaultPurchaseCost,
                        referenceType: 'Order',
                        referenceId: orderDoc._id.toString(),
                        reason: `Meesho Excel Import: ${row.subOrderId} (${product.sku} x${row.quantity})`,
                        createdBy: userId,
                    });
                }
                // If order was already packed, record a packing entry
                if (row.status === 'packed') {
                    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
                    await PackingRecord_1.PackingRecord.create({
                        transactionId: `PCK-${dateStr}-${rand}`,
                        businessAccount,
                        order: orderDoc._id,
                        product: product._id,
                        sku: product.sku,
                        packedQuantity: row.quantity,
                        scannedCode: row.shippingLabelId || row.subOrderId || internalQrCode,
                        scanType: row.shippingLabelId ? 'carrier_label' : 'internal_qr',
                        operator: userId,
                        notes: 'Imported from Meesho Excel',
                    });
                }
                orderJustCreated = true;
                summary.ordersCreated++;
            }
            else {
                // Order already exists: check if status or tracking should be updated
                let needsSave = false;
                if (row.status && orderDoc.status !== row.status) {
                    orderDoc.status = row.status;
                    needsSave = true;
                }
                if (row.shippingLabelId && !orderDoc.shippingLabelId) {
                    orderDoc.shippingLabelId = row.shippingLabelId;
                    needsSave = true;
                }
                if (row.carrierName && !orderDoc.carrierName) {
                    orderDoc.carrierName = row.carrierName;
                    needsSave = true;
                }
                if (needsSave) {
                    await orderDoc.save();
                    summary.ordersUpdated++;
                }
                else {
                    summary.ordersSkipped++;
                }
            }
            // 3. Process Return Entry if row is an RTO or Customer Return
            if (row.isReturn) {
                const isCompleted = row.returnStatus === 'stock_updated';
                const isDamaged = isCompleted && row.itemCondition === 'damaged';
                const shouldRestock = isCompleted && row.itemCondition === 'sellable';
                const goodQty = shouldRestock ? row.quantity : 0;
                const dmgQty = isDamaged ? row.quantity : 0;
                const pendQty = shouldRestock || isDamaged ? 0 : row.quantity;
                // Check if return entry already exists
                const existingReturn = await ReturnOrder_1.ReturnOrder.findOne({
                    originalOrder: orderDoc._id,
                    isDeleted: false,
                });
                if (!existingReturn) {
                    const returnTxId = generateReturnTxId();
                    await ReturnOrder_1.ReturnOrder.create({
                        returnTransactionId: returnTxId,
                        businessAccount,
                        returnDate: row.returnDate || row.orderDate,
                        returnType: row.returnType || 'customer_return',
                        status: row.returnStatus || (shouldRestock || isDamaged ? 'stock_updated' : 'inspection_pending'),
                        originalOrder: orderDoc._id,
                        meeshoOrderId: orderDoc.meeshoOrderId || row.subOrderId,
                        carrierTrackingId: row.shippingLabelId,
                        product: product._id,
                        returnedQuantity: row.quantity,
                        goodQuantity: goodQty,
                        damagedQuantity: dmgQty,
                        pendingInspectionQuantity: pendQty,
                        originalSellingPrice: row.sellingPrice || product.sellingPrice,
                        returnAmount: (row.sellingPrice || product.sellingPrice) * row.quantity,
                        returnReason: row.returnReason ||
                            (row.returnType === 'rto_return'
                                ? 'RTO Return imported from Meesho Excel'
                                : 'Customer Return imported from Meesho Excel'),
                        itemCondition: row.itemCondition || (isDamaged ? 'damaged' : shouldRestock ? 'sellable' : 'pending_inspection'),
                        stockDisposition: isDamaged ? 'discard' : shouldRestock ? 'restock' : 'pending',
                        stockRestored: shouldRestock,
                        damagedStockRestored: isDamaged,
                        createdBy: userId,
                    });
                    // If condition is good/restock, add back to saleable stock ledger
                    if (shouldRestock && goodQty > 0) {
                        await (0, inventory_service_1.recordStockMovement)({
                            businessAccount,
                            productId: product._id.toString(),
                            movementType: 'return_in',
                            stockBucket: 'saleable',
                            quantity: goodQty,
                            referenceType: 'ReturnOrder',
                            reason: `Meesho Excel Import Return: ${row.subOrderId} (${product.sku} x${goodQty})`,
                            createdBy: userId,
                        });
                    }
                    // If condition is damaged, record to damaged stock bucket
                    if (isDamaged && dmgQty > 0) {
                        await (0, inventory_service_1.recordStockMovement)({
                            businessAccount,
                            productId: product._id.toString(),
                            movementType: 'return_damaged',
                            stockBucket: 'damaged',
                            quantity: dmgQty,
                            referenceType: 'ReturnOrder',
                            reason: `Meesho Excel Import Damaged Return: ${row.subOrderId} (${product.sku} x${dmgQty})`,
                            createdBy: userId,
                        });
                    }
                    // If awaiting inspection, record to pending stock bucket so subsequent inspection does not crash
                    if (pendQty > 0) {
                        await (0, inventory_service_1.recordStockMovement)({
                            businessAccount,
                            productId: product._id.toString(),
                            movementType: 'return_in',
                            stockBucket: 'pending',
                            quantity: pendQty,
                            referenceType: 'ReturnOrder',
                            reason: `Meesho Excel Import RTO Awaiting Inspection: ${row.subOrderId} (${product.sku} x${pendQty})`,
                            createdBy: userId,
                        });
                    }
                    // Ensure order status reflects return state
                    if (row.returnType === 'rto_return') {
                        orderDoc.status = isCompleted ? 'rto_received' : 'rto_in_transit';
                        await orderDoc.save();
                    }
                    else if (row.returnType === 'customer_return' && orderDoc.status !== 'returned') {
                        orderDoc.status = 'returned';
                        await orderDoc.save();
                    }
                    // Apply Customer Return Charge if customer return
                    if (row.returnType === 'customer_return') {
                        await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({
                            orderId: orderDoc._id,
                            returnedQuantity: row.quantity,
                            returnDate: row.returnDate || row.orderDate,
                            userId,
                        });
                    }
                    summary.returnsCreated++;
                    if (row.returnType === 'rto_return') {
                        summary.rtoCreated++;
                    }
                    else {
                        summary.customerReturnsCreated++;
                    }
                }
                else {
                    // If return exists, check if it transitioned from in_transit to delivered
                    if ((existingReturn.status === 'return_initiated' || existingReturn.status === 'inspection_pending') &&
                        row.returnStatus === 'stock_updated') {
                        existingReturn.status = 'stock_updated';
                        existingReturn.itemCondition = row.itemCondition || (isDamaged ? 'damaged' : 'sellable');
                        existingReturn.stockDisposition = isDamaged ? 'discard' : shouldRestock ? 'restock' : 'pending';
                        existingReturn.returnDate = row.returnDate || existingReturn.returnDate;
                        if (row.shippingLabelId && !existingReturn.carrierTrackingId) {
                            existingReturn.carrierTrackingId = row.shippingLabelId;
                        }
                        if (row.returnReason && (!existingReturn.returnReason || existingReturn.returnReason.includes('imported from Meesho'))) {
                            existingReturn.returnReason = row.returnReason;
                        }
                        if (shouldRestock && !existingReturn.stockRestored && goodQty > 0) {
                            existingReturn.goodQuantity = goodQty;
                            existingReturn.pendingInspectionQuantity = 0;
                            existingReturn.stockRestored = true;
                            await (0, inventory_service_1.recordStockMovement)({
                                businessAccount,
                                productId: product._id.toString(),
                                movementType: 'return_in',
                                stockBucket: 'saleable',
                                quantity: goodQty,
                                referenceType: 'ReturnOrder',
                                reason: `Meesho Return Delivered Update: ${row.subOrderId} (${product.sku} x${goodQty})`,
                                createdBy: userId,
                            });
                        }
                        else if (isDamaged && !existingReturn.damagedStockRestored && dmgQty > 0) {
                            existingReturn.damagedQuantity = dmgQty;
                            existingReturn.pendingInspectionQuantity = 0;
                            existingReturn.damagedStockRestored = true;
                            await (0, inventory_service_1.recordStockMovement)({
                                businessAccount,
                                productId: product._id.toString(),
                                movementType: 'return_damaged',
                                stockBucket: 'damaged',
                                quantity: dmgQty,
                                referenceType: 'ReturnOrder',
                                reason: `Meesho Damaged Return Delivered Update: ${row.subOrderId} (${product.sku} x${dmgQty})`,
                                createdBy: userId,
                            });
                        }
                        await existingReturn.save();
                        summary.returnsCreated++;
                        if (row.returnType === 'rto_return') {
                            summary.rtoCreated++;
                        }
                        else {
                            summary.customerReturnsCreated++;
                        }
                    }
                }
            }
        }
        catch (err) {
            summary.errors.push({
                rowNumber: row.rowNumber,
                subOrderId: row.subOrderId,
                error: err.message || 'Unknown error processing row',
            });
        }
    }
    // Audit log for this import
    await (0, audit_service_1.createAuditLog)({
        action: 'CREATE',
        resource: 'Order',
        resourceId: businessAccount,
        userId,
        details: `Meesho Excel Import: ${summary.ordersCreated} created, ${summary.ordersUpdated} updated, ${summary.returnsCreated} returns created (${summary.errors.length} errors)`,
    });
    return summary;
};
exports.importMeeshoOrdersAndReturns = importMeeshoOrdersAndReturns;
// Generate a downloadable sample Meesho Excel file Buffer
const generateMeeshoSampleTemplate = () => {
    const sampleData = [
        {
            'Sub Order No': '1084521980_1',
            'Order Date': new Date().toISOString().split('T')[0],
            'SKU': 'AQUA-COOL-100ML',
            'Product Name': 'Aqua Cool Men Luxury Perfume 100ml',
            'Quantity': 1,
            'Selling Price': 499,
            'Sub Order Status': 'Delivered',
            'AWB No': 'SF198273641IN',
            'Courier Partner': 'Shadowfax',
            'Return Type': '',
            'Return Reason': '',
            'Return Date': '',
        },
        {
            'Sub Order No': '1084521981_1',
            'Order Date': new Date().toISOString().split('T')[0],
            'SKU': 'ROSE-GOLD-50ML',
            'Product Name': 'Rose Gold Floral Perfume 50ml',
            'Quantity': 2,
            'Selling Price': 349,
            'Sub Order Status': 'RTO Delivered',
            'AWB No': 'DEL1298471203',
            'Courier Partner': 'Delhivery',
            'Return Type': 'RTO',
            'Return Reason': 'Customer not available / address incomplete',
            'Return Date': new Date().toISOString().split('T')[0],
        },
        {
            'Sub Order No': '1084521982_1',
            'Order Date': new Date().toISOString().split('T')[0],
            'SKU': 'OUD-ROYAL-100ML',
            'Product Name': 'Oud Royal Arabic Perfume 100ml',
            'Quantity': 1,
            'Selling Price': 799,
            'Sub Order Status': 'Customer Return Delivered',
            'AWB No': 'XP987234125',
            'Courier Partner': 'Xpressbees',
            'Return Type': 'Customer Return',
            'Return Reason': 'Product fragrance not as expected',
            'Return Date': new Date().toISOString().split('T')[0],
        },
        {
            'Sub Order No': '1084521983_1',
            'Order Date': new Date().toISOString().split('T')[0],
            'SKU': 'AQUA-COOL-100ML',
            'Product Name': 'Aqua Cool Men Luxury Perfume 100ml',
            'Quantity': 1,
            'Selling Price': 499,
            'Sub Order Status': 'Dispatched',
            'AWB No': 'ECOM76129841',
            'Courier Partner': 'Ecom Express',
            'Return Type': '',
            'Return Reason': '',
            'Return Date': '',
        },
    ];
    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Meesho_Orders');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};
exports.generateMeeshoSampleTemplate = generateMeeshoSampleTemplate;
//# sourceMappingURL=meeshoImport.service.js.map