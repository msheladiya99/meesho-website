import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet,
  Clock,
  CheckCircle2,
  Truck,
  Plus,
  FileSpreadsheet,
  Download,
  Search,
  ChevronRight,
  ExternalLink,
  Edit2,
  Trash2,
  Copy,
  Check,
  Building,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  CreditCard,
  AlertCircle,
  HelpCircle,
  RotateCcw,
  Scale,
  ShieldAlert,
  FileWarning,
  AlertTriangle,
} from 'lucide-react';
import { paymentsApi } from '../services/payments.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatDate, paiseToRupees } from '../lib/utils';
import { RecordPaymentModal } from '../components/ui/RecordPaymentModal';
import { PaymentImportModal } from '../components/ui/PaymentImportModal';
import { ConfirmDialog, LoadingSpinner, EmptyState } from '../components/ui/Feedback';
import { Pagination } from '../components/ui/Pagination';
import toast from 'react-hot-toast';
import type { Payment, PaymentDaySummary, ReconciliationData, UnsettledOrder, PaymentDiscrepancy } from '../types';

export const PaymentsPage: React.FC = () => {
  const qc = useQueryClient();
  const { activeAccountId, getActiveAccount } = useAccountStore();
  const activeAccount = getActiveAccount();

  // Primary Tab Switcher
  const [activeMainTab, setActiveMainTab] = useState<'payouts' | 'reconciliation'>('payouts');

  // Modals
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);

  // Selected Day tabs for dashboard
  const [selectedUpcomingDayId, setSelectedUpcomingDayId] = useState<string | null>(null);
  const [selectedCompletedDayId, setSelectedCompletedDayId] = useState<string | null>(null);

  // Toast notifications visibility
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, boolean>>({});

  // Table Search and Filter State
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'upcoming'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [copiedNeft, setCopiedNeft] = useState<string | null>(null);

  // Reconciliation filter & search
  const [reconFilter, setReconFilter] = useState<
    'all' | 'unsettled' | 'wrongful_return' | 'weight_discrepancy' | 'underpaid'
  >('all');
  const [reconSearch, setReconSearch] = useState('');
  const [copiedDisputeId, setCopiedDisputeId] = useState<string | null>(null);

  // Reconciliation Query
  const { data: reconRes, isLoading: isReconLoading } = useQuery({
    queryKey: ['payments-reconciliation', activeAccountId],
    queryFn: () =>
      paymentsApi.getReconciliation({
        accountId: activeAccountId === 'all' ? undefined : activeAccountId,
      }),
  });

  const reconData = reconRes?.data?.data;

  // Filtered Unsettled Orders (>15d)
  const filteredUnsettled = useMemo(() => {
    if (!reconData?.unsettledOrders) return [];
    let list = reconData.unsettledOrders;
    if (reconFilter !== 'all' && reconFilter !== 'unsettled') return [];
    if (reconSearch.trim()) {
      const q = reconSearch.trim().toLowerCase();
      list = list.filter(
        (u) =>
          u.subOrderId.toLowerCase().includes(q) ||
          (u.sku && u.sku.toLowerCase().includes(q)) ||
          (u.productName && u.productName.toLowerCase().includes(q)) ||
          (u.carrierName && u.carrierName.toLowerCase().includes(q)) ||
          (u.shippingLabelId && u.shippingLabelId.toLowerCase().includes(q))
      );
    }
    return list;
  }, [reconData?.unsettledOrders, reconFilter, reconSearch]);

  // Filtered Discrepancies
  const filteredDiscrepancies = useMemo(() => {
    if (!reconData?.discrepancies) return [];
    let list = reconData.discrepancies;
    if (reconFilter === 'unsettled') return [];
    if (reconFilter === 'wrongful_return') {
      list = list.filter((d) => d.matchStatus === 'wrongful_return_deduction');
    } else if (reconFilter === 'weight_discrepancy') {
      list = list.filter((d) => d.weightDiscrepancy);
    } else if (reconFilter === 'underpaid') {
      list = list.filter((d) => d.matchStatus === 'underpaid');
    }
    if (reconSearch.trim()) {
      const q = reconSearch.trim().toLowerCase();
      list = list.filter(
        (d) =>
          d.subOrderId.toLowerCase().includes(q) ||
          (d.neftId && d.neftId.toLowerCase().includes(q)) ||
          (d.discrepancyReason && d.discrepancyReason.toLowerCase().includes(q))
      );
    }
    return list;
  }, [reconData?.discrepancies, reconFilter, reconSearch]);

  const handleExportDisputeCsv = () => {
    if (!reconData) {
      toast.error('No reconciliation data available to export');
      return;
    }

    const headers = [
      'Ticket Category',
      'Sub Order ID',
      'Issue Type',
      'Dispute Claim Amount (INR)',
      'Order / Payment Date',
      'Days Overdue / Reference',
      'Details & Evidence',
      'Recommended Action',
    ];

    const rows: string[] = [headers.map((h) => `"${h}"`).join(',')];

    for (const u of reconData.unsettledOrders) {
      rows.push(
        [
          'Payment Delay / Unsettled Order',
          u.subOrderId,
          'Unsettled Dispatched Order (>15 Days)',
          (u.grossAmount / 100).toFixed(2),
          u.orderDate ? u.orderDate.split('T')[0] : '',
          `${u.daysOverdue} days overdue`,
          `Order dispatched via ${u.carrierName || 'carrier'} (AWB: ${u.shippingLabelId || 'N/A'}) - pending payout beyond 15-day SLA`,
          'Escalate to Meesho Seller Support for immediate payment release',
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(',')
      );
    }

    for (const d of reconData.discrepancies) {
      let cat = 'Payment Deduction Dispute';
      let action = 'Raise ticket for wrongful deduction reversal';
      if (d.matchStatus === 'wrongful_return_deduction') {
        cat = 'Wrongful RTO Return Deduction';
        action = 'Demand 100% refund of return deduction on RTO parcel (RTO fee must be ₹0)';
      } else if (d.weightDiscrepancy) {
        cat = 'Weight Discrepancy Dispute';
        action = 'Dispute excess shipping charge with packaging dimension proof';
      } else if (d.matchStatus === 'underpaid') {
        cat = 'Underpaid Payout';
        action = 'Request payment audit for underpaid order reference';
      }

      rows.push(
        [
          cat,
          d.subOrderId,
          d.matchStatus,
          (d.discrepancyAmount / 100).toFixed(2),
          d.paymentDate ? d.paymentDate.split('T')[0] : '',
          d.neftId || 'N/A',
          d.discrepancyReason || '',
          action,
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(',')
      );
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meesho_disputes_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Meesho dispute CSV exported successfully');
  };

  // 1. Fetch Dashboard Data
  const dashboardParams = useMemo(() => ({
    accountId: activeAccountId === 'all' ? undefined : activeAccountId,
  }), [activeAccountId]);

  const { data: dashboardRes, isLoading: isDashboardLoading } = useQuery({
    queryKey: ['payments-dashboard', dashboardParams],
    queryFn: () => paymentsApi.getDashboard(dashboardParams),
  });

  const dashboardData = dashboardRes?.data?.data;

  // Resolve active selected day for Upcoming
  const upcomingDays = dashboardData?.upcoming?.days || [];
  const activeUpcomingDay = useMemo(() => {
    if (!upcomingDays.length) return null;
    if (selectedUpcomingDayId) {
      return upcomingDays.find((d) => d._id === selectedUpcomingDayId) || upcomingDays[0];
    }
    return upcomingDays[0];
  }, [upcomingDays, selectedUpcomingDayId]);

  // Resolve active selected day for Completed
  const completedDays = dashboardData?.completed?.days || [];
  const activeCompletedDay = useMemo(() => {
    if (!completedDays.length) return null;
    if (selectedCompletedDayId) {
      return completedDays.find((d) => d._id === selectedCompletedDayId) || completedDays[0];
    }
    return completedDays[0];
  }, [completedDays, selectedCompletedDayId]);

  // 2. Fetch Payments List for the table
  const listParams = useMemo(() => ({
    accountId: activeAccountId === 'all' ? undefined : activeAccountId,
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: searchQuery.trim() || undefined,
    page,
    limit: pageSize,
  }), [activeAccountId, statusFilter, searchQuery, page, pageSize]);

  const { data: listRes, isLoading: isListLoading } = useQuery({
    queryKey: ['payments', listParams],
    queryFn: () => paymentsApi.list(listParams),
  });

  const paymentsList: Payment[] = listRes?.data?.data || [];
  const pagination = (listRes?.data as any)?.pagination || { page: 1, limit: pageSize, total: 0, pages: 1 };

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => paymentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['payments-dashboard'] });
      toast.success('Payment record deleted successfully');
      setDeletePaymentId(null);
    },
    onError: () => {
      toast.error('Failed to delete payment record');
    },
  });

  const handleCopyNeft = (neft: string) => {
    navigator.clipboard.writeText(neft);
    setCopiedNeft(neft);
    toast.success('NEFT ID copied to clipboard');
    setTimeout(() => setCopiedNeft(null), 2000);
  };

  const handleExportCsv = () => {
    if (!paymentsList.length) {
      toast.error('No payments found to export');
      return;
    }
    const headers = ['Payment Date', 'Status', 'NEFT ID', 'Bank Name', 'Orders Amount (Rs)', 'Ads Cost (Rs)', 'Net Amount (Rs)', 'Notes'];
    const rows = paymentsList.map((p) => [
      new Date(p.paymentDate).toISOString().slice(0, 10),
      p.status,
      p.neftId || '',
      p.bankName || 'Axis Bank',
      (p.ordersAmount / 100).toFixed(2),
      (p.adsCost / 100).toFixed(2),
      (p.netAmount / 100).toFixed(2),
      `"${(p.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Meesho_Payments_${activeAccount?.tradeName || 'All'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Payments exported to CSV');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header matching Meesho layout */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">
              Payments
            </h1>
            {activeAccount && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold border border-gray-200">
                {activeAccount.tradeName || activeAccount.name}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Monitor Meesho upcoming payouts, completed settlements, NEFT credits, and platform deductions.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search by Sub Order / NEFT */}
          <div className="relative w-48 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Order / Sub Order No. / NEFT"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Download Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white shadow-xs transition"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>

          {/* Upload Sheet Button */}
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-xs transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Upload Sheet
          </button>

          {/* + Record Payment Receive Button */}
          <button
            type="button"
            onClick={() => {
              setEditingPayment(null);
              setIsRecordModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-xs hover:shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Add Payment Receive
          </button>
        </div>
      </div>

      {/* Primary Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveMainTab('payouts')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer ${
            activeMainTab === 'payouts'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Payouts & Bank Settlements</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('reconciliation')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer relative ${
            activeMainTab === 'reconciliation'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Settlement Reconciliation & Unsettled Orders</span>
          {reconData && (reconData.summary.unsettledOrdersCount > 0 || reconData.summary.wrongfulReturnsCount > 0) && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700 animate-pulse">
              {reconData.summary.unsettledOrdersCount + reconData.summary.wrongfulReturnsCount}
            </span>
          )}
        </button>
      </div>

      {activeMainTab === 'payouts' && (
        <>
          {/* Main Two Dashboard Cards (Upcoming & Completed Payments side-by-side) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* CARD 1: Upcoming Payments */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            {/* Card Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs animate-pulse" />
                <h3 className="text-sm font-bold text-gray-900">
                  Upcoming Payments
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStatusFilter('upcoming')}
                className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-primary-600 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-200 transition"
              >
                <span>Next 7 days ({dashboardData?.upcoming?.formattedTotal || '₹0.00'})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Horizontal Date Tabs */}
            <div className="p-3 bg-gray-50/70 border-b border-gray-100 flex items-center gap-2 overflow-x-auto">
              {upcomingDays.length > 0 ? (
                upcomingDays.map((day) => {
                  const isSelected = activeUpcomingDay?._id === day._id;
                  return (
                    <button
                      key={day._id}
                      type="button"
                      onClick={() => setSelectedUpcomingDayId(day._id)}
                      className={`px-3 py-2 rounded-lg text-left transition shrink-0 border ${
                        isSelected
                          ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-xs'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <div className="text-[11px] font-medium opacity-80">{day.displayDate}</div>
                      <div className="text-xs font-bold">{day.formattedAmount}</div>
                    </button>
                  );
                })
              ) : (
                <div className="py-2 text-xs text-gray-400 italic">
                  No upcoming payouts scheduled in the next 7 days.
                </div>
              )}
            </div>

            {/* Selected Day Breakdown Table */}
            {activeUpcomingDay ? (
              <div className="p-4">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="text-[11px] font-semibold text-gray-400 border-b border-gray-100 pb-2">
                      <th className="py-2">Transaction Type</th>
                      <th className="py-2">Details</th>
                      <th className="py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="py-2.5 font-medium text-gray-900">
                        Orders
                      </td>
                      <td className="py-2.5 text-gray-500">Sales and returns</td>
                      <td className="py-2.5 text-right font-semibold text-gray-900">
                        {formatCurrency(activeUpcomingDay.ordersAmount)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-medium text-gray-900">
                        Net platform recovery
                      </td>
                      <td className="py-2.5 text-gray-500 space-y-1">
                        <div>Ads Cost</div>
                        <div>Program Cost</div>
                      </td>
                      <td className="py-2.5 text-right text-gray-500 space-y-1">
                        <div>{formatCurrency(activeUpcomingDay.adsCost)}</div>
                        <div>{formatCurrency(activeUpcomingDay.programCost)}</div>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-medium text-gray-900">
                        Net platform compensation
                      </td>
                      <td className="py-2.5 text-gray-500 space-y-1">
                        <div>Program Benefits</div>
                        <div>Referral Earnings</div>
                      </td>
                      <td className="py-2.5 text-right text-gray-500 space-y-1">
                        <div>{formatCurrency(activeUpcomingDay.programBenefits)}</div>
                        <div>{formatCurrency(activeUpcomingDay.referralEarnings)}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-gray-400">
                Select an upcoming payout day to inspect breakdown
              </div>
            )}
          </div>

          {/* Card Footer: Net Amount */}
          {activeUpcomingDay && (
            <div className="p-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Net amount</span>
              <span className="text-base font-black text-gray-900">
                {activeUpcomingDay.formattedAmount}
              </span>
            </div>
          )}
        </div>

        {/* CARD 2: Completed Payments */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            {/* Card Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs" />
                <h3 className="text-sm font-bold text-gray-900">
                  Completed Payments
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStatusFilter('completed')}
                className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-primary-600 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-200 transition"
              >
                <span>Last 30 days ({dashboardData?.completed?.formattedTotal || '₹0.00'})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Horizontal Date Tabs */}
            <div className="p-3 bg-gray-50/70 border-b border-gray-100 flex items-center gap-2 overflow-x-auto">
              {completedDays.length > 0 ? (
                completedDays.map((day) => {
                  const isSelected = activeCompletedDay?._id === day._id;
                  return (
                    <button
                      key={day._id}
                      type="button"
                      onClick={() => setSelectedCompletedDayId(day._id)}
                      className={`px-3 py-2 rounded-lg text-left transition shrink-0 border ${
                        isSelected
                          ? 'bg-purple-100/90 border-purple-300 text-purple-950 shadow-xs'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <div className="text-[11px] font-medium opacity-80">{day.displayDate}</div>
                      <div className="text-xs font-bold">{day.formattedAmount}</div>
                    </button>
                  );
                })
              ) : (
                <div className="py-2 text-xs text-gray-400 italic">
                  No completed payouts recorded in the last 30 days.
                </div>
              )}
            </div>

            {/* Selected Day Breakdown Table */}
            {activeCompletedDay ? (
              <div className="p-4">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="text-[11px] font-semibold text-gray-400 border-b border-gray-100 pb-2">
                      <th className="py-2">Transaction Type</th>
                      <th className="py-2">Details</th>
                      <th className="py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="py-2.5 font-medium text-gray-900">
                        Orders
                      </td>
                      <td className="py-2.5 text-gray-500">Sales and returns</td>
                      <td className="py-2.5 text-right font-semibold text-gray-900">
                        {formatCurrency(activeCompletedDay.ordersAmount)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-medium text-gray-900">
                        Net platform recovery
                      </td>
                      <td className="py-2.5 text-gray-500 space-y-1">
                        <div>Ads Cost</div>
                        <div>Program Cost</div>
                      </td>
                      <td className="py-2.5 text-right text-gray-500 space-y-1">
                        <div>{formatCurrency(activeCompletedDay.adsCost)}</div>
                        <div>{formatCurrency(activeCompletedDay.programCost)}</div>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-medium text-gray-900">
                        Net platform compensation
                      </td>
                      <td className="py-2.5 text-gray-500 space-y-1">
                        <div>Program Benefits</div>
                        <div>Referral Earnings</div>
                      </td>
                      <td className="py-2.5 text-right text-gray-500 space-y-1">
                        <div>{formatCurrency(activeCompletedDay.programBenefits)}</div>
                        <div>{formatCurrency(activeCompletedDay.referralEarnings)}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-gray-400">
                Select a completed payout day to inspect breakdown
              </div>
            )}
          </div>

          {/* Card Footer: NEFT ID & Net Amount */}
          {activeCompletedDay && (
            <div className="p-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-gray-500">
                  {activeCompletedDay.neftId ? (
                    <span className="font-mono flex items-center gap-1 text-gray-700">
                      NEFT ID: {activeCompletedDay.neftId}
                      <button
                        type="button"
                        onClick={() => handleCopyNeft(activeCompletedDay.neftId!)}
                        className="text-gray-400 hover:text-gray-600 ml-1 p-0.5"
                        title="Copy NEFT ID"
                      >
                        {copiedNeft === activeCompletedDay.neftId ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </span>
                  ) : (
                    'Net amount'
                  )}
                </span>
              </div>
              <div className="text-right">
                <span className="text-base font-black text-gray-900">
                  {activeCompletedDay.formattedAmount}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Unscheduled Payments Banner Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-gray-900">
                Unscheduled Payments
              </h4>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                {dashboardData?.unscheduled?.count || 0} Shipped Orders Pending
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
              {dashboardData?.unscheduled?.description ||
                'Payments expected from your shipped orders. Once delivered, we will automatically move it to your upcoming payments.'}
            </p>
          </div>
        </div>

        <div className="text-right sm:border-l sm:border-gray-100 sm:pl-5 shrink-0">
          <span className="text-[11px] text-gray-400 block">Expected Payout</span>
          <span className="text-lg font-black text-blue-600">
            {dashboardData?.unscheduled?.formattedAmount || '₹0.00'}
          </span>
        </div>
      </div>

      {/* Floating Recent Credit Toast Badges (matching bottom-right from Meesho screenshot) */}
      <div className="fixed bottom-5 right-5 z-30 space-y-2 pointer-events-none">
        {dashboardData?.recentCredits?.map((rc, idx) => {
          if (dismissedAlerts[rc.displayDate]) return null;
          return (
            <div
              key={idx}
              className="pointer-events-auto bg-gray-900 text-white p-3 rounded-xl shadow-xl border border-gray-800 flex items-center justify-between gap-3 text-xs w-72 animate-in fade-in slide-in-from-bottom-2"
            >
              <div>
                <p className="font-semibold text-gray-100">
                  Payment of {rc.formattedAmount} Credited on {rc.displayDate}
                </p>
                {rc.neftId && (
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                    NEFT: {rc.neftId}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  setDismissedAlerts((prev) => ({ ...prev, [rc.displayDate]: true }))
                }
                className="text-gray-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Payment History & Settlements Table Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        {/* Table Filters & Header */}
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-900">
              Payment & Settlement History
            </h3>
            <span className="text-xs text-gray-500">
              ({pagination.total} records)
            </span>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-lg border border-gray-200">
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setPage(1);
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                statusFilter === 'all'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Payouts
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('completed');
                setPage(1);
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                statusFilter === 'completed'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Completed
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('upcoming');
                setPage(1);
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                statusFilter === 'upcoming'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Upcoming
            </button>
          </div>
        </div>

        {/* Table Body */}
        {isListLoading ? (
          <div className="py-12 flex justify-center">
            <LoadingSpinner />
          </div>
        ) : paymentsList.length === 0 ? (
          <div className="py-12 text-center">
            <EmptyState
              title="No Payment Records Found"
              description="Record a received Meesho payout or upload your payment sheet to track your cashflow."
              action={
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(true)}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-xs transition mt-3"
                >
                  Add Payment Receive
                </button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-gray-600">
              <thead className="bg-gray-50 uppercase text-[11px] font-semibold text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Payout Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">NEFT / Ref ID</th>
                  <th className="py-3 px-4">Bank</th>
                  <th className="py-3 px-4 text-right">Orders (Sales)</th>
                  <th className="py-3 px-4 text-right">Deductions</th>
                  <th className="py-3 px-4 text-right">Net Credited</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paymentsList.map((payment) => {
                  const pDate = new Date(payment.paymentDate);
                  const isCompleted = payment.status === 'completed';

                  return (
                    <tr
                      key={payment._id}
                      className="hover:bg-gray-50/80 transition"
                    >
                      {/* Payout Date */}
                      <td className="py-3 px-4 font-semibold text-gray-900 whitespace-nowrap">
                        {pDate.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3" />
                            Upcoming
                          </span>
                        )}
                      </td>

                      {/* NEFT ID */}
                      <td className="py-3 px-4 font-mono text-gray-700">
                        {payment.neftId ? (
                          <div className="flex items-center gap-1.5">
                            <span>{payment.neftId}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyNeft(payment.neftId!)}
                              className="text-gray-400 hover:text-gray-600"
                              title="Copy NEFT"
                            >
                              {copiedNeft === payment.neftId ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Scheduled</span>
                        )}
                      </td>

                      {/* Bank Name */}
                      <td className="py-3 px-4 text-gray-600">
                        {payment.bankName || 'Axis Bank'}
                      </td>

                      {/* Orders Amount */}
                      <td className="py-3 px-4 text-right font-medium text-gray-900">
                        {formatCurrency(payment.ordersAmount)}
                      </td>

                      {/* Platform Deductions */}
                      <td className="py-3 px-4 text-right text-rose-500 font-medium">
                        {payment.adsCost > 0 || payment.programCost > 0
                          ? `-${formatCurrency(payment.adsCost + payment.programCost)}`
                          : '₹0.00'}
                      </td>

                      {/* Net Credited */}
                      <td className="py-3 px-4 text-right font-bold text-gray-900 text-sm">
                        {formatCurrency(payment.netAmount)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPayment(payment);
                              setIsRecordModalOpen(true);
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition"
                            title="Edit Record"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletePaymentId(payment._id)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition"
                            title="Delete Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="p-4 border-t border-gray-200">
            <Pagination
              page={page}
              total={pagination.total}
              pageSize={pageSize}
              onPageChange={(p) => setPage(p)}
            />
          </div>
        )}
      </div>
      </>
      )}

      {activeMainTab === 'reconciliation' && (
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Expected Receivable */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Total Expected</p>
                <h3 className="text-xl font-extrabold text-gray-900 mt-0.5">
                  {formatCurrency(reconData?.summary?.totalExpectedReceivable || 0)}
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">Settled cash + unsettled orders</p>
              </div>
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                <Wallet className="w-6 h-6" />
              </div>
            </div>

            {/* Card 2: Settled Bank Cash */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Settled in Bank</p>
                <h3 className="text-xl font-extrabold text-emerald-600 mt-0.5">
                  {formatCurrency(reconData?.summary?.totalSettledBankCash || 0)}
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">Credited Meesho payouts</p>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>

            {/* Card 3: Unsettled Dispatched Orders (>15d) */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Unsettled Orders (&gt;15d)</p>
                <h3 className="text-xl font-extrabold text-amber-600 mt-0.5">
                  {reconData?.summary?.unsettledOrdersCount || 0}{' '}
                  <span className="text-xs font-semibold text-gray-500">
                    ({formatCurrency(reconData?.summary?.unsettledOrdersAmount || 0)})
                  </span>
                </h3>
                <p className="text-[11px] text-amber-700 font-medium mt-0.5">Dispatched but payment overdue</p>
              </div>
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            {/* Card 4: Total Discrepancy Amount */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Total Discrepancies</p>
                <h3 className="text-xl font-extrabold text-rose-600 mt-0.5">
                  {formatCurrency(reconData?.summary?.totalDiscrepancyAmount || 0)}
                </h3>
                <p className="text-[11px] text-rose-700 font-medium mt-0.5">
                  {reconData?.summary?.wrongfulReturnsCount || 0} Wrongful RTO •{' '}
                  {reconData?.summary?.weightDiscrepanciesCount || 0} Weight Flags
                </p>
              </div>
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                <ShieldAlert className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Action & Filter Toolbar */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setReconFilter('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  reconFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All Issues (
                {(reconData?.unsettledOrders?.length || 0) + (reconData?.discrepancies?.length || 0)})
              </button>
              <button
                type="button"
                onClick={() => setReconFilter('unsettled')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  reconFilter === 'unsettled'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                <span>Unsettled (&gt;15 Days)</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-white/20 rounded-full font-bold">
                  {reconData?.summary?.unsettledOrdersCount || 0}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setReconFilter('wrongful_return')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  reconFilter === 'wrongful_return'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
              >
                <span>Wrongful RTO Deductions</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-white/20 rounded-full font-bold">
                  {reconData?.summary?.wrongfulReturnsCount || 0}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setReconFilter('weight_discrepancy')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  reconFilter === 'weight_discrepancy'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                }`}
              >
                <span>Weight Discrepancies</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-white/20 rounded-full font-bold">
                  {reconData?.summary?.weightDiscrepanciesCount || 0}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setReconFilter('underpaid')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  reconFilter === 'underpaid'
                    ? 'bg-gray-800 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Underpaid Payouts
              </button>
            </div>

            {/* Right side: Search & Export CSV */}
            <div className="flex items-center gap-2">
              <div className="relative w-48 sm:w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search Sub Order / SKU / Reason"
                  value={reconSearch}
                  onChange={(e) => setReconSearch(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={handleExportDisputeCsv}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition cursor-pointer shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Dispute CSV</span>
              </button>
            </div>
          </div>

          {isReconLoading ? (
            <LoadingSpinner />
          ) : (
            <div className="space-y-6">
              {/* TABLE 1: Unsettled Dispatched Orders (>15 Days) */}
              {(reconFilter === 'all' || reconFilter === 'unsettled') && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-gray-200 bg-amber-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <h3 className="text-sm font-bold text-gray-900">
                        Unsettled Dispatched Orders (&gt;15 Days Overdue)
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                        {filteredUnsettled.length} orders
                      </span>
                    </div>
                    <p className="text-xs text-amber-800">
                      Dispatched orders whose payment was not received within Meesho's standard 15-day settlement window.
                    </p>
                  </div>

                  {filteredUnsettled.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-xs">
                      No overdue unsettled orders found matching your filters. All dispatched orders older than 15 days have been settled!
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                          <tr>
                            <th className="p-3">Sub Order ID</th>
                            <th className="p-3">Order Date</th>
                            <th className="p-3">Overdue SLA</th>
                            <th className="p-3">Product / SKU</th>
                            <th className="p-3">Carrier / AWB</th>
                            <th className="p-3 text-right">Order Value</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-center">Dispute Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredUnsettled.map((order) => {
                            const isCopied = copiedDisputeId === order.subOrderId;
                            return (
                              <tr key={order.orderId} className="hover:bg-gray-50/80 transition">
                                <td className="p-3 font-mono font-bold text-gray-900 flex items-center gap-1.5">
                                  <span>{order.subOrderId}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(order.subOrderId);
                                      setCopiedDisputeId(order.subOrderId);
                                      toast.success('Sub Order ID copied');
                                      setTimeout(() => setCopiedDisputeId(null), 2000);
                                    }}
                                    className="p-1 text-gray-400 hover:text-gray-700 rounded transition cursor-pointer"
                                    title="Copy Sub Order ID"
                                  >
                                    {isCopied ? (
                                      <Check className="w-3 h-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </td>
                                <td className="p-3 text-gray-600 whitespace-nowrap">
                                  {formatDate(order.orderDate)}
                                </td>
                                <td className="p-3 whitespace-nowrap">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      order.daysOverdue > 10
                                        ? 'bg-rose-100 text-rose-700'
                                        : 'bg-amber-100 text-amber-700'
                                    }`}
                                  >
                                    {order.daysOverdue} days overdue
                                  </span>
                                </td>
                                <td className="p-3 text-gray-800">
                                  <div className="font-semibold">{order.productName || 'Perfume Item'}</div>
                                  <div className="text-[11px] text-gray-400 font-mono">SKU: {order.sku}</div>
                                </td>
                                <td className="p-3 text-gray-600">
                                  <div>{order.carrierName || 'Meesho Logistics'}</div>
                                  {order.shippingLabelId && (
                                    <div className="text-[10px] font-mono text-gray-400">
                                      AWB: {order.shippingLabelId}
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-gray-900">
                                  {formatCurrency(order.grossAmount)}
                                </td>
                                <td className="p-3">
                                  <span className="capitalize px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold text-[10px]">
                                    {order.status}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const text = `Issue: Payment Delay Overdue (${order.daysOverdue} days)\nSub Order ID: ${order.subOrderId}\nOrder Date: ${order.orderDate.split('T')[0]}\nValue: ₹${(order.grossAmount / 100).toFixed(2)}\nCarrier: ${order.carrierName || 'N/A'} (AWB: ${order.shippingLabelId || 'N/A'})\nPlease credit payment immediately.`;
                                      navigator.clipboard.writeText(text);
                                      toast.success('Dispute details copied to clipboard');
                                    }}
                                    className="px-2.5 py-1 text-[11px] font-semibold rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition cursor-pointer"
                                  >
                                    Copy Support Text
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TABLE 2: Settlement Discrepancy Tracker */}
              {reconFilter !== 'unsettled' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-gray-200 bg-rose-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      <h3 className="text-sm font-bold text-gray-900">
                        Settlement Discrepancies & Wrongful Deduction Tracker
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold">
                        {filteredDiscrepancies.length} issues
                      </span>
                    </div>
                    <p className="text-xs text-rose-800">
                      Identifies wrongful return penalties charged on RTOs, weight discrepancies exceeding standard slabs, and underpaid orders.
                    </p>
                  </div>

                  {filteredDiscrepancies.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-xs">
                      No settlement discrepancies found matching your filters.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                          <tr>
                            <th className="p-3">Sub Order ID</th>
                            <th className="p-3">Payout Ref / Date</th>
                            <th className="p-3">Issue Classification</th>
                            <th className="p-3 text-right">System Expected</th>
                            <th className="p-3 text-right">Meesho Paid</th>
                            <th className="p-3 text-right">Discrepancy</th>
                            <th className="p-3">Evidence & Reason</th>
                            <th className="p-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredDiscrepancies.map((disc, idx) => {
                            const isWrongful = disc.matchStatus === 'wrongful_return_deduction';
                            const isWeight = disc.weightDiscrepancy;
                            const isUnderpaid = disc.matchStatus === 'underpaid';

                            return (
                              <tr key={`${disc.subOrderId}-${idx}`} className="hover:bg-gray-50/80 transition">
                                <td className="p-3 font-mono font-bold text-gray-900 flex items-center gap-1.5">
                                  <span>{disc.subOrderId}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(disc.subOrderId);
                                      toast.success('Sub Order ID copied');
                                    }}
                                    className="p-1 text-gray-400 hover:text-gray-700 rounded transition cursor-pointer"
                                    title="Copy Sub Order ID"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                </td>
                                <td className="p-3 text-gray-600">
                                  <div className="font-mono text-[11px] font-semibold text-gray-800">
                                    {disc.neftId || 'N/A'}
                                  </div>
                                  <div className="text-[10px] text-gray-400">
                                    {disc.paymentDate ? formatDate(disc.paymentDate) : 'Settlement'}
                                  </div>
                                </td>
                                <td className="p-3">
                                  {isWrongful && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                      Wrongful RTO Penalty
                                    </span>
                                  )}
                                  {isWeight && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 ml-1">
                                      Weight Discrepancy
                                    </span>
                                  )}
                                  {isUnderpaid && !isWrongful && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                      Underpaid Payout
                                    </span>
                                  )}
                                  {disc.matchStatus === 'unmatched_order' && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200">
                                      Unmatched Order ID
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-right font-mono text-gray-700">
                                  {formatCurrency(disc.expectedReceivable)}
                                </td>
                                <td className="p-3 text-right font-mono text-gray-900 font-semibold">
                                  {formatCurrency(disc.netAmount)}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-rose-600">
                                  -{formatCurrency(disc.discrepancyAmount)}
                                </td>
                                <td className="p-3 text-gray-700 max-w-xs">
                                  <div className="text-[11px]">{disc.discrepancyReason}</div>
                                  {isWrongful && (
                                    <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
                                      RTO packages have ₹0 return shipping fee on Meesho.
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const text = `Dispute Type: ${
                                        isWrongful
                                          ? 'Wrongful RTO Deduction'
                                          : isWeight
                                          ? 'Weight Discrepancy'
                                          : 'Underpaid Payment'
                                      }\nSub Order ID: ${disc.subOrderId}\nNEFT: ${
                                        disc.neftId || 'N/A'
                                      }\nDiscrepancy Claim: ₹${(disc.discrepancyAmount / 100).toFixed(
                                        2
                                      )}\nReason: ${disc.discrepancyReason}\nPlease reverse this wrongful deduction.`;
                                      navigator.clipboard.writeText(text);
                                      toast.success('Dispute claim text copied to clipboard');
                                    }}
                                    className="px-2.5 py-1 text-[11px] font-semibold rounded bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 transition cursor-pointer"
                                  >
                                    Copy Dispute Text
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Record / Edit Payment Modal */}
      {isRecordModalOpen && (
        <RecordPaymentModal
          isOpen={isRecordModalOpen}
          onClose={() => {
            setIsRecordModalOpen(false);
            setEditingPayment(null);
          }}
          editingPayment={editingPayment}
        />
      )}

      {/* Upload Meesho Payment Sheet Modal */}
      {isImportModalOpen && (
        <PaymentImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deletePaymentId && (
        <ConfirmDialog
          isOpen={Boolean(deletePaymentId)}
          title="Delete Payment Record?"
          message="Are you sure you want to delete this payment record? This action will remove it from the payment dashboard."
          confirmText="Delete Payment"
          isDangerous
          onConfirm={() => deleteMutation.mutate(deletePaymentId)}
          onCancel={() => setDeletePaymentId(null)}
        />
      )}
    </div>
  );
};

export default PaymentsPage;
