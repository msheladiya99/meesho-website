import api from '../lib/axios';
import type { ApiResponse, BusinessAccount } from '../types';

export const accountsApi = {
  list: () => api.get<ApiResponse<BusinessAccount[]>>('/business-accounts'),
  create: (data: Partial<BusinessAccount>) => api.post('/business-accounts', data),
  update: (id: string, data: Partial<BusinessAccount>) => api.put(`/business-accounts/${id}`, data),
  delete: (id: string) => api.delete(`/business-accounts/${id}`),
};
