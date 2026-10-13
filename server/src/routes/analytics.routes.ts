import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../models/Order';
import { ReturnOrder } from '../models/ReturnOrder';
import { Expense } from '../models/Expense';
import { Partner } from '../models/Partner';
import { BusinessAccount } from '../models/BusinessAccount';
import { authenticate, enforceAccountAccess, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const af = (accountId?: string) =>
  accountId && accountId !== 'all' ? { businessAccount: new mongoose.Types.ObjectId(accountId) } : {};

const df = (startDate?: string, endDate?: string, field = 'orderDate') => {
  const f: Record<string, unknown> = {};
  if (startDate) f['$gte'] = new Date(startDate);
  if (endDate) f['$lte'] = new Date(endDate + 'T23:59:59.999Z');
  return Object.keys(f).length ? { [field]: f } : {};
};

// GET /api/analytics/top-products
router.get('/top-products', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate } = req.query as Record<string, string>;
    const result = await Order.aggregate([
      { $match: { isDeleted: false, ...af(accountId), ...df(startDate, endDate) } },
      { $group: { _id: '$product', qty: { $sum: '$quantity' }, sales: { $sum: '$grossAmount' } } },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $project: { name: '$product.name', sku: '$product.sku', qty: 1, sales: 1 } },
      { $sort: { qty: -1 } },
      { $limit: 15 },
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/analytics/returns-by-category
router.get('/returns-by-category', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate } = req.query as Record<string, string>;
    const result = await ReturnOrder.aggregate([
      { $match: { isDeleted: false, ...af(accountId), ...df(startDate, endDate, 'returnDate') } },
      { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'prod' } },
      { $unwind: '$prod' },
      { $lookup: { from: 'categories', localField: 'prod.category', foreignField: '_id', as: 'cat' } },
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$cat._id', category: { $first: { $ifNull: ['$cat.name', 'Uncategorized'] } }, qty: { $sum: '$returnedQuantity' }, amount: { $sum: '$returnAmount' } } },
      { $sort: { qty: -1 } },
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/analytics/daily-trend
router.get('/daily-trend', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate } = req.query as Record<string, string>;
    const [salesTrend, returnTrend] = await Promise.all([
      Order.aggregate([
        { $match: { isDeleted: false, ...af(accountId), ...df(startDate, endDate) } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$orderDate', timezone: 'Asia/Kolkata' } }, sales: { $sum: '$grossAmount' } } },
        { $sort: { _id: 1 } },
      ]),
      ReturnOrder.aggregate([
        { $match: { isDeleted: false, ...af(accountId), ...df(startDate, endDate, 'returnDate') } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$returnDate', timezone: 'Asia/Kolkata' } }, returns: { $sum: '$returnAmount' } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const returnMap = Object.fromEntries(returnTrend.map((r: { _id: string; returns: number }) => [r._id, r.returns]));
    const merged = salesTrend.map((s: { _id: string; sales: number }) => ({
      date: s._id,
      sales: s.sales,
      returns: returnMap[s._id] || 0,
    }));

    res.json({ success: true, data: merged });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/analytics/monthly-comparison
router.get('/monthly-comparison', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, year } = req.query as Record<string, string>;
    const y = parseInt(year || String(new Date().getFullYear()));
    const start = new Date(y, 0, 1);
    const end = new Date(y, 11, 31, 23, 59, 59, 999);

    const [salesByMonth, returnsByMonth] = await Promise.all([
      Order.aggregate([
        { $match: { isDeleted: false, orderDate: { $gte: start, $lte: end }, ...af(accountId) } },
        { $group: { _id: { $month: '$orderDate' }, sales: { $sum: '$grossAmount' } } },
        { $sort: { _id: 1 } },
      ]),
      ReturnOrder.aggregate([
        { $match: { isDeleted: false, returnDate: { $gte: start, $lte: end }, ...af(accountId) } },
        { $group: { _id: { $month: '$returnDate' }, returns: { $sum: '$returnAmount' } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const returnMap = Object.fromEntries(returnsByMonth.map((r: { _id: number; returns: number }) => [r._id, r.returns]));
    const data = salesByMonth.map((s: { _id: number; sales: number }) => ({
      month: months[s._id - 1],
      sales: s.sales,
      returns: returnMap[s._id] || 0,
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/analytics/inventory-snapshot
router.get('/inventory-snapshot', async (_req, res: Response): Promise<void> => {
  try {
    const { Product } = await import('../models/Product');
    const products = await Product.find({ isActive: true }).populate('category', 'name');
    const data = products.map(p => ({ name: p.name, sku: p.sku, qty: p.currentStock, value: p.currentStock * p.weightedAvgCost }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/analytics/partner-expenses
router.get('/partner-expenses', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { isDeleted: false, ...af(accountId), ...df(startDate, endDate, 'expenseDate') };
    const [partners, expenses] = await Promise.all([
      Partner.find({ isActive: true }),
      Expense.find(filter),
    ]);

    const data = partners.map(p => {
      const pid = p._id.toString();
      let paid = 0; let allocated = 0;
      for (const e of expenses) {
        if (e.paidByPartner?.toString() === pid) paid += e.amount;
        const alloc = e.allocations.find(a => a.partner?.toString() === pid);
        if (alloc) allocated += alloc.amount;
      }
      return { partner: p.name, paid, allocated };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/analytics/gstin-performance
router.get('/gstin-performance', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query as Record<string, string>;
    const accounts = await BusinessAccount.find({ isActive: true });

    const data = await Promise.all(accounts.map(async (acc) => {
      const accFilter = { businessAccount: acc._id };
      const [oAgg, rAgg] = await Promise.all([
        Order.aggregate([{ $match: { isDeleted: false, ...accFilter, ...df(startDate, endDate) } }, { $group: { _id: null, sales: { $sum: '$grossAmount' }, orders: { $sum: 1 } } }]),
        ReturnOrder.aggregate([{ $match: { isDeleted: false, ...accFilter, ...df(startDate, endDate, 'returnDate') } }, { $group: { _id: null, returns: { $sum: '$returnAmount' } } }]),
      ]);
      return {
        name: acc.tradeName || acc.name,
        gstin: acc.gstin,
        sales: oAgg[0]?.sales || 0,
        orders: oAgg[0]?.orders || 0,
        returns: rAgg[0]?.returns || 0,
        netSales: (oAgg[0]?.sales || 0) - (rAgg[0]?.returns || 0),
      };
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
