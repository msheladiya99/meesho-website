import api from '../lib/axios';
import type { PaginationParams } from '../types';

export const reportsApi = {
  dashboard: (params?: { accountId?: string; startDate?: string; endDate?: string }) =>
    api.get('/reports/dashboard', { params }),

  daily: (params: { date: string; accountId?: string }) =>
    api.get('/reports/daily', { params }),

  monthly: (params: { year: number; month: number; accountId?: string }) =>
    api.get('/reports/monthly', { params }),

  yearly: (params: { year: number; accountId?: string }) =>
    api.get('/reports/yearly', { params }),

  custom: (params: PaginationParams) =>
    api.get('/reports/custom', { params }),

  pnl: (params: { startDate: string; endDate: string; accountId?: string }) =>
    api.get('/reports/pnl', { params }),

  exportCsv: (type: string, params: Record<string, string>) =>
    api.get(`/reports/export/${type}`, { params, responseType: 'blob' }),
};

export const analyticsApi = {
  topProducts: (params?: PaginationParams) =>
    api.get('/analytics/top-products', { params }),

  returnsByCategory: (params?: PaginationParams) =>
    api.get('/analytics/returns-by-category', { params }),

  dailyTrend: (params?: PaginationParams) =>
    api.get('/analytics/daily-trend', { params }),

  monthlyComparison: (params?: { year?: number; accountId?: string }) =>
    api.get('/analytics/monthly-comparison', { params }),

  inventorySnapshot: (params?: { accountId?: string }) =>
    api.get('/analytics/inventory-snapshot', { params }),

  partnerExpenses: (params?: PaginationParams) =>
    api.get('/analytics/partner-expenses', { params }),

  gstinPerformance: (params?: PaginationParams) =>
    api.get('/analytics/gstin-performance', { params }),
};
