import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../services/reports.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatPercent, dateRangePresets, formatDate } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import { LoadingSpinner } from '../components/ui/Feedback';
import type { DateRange } from '../types';
import { AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

const PnLPage: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const [dateRange, setDateRange] = useState<DateRange>(dateRangePresets().thisMonth);

  const params = {
    accountId: activeAccountId === 'all' ? undefined : activeAccountId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['pnl', params],
    queryFn: () => reportsApi.pnl(params),
  });

  const pnl = data?.data?.data;

  const Row = ({ label, value, indent = false, bold = false, positive = true, subtotal = false }: {
    label: string; value: number | undefined; indent?: boolean; bold?: boolean; positive?: boolean; subtotal?: boolean;
  }) => {
    if (value === undefined) return null;
    const isNeg = value < 0;
    return (
      <div className={`flex items-center justify-between py-2 sm:py-2.5 ${subtotal ? 'border-t border-gray-200 mt-1' : 'border-b border-gray-50'}`}>
        <span className={`text-xs sm:text-sm ${indent ? 'pl-3 sm:pl-6 text-gray-500' : bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{label}</span>
        <span className={`text-xs sm:text-sm ${bold ? 'font-bold' : 'font-medium'} ${isNeg ? 'text-red-600' : positive ? 'text-gray-900' : 'text-gray-700'}`}>
          {formatCurrency(Math.abs(value))}
          {isNeg && <span className="text-[10px] sm:text-xs ml-1 text-red-400">(loss)</span>}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Profit & Loss</h1>
          <p className="text-sm text-gray-500">{formatDate(dateRange.startDate)} – {formatDate(dateRange.endDate)}</p>
        </div>
        <div className="w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        These are <strong className="mx-1">estimated</strong> figures based on entered data. Not a substitute for audited accounts.
      </div>

      {isLoading ? <LoadingSpinner /> : !pnl ? (
        <div className="card p-8 text-center text-gray-400">No data available for selected period.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* P&L Statement */}
          <div className="card p-3.5 sm:p-6">
            <h2 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider">Income Statement</h2>
            <div className="space-y-0.5">
              <Row label="Gross Order Value" value={pnl.grossOrderValue} bold />
              <Row label="Sales Cancellations" value={-pnl.salesCancellations} indent />
              <Row label="Returns & Refunds" value={-pnl.returnsRefunds} indent />
              <Row label="Net Sales" value={pnl.netSales} bold subtotal />
              <div className="h-2" />
              <Row label="Cost of Goods Sold" value={-pnl.costOfGoodsSold} indent />
              <Row label="Gross Profit" value={pnl.grossProfit} bold subtotal />
              <div className="h-2" />
              <Row label="Meesho Fees" value={-pnl.meeshoFees} indent />
              <Row label="Shipping Costs" value={-pnl.shippingCosts} indent />
              <Row label="Advertising" value={-pnl.advertising} indent />
              <Row label="Other Operating Expenses" value={-pnl.otherExpenses} indent />
              <Row label="Net Operating Profit" value={pnl.operatingProfit} bold subtotal />
            </div>
          </div>

          {/* Summary cards */}
          <div className="space-y-4">
            <div className={`card p-6 ${pnl.operatingProfit >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-center gap-3">
                {pnl.operatingProfit >= 0
                  ? <TrendingUp className="w-8 h-8 text-green-500" />
                  : <TrendingDown className="w-8 h-8 text-red-500" />}
                <div>
                  <p className="text-sm font-medium text-gray-600">Est. Net Profit</p>
                  <p className={`text-2xl font-bold ${pnl.operatingProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatCurrency(pnl.operatingProfit)}
                  </p>
                </div>
              </div>
            </div>

            <div className="card p-5 grid grid-cols-2 gap-4">
              {[
                { label: 'Gross Margin', value: pnl.netSales ? formatPercent((pnl.grossProfit / pnl.netSales) * 100) : 'N/A' },
                { label: 'Net Margin', value: pnl.netSales ? formatPercent((pnl.operatingProfit / pnl.netSales) * 100) : 'N/A' },
                { label: 'Net Sales', value: formatCurrency(pnl.netSales) },
                { label: 'COGS', value: formatCurrency(pnl.costOfGoodsSold) },
                { label: 'Gross Profit', value: formatCurrency(pnl.grossProfit) },
                { label: 'Total Expenses', value: formatCurrency(pnl.meeshoFees + pnl.shippingCosts + pnl.advertising + pnl.otherExpenses) },
              ].map(item => (
                <div key={item.label} className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                  <p className="text-sm font-bold text-gray-900">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="card p-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Key Notes</h3>
              <ul className="space-y-1.5 text-xs text-gray-500">
                <li>• COGS calculated on weighted-average cost basis</li>
                <li>• Unsold inventory excluded from COGS</li>
                <li>• Returns valued at original selling price</li>
                <li>• Meesho settlement data not linked</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PnLPage;
