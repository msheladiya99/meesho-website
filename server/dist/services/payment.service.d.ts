import mongoose from 'mongoose';
import { IPayment, PaymentStatus, IPaymentOrderRef, ReconciliationMatchStatus } from '../models/Payment';
export interface PaymentDaySummary {
    _id: string;
    paymentDate: string;
    displayDate: string;
    formattedAmount: string;
    rawAmount: number;
    netAmount: number;
    ordersAmount: number;
    adsCost: number;
    programCost: number;
    programBenefits: number;
    referralEarnings: number;
    neftId?: string;
    bankName?: string;
    status: PaymentStatus;
    subOrdersCount?: number;
}
export interface PaymentDashboardResponse {
    upcoming: {
        totalAmount: number;
        formattedTotal: string;
        days: PaymentDaySummary[];
        selectedDay?: PaymentDaySummary;
    };
    completed: {
        totalAmount: number;
        formattedTotal: string;
        days: PaymentDaySummary[];
        selectedDay?: PaymentDaySummary;
    };
    unscheduled: {
        count: number;
        estimatedAmount: number;
        formattedAmount: string;
        description: string;
    };
    recentCredits: Array<{
        amount: number;
        formattedAmount: string;
        date: string;
        displayDate: string;
        neftId?: string;
    }>;
}
export declare const formatRupees: (paise: number) => string;
export declare const formatCompactRupees: (paise: number) => string;
export declare const formatMeeshoDate: (d: Date) => string;
/**
 * Fetch Payments Dashboard structured exactly like Meesho Seller Panel:
 * - Upcoming Payments (Next 7 days total & tabs)
 * - Completed Payments (Last 30 days total & tabs)
 * - Unscheduled Payments (dispatched orders pending delivery)
 * - Recent Credited Toast notifications
 */
export declare const getPaymentsDashboard: (params: {
    businessAccount?: string;
    selectedUpcomingDate?: string;
    selectedCompletedDate?: string;
}) => Promise<PaymentDashboardResponse>;
/**
 * List Payments with search, filters, and pagination
 */
export declare const listPayments: (params: {
    businessAccount?: string;
    status?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
}) => Promise<{
    data: (IPayment & Required<{
        _id: mongoose.Types.ObjectId;
    }> & {
        __v: number;
    })[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}>;
/**
 * Record a Payment Receive (Manual Entry)
 */
export declare const recordPaymentReceive: (data: {
    businessAccount: string;
    paymentDate: Date | string;
    status?: PaymentStatus;
    neftId?: string;
    bankName?: string;
    bankAccountNumber?: string;
    ordersAmount: number;
    salesAmount?: number;
    returnsDeduction?: number;
    adsCost?: number;
    programCost?: number;
    otherRecovery?: number;
    programBenefits?: number;
    referralEarnings?: number;
    otherCompensation?: number;
    netAmount?: number;
    ordersCount?: number;
    subOrderIds?: string[];
    notes?: string;
}, userId?: string) => Promise<IPayment>;
/**
 * Import Meesho Payment Sheet (CSV / Excel)
 */
export declare const importMeeshoPaymentSheet: (params: {
    buffer: Buffer;
    businessAccount: string;
    userId?: string;
}) => Promise<{
    totalRows: number;
    paymentsCreated: number;
    paymentsUpdated: number;
}>;
/**
 * Helper to reconcile order references against Order and ReturnOrder collections
 */
export declare const reconcilePaymentOrderRefs: (businessAccount: string, rawRefs: Array<{
    subOrderId: string;
    saleAmount?: number;
    returnAmount?: number;
    shippingOrWeightDeduction?: number;
    netAmount?: number;
}>) => Promise<IPaymentOrderRef[]>;
export interface UnsettledOrderDTO {
    orderId: string;
    subOrderId: string;
    orderDate: string;
    sku: string;
    productName?: string;
    grossAmount: number;
    sellingPrice: number;
    quantity: number;
    status: string;
    carrierName?: string;
    shippingLabelId?: string;
    daysOverdue: number;
}
export interface PaymentDiscrepancyDTO {
    subOrderId: string;
    paymentId?: string;
    neftId?: string;
    paymentDate?: string;
    orderId?: string;
    matchStatus: ReconciliationMatchStatus;
    weightDiscrepancy: boolean;
    discrepancyReason: string;
    saleAmount: number;
    returnAmount: number;
    shippingOrWeightDeduction: number;
    netAmount: number;
    expectedReceivable: number;
    discrepancyAmount: number;
}
export interface PaymentReconciliationResult {
    summary: {
        totalExpectedReceivable: number;
        totalSettledBankCash: number;
        totalDiscrepancyAmount: number;
        unsettledOrdersCount: number;
        unsettledOrdersAmount: number;
        wrongfulReturnsCount: number;
        weightDiscrepanciesCount: number;
    };
    unsettledOrders: UnsettledOrderDTO[];
    discrepancies: PaymentDiscrepancyDTO[];
}
/**
 * Generate full Meesho bank settlement reconciliation report
 */
export declare const getPaymentReconciliation: (params: {
    businessAccount?: string;
    allowedAccounts?: string[];
    startDate?: string;
    endDate?: string;
}) => Promise<PaymentReconciliationResult>;
//# sourceMappingURL=payment.service.d.ts.map