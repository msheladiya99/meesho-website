import { Router, Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Payment } from '../models/Payment';
import { authenticate, requireManagerOrAdmin, enforceAccountAccess, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit.service';
import {
  getPaymentsDashboard,
  listPayments,
  recordPaymentReceive,
  importMeeshoPaymentSheet,
  formatRupees,
} from '../services/payment.service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
});

const router = Router();
router.use(authenticate);

// GET /api/payments/dashboard
// Returns summary and day tabs for Upcoming, Completed, and Unscheduled payments
router.get('/dashboard', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, upcomingDate, completedDate } = req.query as Record<string, string>;
    const dashboardData = await getPaymentsDashboard({
      businessAccount: accountId,
      selectedUpcomingDate: upcomingDate,
      selectedCompletedDate: completedDate,
    });
    res.json({ success: true, data: dashboardData });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// GET /api/payments
// List payments with search, date range, status, and pagination
router.get('/', enforceAccountAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, status, search, startDate, endDate, page, limit } = req.query as Record<string, string>;

    const result = await listPayments({
      businessAccount: accountId,
      status,
      search,
      startDate,
      endDate,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 25,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// POST /api/payments
// Record a Payment Receive (Manual Entry)
router.post(
  '/',
  requireManagerOrAdmin,
  enforceAccountAccess,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const {
        businessAccount,
        paymentDate,
        status,
        neftId,
        bankName,
        bankAccountNumber,
        ordersAmount,
        salesAmount,
        returnsDeduction,
        adsCost,
        programCost,
        otherRecovery,
        programBenefits,
        referralEarnings,
        otherCompensation,
        netAmount,
        subOrderIds,
        notes,
      } = req.body;

      if (!businessAccount) {
        res.status(400).json({ success: false, message: 'businessAccount is required' });
        return;
      }
      if (!paymentDate) {
        res.status(400).json({ success: false, message: 'paymentDate is required' });
        return;
      }
      if (ordersAmount === undefined && netAmount === undefined) {
        res.status(400).json({ success: false, message: 'ordersAmount or netAmount is required' });
        return;
      }

      const payment = await recordPaymentReceive(
        {
          businessAccount,
          paymentDate,
          status,
          neftId,
          bankName,
          bankAccountNumber,
          ordersAmount: ordersAmount !== undefined ? Number(ordersAmount) : Number(netAmount),
          salesAmount: salesAmount !== undefined ? Number(salesAmount) : undefined,
          returnsDeduction: returnsDeduction !== undefined ? Number(returnsDeduction) : 0,
          adsCost: adsCost !== undefined ? Number(adsCost) : 0,
          programCost: programCost !== undefined ? Number(programCost) : 0,
          otherRecovery: otherRecovery !== undefined ? Number(otherRecovery) : 0,
          programBenefits: programBenefits !== undefined ? Number(programBenefits) : 0,
          referralEarnings: referralEarnings !== undefined ? Number(referralEarnings) : 0,
          otherCompensation: otherCompensation !== undefined ? Number(otherCompensation) : 0,
          netAmount: netAmount !== undefined ? Number(netAmount) : undefined,
          subOrderIds: Array.isArray(subOrderIds) ? subOrderIds : [],
          notes,
        },
        req.user?._id?.toString()
      );

      res.status(201).json({
        success: true,
        message: `Payment receive of ${formatRupees(payment.netAmount)} recorded successfully.`,
        data: payment,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: (err as Error).message });
    }
  }
);

// GET /api/payments/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('businessAccount', 'name tradeName gstin')
      .populate('createdBy', 'name email');

    if (!payment || payment.isDeleted) {
      res.status(404).json({ success: false, message: 'Payment record not found' });
      return;
    }

    res.json({ success: true, data: payment });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// PUT /api/payments/:id
