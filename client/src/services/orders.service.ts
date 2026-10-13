import api from '../lib/axios';
import type { ApiResponse, Order, PaginationParams } from '../types';

export const ordersApi = {
  list: (params?: PaginationParams) =>
    api.get<ApiResponse<Order[]>>('/orders', { params }),

  get: (id: string) => api.get<ApiResponse<Order>>(`/orders/${id}`),

  create: (data: Partial<Order>) => api.post<ApiResponse<Order>>('/orders', data),

  update: (id: string, data: Partial<Order>) =>
    api.put<ApiResponse<Order>>(`/orders/${id}`, data),

  delete: (id: string) => api.delete(`/orders/${id}`),

  dailySummary: (params?: { accountId?: string; date?: string }) =>
    api.get('/orders/summary/daily', { params }),

  categorySummary: (params?: PaginationParams) =>
    api.get('/orders/summary/category', { params }),
};
