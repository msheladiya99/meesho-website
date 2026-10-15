import { Router, Response } from 'express';
import { AuditLog } from '../models/AuditLog';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireAdmin);

// GET /api/audit-logs
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = '1', limit = '10', action, resource, search } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const skip = (pageNum - 1) * limitNum;

    const filter: Record<string, any> = {};

    if (action && action !== 'ALL') {
      filter.action = action;
    }

    if (resource && resource !== 'ALL') {
      filter.resource = resource;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { resource: searchRegex },
        { details: searchRegex },
        { ip: searchRegex },
      ];
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('user', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      AuditLog.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;

    res.json({
      success: true,
      data: logs,
      total,
      totalPages,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/audit-logs/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const log = await AuditLog.findById(req.params.id).populate('user', 'name email role');
    if (!log) {
      res.status(404).json({ success: false, message: 'Audit log not found' });
      return;
    }
    res.json({ success: true, data: log });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