router.put(
  '/:id',
  requireManagerOrAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const payment = await Payment.findById(req.params.id);
      if (!payment || payment.isDeleted) {
        res.status(404).json({ success: false, message: 'Payment record not found' });
        return;
      }

      const {
        businessAccount,
        paymentDate,
        status,
        neftId,
        bankName,
        bankAccountNumber,
        ordersAmount,
        salesAmount,
        returnsDeduction,
        adsCost,
        programCost,
        otherRecovery,
        programBenefits,
        referralEarnings,
        otherCompensation,
        netAmount,
        notes,
      } = req.body;

      if (businessAccount && mongoose.Types.ObjectId.isValid(businessAccount)) {
        payment.businessAccount = new mongoose.Types.ObjectId(businessAccount);
      }
      if (paymentDate) payment.paymentDate = new Date(paymentDate);
      if (status) payment.status = status;
      if (neftId !== undefined) payment.neftId = neftId.trim();
      if (bankName !== undefined) payment.bankName = bankName.trim();
      if (bankAccountNumber !== undefined) payment.bankAccountNumber = bankAccountNumber.trim();
      if (ordersAmount !== undefined) payment.ordersAmount = Number(ordersAmount);
      if (salesAmount !== undefined) payment.salesAmount = Number(salesAmount);
      if (returnsDeduction !== undefined) payment.returnsDeduction = Number(returnsDeduction);
      if (adsCost !== undefined) payment.adsCost = Number(adsCost);
      if (programCost !== undefined) payment.programCost = Number(programCost);
      if (otherRecovery !== undefined) payment.otherRecovery = Number(otherRecovery);
      if (programBenefits !== undefined) payment.programBenefits = Number(programBenefits);
      if (referralEarnings !== undefined) payment.referralEarnings = Number(referralEarnings);
      if (otherCompensation !== undefined) payment.otherCompensation = Number(otherCompensation);

      if (netAmount !== undefined) {
        payment.netAmount = Number(netAmount);
      } else {
        payment.netAmount =
          payment.ordersAmount -
          (payment.adsCost + payment.programCost + payment.otherRecovery) +
          (payment.programBenefits + payment.referralEarnings + payment.otherCompensation);
      }

      if (notes !== undefined) payment.notes = notes.trim();

      await payment.save();
      await payment.populate('businessAccount', 'name tradeName gstin');

      if (req.user?._id) {
        await createAuditLog({
          action: 'UPDATE',
          resource: 'Payment',
          resourceId: payment._id.toString(),
          userId: req.user._id.toString(),
          details: `Updated payment ${payment._id} (${formatRupees(payment.netAmount)})`,
        });
      }

      res.json({ success: true, message: 'Payment updated successfully', data: payment });
    } catch (err) {
      res.status(500).json({ success: false, message: (err as Error).message });
    }
  }
);

// DELETE /api/payments/:id
router.delete(
  '/:id',
  requireManagerOrAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const payment = await Payment.findById(req.params.id);
      if (!payment || payment.isDeleted) {
        res.status(404).json({ success: false, message: 'Payment record not found' });
        return;
      }

      payment.isDeleted = true;
      await payment.save();

      if (req.user?._id) {
        await createAuditLog({
          action: 'DELETE',
          resource: 'Payment',
          resourceId: payment._id.toString(),
          userId: req.user._id.toString(),
          details: `Deleted payment record ${payment._id} (NEFT: ${payment.neftId || 'N/A'}, ${formatRupees(payment.netAmount)})`,
        });
      }

      res.json({ success: true, message: 'Payment record deleted successfully' });
    } catch (err) {
      res.status(500).json({ success: false, message: (err as Error).message });
    }
  }
);

// POST /api/payments/import
// Import Meesho Payment Sheet (CSV / Excel)
router.post(
  '/import',
  requireManagerOrAdmin,
  enforceAccountAccess,
  upload.single('file'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }

      const businessAccount = req.body.businessAccount || (req.query.accountId as string);
      if (!businessAccount || businessAccount === 'all') {
        res.status(400).json({ success: false, message: 'Please select a specific GSTIN business account for import' });
        return;
      }

      const result = await importMeeshoPaymentSheet({
        buffer: req.file.buffer,
        businessAccount,
        userId: req.user?._id?.toString(),
      });

      res.json({
        success: true,
        message: `Import completed: ${result.paymentsCreated} payment records created, ${result.paymentsUpdated} updated from ${result.totalRows} rows.`,
        data: result,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: (err as Error).message });
    }
  }
);

export default router;
