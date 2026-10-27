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

  downloadSampleTemplate: () =>
    api.get('/orders/import/sample-template', { responseType: 'blob' }),

  previewImport: (payload: FormData | { rows: any[] }) => {
    if (payload instanceof FormData) {
      return api.post<ApiResponse<any>>('/orders/import/preview', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.post<ApiResponse<any>>('/orders/import/preview', payload);
  },

  executeImport: (payload: FormData | { businessAccount: string; rows: any[] }) => {
    if (payload instanceof FormData) {
      return api.post<ApiResponse<any>>('/orders/import/execute', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.post<ApiResponse<any>>('/orders/import/execute', payload);
  },
};
