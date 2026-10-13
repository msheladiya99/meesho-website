import { Router, Response } from 'express';
import { Vendor } from '../models/Vendor';
import { authenticate, requireManagerOrAdmin, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit.service';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res: Response): Promise<void> => {
  const vendors = await Vendor.find({ isActive: true }).sort({ name: 1 });
  res.json({ success: true, data: vendors });
});

router.post('/', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const v = await Vendor.create(req.body);
    await createAuditLog({ action: 'CREATE', resource: 'Vendor', resourceId: v._id.toString(), userId: req.user?._id });
    res.status(201).json({ success: true, data: v });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.put('/:id', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const v = await Vendor.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!v) { res.status(404).json({ success: false, message: 'Vendor not found' }); return; }
    await createAuditLog({ action: 'UPDATE', resource: 'Vendor', resourceId: req.params.id, userId: req.user?._id });
    res.json({ success: true, data: v });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.delete('/:id', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await Vendor.findByIdAndUpdate(req.params.id, { isActive: false });
    await createAuditLog({ action: 'DELETE', resource: 'Vendor', resourceId: req.params.id, userId: req.user?._id });
    res.json({ success: true, message: 'Vendor deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
