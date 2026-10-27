import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import { Order, OrderStatus } from '../models/Order';
import { ReturnOrder, ReturnType, ReturnStatus, ItemCondition } from '../models/ReturnOrder';
import { Product } from '../models/Product';
import { Category } from '../models/Category';
import { PackingRecord } from '../models/PackingRecord';
import { recordStockMovement } from './inventory.service';
import { generateInternalQrCode } from './qrScanner.service';
import { createAuditLog } from './audit.service';

export interface ParsedMeeshoRow {
  rowNumber: number;
  subOrderId: string;
  meeshoOrderId?: string;
  orderDate: Date;
  sku: string;
  productName?: string;
  quantity: number;
  sellingPrice: number; // in paise
  status: OrderStatus;
  carrierName?: string;
  shippingLabelId?: string; // AWB tracking
  isReturn: boolean;
  returnType?: ReturnType;
  returnStatus?: ReturnStatus;
  returnDate?: Date;
  returnReason?: string;
  itemCondition?: ItemCondition;
  rawStatus?: string;
}

export interface ImportSummary {
  totalRows: number;
  ordersCreated: number;
  ordersUpdated: number;
  ordersSkipped: number;
  returnsCreated: number;
  productsAutoCreated: number;
  errors: Array<{ rowNumber: number; subOrderId?: string; error: string }>;
}

// Generate return transaction ID (RET-YYYYMMDD-XXXXX)
const generateReturnTxId = (): string => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `RET-${dateStr}-${rand}`;
};

// Normalize header strings for flexible matching
const normalizeHeader = (header: string): string =>
  header
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

// Parse dates across various Excel and string formats
export const parseFlexibleDate = (raw: any): Date => {
  if (!raw) return new Date();

  // Excel serial date number (e.g. 45231)
  if (typeof raw === 'number' && raw > 30000 && raw < 80000) {
    const epoch = new Date(Math.round((raw - 25569) * 86400 * 1000));
    if (!isNaN(epoch.getTime())) return epoch;
  }

  const str = String(raw).trim();
  if (!str) return new Date();

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
    if (!isNaN(d.getTime())) return d;
  }

  // Standard JS Date parse (handles ISO, YYYY-MM-DD, etc.)
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed;

  return new Date();
};

// Parse price from string/number to paise
export const parsePriceToPaise = (raw: any): number => {
  if (typeof raw === 'number') {
    return Math.max(0, Math.round(raw * 100));
  }
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : Math.max(0, Math.round(val * 100));
};

