import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { StockPurchase } from '../models/StockPurchase';
import { Product } from '../models/Product';
import { StockMovement } from '../models/StockMovement';
import { Expense } from '../models/Expense';
import { Partner } from '../models/Partner';
import { Vendor } from '../models/Vendor';
import { authenticate, requireManagerOrAdmin, enforceAccountAccess, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit.service';
import { recordStockMovement, reverseMovementsByReference } from '../services/inventory.service';

const router = Router();
router.use(authenticate);

// Concurrency locks to prevent duplicate submissions from rapid clicks
const activePurchaseLocks = new Set<string>();
const recentPurchaseCreations = new Map<string, number>();

const accountFilter = (accountId?: string): Record<string, unknown> =>
  accountId && accountId !== 'all' ? { businessAccount: new mongoose.Types.ObjectId(accountId) } : {};

export function calculateNextInvoiceNumber(invoices: (string | undefined | null)[]): string {
  const cleanList = invoices
    .map(inv => (typeof inv === 'string' ? inv.trim() : ''))
    .filter(inv => inv.length > 0);

  if (cleanList.length === 0) {
    return '1';
  }

  // 1. Check for pure numbers (with or without leading '#')
  const pureNumericValues: number[] = [];
  for (const inv of cleanList) {
    const stripped = inv.replace(/^#\s*/, '');
    if (/^\d+$/.test(stripped)) {
      pureNumericValues.push(parseInt(stripped, 10));
    }
  }

  if (pureNumericValues.length > 0) {
    const maxVal = Math.max(...pureNumericValues);
    return String(maxVal + 1);
  }

  // 2. Check for alphanumeric patterns ending in digits: e.g. "INV-001", "BILL-197"
  let maxTrailingNum = -1;
  let bestPrefix = '';
  let bestPadLength = 0;

  for (const inv of cleanList) {
    const match = inv.match(/^(.*?)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const digits = match[2];
      const val = parseInt(digits, 10);
      if (val > maxTrailingNum) {
        maxTrailingNum = val;
        bestPrefix = prefix;
        bestPadLength = digits.length;
      }
    }
  }

  if (maxTrailingNum >= 0) {
    const nextVal = maxTrailingNum + 1;
    const padded = String(nextVal).padStart(bestPadLength, '0');
    return `${bestPrefix}${padded}`;
  }

  // 3. Fallback to count + 1
  return String(cleanList.length + 1);
}

// GET /api/stock-purchases
router.get('/', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate, page = '1', limit = '100' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { isDeleted: false, ...accountFilter(accountId) };
    if (startDate || endDate) {
      filter.purchaseDate = {};
      if (startDate) (filter.purchaseDate as Record<string, unknown>)['$gte'] = new Date(startDate);
      if (endDate) (filter.purchaseDate as Record<string, unknown>)['$lte'] = new Date(endDate + 'T23:59:59.999Z');
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [purchases, total] = await Promise.all([
      StockPurchase.find(filter)
        .populate('vendor', 'name phone')
        .populate({
          path: 'items.product',
          select: 'name sku category defaultPurchaseCost weightedAvgCost currentStock',
          populate: { path: 'category', select: 'name' }
        })
        .populate('businessAccount', 'name gstin')
        .populate('payments.paidByPartner', 'name upiId')
        .populate('payments.recordedBy', 'name email')
        .sort({ purchaseDate: -1 }).skip(skip).limit(parseInt(limit)),
      StockPurchase.countDocuments(filter),
    ]);
    res.json({ success: true, data: purchases, total });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/stock-purchases/accounting-summary
router.get('/accounting-summary', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { isDeleted: false, ...accountFilter(accountId) };
    if (startDate || endDate) {
      filter.purchaseDate = {};
      if (startDate) (filter.purchaseDate as Record<string, unknown>)['$gte'] = new Date(startDate);
      if (endDate) (filter.purchaseDate as Record<string, unknown>)['$lte'] = new Date(endDate + 'T23:59:59.999Z');
    }

    const purchases = await StockPurchase.find(filter)
      .populate('vendor', 'name phone')
      .lean();

    let totalPurchased = 0;
    let totalPaid = 0;
    let totalDue = 0;
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;

    const vendorMap = new Map<string, {
      vendorId: string;
      vendorName: string;
      vendorPhone?: string;
      totalPurchased: number;
      totalPaid: number;
      totalDue: number;
      invoiceCount: number;
      unpaidCount: number;
    }>();

    for (const p of purchases) {
      const pTotal = p.totalAmount || 0;
      const pPaid = p.paidAmount ?? (p.paymentStatus === 'paid' ? pTotal : 0);
      const pDue = p.dueAmount ?? Math.max(0, pTotal - pPaid);

      totalPurchased += pTotal;
      totalPaid += pPaid;
      totalDue += pDue;

      if (p.paymentStatus === 'paid') paidCount++;
      else if (p.paymentStatus === 'partial') partialCount++;
      else unpaidCount++;

      const vendorObj = (p.vendor && typeof p.vendor === 'object') ? (p.vendor as any) : null;
      const vendorId = vendorObj?._id ? vendorObj._id.toString() : (p.vendor ? p.vendor.toString() : 'unknown');
      const vendorName = vendorObj?.name || 'Unknown Vendor';
      const vendorPhone = vendorObj?.phone || '';

      const existingV = vendorMap.get(vendorId) || {
        vendorId,
        vendorName,
        vendorPhone,
        totalPurchased: 0,
        totalPaid: 0,
        totalDue: 0,
        invoiceCount: 0,
        unpaidCount: 0,
      };

      existingV.totalPurchased += pTotal;
      existingV.totalPaid += pPaid;
      existingV.totalDue += pDue;
      existingV.invoiceCount += 1;
      if (p.paymentStatus !== 'paid') {
        existingV.unpaidCount += 1;
      }

      vendorMap.set(vendorId, existingV);
    }

    const vendors = Array.from(vendorMap.values()).sort((a, b) => b.totalDue - a.totalDue);

    res.json({
      success: true,
      data: {
        totalPurchased,
        totalPaid,
        totalDue,
        totalPurchases: purchases.length,
        paidCount,
        partialCount,
        unpaidCount,
        vendors,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/stock-purchases/next-invoice-number
router.get('/next-invoice-number', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {
      isDeleted: false,
      ...accountFilter(accountId),
    };

    const purchases = await StockPurchase.find(filter)
      .select('vendorInvoiceNumber')
      .lean();

    const invoices = purchases.map(p => p.vendorInvoiceNumber).filter(Boolean) as string[];
    const nextInvoiceNumber = calculateNextInvoiceNumber(invoices);

    res.json({
      success: true,
      data: {
        nextInvoiceNumber,
        totalPurchases: purchases.length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/stock-purchases/vendor/:vendorId/ledger
router.get('/vendor/:vendorId/ledger', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vendorId } = req.params;
    const { accountId, startDate, endDate } = req.query as Record<string, string>;

    if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId as string)) {
      res.status(400).json({ success: false, message: 'Invalid vendor ID' });
      return;
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      res.status(404).json({ success: false, message: 'Vendor not found' });
      return;
    }

    const filter: Record<string, unknown> = {
      isDeleted: false,
      vendor: new mongoose.Types.ObjectId(vendorId as string),
      ...accountFilter(accountId),
    };

    if (startDate || endDate) {
      filter.purchaseDate = {};
      if (startDate) (filter.purchaseDate as Record<string, unknown>)['$gte'] = new Date(startDate);
      if (endDate) (filter.purchaseDate as Record<string, unknown>)['$lte'] = new Date(endDate + 'T23:59:59.999Z');
    }

    const purchases = await StockPurchase.find(filter)
      .populate('businessAccount', 'name')
      .populate('payments.paidByPartner', 'name upiId')
      .populate('payments.recordedBy', 'name email')
      .sort({ purchaseDate: 1 });

    interface LedgerEntry {
      id: string;
      date: string;
      type: 'debit' | 'credit';
      entryType: 'purchase' | 'payment';
      invoiceNumber?: string;
      description: string;
      debit: number;
      credit: number;
      runningBalance: number;
      paidBy?: 'business' | 'partner';
      paymentMode?: string;
      paidByPartner?: any;
      referenceNumber?: string;
      notes?: string;
      purchaseId?: string;
      paymentId?: string;
    }

    const entries: LedgerEntry[] = [];

    for (const p of purchases) {
      const pQty = p.totalQuantity || (Array.isArray(p.items) ? p.items.reduce((s, it) => s + (it.quantityPurchased || 0), 0) : 0);
      entries.push({
        id: `bill_${p._id}`,
        date: p.purchaseDate.toISOString(),
        type: 'debit',
        entryType: 'purchase',
        invoiceNumber: p.vendorInvoiceNumber || p._id.toString().slice(-6),
        description: `Stock Purchase Bill #${p.vendorInvoiceNumber || p._id.toString().slice(-6)} (${pQty} units)`,
        debit: p.totalAmount,
        credit: 0,
        runningBalance: 0,
        purchaseId: p._id.toString(),
        notes: p.notes,
      });

      if (Array.isArray(p.payments)) {
        for (const pay of p.payments) {
          entries.push({
            id: `pay_${pay._id || Math.random()}`,
            date: pay.paymentDate.toISOString(),
            type: 'credit',
            entryType: 'payment',
            invoiceNumber: p.vendorInvoiceNumber || p._id.toString().slice(-6),
            description: `Payment for Invoice #${p.vendorInvoiceNumber || p._id.toString().slice(-6)}`,
            debit: 0,
            credit: pay.amount,
            runningBalance: 0,
            paidBy: pay.paidBy || (pay.paidByPartner ? 'partner' : 'business'),
            paymentMode: pay.paymentMode,
            paidByPartner: pay.paidByPartner,
            referenceNumber: pay.referenceNumber,
            notes: pay.notes,
            purchaseId: p._id.toString(),
            paymentId: pay._id?.toString(),
          });
        }
      }
    }

    entries.sort((a, b) => {
      const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (timeDiff !== 0) return timeDiff;
      if (a.type === 'debit' && b.type === 'credit') return -1;
      if (a.type === 'credit' && b.type === 'debit') return 1;
      return 0;
    });

    let runningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    for (const entry of entries) {
      totalDebit += entry.debit;
      totalCredit += entry.credit;
      runningBalance += (entry.debit - entry.credit);
      entry.runningBalance = runningBalance;
    }

    res.json({
      success: true,
      data: {
        vendor: {
          _id: vendor._id,
          name: vendor.name,
          phone: vendor.phone,
          company: vendor.company,
          gstin: vendor.gstin,
        },
        totalDebit,
        totalCredit,
        closingBalance: runningBalance,
        totalPurchases: purchases.length,
        entries,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /api/stock-purchases/vendor/:vendorId/pay-due
router.post('/vendor/:vendorId/pay-due', requireManagerOrAdmin, enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vendorId } = req.params;
    const { amount, paymentDate, paymentMode, paidBy, paidByPartner, referenceNumber, notes } = req.body;

    if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId as string)) {
      res.status(400).json({ success: false, message: 'Invalid vendor ID' });
      return;
    }

    const numAmount = Math.round(Number(amount));
    if (!numAmount || numAmount <= 0) {
      res.status(400).json({ success: false, message: 'Payment amount must be greater than 0' });
      return;
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      res.status(404).json({ success: false, message: 'Vendor not found' });
      return;
    }

    const purchases = await StockPurchase.find({
      vendor: new mongoose.Types.ObjectId(vendorId as string),
      isDeleted: false,
      paymentStatus: { $ne: 'paid' },
    }).sort({ purchaseDate: 1 });

    if (purchases.length === 0) {
      res.status(400).json({ success: false, message: 'No pending due balance found for this vendor' });
      return;
    }

    const totalDue = purchases.reduce((sum, p) => {
      const pPaid = p.paidAmount ?? (p.paymentStatus === 'paid' ? p.totalAmount : 0);
      const pDue = p.dueAmount ?? Math.max(0, p.totalAmount - pPaid);
      return sum + pDue;
    }, 0);

    if (numAmount > totalDue) {
      res.status(400).json({
        success: false,
        message: `Payment amount (₹${(numAmount / 100).toFixed(2)}) exceeds total outstanding balance of ₹${(totalDue / 100).toFixed(2)}`,
      });
      return;
    }

    const isPartnerPaid = (paidBy === 'partner' || Boolean(paidByPartner));
    let linkedExpenseId: mongoose.Types.ObjectId | undefined;

    if (isPartnerPaid && paidByPartner) {
      const partner = await Partner.findById(paidByPartner);
      if (partner && partner.isActive) {
        const activePartners = await Partner.find({ isActive: true });
        const count = activePartners.length || 1;
        const splitAmount = Math.floor(numAmount / count);
        const remainder = numAmount - splitAmount * count;
        const allocations = activePartners.map((p, idx) => ({
          partner: p._id as mongoose.Types.ObjectId,
          amount: splitAmount + (idx === 0 ? remainder : 0),
          percent: Math.round((100 / count) * 100) / 100,
        }));

        const expense = await Expense.create({
          businessAccount: purchases[0].businessAccount,
          expenseDate: paymentDate ? new Date(paymentDate) : new Date(),
          category: 'Stock Purchase',
          description: `Vendor Due Payment: ${vendor.name}`,
          amount: numAmount,
          paidBy: 'partner',
          paidByPartner: partner._id,
          allocationMethod: 'equal',
          allocations,
          vendor: vendor.name,
          paymentMethod: paymentMode ? paymentMode.replace(/_/g, ' ') : 'Partner Out of Pocket',
          notes: notes ? `Vendor Payment Note: ${notes}` : `Paid on behalf of business for vendor ${vendor.name}`,
          createdBy: req.user?._id,
        });
        linkedExpenseId = expense._id as mongoose.Types.ObjectId;
      }
    }

    let remainingToApply = numAmount;
    const modifiedPurchases = [];

    for (const purchase of purchases) {
      if (remainingToApply <= 0) break;

      const pPaid = purchase.paidAmount ?? (purchase.paymentStatus === 'paid' ? purchase.totalAmount : 0);
      const pDue = purchase.dueAmount ?? Math.max(0, purchase.totalAmount - pPaid);
      if (pDue <= 0) continue;

      const allocation = Math.min(remainingToApply, pDue);
      remainingToApply -= allocation;

      if (!Array.isArray(purchase.payments)) purchase.payments = [];
      purchase.payments.push({
        amount: allocation,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        paidBy: isPartnerPaid ? 'partner' : 'business',
        paymentMode: paymentMode || 'upi',
        paidByPartner: (isPartnerPaid && paidByPartner) ? new mongoose.Types.ObjectId(paidByPartner) : undefined,
        referenceNumber: referenceNumber?.trim() || undefined,
        notes: notes ? `${notes} (Part of ₹${(numAmount / 100).toFixed(2)} vendor payment)` : `Vendor Due Payment`,
        recordedBy: req.user?._id ? new mongoose.Types.ObjectId(req.user._id) : undefined,
        linkedExpenseId,
        createdAt: new Date(),
      });

      await purchase.save();
      modifiedPurchases.push(purchase);
    }

    await createAuditLog({
      action: 'UPDATE',
      resource: 'VendorPayment',
      resourceId: vendorId as string,
      userId: req.user?._id?.toString(),
    });

    res.json({
      success: true,
      message: `Successfully paid ₹${(numAmount / 100).toFixed(2)} to ${vendor.name}`,
      data: {
        totalPaid: numAmount,
        allocatedInvoicesCount: modifiedPurchases.length,
        remainingVendorDue: Math.max(0, totalDue - numAmount),
      },
    });
  } catch (err) {
    console.error('Error recording vendor payment:', err);
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/stock-purchases/:id
router.get('/:id', async (req, res: Response): Promise<void> => {
  try {
    const p = await StockPurchase.findById(req.params.id)
      .populate('vendor', 'name phone')
      .populate({
        path: 'items.product',
        select: 'name sku category defaultPurchaseCost weightedAvgCost currentStock',
        populate: { path: 'category', select: 'name' }
      })
      .populate('businessAccount')
      .populate('payments.paidByPartner', 'name upiId')
      .populate('payments.recordedBy', 'name email');
    if (!p || p.isDeleted) { res.status(404).json({ success: false, message: 'Purchase not found' }); return; }
    res.json({ success: true, data: p });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /api/stock-purchases/:id/payments
router.post('/:id/payments', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const purchaseId = req.params.id as string;
  if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
    res.status(400).json({ success: false, message: 'Invalid purchase ID' });
    return;
  }

  try {
    const purchase = await StockPurchase.findById(purchaseId).populate('vendor', 'name');
    if (!purchase || purchase.isDeleted) {
      res.status(404).json({ success: false, message: 'Purchase not found' });
      return;
    }

    const { amount, paymentDate, paymentMode, paidBy, paidByPartner, referenceNumber, notes } = req.body;
    const numAmount = Math.round(Number(amount));
    if (!numAmount || numAmount <= 0) {
      res.status(400).json({ success: false, message: 'Payment amount must be greater than 0' });
      return;
    }

    const currentDue = purchase.dueAmount ?? Math.max(0, purchase.totalAmount - (purchase.paidAmount || 0));
    if (numAmount > currentDue) {
      res.status(400).json({
        success: false,
        message: `Payment amount (₹${(numAmount / 100).toFixed(2)}) exceeds remaining balance due of ₹${(currentDue / 100).toFixed(2)}`,
      });
      return;
    }

    const isPartnerPaid = (paidBy === 'partner' || Boolean(paidByPartner));
    let linkedExpenseId: mongoose.Types.ObjectId | undefined;

    // If payment is made out-of-pocket by a partner, record an Expense entry so it factors into partner settlements
    if (isPartnerPaid && paidByPartner) {
      const partner = await Partner.findById(paidByPartner);
      if (partner && partner.isActive) {
        const activePartners = await Partner.find({ isActive: true });
        const count = activePartners.length || 1;
        const splitAmount = Math.floor(numAmount / count);
        const remainder = numAmount - splitAmount * count;
        const allocations = activePartners.map((p, idx) => ({
          partner: p._id as mongoose.Types.ObjectId,
          amount: splitAmount + (idx === 0 ? remainder : 0),
          percent: Math.round((100 / count) * 100) / 100,
        }));

        const vendorName = (purchase.vendor as any)?.name || 'Vendor';
        const invoiceLabel = purchase.vendorInvoiceNumber ? `#${purchase.vendorInvoiceNumber}` : purchase._id.toString().slice(-6);

        const expense = await Expense.create({
          businessAccount: purchase.businessAccount,
          expenseDate: paymentDate ? new Date(paymentDate) : new Date(),
          category: 'Stock Purchase',
          description: `Stock Purchase Payment: Inv ${invoiceLabel} (${vendorName})`,
          amount: numAmount,
          paidBy: 'partner',
          paidByPartner: partner._id,
          allocationMethod: 'equal',
          allocations,
          vendor: vendorName,
          paymentMethod: paymentMode ? paymentMode.replace(/_/g, ' ') : 'Partner Out of Pocket',
          notes: notes ? `Purchase Payment Note: ${notes}` : `Paid on behalf of business for purchase invoice ${invoiceLabel}`,
          createdBy: req.user?._id,
        });
        linkedExpenseId = expense._id as mongoose.Types.ObjectId;
      }
    }

    if (!Array.isArray(purchase.payments)) {
      purchase.payments = [];
    }

    purchase.payments.push({
      amount: numAmount,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paidBy: isPartnerPaid ? 'partner' : 'business',
      paymentMode: paymentMode || 'upi',
      paidByPartner: (isPartnerPaid && paidByPartner) ? new mongoose.Types.ObjectId(paidByPartner) : undefined,
      referenceNumber: referenceNumber?.trim() || undefined,
      notes: notes?.trim() || undefined,
      recordedBy: req.user?._id ? new mongoose.Types.ObjectId(req.user._id) : undefined,
      linkedExpenseId,
      createdAt: new Date(),
    });

    await purchase.save();

    await createAuditLog({
      action: 'UPDATE',
      resource: 'StockPurchasePayment',
      resourceId: purchase._id.toString(),
      userId: req.user?._id?.toString(),
    });

    const populated = await StockPurchase.findById(purchase._id)
      .populate('vendor', 'name phone')
      .populate({
        path: 'items.product',
        select: 'name sku category defaultPurchaseCost weightedAvgCost currentStock',
        populate: { path: 'category', select: 'name' },
      })
      .populate('businessAccount', 'name gstin')
      .populate('payments.paidByPartner', 'name upiId')
      .populate('payments.recordedBy', 'name email');

    res.json({ success: true, data: populated, message: 'Payment recorded successfully' });
  } catch (err) {
    console.error('Error recording stock purchase payment:', err);
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// DELETE /api/stock-purchases/:id/payments/:paymentId
router.delete('/:id/payments/:paymentId', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const purchaseId = req.params.id as string;
  const paymentId = req.params.paymentId as string;
  if (!purchaseId || !paymentId || !mongoose.Types.ObjectId.isValid(purchaseId) || !mongoose.Types.ObjectId.isValid(paymentId)) {
    res.status(400).json({ success: false, message: 'Invalid ID' });
    return;
  }

  try {
    const purchase = await StockPurchase.findById(purchaseId);
    if (!purchase || purchase.isDeleted) {
      res.status(404).json({ success: false, message: 'Purchase not found' });
      return;
    }

    const paymentIndex = (purchase.payments || []).findIndex(
      p => p._id && p._id.toString() === paymentId
    );
    if (paymentIndex === -1) {
      res.status(404).json({ success: false, message: 'Payment entry not found' });
      return;
    }

    const removedPayment = purchase.payments![paymentIndex];

    // If there is a linked expense, soft-delete it
    if (removedPayment.linkedExpenseId) {
      await Expense.findByIdAndUpdate(removedPayment.linkedExpenseId, { isDeleted: true });
    }

    purchase.payments!.splice(paymentIndex, 1);
    await purchase.save();

    await createAuditLog({
      action: 'DELETE',
      resource: 'StockPurchasePayment',
      resourceId: `${purchaseId}:${paymentId}`,
      userId: req.user?._id?.toString(),
    });

    const populated = await StockPurchase.findById(purchase._id)
      .populate('vendor', 'name phone')
      .populate({
        path: 'items.product',
        select: 'name sku category defaultPurchaseCost weightedAvgCost currentStock',
        populate: { path: 'category', select: 'name' },
      })
      .populate('businessAccount', 'name gstin')
      .populate('payments.paidByPartner', 'name upiId')
      .populate('payments.recordedBy', 'name email');

    res.json({ success: true, data: populated, message: 'Payment entry deleted' });
  } catch (err) {
    console.error('Error deleting stock purchase payment:', err);
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /api/stock-purchases
router.post('/', requireManagerOrAdmin, enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { businessAccount, totalQuantity, purchasePricePerUnit, items, totalAmount } = req.body;
    if (!businessAccount) { res.status(400).json({ success: false, message: 'businessAccount is required' }); return; }

    const parsedQty = Number(totalQuantity) || (Array.isArray(items) ? items.reduce((sum: number, it: any) => sum + (Number(it.quantityPurchased) || 0), 0) : 0);
    if (!parsedQty || parsedQty <= 0) {
      res.status(400).json({ success: false, message: 'Total quantity must be greater than 0' });
      return;
    }

    // Concurrency guard against rapid double clicks on Create
    const createKey = `${req.user?._id}_${businessAccount}_${req.body.vendorInvoiceNumber || ''}_${req.body.vendor || ''}`;
    const lastCreateTime = recentPurchaseCreations.get(createKey);
    if (lastCreateTime && Date.now() - lastCreateTime < 3000) {
      res.status(409).json({ success: false, message: 'Purchase creation already in progress. Please wait a moment.' });
      return;
    }
    recentPurchaseCreations.set(createKey, Date.now());
    if (recentPurchaseCreations.size > 100) {
      const now = Date.now();
      for (const [k, v] of recentPurchaseCreations.entries()) {
        if (now - v > 10000) recentPurchaseCreations.delete(k);
      }
    }

    const calculatedUnitPrice = purchasePricePerUnit !== undefined && purchasePricePerUnit !== null
      ? Number(purchasePricePerUnit)
      : (parsedQty > 0 ? Math.round((Number(totalAmount) || 0) / parsedQty) : 0);

    let assignedInvoiceNumber = req.body.vendorInvoiceNumber?.toString().trim();
    if (!assignedInvoiceNumber) {
      const filter: Record<string, unknown> = {
        isDeleted: false,
        ...accountFilter(businessAccount),
      };
      const allPurchases = await StockPurchase.find(filter).select('vendorInvoiceNumber').lean();
      const existingInvoices = allPurchases.map(p => p.vendorInvoiceNumber).filter(Boolean) as string[];
      assignedInvoiceNumber = calculateNextInvoiceNumber(existingInvoices);
    }

    const paymentStatusInput = req.body.paymentStatus || 'unpaid';
    const totalAmountPaise = Math.round(Number(totalAmount) || (parsedQty * calculatedUnitPrice));
    let paidAmountInitial = 0;
    let dueAmountInitial = totalAmountPaise;

    if (paymentStatusInput === 'paid') {
      paidAmountInitial = totalAmountPaise;
      dueAmountInitial = 0;
    }

    const purchase = await StockPurchase.create({
      ...req.body,
      vendorInvoiceNumber: assignedInvoiceNumber,
      totalQuantity: parsedQty,
      purchasePricePerUnit: calculatedUnitPrice,
      totalAmount: totalAmountPaise,
      paidAmount: paidAmountInitial,
      dueAmount: dueAmountInitial,
      paymentStatus: paymentStatusInput,
      items: Array.isArray(items) ? items : [],
      payments: Array.isArray(req.body.payments) ? req.body.payments : [],
      createdBy: req.user?._id
    });

    // If items with specific products are provided (legacy mode), record per item;
    // Otherwise record direct total quantity warehouse movement
    if (Array.isArray(items) && items.length > 0 && items.some(it => it.product)) {
      for (const item of items) {
        const itemQty = Number(item.quantityPurchased) || 0;
        if (itemQty <= 0) continue;
        const unitCostForMovement = itemQty > 0 ? Math.round((item.totalAmount || (itemQty * item.purchasePricePerUnit)) / itemQty) : item.purchasePricePerUnit;
        await recordStockMovement({
          businessAccount,
          productId: item.product,
          movementType: 'purchase',
          quantity: itemQty,
          unitCost: unitCostForMovement,
          referenceType: 'StockPurchase',
          referenceId: purchase._id.toString(),
          reason: `Stock purchase from vendor`,
          createdBy: req.user?._id?.toString(),
        });
      }
    } else {
      await recordStockMovement({
        businessAccount,
        movementType: 'purchase',
        quantity: parsedQty,
        unitCost: calculatedUnitPrice,
        referenceType: 'StockPurchase',
        referenceId: purchase._id.toString(),
        reason: `Direct stock purchase: ${parsedQty} units`,
        createdBy: req.user?._id?.toString(),
      });
    }

    // Keep active products' purchase cost synchronized with the latest purchase price
    if (calculatedUnitPrice > 0) {
      const activeProducts = await Product.find({ isActive: true });
      for (const prod of activeProducts) {
        const multiplier = (prod.sizeml && prod.sizeml > 50) ? Math.round(prod.sizeml / 50) : 1;
        const syncedCost = calculatedUnitPrice * multiplier;
        await Product.findByIdAndUpdate(prod._id, {
          defaultPurchaseCost: syncedCost,
          weightedAvgCost: syncedCost,
        });
      }
    }

    await createAuditLog({ action: 'CREATE', resource: 'StockPurchase', resourceId: purchase._id.toString(), userId: req.user?._id });
    const populated = await StockPurchase.findById(purchase._id)
      .populate('vendor', 'name phone')
      .populate({
        path: 'items.product',
        select: 'name sku category defaultPurchaseCost weightedAvgCost currentStock',
        populate: { path: 'category', select: 'name' }
      })
      .populate('businessAccount', 'name gstin')
      .populate('payments.paidByPartner', 'name upiId')
      .populate('payments.recordedBy', 'name email');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    console.error('Error creating stock purchase:', err);
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// PUT /api/stock-purchases/:id
router.put('/:id', requireManagerOrAdmin, enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  const purchaseId = req.params.id as string;
  if (activePurchaseLocks.has(purchaseId)) {
    res.status(409).json({ success: false, message: 'An update is already in progress for this purchase. Please wait.' });
    return;
  }
  activePurchaseLocks.add(purchaseId);

  try {
    const existing = await StockPurchase.findById(purchaseId);
    if (!existing || existing.isDeleted) { res.status(404).json({ success: false, message: 'Purchase not found' }); return; }

    const { items, totalQuantity, purchasePricePerUnit, purchaseDate, vendor, vendorInvoiceNumber, discount, additionalCosts, taxAmount, totalAmount, paymentStatus, notes } = req.body;
    const parsedQty = Number(totalQuantity) || (Array.isArray(items) ? items.reduce((sum: number, it: any) => sum + (Number(it.quantityPurchased) || 0), 0) : existing.totalQuantity || 0);

    if (!parsedQty || parsedQty <= 0) {
      res.status(400).json({ success: false, message: 'Total quantity must be greater than 0' });
      return;
    }

    const calculatedUnitPrice = purchasePricePerUnit !== undefined && purchasePricePerUnit !== null
      ? Number(purchasePricePerUnit)
      : (parsedQty > 0 ? Math.round((Number(totalAmount) || 0) / parsedQty) : 0);

    // Reverse old movements, then clean up any remaining movements with this referenceId
    await reverseMovementsByReference(purchaseId, req.user?._id?.toString());
    await StockMovement.deleteMany({
      referenceType: 'StockPurchase',
      referenceId: new mongoose.Types.ObjectId(purchaseId),
    });

    existing.totalQuantity = parsedQty;
    existing.purchasePricePerUnit = calculatedUnitPrice;
    existing.items = Array.isArray(items) ? items : [];
    if (purchaseDate) existing.purchaseDate = purchaseDate;
    if (vendor) existing.vendor = vendor;
    if (vendorInvoiceNumber !== undefined) existing.vendorInvoiceNumber = vendorInvoiceNumber;
    existing.discount = Number(discount) || 0;
    existing.additionalCosts = Number(additionalCosts) || 0;
    existing.taxAmount = Number(taxAmount) || 0;
    existing.totalAmount = Number(totalAmount) || 0;
    if (notes !== undefined) existing.notes = notes;

    // Handle payment status update if specified
    if (paymentStatus) {
      existing.paymentStatus = paymentStatus;
      if (paymentStatus === 'paid' && (!existing.payments || existing.payments.length === 0)) {
        existing.paidAmount = existing.totalAmount;
        existing.dueAmount = 0;
      } else if (paymentStatus === 'unpaid' && (!existing.payments || existing.payments.length === 0)) {
        existing.paidAmount = 0;
        existing.dueAmount = existing.totalAmount;
      }
    }

    await existing.save();
    const updated = existing;

    // Re-record stock movements
    if (Array.isArray(items) && items.length > 0 && items.some(it => it.product)) {
      for (const item of items) {
        const itemQty = Number(item.quantityPurchased) || 0;
        if (itemQty <= 0) continue;
        const unitCostForMovement = itemQty > 0 ? Math.round((item.totalAmount || (itemQty * item.purchasePricePerUnit)) / itemQty) : item.purchasePricePerUnit;
        await recordStockMovement({
          businessAccount: updated.businessAccount.toString(),
          productId: item.product.toString(),
          movementType: 'purchase',
          quantity: itemQty,
          unitCost: unitCostForMovement,
          referenceType: 'StockPurchase',
          referenceId: updated._id.toString(),
          reason: 'Stock purchase updated — re-recorded',
          createdBy: req.user?._id?.toString(),
        });
      }
    } else {
      await recordStockMovement({
        businessAccount: updated.businessAccount.toString(),
        movementType: 'purchase',
        quantity: parsedQty,
        unitCost: calculatedUnitPrice,
        referenceType: 'StockPurchase',
        referenceId: updated._id.toString(),
        reason: `Direct stock purchase updated: ${parsedQty} units`,
        createdBy: req.user?._id?.toString(),
      });
    }

    // Keep active products' purchase cost synchronized with the latest purchase price
    if (calculatedUnitPrice > 0) {
      const activeProducts = await Product.find({ isActive: true });
      for (const prod of activeProducts) {
        const multiplier = (prod.sizeml && prod.sizeml > 50) ? Math.round(prod.sizeml / 50) : 1;
        const syncedCost = calculatedUnitPrice * multiplier;
        await Product.findByIdAndUpdate(prod._id, {
          defaultPurchaseCost: syncedCost,
          weightedAvgCost: syncedCost,
        });
      }
    }

    await createAuditLog({ action: 'UPDATE', resource: 'StockPurchase', resourceId: purchaseId, userId: req.user?._id?.toString() });
    const populated = await StockPurchase.findById(updated._id)
      .populate('vendor', 'name phone')
      .populate({
        path: 'items.product',
        select: 'name sku category defaultPurchaseCost weightedAvgCost currentStock',
        populate: { path: 'category', select: 'name' }
      })
      .populate('businessAccount', 'name gstin')
      .populate('payments.paidByPartner', 'name upiId')
      .populate('payments.recordedBy', 'name email');
    res.json({ success: true, data: populated });
    res.json({ success: true, data: populated });
  } catch (err) {
    console.error('Update error:', err);
    res.status(400).json({ success: false, message: (err as Error).message });
  } finally {
    activePurchaseLocks.delete(purchaseId);
  }
});

// DELETE /api/stock-purchases/:id
router.delete('/:id', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const purchaseId = req.params.id as string;
  if (activePurchaseLocks.has(purchaseId)) {
    res.status(409).json({ success: false, message: 'An operation is already in progress for this purchase.' });
    return;
  }
  activePurchaseLocks.add(purchaseId);

  try {
    const purchase = await StockPurchase.findById(purchaseId);
    if (!purchase || purchase.isDeleted) { res.status(404).json({ success: false, message: 'Purchase not found' }); return; }

    await reverseMovementsByReference(purchaseId, req.user?._id?.toString());
    await StockMovement.deleteMany({
      referenceType: 'StockPurchase',
      referenceId: new mongoose.Types.ObjectId(purchaseId),
    });
    await StockPurchase.findByIdAndUpdate(purchaseId, { isDeleted: true });
    await createAuditLog({ action: 'DELETE', resource: 'StockPurchase', resourceId: purchaseId, userId: req.user?._id?.toString() });
    res.json({ success: true, message: 'Purchase deleted and stock reversed' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  } finally {
    activePurchaseLocks.delete(purchaseId);
  }
});

export default router;
