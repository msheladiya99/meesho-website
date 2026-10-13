import { Router, Response } from 'express';
import { Partner } from '../models/Partner';
import { Expense } from '../models/Expense';
import { authenticate, requireManagerOrAdmin, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit.service';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res: Response): Promise<void> => {
  const partners = await Partner.find({ isActive: true }).sort({ name: 1 });
  res.json({ success: true, data: partners });
});

router.get('/:id', async (req, res: Response): Promise<void> => {
  try {
    const p = await Partner.findById(req.params.id);
    if (!p) { res.status(404).json({ success: false, message: 'Partner not found' }); return; }
    res.json({ success: true, data: p });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

router.post('/', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const p = await Partner.create(req.body);
    await createAuditLog({ action: 'CREATE', resource: 'Partner', resourceId: p._id.toString(), userId: req.user?._id });
    res.status(201).json({ success: true, data: p });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.put('/:id', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const p = await Partner.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!p) { res.status(404).json({ success: false, message: 'Partner not found' }); return; }
    await createAuditLog({ action: 'UPDATE', resource: 'Partner', resourceId: req.params.id, userId: req.user?._id });
    res.json({ success: true, data: p });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/partners/balance — partner expense balance summary
router.get('/balance', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { isDeleted: false };
    if (accountId && accountId !== 'all') filter.businessAccount = accountId;
    if (startDate || endDate) {
      filter.expenseDate = {};
      if (startDate) (filter.expenseDate as Record<string, unknown>)['$gte'] = new Date(startDate);
      if (endDate) (filter.expenseDate as Record<string, unknown>)['$lte'] = new Date(endDate + 'T23:59:59.999Z');
    }

    const [partners, expenses] = await Promise.all([
      Partner.find({ isActive: true }),
      Expense.find(filter).populate('allocations.partner'),
    ]);

    const balances: Record<string, { expensesPaid: number; expensesAllocated: number; balance: number }> = {};
    for (const partner of partners) {
      const pid = partner._id.toString();
      balances[pid] = { expensesPaid: 0, expensesAllocated: 0, balance: 0 };
    }

    for (const expense of expenses) {
      if (expense.paidByPartner) {
        const pid = expense.paidByPartner.toString();
        if (balances[pid]) balances[pid].expensesPaid += expense.amount;
      }
      for (const alloc of expense.allocations) {
        const pid = alloc.partner?.toString();
        if (pid && balances[pid]) balances[pid].expensesAllocated += alloc.amount;
      }
    }

    for (const pid of Object.keys(balances)) {
      balances[pid].balance = balances[pid].expensesPaid - balances[pid].expensesAllocated;
    }

    res.json({ success: true, data: balances });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
