import { Router, Response } from 'express';
import { BusinessAccount } from '../models/BusinessAccount';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit.service';

const router = Router();
router.use(authenticate);

// GET /api/business-accounts
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let query = {};
    // Non-admins only see their allowed accounts
    if (req.user?.role !== 'admin' && req.user?.allowedAccounts?.length) {
      query = { _id: { $in: req.user.allowedAccounts } };
    }
    const accounts = await BusinessAccount.find(query).sort({ name: 1 });
    res.json({ success: true, data: accounts });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /api/business-accounts
router.post('/', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const account = await BusinessAccount.create(req.body);
    await createAuditLog({ action: 'CREATE', resource: 'BusinessAccount', resourceId: account._id.toString(), userId: req.user?._id, details: `Created GSTIN account ${account.gstin}` });
    res.status(201).json({ success: true, data: account });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// PUT /api/business-accounts/:id
router.put('/:id', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const account = await BusinessAccount.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
    if (!account) { res.status(404).json({ success: false, message: 'Account not found' }); return; }
    await createAuditLog({ action: 'UPDATE', resource: 'BusinessAccount', resourceId: id, userId: req.user?._id });
    res.json({ success: true, data: account });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

// DELETE /api/business-accounts/:id
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    await BusinessAccount.findByIdAndUpdate(id, { isActive: false });
    await createAuditLog({ action: 'DELETE', resource: 'BusinessAccount', resourceId: id, userId: req.user?._id });
    res.json({ success: true, message: 'Account deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
