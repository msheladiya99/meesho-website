import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { createAuditLog } from '../services/audit.service';

export interface AuthRequest extends Request {
  user?: {
    _id: string;
    role: string;
    allowedAccounts: string[];
    name: string;
    email: string;
  };
  allowedAccountIds?: string[];
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'No token provided' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('FATAL: JWT_SECRET environment variable is missing.');
    }
    const decoded = jwt.verify(token, secret) as { id: string };

    const user = await User.findById(decoded.id).select('-password').lean();
    if (!user) {
      res.status(401).json({ success: false, message: 'User not found' });
      return;
    }

    req.user = {
      _id: user._id.toString(),
      role: user.role,
      allowedAccounts: (user.allowedAccounts || []).map(String),
      name: user.name,
      email: user.email,
    };

    next();
  } catch (err: any) {
    if (err.message?.includes('JWT_SECRET')) {
      res.status(500).json({ success: false, message: 'Server configuration error: JWT_SECRET missing' });
      return;
    }
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Admin access required' });
    return;
  }
  next();
};

export const requireManagerOrAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!['admin', 'manager'].includes(req.user?.role || '')) {
    res.status(403).json({ success: false, message: 'Insufficient permissions' });
    return;
  }
  next();
};

/**
 * Middleware that enforces the accountId from query/body matches
 * the user's allowed accounts (admins bypass this check).
 */
export const enforceAccountAccess = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.user?.role === 'admin') {
    next();
    return;
  }

  const allowed = req.user?.allowedAccounts || [];
  if (allowed.length === 0) {
    res.status(403).json({ success: false, message: 'No business accounts assigned to this user' });
    return;
  }

  // Validate request body businessAccount if supplied
  const bodyAccount = req.body?.businessAccount;
  if (bodyAccount) {
    const accStr = bodyAccount.toString();
    if (!allowed.includes(accStr)) {
      res.status(403).json({ success: false, message: 'Access to this account is not permitted' });
      return;
    }
  }

  // Validate query accountId
  const queryAccount = req.query.accountId as string | undefined;
  if (queryAccount && queryAccount !== 'all') {
    if (!allowed.includes(queryAccount)) {
      res.status(403).json({ success: false, message: 'Access to this account is not permitted' });
      return;
    }
  } else {
    // When query accountId is 'all' or omitted, attach permitted accounts so queries are scoped
    req.allowedAccountIds = allowed;
    if (allowed.length === 1) {
      req.query.accountId = allowed[0];
    }
  }

  next();
};
