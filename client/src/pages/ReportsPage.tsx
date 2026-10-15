import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../services/reports.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatNumber, formatDate, dateRangePresets, today } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import { LoadingSpinner } from '../components/ui/Feedback';
import type { DateRange } from '../types';
import { FileDown, Printer, Download } from 'lucide-react';

type ReportType = 'daily' | 'monthly' | 'yearly' | 'custom';

const ReportsPage: React.FC = () => {
  const { activeAccountId, accounts } = useAccountStore();
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [selectedDate, setSelectedDate] = useState(today());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [dateRange, setDateRange] = useState<DateRange>(dateRangePresets().thisMonth);

  const accountId = activeAccountId === 'all' ? undefined : activeAccountId;
  const activeAccount = accounts.find(a => a._id === activeAccountId);

  const dailyQuery = useQuery({
    queryKey: ['report-daily', selectedDate, accountId],
    queryFn: () => reportsApi.daily({ date: selectedDate, accountId }),
    enabled: reportType === 'daily',
  });

  const monthlyQuery = useQuery({
    queryKey: ['report-monthly', selectedYear, selectedMonth, accountId],
    queryFn: () => reportsApi.monthly({ year: selectedYear, month: selectedMonth, accountId }),
    enabled: reportType === 'monthly',
  });

  const yearlyQuery = useQuery({
    queryKey: ['report-yearly', selectedYear, accountId],
    queryFn: () => reportsApi.yearly({ year: selectedYear, accountId }),
    enabled: reportType === 'yearly',
  });

  const customQuery = useQuery({
    queryKey: ['report-custom', dateRange, accountId],
    queryFn: () => reportsApi.custom({ accountId, startDate: dateRange.startDate, endDate: dateRange.endDate }),
    enabled: reportType === 'custom',
  });

  const activeQuery = { daily: dailyQuery, monthly: monthlyQuery, yearly: yearlyQuery, custom: customQuery }[reportType];
  const report = activeQuery.data?.data?.data;
  const isLoading = activeQuery.isLoading;

  const handleExportCsv = async () => {
    try {
      const params: Record<string, string> = { accountId: accountId || 'all' };
      if (reportType === 'daily') params.date = selectedDate;
      else if (reportType === 'monthly') { params.year = String(selectedYear); params.month = String(selectedMonth); }
      else if (reportType === 'yearly') params.year = String(selectedYear);
      else { params.startDate = dateRange.startDate; params.endDate = dateRange.endDate; }

      const res = await reportsApi.exportCsv(reportType, params);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = `report_${reportType}_${today()}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed. Please try again.');
    }
  };

  const handleExportRegister = async (type: string) => {
    try {
      const params: Record<string, string> = {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      };
      if (accountId) {
        params.accountId = accountId;
      }
      const res = await reportsApi.exportCsv(type, params);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${type}_register_${today()}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Register export failed.');
    }
  };

  const MetricRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between py-2 border-b border-gray-50">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
  );

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">
            {activeAccountId === 'all' ? 'All accounts' : activeAccount?.tradeName || activeAccount?.name} •
            Generated {formatDate(new Date().toISOString())}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCsv} className="btn-secondary"><FileDown className="w-4 h-4" /> Export CSV</button>
          <button onClick={() => window.print()} className="btn-secondary"><Printer className="w-4 h-4" /> Print</button>
        </div>
      </div>

      {/* Report type tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {(['daily', 'monthly', 'yearly', 'custom'] as ReportType[]).map(t => (
          <button key={t} onClick={() => setReportType(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-all ${reportType === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Date controls */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        {reportType === 'daily' && (
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="input w-auto" />
        )}
        {(reportType === 'monthly' || reportType === 'yearly') && (
          <>
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="select w-auto">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {reportType === 'monthly' && (
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="select w-auto">
                {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            )}
          </>
        )}
        {reportType === 'custom' && (
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        )}
      </div>

      {/* Report output */}
      {isLoading ? <LoadingSpinner /> : !report ? (
        <div className="card p-8 text-center text-gray-400">No data for selected period.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Orders */}
          <div className="card p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Orders Summary</h2>
            <MetricRow label="Total Orders" value={formatNumber(report.totalOrders || 0)} />
            <MetricRow label="Total Qty Sold" value={formatNumber(report.totalQuantity || 0)} />
            <MetricRow label="Gross Order Value" value={formatCurrency(report.grossOrderValue || 0)} />
          </div>

          {/* Returns */}
          <div className="card p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Returns</h2>
            <MetricRow label="Total Returns" value={formatNumber(report.totalReturns || 0)} />
            <MetricRow label="Return Qty" value={formatNumber(report.returnQuantity || 0)} />
            <MetricRow label="Return Value" value={formatCurrency(report.returnValue || 0)} />
          </div>

          {/* Financials */}
          <div className="card p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Financials</h2>
            <MetricRow label="Net Sales" value={formatCurrency(report.netSales || 0)} />
            <MetricRow label="Stock Purchases" value={formatCurrency(report.stockPurchases || 0)} />
            <MetricRow label="Total Expenses" value={formatCurrency(report.totalExpenses || 0)} />
            <MetricRow label="Est. Gross Profit" value={formatCurrency(report.estimatedGrossProfit || 0)} />
            <MetricRow label="Est. Net Profit" value={formatCurrency(report.estimatedNetProfit || 0)} />
          </div>

          {/* Inventory */}
          <div className="card p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Inventory</h2>
            <MetricRow label="Closing Stock Qty" value={formatNumber(report.closingStockQty || 0)} />
            <MetricRow label="Inventory Value" value={formatCurrency(report.inventoryValue || 0)} />
          </div>

          {/* Category breakdown */}
          {report.categoryBreakdown && report.categoryBreakdown.length > 0 && (
            <div className="card p-5 lg:col-span-2">
              <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Category Breakdown</h2>
              <div className="table-container">
                <table className="table">
                  <thead><tr><th>Category</th><th>Orders</th><th>Qty</th><th>Sales</th><th>Returns</th><th>Net</th></tr></thead>
                  <tbody>
                    {report.categoryBreakdown.map((cat: { category: string; orders: number; qty: number; sales: number; returns: number; net: number }) => (
                      <tr key={cat.category}>
                        <td>{cat.category}</td>
                        <td>{cat.orders}</td>
                        <td>{cat.qty}</td>
                        <td>{formatCurrency(cat.sales)}</td>
                        <td className="text-red-600">{formatCurrency(cat.returns)}</td>
                        <td className="font-semibold">{formatCurrency(cat.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Operational Registers & Exception Audits */}
      <div className="card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
            Warehouse Operational Registers & Audit Exports
          </h2>
          <p className="text-xs text-gray-500">
            Export immutable audit logs and registers for packing scans, RTO, customer returns, and scan exceptions.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          <button
            onClick={() => handleExportRegister('packing')}
            className="p-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-left flex items-center justify-between group transition-all"
          >
            <div>
              <p className="text-xs font-bold text-gray-900">Packing Register</p>
              <p className="text-[11px] text-gray-400">Barcode/QR scan logs</p>
            </div>
            <Download className="w-4 h-4 text-primary-600 group-hover:translate-y-0.5 transition-transform" />
          </button>

          <button
            onClick={() => handleExportRegister('rto')}
            className="p-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-left flex items-center justify-between group transition-all"
          >
            <div>
              <p className="text-xs font-bold text-gray-900">RTO Register</p>
              <p className="text-[11px] text-gray-400">Courier return parcels</p>
            </div>
            <Download className="w-4 h-4 text-amber-600 group-hover:translate-y-0.5 transition-transform" />
          </button>

          <button
            onClick={() => handleExportRegister('customer_returns')}
            className="p-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-left flex items-center justify-between group transition-all"
          >
            <div>
              <p className="text-xs font-bold text-gray-900">Customer Returns</p>
              <p className="text-[11px] text-gray-400">Inspected returns</p>
            </div>
            <Download className="w-4 h-4 text-rose-600 group-hover:translate-y-0.5 transition-transform" />
          </button>

          <button
            onClick={() => handleExportRegister('exceptions')}
            className="p-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-left flex items-center justify-between group transition-all"
          >
            <div>
              <p className="text-xs font-bold text-gray-900">Scan Exceptions</p>
              <p className="text-[11px] text-gray-400">Duplicates & unknown QRs</p>
            </div>
            <Download className="w-4 h-4 text-red-600 group-hover:translate-y-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
