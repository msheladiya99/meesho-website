import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../services/reports.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, dateRangePresets } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import type { DateRange } from '../types';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis
} from 'recharts';

const COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#7c3aed', '#db2777'];

const AnalyticsPage: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const [dateRange, setDateRange] = useState<DateRange>(dateRangePresets().thisMonth);

  const params = {
    accountId: activeAccountId === 'all' ? undefined : activeAccountId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  };

  const { data: topData } = useQuery({ queryKey: ['top-products', params], queryFn: () => analyticsApi.topProducts(params) });
  const { data: returnCatData } = useQuery({ queryKey: ['returns-by-cat', params], queryFn: () => analyticsApi.returnsByCategory(params) });
  const { data: trendData } = useQuery({ queryKey: ['daily-trend', params], queryFn: () => analyticsApi.dailyTrend(params) });
  const { data: monthlyData } = useQuery({ queryKey: ['monthly-comparison', { accountId: params.accountId }], queryFn: () => analyticsApi.monthlyComparison({ accountId: params.accountId }) });
  const { data: partnerData } = useQuery({ queryKey: ['partner-expenses', params], queryFn: () => analyticsApi.partnerExpenses(params) });
  const { data: gstinData } = useQuery({ queryKey: ['gstin-perf', params], queryFn: () => analyticsApi.gstinPerformance(params) });

  const topProducts = topData?.data?.data || [];
  const returnsByCategory = returnCatData?.data?.data || [];
  const trend = trendData?.data?.data || [];
  const monthly = monthlyData?.data?.data || [];
  const partnerExpenses = partnerData?.data?.data || [];
  const gstinPerf = gstinData?.data?.data || [];

  const chartCard = (title: string, children: React.ReactNode) => (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">{title}</h2>
      {children}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <h1 className="text-xl font-bold text-gray-900">Analytics & Charts</h1>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {chartCard('Best-Selling Products (Qty)', topProducts.length === 0 ? <div className="h-56 flex items-center justify-center text-sm text-gray-400">No data</div> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topProducts.slice(0, 8)} layout="vertical" margin={{ left: 50, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={50} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="qty" name="Units" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ))}

        {chartCard('Best-Selling Products (Revenue)', topProducts.length === 0 ? <div className="h-56 flex items-center justify-center text-sm text-gray-400">No data</div> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topProducts.slice(0, 8)} layout="vertical" margin={{ left: 50, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/100).toFixed(0)}`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={50} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="sales" name="Sales" fill="#7c3aed" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ))}

        {chartCard('Returns by Category', returnsByCategory.length === 0 ? <div className="h-56 flex items-center justify-center text-sm text-gray-400">No returns data</div> : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={returnsByCategory} dataKey="qty" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {returnsByCategory.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        ))}

        {chartCard('Daily Sales Trend', trend.length === 0 ? <div className="h-56 flex items-center justify-center text-sm text-gray-400">No data</div> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/100).toFixed(0)}`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="sales" name="Sales" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line dataKey="returns" name="Returns" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        ))}

        {chartCard('Monthly Revenue vs Returns', monthly.length === 0 ? <div className="h-56 flex items-center justify-center text-sm text-gray-400">No data</div> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/100).toFixed(0)}`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="sales" name="Sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="returns" name="Returns" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ))}

        {chartCard('Partner-wise Expenses', partnerExpenses.length === 0 ? <div className="h-56 flex items-center justify-center text-sm text-gray-400">No data</div> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={partnerExpenses} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="partner" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/100).toFixed(0)}`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="paid" name="Paid" fill="#059669" radius={[4, 4, 0, 0]} />
              <Bar dataKey="allocated" name="Allocated" fill="#d97706" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ))}
      </div>
    </div>
  );
};

export default AnalyticsPage;
