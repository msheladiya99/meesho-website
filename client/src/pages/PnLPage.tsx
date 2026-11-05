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
            <h2 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider flex items-center justify-between">
              <span>Income Statement</span>
              <span className="text-[11px] font-normal text-gray-500 lowercase bg-gray-100 px-2 py-0.5 rounded">
                purchase + packing + customer returns
              </span>
            </h2>
            <div className="space-y-0.5">
              {/* 1. Revenue / Net Sales */}
              <Row label="Gross Sales / Order Value" value={pnl.grossOrderValue} bold />
              <Row label="Sales Cancellations" value={-pnl.salesCancellations} indent />
              <Row label="Sales Returns / Refunds (Reversals)" value={-pnl.returnsRefunds} indent />
              <Row label="Net Sales" value={pnl.netSales} bold subtotal />

              <div className="h-2" />

              {/* 2. Direct Costs: Purchase Price + Packing Charges */}
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider pt-1 pl-1">
                Direct Cost of Goods & Packaging
              </p>
              <Row
                label="Product Purchase Price"
                value={-(pnl.totalPurchaseCost ?? pnl.purchaseCost ?? pnl.costOfGoodsSold)}
                indent
                badge="Base COGS"
              />
              
              {/* Packaging Charges Breakdown */}
              <div className="bg-gray-50/75 rounded-lg p-2 my-1 border border-gray-100 space-y-0.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600 px-1 pb-1">
                  <span>Packing Charges Breakdown</span>
                  <span className="font-mono text-gray-500">{formatCurrency(pnl.totalPackingCharges || 0)}</span>
                </div>
                <Row
                  label="• Box Price (₹2 / unit)"
                  value={-(pnl.totalBoxCost ?? 0)}
                  indent
                />
                <Row
                  label="• Sticker Price (₹1 – ₹4 / unit)"
                  value={-(pnl.totalStickerCost ?? 0)}
                  indent
                />
                <Row
                  label="• 1 POP Bag + Review Card (₹1 / unit)"
                  value={-(pnl.totalBagCardCost ?? 0)}
                  indent
                />
                <Row
                  label="• 1 Order Print Label (₹1 / parcel)"
                  value={-(pnl.totalPrintLabelCost ?? 0)}
                  indent
                />
                <Row
                  label="Total Packing Charges"
                  value={-(pnl.totalPackingCharges ?? 0)}
                  bold
                />
              </div>

              <Row
                label="Total Purchase Price + Packing Charges"
                value={-(pnl.totalPurchaseAndPackingCost ?? ((pnl.purchaseCost ?? pnl.costOfGoodsSold) + (pnl.totalPackingCharges ?? 0)))}
                bold
                subtotal
              />
              <Row label="Gross Profit" value={pnl.grossProfit} bold subtotal positive={pnl.grossProfit >= 0} />

              <div className="h-2" />

              {/* 3. Customer Returns & Operating Expenses */}
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider pt-1 pl-1">
                Customer Returns & Operating Expenses
              </p>
              <Row
                label="Less: Customer Return Charges (Base Fee)"
                value={-pnl.totalCustomerReturnCharges}
                indent
                badge="Customer Return"
              />
              {pnl.totalCustomerReturnHandlingCharges > 0 && (
                <Row
                  label="Less: Customer Return Handling Charges"
                  value={-pnl.totalCustomerReturnHandlingCharges}
                  indent
                  badge="Handling Fee"
                />
              )}
              {/* RTO Notice */}
              <div className="flex items-center justify-between py-1.5 pl-3 sm:pl-6 text-xs text-emerald-700 bg-emerald-50/60 rounded px-2 my-0.5 border border-emerald-100/50">
                <span className="flex items-center gap-1 font-medium">
                  RTO Courier Returns (Not Customer Return)
                </span>
                <span className="font-mono font-semibold text-emerald-700">₹0.00 (Free / Zero Charge)</span>
              </div>

              <Row label="Meesho Marketplace Fees" value={-pnl.meeshoFees} indent />
              <Row label="Shipping Costs" value={-pnl.shippingCosts} indent />
              <Row label="Advertising & Marketing" value={-pnl.advertising} indent />
              <Row label="Other Operating Expenses" value={-pnl.otherExpenses} indent />
              <Row
                label="Total Deductions (Returns + Expenses)"
                value={-pnl.totalOperatingExpenses}
                bold
              />

              <div className="h-1" />

              {/* 4. Bottom Line: Net Profit / Loss */}
              <Row
                label="Net Profit / Loss"
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
                  <p className="text-sm font-medium text-gray-600">Net Profit / Loss</p>
                  <p
                    className={`text-2xl font-bold ${
                      pnl.operatingProfit >= 0 ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {formatCurrency(pnl.operatingProfit)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Net Sales − Purchase Price − Packing Charges − Customer Returns − Expenses
                  </p>
                </div>
              </div>
            </div>

            <div className="card p-5 grid grid-cols-2 gap-3 sm:gap-4">
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
                { label: 'Purchase Cost', value: formatCurrency(pnl.totalPurchaseCost ?? pnl.purchaseCost ?? pnl.costOfGoodsSold) },
                { label: 'Packing Charges', value: formatCurrency(pnl.totalPackingCharges || 0) },
                { label: 'Purchase + Packing', value: formatCurrency(pnl.totalPurchaseAndPackingCost || ((pnl.purchaseCost ?? pnl.costOfGoodsSold) + (pnl.totalPackingCharges || 0))) },
                {
                  label: 'Customer Return Loss',
                  value: formatCurrency(pnl.totalCustomerReturnExpenses || 0),
                },
                {
                  label: 'RTO Return Fee',
                  value: '₹0.00 (Excluded)',
                },
                {
                  label: 'Operating Expenses',
                  value: formatCurrency((pnl.totalOperatingExpenses || 0) - (pnl.totalCustomerReturnExpenses || 0)),
                },
                {
                  label: 'Total Expenses & Returns',
                  value: formatCurrency(pnl.totalOperatingExpenses || 0),
                },
              ].map((item) => (
                <div key={item.label} className="text-center p-2.5 sm:p-3 bg-gray-50 rounded-lg">
                  <p className="text-[11px] text-gray-500 mb-0.5">{item.label}</p>
                  <p className="text-xs sm:text-sm font-bold text-gray-900">{item.value}</p>
                </div>
              ))}
            </div>

            {/* Packaging & Unit Economics Guide */}
            <div className="card p-5 space-y-2.5">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider flex items-center justify-between">
                <span>Unit Cost & Packaging Structure</span>
                <span className="text-[10px] text-primary-600 bg-primary-50 px-2 py-0.5 rounded font-bold">Standard Model</span>
              </h3>
              <div className="text-xs text-gray-600 space-y-1.5 bg-gray-50 p-3 rounded-lg border border-gray-100">
                <div className="flex justify-between border-b border-gray-200 pb-1">
                  <span>Product Purchase Price (Example):</span>
                  <span className="font-semibold text-gray-800">₹55.00</span>
                </div>
                <div className="flex justify-between">
                  <span>+ Box Price:</span>
                  <span>₹2.00</span>
                </div>
                <div className="flex justify-between">
                  <span>+ Sticker Price:</span>
                  <span>₹1.00 <span className="text-[10px] text-gray-400">(or ₹4.00 for special perfume)</span></span>
                </div>
                <div className="flex justify-between">
                  <span>+ 1 POP Bag + Review Card:</span>
                  <span>₹1.00</span>
                </div>
                <div className="flex justify-between">
                  <span>+ 1 Order Print Label:</span>
                  <span>₹1.00</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-1 font-medium text-gray-700">
                  <span>= Total Packing Charge:</span>
                  <span className="font-bold text-primary-700">₹5.00 – ₹8.00</span>
                </div>
                <div className="flex justify-between border-t border-dashed border-gray-300 pt-1 font-bold text-gray-900">
                  <span>= Total Unit Cost (Purchase + Pack):</span>
                  <span className="text-emerald-700 font-extrabold">₹60.00 – ₹63.00</span>
                </div>
              </div>
              <div className="text-[11px] text-gray-500 space-y-1">
                <p>• <strong>Less Customer Return:</strong> Customer returns incur return base + handling fees which are deducted from profit.</p>
                <p>• <strong>RTO Return:</strong> Courier undelivered returns (RTO) do NOT incur return fees on Meesho and are strictly zero-charged.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PnLPage;
