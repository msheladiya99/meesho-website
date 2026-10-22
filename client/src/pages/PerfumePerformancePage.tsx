import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Flame, ShoppingCart, RotateCcw, Package, Download, RefreshCw,
  Search, ArrowUpDown, TrendingUp, CheckCircle2, AlertTriangle, X,
  Percent, DollarSign, Filter, Layers, Info
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from 'recharts';

import { analyticsApi } from '../services/reports.service';
import { categoriesApi } from '../services/inventory.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatNumber, dateRangePresets, today } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import { LoadingSpinner, EmptyState } from '../components/ui/Feedback';
import type { PerfumePerformance, PerfumePerformanceSummary, Category, DateRange } from '../types';

type SortField = 'soldCount' | 'returnCount' | 'netSoldCount' | 'returnRate' | 'currentStock' | 'name' | 'salesRevenue';
type SortOrder = 'asc' | 'desc';

const PerfumePerformancePage: React.FC = () => {
  const { activeAccountId, accounts } = useAccountStore();

  // Filters state
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: '', // empty means all time
    endDate: '',
  });
  const [isAllTime, setIsAllTime] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('soldCount');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedPerfume, setSelectedPerfume] = useState<PerfumePerformance | null>(null);

  // Active account name
  const currentAccount = accounts.find(a => a._id === activeAccountId);

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list(),
  });
  const categories: Category[] = categoriesData?.data?.data || [];

  // Query performance data
  const queryParams = {
    accountId: activeAccountId === 'all' ? undefined : activeAccountId,
    startDate: isAllTime ? undefined : dateRange.startDate || undefined,
    endDate: isAllTime ? undefined : dateRange.endDate || undefined,
    categoryId: selectedCategory === 'all' ? undefined : selectedCategory,
    search: search.trim() || undefined,
  };

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['perfume-performance', queryParams],
    queryFn: () => analyticsApi.perfumePerformance(queryParams),
  });

  const responseData = data?.data?.data;
  const rawPerfumes: PerfumePerformance[] = responseData?.perfumes || [];
  const summary: PerfumePerformanceSummary = responseData?.summary || {
    totalSoldUnits: 0,
    totalReturnUnits: 0,
    totalNetSoldUnits: 0,
    totalSalesRevenue: 0,
    totalReturnAmount: 0,
    totalNetRevenue: 0,
    totalStockUnits: 0,
    overallReturnRate: 0,
    totalPerfumes: 0,
  };

  // Sorting logic
  const sortedPerfumes = useMemo(() => {
    return [...rawPerfumes].sort((a, b) => {
      let valA: string | number = a[sortField] ?? 0;
      let valB: string | number = b[sortField] ?? 0;

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB as string).toLowerCase();
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortOrder === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [rawPerfumes, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Date range handlers
  const handleDatePreset = (preset: 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'all') => {
    if (preset === 'all') {
      setIsAllTime(true);
      setDateRange({ startDate: '', endDate: '' });
    } else {
      setIsAllTime(false);
      const ranges = dateRangePresets();
      setDateRange(ranges[preset]);
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (sortedPerfumes.length === 0) return;

    const headers = [
      'Perfume Name',
      'SKU',
      'Category',
      'Bottle Size (ml)',
      'Current Stock',
      'Total Sold Units',
      'Single Order Sold',
      'Combo Order Sold',
      'Orders Count',
      'Total Return Units',
      'Customer Returns',
      'Courier RTO Returns',
      'Net Sold Units',
      'Return Rate (%)',
      'Gross Sales Revenue (INR)',
      'Return Value (INR)',
      'Net Revenue (INR)',
    ];

    const rows = sortedPerfumes.map(p => [
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.sku}"`,
      `"${p.category || ''}"`,
      p.sizeml || '',
      p.currentStock,
      p.soldCount,
      p.directSoldCount,
      p.comboSoldCount,
      p.soldOrdersCount,
      p.returnCount,
      p.customerReturnCount,
      p.rtoReturnCount,
      p.netSoldCount,
      `${p.returnRate}%`,
      (p.salesRevenue / 100).toFixed(2),
      (p.returnAmount / 100).toFixed(2),
      (p.netRevenue / 100).toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `perfume_sales_returns_${today()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Prepare chart data (top perfumes by sold)
  const chartData = useMemo(() => {
    return [...rawPerfumes]
      .sort((a, b) => b.soldCount - a.soldCount)
      .slice(0, 10)
      .map(p => ({
        name: p.name.length > 12 ? p.name.slice(0, 10) + '..' : p.name,
        fullName: p.name,
        sold: p.soldCount,
        returns: p.returnCount,
        net: p.netSoldCount,
      }));
  }, [rawPerfumes]);

  return (
    <div className="space-y-6">
      {/* Page Title & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-brand-600 flex items-center justify-center text-white shadow-xs">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">Perfume Sales & Returns</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Perfume-wise sales count, return count, net volume, and inventory status
                {currentAccount && (
                  <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
                    Account: {currentAccount.tradeName || currentAccount.name}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Date Presets */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-xs">
            <button
              onClick={() => handleDatePreset('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                isAllTime ? 'bg-primary-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => handleDatePreset('today')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                !isAllTime && dateRange.startDate === today() && dateRange.endDate === today()
                  ? 'bg-primary-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => handleDatePreset('last7')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                !isAllTime && dateRange.startDate === dateRangePresets().last7.startDate
                  ? 'bg-primary-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => handleDatePreset('thisMonth')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                !isAllTime && dateRange.startDate === dateRangePresets().thisMonth.startDate
                  ? 'bg-primary-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              This Month
            </button>
          </div>

          {!isAllTime && (
            <DateRangePicker
              value={dateRange}
              onChange={(newRange) => {
                setIsAllTime(false);
                setDateRange(newRange);
              }}
            />
          )}

          <button
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="p-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg shadow-xs transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin text-primary-600' : ''}`} />
          </button>

          <button
            onClick={handleExportCsv}
            disabled={sortedPerfumes.length === 0}
            className="btn btn-secondary flex items-center gap-1.5 text-xs font-medium py-1.5 px-3"
            title="Export to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Total Sold Units */}
        <div className="card p-4 border border-blue-100/80 bg-gradient-to-br from-blue-50/50 to-white shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Total Sold Units</span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900 mt-2">{formatNumber(summary.totalSoldUnits)}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Sales: <span className="font-semibold text-gray-700">{formatCurrency(summary.totalSalesRevenue)}</span>
          </p>
        </div>

        {/* Total Return Units */}
        <div className="card p-4 border border-rose-100/80 bg-gradient-to-br from-rose-50/50 to-white shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Total Return Units</span>
            <div className="w-7 h-7 rounded-lg bg-rose-100 flex items-center justify-center text-rose-600">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900 mt-2">{formatNumber(summary.totalReturnUnits)}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Value: <span className="font-semibold text-rose-600">{formatCurrency(summary.totalReturnAmount)}</span>
          </p>
        </div>

        {/* Net Units Sold */}
        <div className="card p-4 border border-emerald-100/80 bg-gradient-to-br from-emerald-50/50 to-white shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Net Units Sold</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900 mt-2">{formatNumber(summary.totalNetSoldUnits)}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Net: <span className="font-semibold text-emerald-700">{formatCurrency(summary.totalNetRevenue)}</span>
          </p>
        </div>

        {/* Overall Return Rate */}
        <div className="card p-4 border border-purple-100/80 bg-gradient-to-br from-purple-50/50 to-white shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Overall Return Rate</span>
            <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900 mt-2">
            {summary.overallReturnRate.toFixed(1)}%
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {summary.overallReturnRate === 0 ? (
              <span className="text-emerald-600 font-medium">✓ Zero returns</span>
            ) : summary.overallReturnRate < 15 ? (
              <span className="text-emerald-600 font-medium">✓ Low return rate</span>
            ) : summary.overallReturnRate < 25 ? (
              <span className="text-amber-600 font-medium">⚠ Moderate rate</span>
            ) : (
              <span className="text-red-600 font-medium">⚠ High return rate</span>
            )}
          </p>
        </div>

        {/* Current Active Stock */}
        <div className="card p-4 border border-amber-100/80 bg-gradient-to-br from-amber-50/50 to-white shadow-xs col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Total Stock</span>
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900 mt-2">{formatNumber(summary.totalStockUnits)}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Across {summary.totalPerfumes} perfume lines
          </p>
        </div>
      </div>

      {/* Visual Chart Card */}
      {chartData.length > 0 && (
        <div className="card p-5 border border-gray-100 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-gray-800">Top Perfumes — Sold vs Return Comparison</h2>
              <p className="text-xs text-gray-500">Visual comparison of unit sales and returns for top perfume varieties</p>
            </div>
            <span className="text-xs text-gray-400 font-medium">Top 10 Perfumes</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip
                  formatter={(val: any, name: any) => [
                    `${val} units`,
                    name === 'sold' ? 'Sold Units' : name === 'returns' ? 'Return Units' : 'Net Sold'
                  ]}
                  labelFormatter={(_label, payload) => {
                    const item = payload?.[0]?.payload;
                    return item?.fullName || _label;
                  }}
                  contentStyle={{ borderRadius: 8, fontSize: 12, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: 12, fontSize: 12 }}
                  formatter={(value) => (value === 'sold' ? 'Sold Units' : value === 'returns' ? 'Return Units' : 'Net Sold')}
                />
                <Bar dataKey="sold" name="sold" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="returns" name="returns" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="net" name="net" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="card p-3 sm:p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 flex-1">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              className="input pl-9 text-xs py-2 w-full"
              placeholder="Search perfume name or SKU..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="select text-xs py-2 w-full sm:max-w-[180px]"
          >
            <option value="all">All Categories</option>
            {categories.map(c => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center justify-between sm:justify-end gap-2">
          <span className="text-xs text-gray-500 font-medium">Sort by:</span>
          <select
            value={sortField}
            onChange={e => setSortField(e.target.value as SortField)}
            className="select text-xs py-1.5 font-medium flex-1 sm:flex-none"
          >
            <option value="soldCount">Most Sold</option>
            <option value="returnCount">Most Returns</option>
            <option value="netSoldCount">Highest Net Sold</option>
            <option value="returnRate">Highest Return Rate</option>
            <option value="currentStock">Current Stock</option>
            <option value="salesRevenue">Sales Revenue</option>
            <option value="name">Perfume Name (A-Z)</option>
          </select>

          <button
            onClick={() => setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
            className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors flex-shrink-0"
            title={`Toggle order: currently ${sortOrder.toUpperCase()}`}
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Perfume Table */}
      <div className="card shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <LoadingSpinner />
            <p className="text-xs text-gray-500 mt-3 font-medium">Calculating perfume sales & return metrics...</p>
          </div>
        ) : sortedPerfumes.length === 0 ? (
          <EmptyState
            title="No perfumes found"
            description={search ? `No perfumes matched "${search}". Try clearing your search filter.` : 'No perfume orders or products recorded.'}
            icon={<Flame className="w-12 h-12 text-gray-300" />}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr className="bg-gray-50/80 text-gray-600 text-[10px] sm:text-xs uppercase tracking-wider font-semibold">
                  <th className="cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('name')}>
                    <div className="flex items-center gap-1">
                      <span>Perfume</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-400" />
                    </div>
                  </th>
                  <th className="cursor-pointer hover:bg-gray-100 transition-colors text-center" onClick={() => handleSort('currentStock')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Stock</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-400" />
                    </div>
                  </th>
                  <th className="cursor-pointer hover:bg-gray-100 transition-colors text-right" onClick={() => handleSort('soldCount')}>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-blue-700">Sold</span>
                      <ArrowUpDown className="w-3 h-3 text-blue-500" />
                    </div>
                  </th>
                  <th className="cursor-pointer hover:bg-gray-100 transition-colors text-right" onClick={() => handleSort('returnCount')}>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-rose-700">Return</span>
                      <ArrowUpDown className="w-3 h-3 text-rose-500" />
                    </div>
                  </th>
                  <th className="cursor-pointer hover:bg-gray-100 transition-colors text-right" onClick={() => handleSort('netSoldCount')}>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-emerald-700">Net</span>
                      <ArrowUpDown className="w-3 h-3 text-emerald-500" />
                    </div>
                  </th>
                  <th className="hidden md:table-cell cursor-pointer hover:bg-gray-100 transition-colors text-center" onClick={() => handleSort('returnRate')}>
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Return Rate</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-400" />
                    </div>
                  </th>
                  <th className="hidden lg:table-cell cursor-pointer hover:bg-gray-100 transition-colors text-right" onClick={() => handleSort('salesRevenue')}>
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Sales Revenue</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-400" />
                    </div>
                  </th>
                  <th className="hidden sm:table-cell text-center">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedPerfumes.map((perfume) => {
                  const isOutOfStock = perfume.currentStock <= 0;
                  const isLowStock = perfume.currentStock > 0 && perfume.currentStock <= 5;
                  const returnRate = perfume.returnRate;

                  return (
                    <tr
                      key={perfume._id}
                      className="hover:bg-primary-50/30 transition-colors cursor-pointer group"
                      onClick={() => setSelectedPerfume(perfume)}
                    >
                      {/* Perfume Name & SKU */}
                      <td className="py-2.5 sm:py-3.5">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="hidden sm:flex w-9 h-9 rounded-lg bg-primary-50 border border-primary-100 items-center justify-center text-primary-600 font-bold text-xs flex-shrink-0 group-hover:bg-primary-600 group-hover:text-white transition-all shadow-2xs">
                            <Flame className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 group-hover:text-primary-700 transition-colors text-xs sm:text-sm truncate max-w-[115px] sm:max-w-none">
                              {perfume.name}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="font-mono text-[9px] sm:text-[11px] text-gray-500 bg-gray-100 px-1 py-0.2 rounded truncate max-w-[80px] sm:max-w-none">
                                {perfume.sku}
                              </span>
                              {perfume.category && perfume.category !== 'Uncategorized' && (
                                <span className="hidden sm:inline text-[10px] text-gray-500">
                                  {perfume.category}
                                </span>
                              )}
                              {perfume.sizeml ? (
                                <span className="text-[9px] sm:text-[10px] text-gray-400">
                                  · {perfume.sizeml}ml
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Stock Quantity */}
                      <td className="text-center">
                        <div className="inline-flex items-center gap-1">
                          <span
                            className={`font-bold px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs ${
                              isOutOfStock
                                ? 'bg-red-100 text-red-700 font-extrabold'
                                : isLowStock
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {perfume.currentStock}
                          </span>
                          {perfume.isSharedStock && (
                            <span className="hidden sm:inline px-1.5 py-0.5 rounded text-[9px] bg-purple-100 text-purple-700 font-bold tracking-tight" title="Shared Stock">
                              Shared
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Sold Count */}
                      <td className="text-right">
                        <div className="font-extrabold text-blue-700 text-xs sm:text-base">
                          {perfume.soldCount}
                        </div>
                        <div className="sm:hidden text-[9px] text-gray-500 font-medium">
                          {formatCurrency(perfume.salesRevenue)}
                        </div>
                        <div className="hidden sm:block text-[11px] text-gray-500 mt-0.5">
                          {perfume.soldOrdersCount} {perfume.soldOrdersCount === 1 ? 'order' : 'orders'}
                        </div>
                      </td>

                      {/* Return Count */}
                      <td className="text-right">
                        <div className={`font-extrabold text-xs sm:text-base ${perfume.returnCount > 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                          {perfume.returnCount}
                        </div>
                        <div className="sm:hidden text-[9px] text-rose-500 font-medium">
                          {returnRate > 0 ? `${returnRate.toFixed(0)}%` : '0%'}
                        </div>
                        {perfume.returnCount > 0 ? (
                          <div className="hidden sm:block text-[10px] text-gray-500 mt-0.5">
                            {perfume.customerReturnCount > 0 && <span>{perfume.customerReturnCount}C </span>}
                            {perfume.rtoReturnCount > 0 && <span>{perfume.rtoReturnCount}RTO</span>}
                          </div>
                        ) : null}
                      </td>

                      {/* Net Sold */}
                      <td className="text-right">
                        <div className="font-extrabold text-emerald-700 text-xs sm:text-base">
                          {perfume.netSoldCount}
                        </div>
                      </td>

                      {/* Return Rate (Desktop) */}
                      <td className="hidden md:table-cell text-center">
                        <div className="inline-flex flex-col items-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              returnRate === 0
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : returnRate < 15
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : returnRate < 25
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                            }`}
                          >
                            {returnRate.toFixed(1)}%
                          </span>
                          {/* Mini visual bar */}
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                returnRate === 0 ? 'bg-emerald-500' : returnRate < 15 ? 'bg-blue-500' : returnRate < 25 ? 'bg-amber-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(100, returnRate)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Sales Revenue (Desktop) */}
                      <td className="hidden lg:table-cell text-right">
                        <div className="font-semibold text-gray-900">
                          {formatCurrency(perfume.salesRevenue)}
                        </div>
                        {perfume.returnAmount > 0 && (
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            Net: <span className="font-medium text-emerald-700">{formatCurrency(perfume.netRevenue)}</span>
                          </div>
                        )}
                      </td>

                      {/* Details View Button (Desktop) */}
                      <td className="hidden sm:table-cell text-center" onClick={(e) => { e.stopPropagation(); setSelectedPerfume(perfume); }}>
                        <button className="px-2.5 py-1 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors">
                          View
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

      {/* Perfume Detail Drawer / Modal */}
      {selectedPerfume && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="bg-gradient-to-r from-primary-600 to-brand-600 text-white p-5 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold leading-tight">{selectedPerfume.name}</h3>
                  <div className="flex items-center gap-2 mt-1 text-primary-100 text-xs">
                    <span className="font-mono bg-white/20 px-1.5 py-0.5 rounded">{selectedPerfume.sku}</span>
                    <span>·</span>
                    <span>{selectedPerfume.category || 'Perfume'}</span>
                    {selectedPerfume.sizeml ? <span>· {selectedPerfume.sizeml} ml</span> : null}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedPerfume(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Key numbers grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-100 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Units Sold</p>
                  <p className="text-xl font-extrabold text-blue-900 mt-1">{selectedPerfume.soldCount}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{selectedPerfume.soldOrdersCount} orders</p>
                </div>

                <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-100 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Returns</p>
                  <p className="text-xl font-extrabold text-rose-900 mt-1">{selectedPerfume.returnCount}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{selectedPerfume.returnRate.toFixed(1)}% rate</p>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-100 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Net Kept</p>
                  <p className="text-xl font-extrabold text-emerald-900 mt-1">{selectedPerfume.netSoldCount}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {selectedPerfume.soldCount > 0 ? `${((selectedPerfume.netSoldCount / selectedPerfume.soldCount) * 100).toFixed(0)}%` : '0%'}
                  </p>
                </div>
              </div>

              {/* Detailed Breakdown Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Sales & Order Breakdown</h4>
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden bg-gray-50/50">
                  <div className="flex justify-between items-center py-2.5 px-3.5 text-xs">
                    <span className="text-gray-600">Single Product Orders</span>
                    <span className="font-bold text-gray-900">{selectedPerfume.directSoldCount} units</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5 px-3.5 text-xs">
                    <span className="text-gray-600">Combo Package Orders</span>
                    <span className="font-bold text-indigo-700">{selectedPerfume.comboSoldCount} units</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5 px-3.5 text-xs">
                    <span className="text-gray-600">Total Customer Returns</span>
                    <span className="font-bold text-amber-700">{selectedPerfume.customerReturnCount} units</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5 px-3.5 text-xs">
                    <span className="text-gray-600">Courier RTO Returns</span>
                    <span className="font-bold text-rose-700">{selectedPerfume.rtoReturnCount} units</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5 px-3.5 text-xs">
                    <span className="text-gray-600">Damaged Returns</span>
                    <span className="font-bold text-red-600">{selectedPerfume.damagedReturnCount} units</span>
                  </div>
                </div>
              </div>

              {/* Inventory & Financial Overview */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Stock & Financials</h4>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-[11px] text-gray-500">Current Warehouse Stock</p>
                    <p className={`text-base font-bold mt-0.5 ${selectedPerfume.currentStock === 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {selectedPerfume.currentStock} units
                      {selectedPerfume.isSharedStock && <span className="text-xs text-purple-600 font-normal ml-1">(Shared)</span>}
                    </p>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-[11px] text-gray-500">Selling Price</p>
                    <p className="text-base font-bold text-gray-900 mt-0.5">
                      {formatCurrency(selectedPerfume.sellingPrice || 0)}
                    </p>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-[11px] text-gray-500">Gross Sales Revenue</p>
                    <p className="text-base font-bold text-blue-700 mt-0.5">
                      {formatCurrency(selectedPerfume.salesRevenue)}
                    </p>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-[11px] text-gray-500">Net Revenue (After Returns)</p>
                    <p className="text-base font-bold text-emerald-700 mt-0.5">
                      {formatCurrency(selectedPerfume.netRevenue)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedPerfume(null)}
                className="btn btn-secondary text-xs px-4 py-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerfumePerformancePage;
