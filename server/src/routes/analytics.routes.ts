import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../models/Order';
import { ReturnOrder } from '../models/ReturnOrder';
import { Expense } from '../models/Expense';
import { Partner } from '../models/Partner';
import { BusinessAccount } from '../models/BusinessAccount';
import { Product } from '../models/Product';
import { StockMovement } from '../models/StockMovement';
import { resolveStockAccountIds } from '../services/inventory.service';
import { authenticate, enforceAccountAccess, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const af = (accountId?: string) =>
  accountId && accountId !== 'all' && mongoose.Types.ObjectId.isValid(accountId)
    ? { businessAccount: new mongoose.Types.ObjectId(accountId) }
    : {};

const df = (startDate?: string, endDate?: string, field = 'orderDate') => {
  const f: Record<string, unknown> = {};
  if (startDate && !isNaN(new Date(startDate).getTime())) f['$gte'] = new Date(startDate);
  if (endDate && !isNaN(new Date(endDate).getTime())) f['$lte'] = new Date(endDate + 'T23:59:59.999Z');
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

// GET /api/analytics/perfume-performance — perfume-wise sell & return counts and metrics
router.get('/perfume-performance', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, startDate, endDate, categoryId, search } = req.query as Record<string, string>;

    // 1. Fetch active products with filters
    const productFilter: Record<string, unknown> = { isActive: true };
    if (categoryId && categoryId !== 'all' && mongoose.Types.ObjectId.isValid(categoryId)) {
      productFilter.category = new mongoose.Types.ObjectId(categoryId);
    }
    if (search && search.trim()) {
      const q = search.trim();
      productFilter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } },
      ];
    }

    const products = await Product.find(productFilter)
      .populate('category', 'name')
      .sort({ name: 1 })
      .lean();

    const productIds = products.map(p => p._id);

    // 2. Resolve account-specific stock if accountId is provided
    const accountStockMap = new Map<string, number>();
    let isSharedStock = false;
    if (accountId && accountId !== 'all' && mongoose.Types.ObjectId.isValid(accountId)) {
      const resolved = await resolveStockAccountIds(accountId);
      isSharedStock = resolved.isSharedStock;
      const stockAgg = await StockMovement.aggregate([
        {
          $match: {
            product: { $in: productIds },
            businessAccount: { $in: resolved.targetAccountIds },
            stockBucket: 'saleable',
          }
        },
        {
          $group: {
            _id: '$product',
            qty: { $sum: '$quantity' }
          }
        }
      ]);
      stockAgg.forEach(item => {
        accountStockMap.set(item._id.toString(), Math.max(0, item.qty));
      });
    }

    // 3. Orders matching account & date filter
    const orderFilter: Record<string, unknown> = {
      isDeleted: false,
      status: { $ne: 'cancelled' },
      ...af(accountId),
      ...df(startDate, endDate, 'orderDate'),
    };

    const orders = await Order.find(orderFilter)
      .select('_id businessAccount orderDate isCombo items product sku quantity grossAmount sellingPrice status')
      .lean();

    // 4. Returns matching account & date filter
    const returnFilter: Record<string, unknown> = {
      isDeleted: false,
      ...af(accountId),
      ...df(startDate, endDate, 'returnDate'),
    };

    const returns = await ReturnOrder.find(returnFilter)
      .select('_id businessAccount returnDate returnType status originalOrder product returnedQuantity goodQuantity damagedQuantity returnAmount')
      .lean();

    // Map stats by product ID string
    const statsMap = new Map<string, {
      _id: string;
      name: string;
      sku: string;
      category?: string;
      sizeml?: number;
      fragranceType?: string;
      brand?: string;
      currentStock: number;
      isSharedStock: boolean;
      defaultPurchaseCost: number;
      sellingPrice: number;
      soldCount: number;
      directSoldCount: number;
      comboSoldCount: number;
      soldOrdersCount: number;
      salesRevenue: number;
      returnCount: number;
      customerReturnCount: number;
      rtoReturnCount: number;
      damagedReturnCount: number;
      returnAmount: number;
      netSoldCount: number;
      returnRate: number;
      netRevenue: number;
    }>();

    for (const p of products) {
      const pIdStr = p._id.toString();
      const stock = accountId && accountId !== 'all'
        ? (accountStockMap.get(pIdStr) ?? 0)
        : Math.max(0, p.currentStock || 0);

      statsMap.set(pIdStr, {
        _id: pIdStr,
        name: p.name,
        sku: p.sku,
        category: (p.category as any)?.name || 'Uncategorized',
        sizeml: p.sizeml,
        fragranceType: p.fragranceType,
        brand: p.brand,
        currentStock: stock,
        isSharedStock,
        defaultPurchaseCost: p.defaultPurchaseCost || 0,
        sellingPrice: p.sellingPrice || 0,
        soldCount: 0,
        directSoldCount: 0,
        comboSoldCount: 0,
        soldOrdersCount: 0,
        salesRevenue: 0,
        returnCount: 0,
        customerReturnCount: 0,
        rtoReturnCount: 0,
        damagedReturnCount: 0,
        returnAmount: 0,
        netSoldCount: 0,
        returnRate: 0,
        netRevenue: 0,
      });
    }

    // Set of orders counted in ReturnOrder
    const returnOrderOriginalIds = new Set<string>();

    for (const r of returns) {
      if (r.originalOrder) {
        returnOrderOriginalIds.add(r.originalOrder.toString());
      }
      const pid = r.product ? r.product.toString() : null;
      if (pid && statsMap.has(pid)) {
        const item = statsMap.get(pid)!;
        const qty = r.returnedQuantity || 1;
        item.returnCount += qty;
        if (r.returnType === 'rto_return') {
          item.rtoReturnCount += qty;
        } else {
          item.customerReturnCount += qty;
        }
        item.damagedReturnCount += (r.damagedQuantity || 0);
        item.returnAmount += (r.returnAmount || 0);
      }
    }

    // Aggregate Orders
    for (const o of orders) {
      if (o.isCombo && Array.isArray(o.items) && o.items.length > 0) {
        for (const it of o.items) {
          const pid = it.product ? it.product.toString() : null;
          if (pid && statsMap.has(pid)) {
            const item = statsMap.get(pid)!;
            const qty = it.quantity || 1;
            item.soldCount += qty;
            item.comboSoldCount += qty;
            item.soldOrdersCount += 1;
            const unitPrice = it.sellingPrice || Math.round((o.grossAmount || 0) / o.items.length);
            item.salesRevenue += unitPrice * qty;

            // If order itself is marked returned and not in ReturnOrder collection
            if (['returned', 'rto_received'].includes(o.status) && !returnOrderOriginalIds.has(o._id.toString())) {
              item.returnCount += qty;
              if (o.status === 'rto_received') item.rtoReturnCount += qty;
              else item.customerReturnCount += qty;
              item.returnAmount += unitPrice * qty;
            }
          }
        }
      } else if (o.product) {
        const pid = o.product.toString();
        if (statsMap.has(pid)) {
          const item = statsMap.get(pid)!;
          const qty = o.quantity || 1;
          item.soldCount += qty;
          item.directSoldCount += qty;
          item.soldOrdersCount += 1;
          const rev = o.grossAmount || ((o.sellingPrice || 0) * qty) || 0;
          item.salesRevenue += rev;

          // If order itself is marked returned and not in ReturnOrder collection
          if (['returned', 'rto_received'].includes(o.status) && !returnOrderOriginalIds.has(o._id.toString())) {
            item.returnCount += qty;
            if (o.status === 'rto_received') item.rtoReturnCount += qty;
            else item.customerReturnCount += qty;
            item.returnAmount += rev;
          }
        }
      }
    }

    // Finalize calculated fields
    const perfumeList = Array.from(statsMap.values()).map(item => {
      const netSoldCount = item.soldCount - item.returnCount;
      const returnRate = item.soldCount > 0
        ? Number(((item.returnCount / item.soldCount) * 100).toFixed(1))
        : 0;
      const netRevenue = item.salesRevenue - item.returnAmount;

      return {
        ...item,
        netSoldCount,
        returnRate,
        netRevenue,
      };
    });

    // Summary totals
    const totals = perfumeList.reduce((acc, p) => {
      acc.totalSoldUnits += p.soldCount;
      acc.totalReturnUnits += p.returnCount;
      acc.totalNetSoldUnits += p.netSoldCount;
      acc.totalSalesRevenue += p.salesRevenue;
      acc.totalReturnAmount += p.returnAmount;
      acc.totalNetRevenue += p.netRevenue;
      acc.totalStockUnits += p.currentStock;
      return acc;
    }, {
      totalSoldUnits: 0,
      totalReturnUnits: 0,
      totalNetSoldUnits: 0,
      totalSalesRevenue: 0,
      totalReturnAmount: 0,
      totalNetRevenue: 0,
      totalStockUnits: 0,
    });

    const overallReturnRate = totals.totalSoldUnits > 0
      ? Number(((totals.totalReturnUnits / totals.totalSoldUnits) * 100).toFixed(1))
      : 0;

    res.json({
      success: true,
      data: {
        perfumes: perfumeList,
        summary: {
          ...totals,
          overallReturnRate,
          totalPerfumes: perfumeList.length,
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
