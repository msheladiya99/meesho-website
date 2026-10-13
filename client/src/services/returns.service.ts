import api from '../lib/axios';
import type { ApiResponse, ReturnOrder, PaginationParams } from '../types';

export const returnsApi = {
  list: (params?: PaginationParams) =>
    api.get<ApiResponse<ReturnOrder[]>>('/returns', { params }),

  get: (id: string) => api.get<ApiResponse<ReturnOrder>>(`/returns/${id}`),

  create: (data: Partial<ReturnOrder>) =>
    api.post<ApiResponse<ReturnOrder>>('/returns', data),

  update: (id: string, data: Partial<ReturnOrder>) =>
    api.put<ApiResponse<ReturnOrder>>(`/returns/${id}`, data),

  delete: (id: string) => api.delete(`/returns/${id}`),

  summary: (params?: PaginationParams) =>
    api.get('/returns/summary/category', { params }),
};
