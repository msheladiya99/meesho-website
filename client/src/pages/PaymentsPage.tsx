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
} from 'lucide-react';
import { paymentsApi } from '../services/payments.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatDate, paiseToRupees } from '../lib/utils';
import { RecordPaymentModal } from '../components/ui/RecordPaymentModal';
import { PaymentImportModal } from '../components/ui/PaymentImportModal';
import { ConfirmDialog, LoadingSpinner, EmptyState } from '../components/ui/Feedback';
import { Pagination } from '../components/ui/Pagination';
import toast from 'react-hot-toast';
import type { Payment, PaymentDaySummary } from '../types';

export const PaymentsPage: React.FC = () => {
  const qc = useQueryClient();
  const { activeAccountId, getActiveAccount } = useAccountStore();
  const activeAccount = getActiveAccount();

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
