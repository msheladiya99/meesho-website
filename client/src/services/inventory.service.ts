import api from '../lib/axios';
import type { ApiResponse, Product, Category, StockPurchase, StockMovement, Vendor, PaginationParams } from '../types';

export const productsApi = {
  list: (params?: PaginationParams) =>
    api.get<ApiResponse<Product[]>>('/products', { params }),
  get: (id: string) => api.get<ApiResponse<Product>>(`/products/${id}`),
  create: (data: Partial<Product>) => api.post<ApiResponse<Product>>('/products', data),
  update: (id: string, data: Partial<Product>) => api.put<ApiResponse<Product>>(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
};

export const categoriesApi = {
  list: () => api.get<ApiResponse<Category[]>>('/categories'),
  create: (data: Partial<Category>) => api.post('/categories', data),
  update: (id: string, data: Partial<Category>) => api.put(`/categories/${id}`, data),
  delete: (id: string) => api.delete(`/categories/${id}`),
};

export const vendorsApi = {
  list: () => api.get<ApiResponse<Vendor[]>>('/vendors'),
  create: (data: Partial<Vendor>) => api.post('/vendors', data),
  update: (id: string, data: Partial<Vendor>) => api.put(`/vendors/${id}`, data),
  delete: (id: string) => api.delete(`/vendors/${id}`),
};

export const stockPurchasesApi = {
  list: (params?: PaginationParams) =>
    api.get<ApiResponse<StockPurchase[]>>('/stock-purchases', { params }),
  get: (id: string) => api.get<ApiResponse<StockPurchase>>(`/stock-purchases/${id}`),
  create: (data: Partial<StockPurchase>) => api.post<ApiResponse<StockPurchase>>('/stock-purchases', data),
  update: (id: string, data: Partial<StockPurchase>) => api.put<ApiResponse<StockPurchase>>(`/stock-purchases/${id}`, data),
  delete: (id: string) => api.delete(`/stock-purchases/${id}`),
};

export const inventoryApi = {
  list: (params?: { accountId?: string; search?: string; categoryId?: string }) =>
    api.get<ApiResponse<Product[]>>('/inventory', { params }),
  movements: (productId: string, params?: PaginationParams) =>
    api.get<ApiResponse<StockMovement[]>>(`/inventory/${productId}/movements`, { params }),
  adjust: (productId: string, data: { quantity: number; reason: string; accountId: string }) =>
    api.post(`/inventory/${productId}/adjust`, data),
};
