import { Router, Response } from 'express';
import { Category } from '../models/Category';
import { authenticate, requireManagerOrAdmin, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit.service';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res: Response): Promise<void> => {
  const cats = await Category.find({ isActive: true }).sort({ name: 1 });
  res.json({ success: true, data: cats });
});

router.post('/', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cat = await Category.create(req.body);
    await createAuditLog({ action: 'CREATE', resource: 'Category', resourceId: cat._id.toString(), userId: req.user?._id });
    res.status(201).json({ success: true, data: cat });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.put('/:id', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const cat = await Category.findByIdAndUpdate(id, req.body, { new: true });
    if (!cat) { res.status(404).json({ success: false, message: 'Category not found' }); return; }
    await createAuditLog({ action: 'UPDATE', resource: 'Category', resourceId: id, userId: req.user?._id });
    res.json({ success: true, data: cat });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

router.delete('/:id', requireManagerOrAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const category = await Category.findByIdAndDelete(id);
    if (!category) { res.status(404).json({ success: false, message: 'Category not found' }); return; }
    await createAuditLog({ action: 'DELETE', resource: 'Category', resourceId: id, userId: req.user?._id, details: `Deleted category ${category.name}` });
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
