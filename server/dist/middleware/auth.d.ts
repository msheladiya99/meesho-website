import { Request, Response, NextFunction } from 'express';
export interface AuthRequest extends Request {
    user?: {
        _id: string;
        role: string;
        allowedAccounts: string[];
        name: string;
        email: string;
    };
}
export declare const authenticate: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const requireAdmin: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const requireManagerOrAdmin: (req: AuthRequest, res: Response, next: NextFunction) => void;
/**
 * Middleware that enforces the accountId from query/body matches
 * the user's allowed accounts (admins bypass this check).
 */
export declare const enforceAccountAccess: (req: AuthRequest, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map