import { Router, Response } from 'express';
import { User } from '../models/User';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit.service';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// GET /api/users
router.get('/', requireAdmin, async (_req, res: Response): Promise<void> => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  res.json({ success: true, data: users });
});

// POST /api/users
router.post('/', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, password, role, allowedAccounts } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: 'Name, email, and password are required' });
      return;
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      res.status(400).json({ success: false, message: 'Email already in use' });
      return;
    }
    const user = await User.create({ name, email, password, role: role || 'viewer', allowedAccounts: allowedAccounts || [] });
    await createAuditLog({ action: 'CREATE', resource: 'User', resourceId: user._id.toString(), userId: req.user?._id, details: `Created user ${email}` });
    res.status(201).json({ success: true, data: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// PUT /api/users/:id
router.put('/:id', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, role, allowedAccounts, isActive } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, role, allowedAccounts, isActive },
      { new: true, runValidators: true }
    ).select('-password');
    if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }
    await createAuditLog({ action: 'UPDATE', resource: 'User', resourceId: req.params.id, userId: req.user?._id, details: `Updated user ${user.email}` });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      return;
    }
    const user = await User.findById(req.params.id);
    if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }
    user.password = password;
    await user.save();
    await createAuditLog({ action: 'UPDATE', resource: 'User', resourceId: req.params.id, userId: req.user?._id, details: `Password reset for user ${user.email}` });
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.params.id === req.user?._id) {
      res.status(400).json({ success: false, message: 'Cannot delete your own account' });
      return;
    }
    await User.findByIdAndUpdate(req.params.id, { isActive: false });
    await createAuditLog({ action: 'DELETE', resource: 'User', resourceId: req.params.id, userId: req.user?._id });
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