// Map Meesho raw status and return hints to internal OrderStatus and Return metadata
export const mapMeeshoStatus = (
  rawStatusStr?: string,
  rawReturnTypeStr?: string,
  rawReturnStatusStr?: string
): {
  orderStatus: OrderStatus;
  isReturn: boolean;
  returnType?: ReturnType;
  returnStatus?: ReturnStatus;
  itemCondition?: ItemCondition;
} => {
  const combined = `${rawStatusStr || ''} ${rawReturnTypeStr || ''} ${rawReturnStatusStr || ''}`.toLowerCase();

  // Check RTO return hints
  if (
    combined.includes('rto') ||
    combined.includes('courier return') ||
    combined.includes('undelivered') ||
    (rawReturnTypeStr && /rto/i.test(rawReturnTypeStr))
  ) {
    const isCompleted =
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
  if (
    combined.includes('customer return') ||
    combined.includes('cust return') ||
    combined.includes('returned') ||
    combined.includes('return received') ||
    combined.includes('return delivered') ||
    combined.includes('return initiated') ||
    (rawReturnTypeStr && /customer/i.test(rawReturnTypeStr)) ||
    (rawReturnStatusStr && rawReturnStatusStr.trim() !== '')
  ) {
    const isCompleted =
      combined.includes('deliver') ||
      combined.includes('received') ||
      combined.includes('complete');

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
  if (
    combined.includes('shipped') ||
    combined.includes('transit') ||
    combined.includes('dispatched') ||
    combined.includes('out for delivery')
  ) {
    return { orderStatus: 'dispatched', isReturn: false };
  }

  // Packed / Ready to Ship orders
  if (
    combined.includes('packed') ||
    combined.includes('ready to ship') ||
    combined.includes('ready_to_ship') ||
    combined.includes('manifested')
  ) {
    return { orderStatus: 'packed', isReturn: false };
  }

  // Default: Pending
  return { orderStatus: 'pending', isReturn: false };
};

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
const findMatchingField = (rawRow: Record<string, any>, aliases: string[]): any => {
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
export const parseMeeshoRawRows = (
  rawRows: Record<string, any>[],
  options?: { skipHoldAndReadyToShip?: boolean }
): ParsedMeeshoRow[] => {
  const parsedRows: ParsedMeeshoRow[] = [];
  const skipHoldAndReady = options?.skipHoldAndReadyToShip !== false;

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 2; // assuming row 1 is header

    const subOrderVal = findMatchingField(raw, COLUMN_ALIASES.subOrderId);
    if (!subOrderVal) continue; // Skip blank or invalid rows

    const statusVal = findMatchingField(raw, COLUMN_ALIASES.status);
    const rawStatus = statusVal ? String(statusVal).trim() : undefined;

    // Filter out HOLD and READY_TO_SHIP orders by default (only add shipped, delivered, and returns)
    if (skipHoldAndReady && rawStatus) {
      const upper = rawStatus.toUpperCase();
      if (
        upper === 'HOLD' ||
        upper.includes('HOLD') ||
        upper === 'READY_TO_SHIP' ||
        upper.includes('READY TO SHIP') ||
        upper.includes('READY_TO_SHIP')
      ) {
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
    const sellingPrice = parsePriceToPaise(priceVal);

    const dateVal = findMatchingField(raw, COLUMN_ALIASES.orderDate);
    const orderDate = parseFlexibleDate(dateVal);

    const awbVal = findMatchingField(raw, COLUMN_ALIASES.shippingLabelId);
    const shippingLabelId = awbVal ? String(awbVal).trim() : undefined;

    const carrierVal = findMatchingField(raw, COLUMN_ALIASES.carrierName);
    const carrierName = carrierVal ? String(carrierVal).trim() : undefined;

    const returnTypeVal = findMatchingField(raw, COLUMN_ALIASES.returnType);
    const returnStatusVal = findMatchingField(raw, COLUMN_ALIASES.returnStatus);
    const returnReasonVal = findMatchingField(raw, COLUMN_ALIASES.returnReason);
    const returnDateVal = findMatchingField(raw, COLUMN_ALIASES.returnDate);

    const { orderStatus, isReturn, returnType, returnStatus, itemCondition } = mapMeeshoStatus(
      rawStatus,
      returnTypeVal ? String(returnTypeVal) : undefined,
      returnStatusVal ? String(returnStatusVal) : undefined
    );

    const returnDate = returnDateVal ? parseFlexibleDate(returnDateVal) : (isReturn ? orderDate : undefined);
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

// Parse an Excel Buffer (xlsx, xls, csv) into ParsedMeeshoRow[]
export const parseMeeshoWorkbook = (
  buffer: Buffer,
  options?: { skipHoldAndReadyToShip?: boolean }
): ParsedMeeshoRow[] => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  return parseMeeshoRawRows(rawRows, options);
};

// Core Execution: Process parsed Meesho rows into Database (Orders & Returns)
export const importMeeshoOrdersAndReturns = async (params: {
  businessAccount: string;
  rows: ParsedMeeshoRow[];
  userId?: string;
  skipHoldAndReadyToShip?: boolean;
}): Promise<ImportSummary> => {
  const { businessAccount, rows, userId, skipHoldAndReadyToShip = true } = params;

  // Filter out HOLD and READY_TO_SHIP rows if enabled
  const activeRows = skipHoldAndReadyToShip
    ? rows.filter((r) => {
        const upper = (r.rawStatus || '').toUpperCase();
        return !(
          upper === 'HOLD' ||
          upper.includes('HOLD') ||
          upper === 'READY_TO_SHIP' ||
          upper.includes('READY TO SHIP') ||
          upper.includes('READY_TO_SHIP')
        );
      })
    : rows;

  const summary: ImportSummary = {
    totalRows: activeRows.length,
    ordersCreated: 0,
    ordersUpdated: 0,
    ordersSkipped: rows.length - activeRows.length,
    returnsCreated: 0,
    productsAutoCreated: 0,
    errors: [],
  };

  // Default category resolution for new products
  let defaultCategory = await Category.findOne({ isActive: true });
  if (!defaultCategory) {
    defaultCategory = await Category.create({ name: 'Perfumes', isActive: true });
  }

  // Product cache to minimize DB queries
  const productCache = new Map<string, any>();

  for (const row of activeRows) {
    try {
      // 1. Resolve Product by SKU or Name (or Auto-Create)
      const skuKey = row.sku.toUpperCase();
      let product = productCache.get(skuKey);

      if (!product) {
        product = await Product.findOne({
          sku: { $regex: `^${skuKey.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, $options: 'i' },
        });

        // Flexible alphanumeric matching (e.g. 'Choco Musk-01' matches 'CHOCO_MUSK01')
        if (!product) {
          const stripped = skuKey.replace(/[^A-Z0-9]/g, '');
          if (stripped.length >= 4) {
            const flexPattern = stripped.split('').join('[-_\\s]?');
            product = await Product.findOne({
              sku: { $regex: `^${flexPattern}$`, $options: 'i' },
            });
          }
        }

        if (!product && row.productName) {
          product = await Product.findOne({
            name: { $regex: `^${row.productName.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, $options: 'i' },
          });
        }

        // Auto-create product if not yet in database
        if (!product) {
          const sizeMatch = (row.productName + ' ' + row.sku).match(/(\d+)\s*ml/i);
          const sizeml = sizeMatch ? parseInt(sizeMatch[1], 10) : 100;
          const estimatedCost = Math.round((row.sellingPrice || 49900) * 0.4);

          product = await Product.create({
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
      let orderDoc = await Order.findOne({
        isDeleted: false,
        subOrderId: row.subOrderId,
      });

      if (!orderDoc && row.shippingLabelId) {
        orderDoc = await Order.findOne({
          isDeleted: false,
          businessAccount,
          shippingLabelId: row.shippingLabelId,
        });
      }

      let orderJustCreated = false;

      if (!orderDoc) {
        // Create New Order
        const tempId = new mongoose.Types.ObjectId();
        const internalQrCode = generateInternalQrCode(tempId.toString(), product.sku);

        orderDoc = await Order.create({
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
          await recordStockMovement({
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
          await PackingRecord.create({
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
      } else {
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
        } else {
          summary.ordersSkipped++;
        }
      }

      // 3. Process Return Entry if row is an RTO or Customer Return
      if (row.isReturn) {
        // Prevent duplicate return creation for the same original order
        const existingReturn = await ReturnOrder.findOne({
          originalOrder: orderDoc._id,
          isDeleted: false,
        });

        if (!existingReturn) {
          const returnTxId = generateReturnTxId();
          const shouldRestock = row.returnStatus === 'stock_updated' && row.itemCondition === 'sellable';
          const goodQty = shouldRestock ? row.quantity : 0;
          const pendQty = shouldRestock ? 0 : row.quantity;

          await ReturnOrder.create({
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
            returnReason:
              row.returnReason ||
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
            await recordStockMovement({
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
          } else if (row.returnType === 'customer_return' && orderDoc.status !== 'returned') {
            orderDoc.status = 'returned';
            await orderDoc.save();
          }

          summary.returnsCreated++;
        }
      }
    } catch (err: any) {
      summary.errors.push({
        rowNumber: row.rowNumber,
        subOrderId: row.subOrderId,
        error: err.message || 'Unknown error processing row',
      });
    }
  }

  // Audit log for this import
  await createAuditLog({
    action: 'CREATE',
    resource: 'Order',
    resourceId: businessAccount,
    userId,
    details: `Meesho Excel Import: ${summary.ordersCreated} created, ${summary.ordersUpdated} updated, ${summary.returnsCreated} returns created (${summary.errors.length} errors)`,
  });

  return summary;
};

// Generate a downloadable sample Meesho Excel file Buffer
export const generateMeeshoSampleTemplate = (): Buffer => {
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
