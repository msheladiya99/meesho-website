import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../services/reports.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatPercent, dateRangePresets, formatDate } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import { LoadingSpinner } from '../components/ui/Feedback';
import type { DateRange } from '../types';
import { AlertTriangle, TrendingUp, TrendingDown, Layers } from 'lucide-react';
import axios from '../lib/axios';

const PnLPage: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const [dateRange, setDateRange] = useState<DateRange>(dateRangePresets().thisMonth);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Categories list query for filter
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await axios.get('/categories');
      return res.data?.data || [];
    },
  });
  const categories: Array<{ _id: string; name: string }> = categoriesData || [];

  const params = {
    accountId: activeAccountId === 'all' ? undefined : activeAccountId,
    categoryId: selectedCategory === 'all' ? undefined : selectedCategory,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['pnl', params],
    queryFn: () => reportsApi.pnl(params),
  });

  const pnl = data?.data?.data;

  const Row = ({
    label,
    value,
    indent = false,
    bold = false,
    positive = true,
    subtotal = false,
    badge,
  }: {
    label: string;
    value: number | undefined;
    indent?: boolean;
    bold?: boolean;
    positive?: boolean;
    subtotal?: boolean;
    badge?: string;
  }) => {
    if (value === undefined) return null;
    const isNeg = value < 0;
    return (
      <div
        className={`flex items-center justify-between py-2 sm:py-2.5 ${
          subtotal ? 'border-t border-gray-200 mt-1 font-semibold' : 'border-b border-gray-50'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={`text-xs sm:text-sm ${
              indent ? 'pl-3 sm:pl-6 text-gray-500' : bold ? 'font-semibold text-gray-900' : 'text-gray-700'
            }`}
          >
            {label}
          </span>
          {badge && (
            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded font-medium">
              {badge}
            </span>
          )}
        </div>
        <span
          className={`text-xs sm:text-sm ${bold ? 'font-bold' : 'font-medium'} ${
            isNeg ? 'text-red-600' : positive ? 'text-gray-900' : 'text-gray-700'
          }`}
        >
          {formatCurrency(Math.abs(value))}
          {isNeg && <span className="text-[10px] sm:text-xs ml-1 text-red-400">(loss)</span>}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 sm:gap-4 justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Profit & Loss</h1>
          <p className="text-sm text-gray-500">
            {formatDate(dateRange.startDate)} – {formatDate(dateRange.endDate)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input text-xs py-1.5 h-8 w-auto min-w-[130px]"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        These are <strong className="mx-1">estimated</strong> figures based on recorded sales, returns, and operating expenses. Customer return fees are charged as separate operating expenses.
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : !pnl ? (
        <div className="card p-8 text-center text-gray-400">No data available for selected period.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* P&L Statement */}
          <div className="card p-3.5 sm:p-6">
            <h2 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider">
              Income Statement
            </h2>
            <div className="space-y-0.5">
              <Row label="Gross Sales / Order Value" value={pnl.grossOrderValue} bold />
              <Row label="Sales Cancellations" value={-pnl.salesCancellations} indent />
              <Row label="Sales Returns / Refunds (Reversals)" value={-pnl.returnsRefunds} indent />
              <Row label="Net Sales" value={pnl.netSales} bold subtotal />
              <div className="h-2" />
              <Row label="Cost of Goods Sold (COGS)" value={-pnl.costOfGoodsSold} indent />
              <Row label="Gross Profit" value={pnl.grossProfit} bold subtotal />
              <div className="h-2" />
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider pt-1 pl-1">
                Operating Expenses
              </p>
              <Row label="Meesho Fees" value={-pnl.meeshoFees} indent />
              <Row label="Shipping Costs" value={-pnl.shippingCosts} indent />
              <Row label="Advertising" value={-pnl.advertising} indent />
              <Row
                label="Customer Return Charges"
                value={-pnl.totalCustomerReturnCharges}
                indent
                badge="Base Fee"
              />
              {pnl.totalCustomerReturnHandlingCharges > 0 && (
                <Row
                  label="Customer Return Handling Charges"
                  value={-pnl.totalCustomerReturnHandlingCharges}
                  indent
                  badge="Handling"
                />
              )}
              {pnl.totalRtoCharges > 0 ? (
                <Row
                  label="RTO Charges"
                  value={-pnl.totalRtoCharges}
                  indent
                  badge="RTO Expense"
                />
              ) : (
                <div className="flex items-center justify-between py-1.5 pl-3 sm:pl-6 text-xs text-gray-400">
                  <span>RTO Charges</span>
                  <span className="font-mono text-gray-400">₹0.00 (Excluded)</span>
                </div>
              )}
              <Row label="Other Operating Expenses" value={-pnl.otherExpenses} indent />
              <Row
                label="Net Operating Profit / Loss"
                value={pnl.operatingProfit}
                bold
                subtotal
                positive={pnl.operatingProfit >= 0}
              />
            </div>
          </div>

          {/* Summary cards */}
          <div className="space-y-4">
            <div
              className={`card p-6 ${
                pnl.operatingProfit >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {pnl.operatingProfit >= 0 ? (
                  <TrendingUp className="w-8 h-8 text-green-500" />
                ) : (
                  <TrendingDown className="w-8 h-8 text-red-500" />
                )}
                <div>
                  <p className="text-sm font-medium text-gray-600">Est. Net Profit</p>
                  <p
                    className={`text-2xl font-bold ${
                      pnl.operatingProfit >= 0 ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {formatCurrency(pnl.operatingProfit)}
                  </p>
                </div>
              </div>
            </div>

            <div className="card p-5 grid grid-cols-2 gap-4">
              {[
                {
                  label: 'Gross Margin',
                  value: pnl.netSales ? formatPercent((pnl.grossProfit / pnl.netSales) * 100) : 'N/A',
                },
                {
                  label: 'Net Margin',
                  value: pnl.netSales
                    ? formatPercent((pnl.operatingProfit / pnl.netSales) * 100)
                    : 'N/A',
                },
                { label: 'Net Sales', value: formatCurrency(pnl.netSales) },
                { label: 'COGS', value: formatCurrency(pnl.costOfGoodsSold) },
                { label: 'Gross Profit', value: formatCurrency(pnl.grossProfit) },
                {
                  label: 'Return Expenses',
                  value: formatCurrency(pnl.totalCustomerReturnExpenses || 0),
                },
                {
                  label: 'Total Expenses',
                  value: formatCurrency(pnl.totalOperatingExpenses || 0),
                },
                {
                  label: 'RTO Charges',
                  value: formatCurrency(pnl.totalRtoCharges || 0),
                },
              ].map((item) => (
                <div key={item.label} className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                  <p className="text-sm font-bold text-gray-900">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="card p-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Accounting Principles
              </h3>
              <ul className="space-y-1.5 text-xs text-gray-500">
                <li>• <strong>Net Sales</strong> = Eligible Sales Revenue − Sales Reversals / Refunds</li>
                <li>• <strong>Gross Profit</strong> = Net Sales − Cost of Goods Sold (COGS)</li>
                <li>• <strong>Customer Return Charges</strong> are recorded as operating expenses (not sales reversals)</li>
                <li>• <strong>RTO Orders</strong> strictly receive zero customer return charges</li>
                <li>• <strong>Net Profit</strong> = Net Sales − COGS − Customer Return Expenses − Other Expenses</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PnLPage;
