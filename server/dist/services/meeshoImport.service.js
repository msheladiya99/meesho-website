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
const Category_1 = require("../models/Category");
const PackingRecord_1 = require("../models/PackingRecord");
const inventory_service_1 = require("./inventory.service");
const qrScanner_service_1 = require("./qrScanner.service");
const audit_service_1 = require("./audit.service");
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
const mapMeeshoStatus = (rawStatusStr, rawReturnTypeStr, rawReturnStatusStr) => {
    const combined = `${rawStatusStr || ''} ${rawReturnTypeStr || ''} ${rawReturnStatusStr || ''}`.toLowerCase();
    // Check RTO return hints
    if (combined.includes('rto') ||
        combined.includes('courier return') ||
        combined.includes('undelivered') ||
        (rawReturnTypeStr && /rto/i.test(rawReturnTypeStr))) {
        const isCompleted = combined.includes('deliver') ||
            combined.includes('received') ||
            combined.includes('completed') ||
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
        const isCompleted = combined.includes('deliver') ||
            combined.includes('received') ||
            combined.includes('completed');
        return {
            orderStatus: 'returned',
            isReturn: true,
            returnType: 'customer_return',
            returnStatus: isCompleted ? 'stock_updated' : 'return_initiated',
            itemCondition: isCompleted ? 'sellable' : 'pending_inspection',
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
        'suborderstatus',
        'orderstatus',
        'status',
        'currentstatus',
        'itemstatus',
        'trackingstatus',
    ],
    shippingLabelId: [
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
    ],
    returnDate: [
        'returndate',
        'returncreateddate',
        'returndeliverydate',
        'rtodelivereddate',
        'rtodate',
    ],
    returnReason: [
        'returnreason',
        'detailedreturnreason',
        'reasonforreturn',
        'reason',
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
const parseMeeshoRawRows = (rawRows) => {
    const parsedRows = [];
    for (let i = 0; i < rawRows.length; i++) {
        const raw = rawRows[i];
        const rowNum = i + 2; // assuming row 1 is header
        const subOrderVal = findMatchingField(raw, COLUMN_ALIASES.subOrderId);
        if (!subOrderVal)
            continue; // Skip blank or invalid rows
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
        const statusVal = findMatchingField(raw, COLUMN_ALIASES.status);
        const rawStatus = statusVal ? String(statusVal).trim() : undefined;
        const returnTypeVal = findMatchingField(raw, COLUMN_ALIASES.returnType);
        const returnStatusVal = findMatchingField(raw, COLUMN_ALIASES.returnStatus);
        const returnReasonVal = findMatchingField(raw, COLUMN_ALIASES.returnReason);
        const returnDateVal = findMatchingField(raw, COLUMN_ALIASES.returnDate);
        const { orderStatus, isReturn, returnType, returnStatus, itemCondition } = (0, exports.mapMeeshoStatus)(rawStatus, returnTypeVal ? String(returnTypeVal) : undefined, returnStatusVal ? String(returnStatusVal) : undefined);
        const returnDate = returnDateVal ? (0, exports.parseFlexibleDate)(returnDateVal) : (isReturn ? orderDate : undefined);
        const returnReason = returnReasonVal ? String(returnReasonVal).trim() : undefined;
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
            returnReason,
            itemCondition,
            rawStatus,
        });
    }
    return parsedRows;
};
exports.parseMeeshoRawRows = parseMeeshoRawRows;
// Parse an Excel Buffer (xlsx, xls, csv) into ParsedMeeshoRow[]
const parseMeeshoWorkbook = (buffer) => {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName)
        return [];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    return (0, exports.parseMeeshoRawRows)(rawRows);
};
exports.parseMeeshoWorkbook = parseMeeshoWorkbook;
// Core Execution: Process parsed Meesho rows into Database (Orders & Returns)
const importMeeshoOrdersAndReturns = async (params) => {
    const { businessAccount, rows, userId } = params;
    const summary = {
        totalRows: rows.length,
        ordersCreated: 0,
        ordersUpdated: 0,
        ordersSkipped: 0,
        returnsCreated: 0,
        productsAutoCreated: 0,
        errors: [],
    };
    // Default category resolution for new products
    let defaultCategory = await Category_1.Category.findOne({ isActive: true });
    if (!defaultCategory) {
        defaultCategory = await Category_1.Category.create({ name: 'Perfumes', isActive: true });
    }
    // Product cache to minimize DB queries
    const productCache = new Map();
    for (const row of rows) {
        try {
            // 1. Resolve Product by SKU or Name (or Auto-Create)
            const skuKey = row.sku.toUpperCase();
            let product = productCache.get(skuKey);
            if (!product) {
                product = await Product_1.Product.findOne({
                    sku: { $regex: `^${skuKey.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, $options: 'i' },
                });
                if (!product && row.productName) {
                    product = await Product_1.Product.findOne({
                        name: { $regex: `^${row.productName.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, $options: 'i' },
                    });
                }
                // Auto-create product if not yet in database
                if (!product) {
                    const sizeMatch = (row.productName + ' ' + row.sku).match(/(\d+)\s*ml/i);
                    const sizeml = sizeMatch ? parseInt(sizeMatch[1], 10) : 100;
                    const estimatedCost = Math.round((row.sellingPrice || 49900) * 0.4);
                    product = await Product_1.Product.create({
                        name: row.productName || row.sku,
                        sku: skuKey,
                        category: defaultCategory._id,
                        sizeml: sizeml || 100,
                        sellingPrice: row.sellingPrice || 49900,
                        defaultPurchaseCost: estimatedCost,
                        weightedAvgCost: estimatedCost,
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
                // Prevent duplicate return creation for the same original order
                const existingReturn = await ReturnOrder_1.ReturnOrder.findOne({
                    originalOrder: orderDoc._id,
                    isDeleted: false,
                });
                if (!existingReturn) {
                    const returnTxId = generateReturnTxId();
                    const shouldRestock = row.returnStatus === 'stock_updated' && row.itemCondition === 'sellable';
                    const goodQty = shouldRestock ? row.quantity : 0;
                    const pendQty = shouldRestock ? 0 : row.quantity;
                    await ReturnOrder_1.ReturnOrder.create({
                        returnTransactionId: returnTxId,
                        businessAccount,
                        returnDate: row.returnDate || row.orderDate,
                        returnType: row.returnType || 'customer_return',
                        status: row.returnStatus || (shouldRestock ? 'stock_updated' : 'inspection_pending'),
                        originalOrder: orderDoc._id,
                        meeshoOrderId: orderDoc.meeshoOrderId || row.subOrderId,
                        carrierTrackingId: row.shippingLabelId,
                        product: product._id,
                        returnedQuantity: row.quantity,
                        goodQuantity: goodQty,
                        damagedQuantity: 0,
                        pendingInspectionQuantity: pendQty,
                        originalSellingPrice: row.sellingPrice || product.sellingPrice,
                        returnAmount: (row.sellingPrice || product.sellingPrice) * row.quantity,
                        returnReason: row.returnReason ||
                            (row.returnType === 'rto_return'
                                ? 'RTO Return imported from Meesho Excel'
                                : 'Customer Return imported from Meesho Excel'),
                        itemCondition: row.itemCondition || (shouldRestock ? 'sellable' : 'pending_inspection'),
                        stockDisposition: shouldRestock ? 'restock' : 'pending',
                        stockRestored: shouldRestock,
                        damagedStockRestored: false,
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
                    // Ensure order status reflects return state
                    if (row.returnType === 'rto_return' && orderDoc.status !== 'rto_received') {
                        orderDoc.status = 'rto_received';
                        await orderDoc.save();
                    }
                    else if (row.returnType === 'customer_return' && orderDoc.status !== 'returned') {
                        orderDoc.status = 'returned';
                        await orderDoc.save();
                    }
                    summary.returnsCreated++;
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