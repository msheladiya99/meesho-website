import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart, RotateCcw, Package, TrendingUp, TrendingDown,
  DollarSign, Warehouse, BarChart2, AlertTriangle, Plus,
  PackageCheck, Truck, Clock, ShieldAlert, CheckCircle2
} from 'lucide-react';
import StatCard from '../components/ui/StatCard';
import DateRangePicker from '../components/ui/DateRangePicker';
import { reportsApi, analyticsApi } from '../services/reports.service';
import { useAccountStore } from '../store/accountStore';
import { useAuthStore } from '../store/authStore';
import { formatCurrency, formatNumber, dateRangePresets, formatDate } from '../lib/utils';
import type { DateRange } from '../types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';
import { useNavigate } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const presets = dateRangePresets();
  const [dateRange, setDateRange] = useState<DateRange>(presets.thisMonth);

  const params = {
    accountId: activeAccountId === 'all' ? undefined : activeAccountId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  };

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard', params],
    queryFn: () => reportsApi.dashboard(params),
  });

  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ['daily-trend', params],
    queryFn: () => analyticsApi.dailyTrend({ ...params, startDate: dateRange.startDate, endDate: dateRange.endDate }),
  });

  const { data: topData } = useQuery({
    queryKey: ['top-products', params],
    queryFn: () => analyticsApi.topProducts({ ...params }),
  });

  const stats = statsData?.data?.data;
  const trend = trendData?.data?.data || [];
  const topProducts = topData?.data?.data || [];

  const cards = [
    { title: 'Total Order Sales', value: stats ? formatCurrency(stats.totalOrderSales) : '—', icon: ShoppingCart, iconColor: 'text-blue-600', iconBg: 'bg-blue-50' },
    { title: 'Total Orders', value: stats ? formatNumber(stats.totalOrders) : '—', icon: ShoppingCart, iconColor: 'text-indigo-600', iconBg: 'bg-indigo-50' },
    { title: 'Pending Packing', value: stats ? formatNumber(stats.pendingPacking ?? 0) : '—', icon: Clock, iconColor: 'text-amber-600', iconBg: 'bg-amber-50' },
    { title: 'Packed Today', value: stats ? formatNumber(stats.packedToday ?? 0) : '—', icon: PackageCheck, iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50' },
    { title: 'Dispatched Today', value: stats ? formatNumber(stats.dispatchedToday ?? 0) : '—', icon: Truck, iconColor: 'text-indigo-600', iconBg: 'bg-indigo-50' },
    { title: 'RTO Returns', value: stats ? `${formatNumber(stats.rtoReturns ?? 0)} (${stats.rtoReturnQty ?? 0}u)` : '—', icon: RotateCcw, iconColor: 'text-orange-600', iconBg: 'bg-orange-50' },
    { title: 'Customer Returns', value: stats ? `${formatNumber(stats.customerReturns ?? 0)} (${stats.customerReturnQty ?? 0}u)` : '—', icon: RotateCcw, iconColor: 'text-rose-600', iconBg: 'bg-rose-50' },
    { title: 'Good Stock Recovered', value: stats ? formatNumber(stats.goodStockRecovered ?? 0) : '—', icon: CheckCircle2, iconColor: 'text-green-600', iconBg: 'bg-green-50' },
    { title: 'Damaged Stock', value: stats ? formatNumber(stats.damagedStock ?? 0) : '—', icon: ShieldAlert, iconColor: 'text-red-500', iconBg: 'bg-red-50' },
    { title: 'Awaiting Inspection', value: stats ? formatNumber(stats.returnsAwaitingInspection ?? 0) : '—', icon: Clock, iconColor: 'text-amber-500', iconBg: 'bg-amber-50' },
    { title: 'Net Sales', value: stats ? formatCurrency(stats.netSales) : '—', icon: TrendingUp, iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50' },
    { title: 'Est. Net Profit', value: stats ? formatCurrency(stats.estimatedNetProfit) : '—', icon: TrendingDown, iconColor: stats?.estimatedNetProfit >= 0 ? 'text-green-600' : 'text-red-500', iconBg: stats?.estimatedNetProfit >= 0 ? 'bg-green-50' : 'bg-red-50' },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Business Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeAccountId === 'all' ? 'All accounts consolidated' : 'Single account view'} •{' '}
            {formatDate(dateRange.startDate)} – {formatDate(dateRange.endDate)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user?.role === 'admin' && (
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              New GSTIN Account
            </button>
          )}
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {/* Estimated note */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Financial figures are <strong>estimates</strong> based on entered records. Meesho settlement data not linked.</span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <StatCard key={c.title} loading={statsLoading} {...c} />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily trend */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Daily Sales vs Returns</h2>
          {trendLoading ? (
            <div className="skeleton h-48 w-full rounded-lg" />
          ) : trend.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-400">
              No data for selected period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v/100).toFixed(0)}`} />
                <Tooltip
                  formatter={(v: any) => [formatCurrency(Number(v) || 0)]}
                  labelStyle={{ fontSize: 12 }}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line dataKey="sales" name="Sales" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line dataKey="returns" name="Returns" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top products */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Top Products by Quantity</h2>
          {topProducts.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topProducts.slice(0, 8)} layout="vertical" margin={{ left: 60, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={60} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="qty" name="Units" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
