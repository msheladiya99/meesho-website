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
  product: Product | string;
  sku: string;
  sellingPrice: number; // paise
  quantity: number;
  grossAmount: number; // paise
  status: 'pending' | 'dispatched' | 'delivered' | 'cancelled' | 'returned';
  notes?: string;
  isDeleted: boolean;
  createdAt: string;
}

// ─── Return Order ────────────────────────────────────────────────────────────
export interface ReturnOrder {
  _id: string;
  businessAccount: BusinessAccount | string;
  returnDate: string;
  originalOrder?: Order | string;
  meeshoOrderId?: string;
  product: Product | string;
  returnedQuantity: number;
  originalSellingPrice: number; // paise
  returnAmount: number; // paise
  returnReason?: string;
  itemCondition: 'sellable' | 'damaged' | 'opened' | 'pending_inspection';
  stockDisposition: 'restock' | 'discard' | 'pending';
  notes?: string;
  isProcessed: boolean;
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
