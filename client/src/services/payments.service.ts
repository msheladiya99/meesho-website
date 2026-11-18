import api from '../lib/axios';
import type { ApiResponse, Payment, PaymentDashboardData } from '../types';

export interface PaymentListParams {
  accountId?: string;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface PaymentDashboardParams {
  accountId?: string;
  upcomingDate?: string;
  completedDate?: string;
}

export const paymentsApi = {
  getDashboard: (params?: PaymentDashboardParams) =>
    api.get<ApiResponse<PaymentDashboardData>>('/payments/dashboard', { params }),

  list: (params?: PaymentListParams) =>
    api.get<ApiResponse<Payment[]> & { pagination: { page: number; limit: number; total: number; pages: number } }>(
      '/payments',
      { params }
    ),

  get: (id: string) =>
    api.get<ApiResponse<Payment>>(`/payments/${id}`),

  create: (data: Partial<Payment>) =>
    api.post<ApiResponse<Payment>>('/payments', data),

  update: (id: string, data: Partial<Payment>) =>
    api.put<ApiResponse<Payment>>(`/payments/${id}`, data),

  delete: (id: string) =>
    api.delete(`/payments/${id}`),

  importSheet: (formData: FormData) =>
    api.post<ApiResponse<{ totalRows: number; paymentsCreated: number; paymentsUpdated: number }>>(
      '/payments/import',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ),
};
