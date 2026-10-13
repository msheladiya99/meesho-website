import api from '../lib/axios';
import type { ApiResponse, Expense, Partner, PaginationParams } from '../types';

export const expensesApi = {
  list: (params?: PaginationParams) =>
    api.get<ApiResponse<Expense[]>>('/expenses', { params }),
  get: (id: string) => api.get<ApiResponse<Expense>>(`/expenses/${id}`),
  create: (data: Partial<Expense>) => api.post<ApiResponse<Expense>>('/expenses', data),
  update: (id: string, data: Partial<Expense>) => api.put<ApiResponse<Expense>>(`/expenses/${id}`, data),
  delete: (id: string) => api.delete(`/expenses/${id}`),
  partnerSummary: (params?: PaginationParams) =>
    api.get('/expenses/summary/partner', { params }),
};

export const partnersApi = {
  list: () => api.get<ApiResponse<Partner[]>>('/partners'),
  get: (id: string) => api.get<ApiResponse<Partner>>(`/partners/${id}`),
  create: (data: Partial<Partner>) => api.post('/partners', data),
  update: (id: string, data: Partial<Partner>) => api.put(`/partners/${id}`, data),
  balance: (params?: PaginationParams) => api.get('/partners/balance', { params }),
};
