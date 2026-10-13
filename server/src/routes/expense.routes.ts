import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { Expense } from '../models/Expense';
import { Partner } from '../models/Partner';
import { authenticate, requireManagerOrAdmin, enforceAccountAccess, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit.service';

const router = Router();
router.use(authenticate);

const accountFilter = (accountId?: string): Record<string, unknown> =>
  accountId && accountId !== 'all' ? { businessAccount: new mongoose.Types.ObjectId(accountId) } : {};

// GET /api/expenses
router.get('/', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate, page = '1', limit = '100' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { isDeleted: false, ...accountFilter(accountId) };
    if (startDate || endDate) {
      filter.expenseDate = {};
      if (startDate) (filter.expenseDate as Record<string, unknown>)['$gte'] = new Date(startDate);
      if (endDate) (filter.expenseDate as Record<string, unknown>)['$lte'] = new Date(endDate + 'T23:59:59.999Z');
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [expenses, total] = await Promise.all([
      Expense.find(filter).populate('paidByPartner', 'name').populate('allocations.partner', 'name').populate('businessAccount', 'name gstin').sort({ expenseDate: -1 }).skip(skip).limit(parseInt(limit)),
      Expense.countDocuments(filter),
    ]);
    res.json({ success: true, data: expenses, total });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /api/expenses
router.post('/', requireManagerOrAdmin, enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { businessAccount, amount, allocationMethod, paidBy, paidByPartner } = req.body;
    if (!businessAccount) { res.status(400).json({ success: false, message: 'businessAccount is required' }); return; }

    // Auto-generate equal allocations if method is equal
    let { allocations } = req.body;
    if (allocationMethod === 'equal' && (!allocations || allocations.length === 0)) {
      const partners = await Partner.find({ isActive: true });
      if (partners.length > 0) {
        const perPartner = Math.round(amount / partners.length);
        const rem = amount - perPartner * partners.length;
        allocations = partners.map((p, i) => ({
          partner: p._id,
          amount: i === 0 ? perPartner + rem : perPartner,
          percent: Math.round(100 / partners.length),
        }));
      }
    }

    // Validate allocation total
    if (allocations && allocations.length > 0) {
      const allocTotal = allocations.reduce((s: number, a: { amount: number }) => s + a.amount, 0);
      if (Math.abs(allocTotal - amount) > 5) { // allow 5 paise rounding tolerance
        res.status(400).json({ success: false, message: `Allocation total (${allocTotal}) does not match expense amount (${amount})` });
        return;
      }
    }

    const expense = await Expense.create({
      ...req.body,
      allocations,
      paidByPartner: paidByPartner || undefined,
      createdBy: req.user?._id,
    });

    await createAuditLog({ action: 'CREATE', resource: 'Expense', resourceId: expense._id.toString(), userId: req.user?._id, details: `${req.body.category}: ₹${(amount / 100).toFixed(2)}` });
    const populated = await Expense.findById(expense._id).populate('paidByPartner', 'name').populate('allocations.partner', 'name').populate('businessAccount', 'name gstin');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// PUT /api/expenses/:id
router.put('/:id', requireManagerOrAdmin, enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updated = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('paidByPartner', 'name').populate('businessAccount', 'name gstin');
    if (!updated) { res.status(404).json({ success: false, message: 'Expense not found' }); return; }
    await createAuditLog({ action: 'UPDATE', resource: 'Expense', resourceId: req.params.id, userId: req.user?._id });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await Expense.findByIdAndUpdate(req.params.id, { isDeleted: true });
    await createAuditLog({ action: 'DELETE', resource: 'Expense', resourceId: req.params.id, userId: req.user?._id });
    res.json({ success: true, message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/expenses/summary/partner
router.get('/summary/partner', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { isDeleted: false, ...accountFilter(accountId) };
    if (startDate || endDate) {
      filter.expenseDate = {};
      if (startDate) (filter.expenseDate as Record<string, unknown>)['$gte'] = new Date(startDate);
      if (endDate) (filter.expenseDate as Record<string, unknown>)['$lte'] = new Date(endDate + 'T23:59:59.999Z');
    }

    const [partners, expenses] = await Promise.all([
      Partner.find({ isActive: true }),
      Expense.find(filter),
    ]);

    const summary = partners.map(p => {
      const pid = p._id.toString();
      let paid = 0;
      let allocated = 0;
      for (const e of expenses) {
        if (e.paidByPartner?.toString() === pid) paid += e.amount;
        const alloc = e.allocations.find(a => a.partner?.toString() === pid);
        if (alloc) allocated += alloc.amount;
      }
      return { partner: p.name, partnerId: pid, paid, allocated, balance: paid - allocated };
    });

    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
