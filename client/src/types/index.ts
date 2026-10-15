// ─── Auth & User ────────────────────────────────────────────────────────────
export interface User {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'viewer';
  allowedAccounts: string[];
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

// ─── Business Account (GSTIN) ───────────────────────────────────────────────
export interface BusinessAccount {
  _id: string;
  name: string;
  gstin: string;
  tradeName: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
}

// ─── Partner ────────────────────────────────────────────────────────────────
export interface Partner {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  profitSharePercent: number;
  capitalContributed: number;
  isActive: boolean;
}

// ─── Category & Product ──────────────────────────────────────────────────────
export interface Category {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface Product {
  _id: string;
  name: string;
  sku: string;
  category: Category | string;
  sizeml: number;
  fragranceType?: string;
  brand?: string;
  sellingPrice: number; // in paise
  defaultPurchaseCost: number; // in paise
  reorderThreshold: number;
  currentStock: number;
  damagedStock?: number;
  pendingInspectionStock?: number;
  weightedAvgCost?: number; // in paise
  isActive: boolean;
}

// ─── Vendor ──────────────────────────────────────────────────────────────────
export interface Vendor {
  _id: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  notes?: string;
  isActive: boolean;
}

// ─── Order ───────────────────────────────────────────────────────────────────
export interface Order {
  _id: string;
  businessAccount: BusinessAccount | string;
  orderDate: string;
  meeshoOrderId?: string;
  shippingLabelId?: string;
  carrierName?: string;
  internalQrCode?: string;
  product: Product | string;
  sku: string;
  sellingPrice: number; // paise
  quantity: number;
  packedQuantity?: number;
  grossAmount: number; // paise
  status:
    | 'pending'
    | 'packed'
    | 'dispatched'
    | 'delivered'
    | 'cancelled'
    | 'returned'
    | 'rto_in_transit'
    | 'rto_received';
  stockDeducted?: boolean;
  packedAt?: string;
  packedBy?: User | string;
  dispatchedAt?: string;
  dispatchedBy?: User | string;
  notes?: string;
  isDeleted: boolean;
  createdAt: string;
}

// ─── Return Order ────────────────────────────────────────────────────────────
export interface ReturnOrder {
  _id: string;
  returnTransactionId?: string;
  businessAccount: BusinessAccount | string;
  returnDate: string;
  returnType?: 'customer_return' | 'rto_return';
  status?:
    | 'return_initiated'
    | 'parcel_received'
    | 'inspection_pending'
    | 'inspected'
    | 'stock_updated';
  originalOrder?: Order | string;
  meeshoOrderId?: string;
  carrierTrackingId?: string;
  scannedQrCode?: string;
  product: Product | string;
  returnedQuantity: number;
  goodQuantity?: number;
  damagedQuantity?: number;
  pendingInspectionQuantity?: number;
  originalSellingPrice: number; // paise
  returnAmount: number; // paise
  returnReason?: string;
  damageReason?: string;
  damagePhotos?: string[];
  damageResolution?: 'none' | 'repaired' | 'disposed' | 'resale_approved';
  itemCondition: 'sellable' | 'damaged' | 'opened' | 'pending_inspection';
  stockDisposition: 'restock' | 'discard' | 'pending';
  stockRestored?: boolean;
  damagedStockRestored?: boolean;
  receivedAt?: string;
  receivedBy?: User | string;
  inspectedAt?: string;
  inspectedBy?: User | string;
  operator?: User | string;
  notes?: string;
  isProcessed: boolean;
  createdAt: string;
}

// ─── Packing Record ──────────────────────────────────────────────────────────
export interface PackingRecord {
  _id: string;
  transactionId: string;
  businessAccount: BusinessAccount | string;
  order: Order | string;
  product: Product | string;
  sku: string;
  packedQuantity: number;
  scannedCode: string;
  scanType: 'internal_qr' | 'carrier_label' | 'meesho_order_id' | 'order_id' | 'manual';
  operator: User | string;
  notes?: string;
  createdAt: string;
}

// ─── Scan Exception ──────────────────────────────────────────────────────────
export interface ScanException {
  _id: string;
  businessAccount?: BusinessAccount | string;
  scannedCode: string;
  module: 'packing' | 'return';
  exceptionType:
    | 'order_not_found'
    | 'already_packed'
    | 'already_returned'
    | 'qty_exceeded'
    | 'wrong_account'
    | 'invalid_format'
    | 'system_error';
  attemptedAction?: string;
  reason?: string;
  details?: string;
  operator?: User | string;
  operatorName?: string;
  createdAt: string;
}

// ─── Stock Purchase ──────────────────────────────────────────────────────────
export interface StockPurchaseItem {
  product: Product | string;
  quantityPurchased: number;
  purchasePricePerUnit: number; // paise
  totalAmount: number; // paise
}

export interface StockPurchase {
  _id: string;
  businessAccount: BusinessAccount | string;
  purchaseDate: string;
  vendor: Vendor | string;
  vendorInvoiceNumber?: string;
  items: StockPurchaseItem[];
  discount: number; // paise
  additionalCosts: number; // paise
  taxAmount: number; // paise
  totalAmount: number; // paise
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  notes?: string;
  createdAt: string;
}

// ─── Stock Movement ──────────────────────────────────────────────────────────
export interface StockMovement {
  _id: string;
  businessAccount: string;
  product: Product | string;
  movementType: 'purchase' | 'sale' | 'return_in' | 'return_out' | 'adjustment' | 'opening';
  quantity: number; // positive = in, negative = out
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  runningBalance: number;
  createdAt: string;
}

// ─── Expense ─────────────────────────────────────────────────────────────────
export interface ExpenseAllocation {
  partner: Partner | string;
  amount: number; // paise
  percent: number;
}

export interface Expense {
  _id: string;
  businessAccount: BusinessAccount | string;
  expenseDate: string;
  category: string;
  description: string;
  amount: number; // paise
  paidBy: 'partner1' | 'partner2' | 'partner3' | 'business';
  paidByPartner?: Partner | string;
  allocationMethod: 'equal' | 'custom';
  allocations: ExpenseAllocation[];
  vendor?: string;
  paymentMethod?: string;
  notes?: string;
  createdAt: string;
}

// ─── Reports / Analytics ─────────────────────────────────────────────────────
export interface DashboardStats {
  totalOrderSales: number;
  totalOrders: number;
  totalQuantitySold: number;
  totalReturnedOrders: number;
  totalReturnQuantity: number;
  netSales: number;
  totalPurchaseCost: number;
  totalExpenses: number;
  estimatedGrossProfit: number;
  estimatedNetProfit: number;
  currentInventoryQty: number;
  inventoryValue: number;
  // Module 8 Cards
  pendingPacking?: number;
  packedToday?: number;
  dispatchedToday?: number;
  rtoReturns?: number;
  rtoReturnQty?: number;
  customerReturns?: number;
  customerReturnQty?: number;
  goodStockRecovered?: number;
  damagedStock?: number;
  returnsAwaitingInspection?: number;
}

// ─── API ──────────────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  total?: number;
  page?: number;
  limit?: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
  accountId?: string;
  productId?: string;
  categoryId?: string;
}

// ─── UI ───────────────────────────────────────────────────────────────────────
export type DateRange = {
  startDate: string;
  endDate: string;
};

export type AccountFilter = 'all' | string;

export const EXPENSE_CATEGORIES = [
  'Perfume Stock Purchase',
  'Packaging',
  'Shipping',
  'Meesho Fees',
  'Return Shipping',
  'Advertising',
  'Marketing',
  'Website & Software',
  'Travel',
  'Office Expenses',
  'Miscellaneous',
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];
