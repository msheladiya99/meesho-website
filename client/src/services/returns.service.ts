import api from '../lib/axios';
import type { ApiResponse, ReturnOrder, PaginationParams, ScanException } from '../types';

export interface ReturnLookupResult {
  order: any;
  matchedBy: string;
  orderedQuantity: number;
  packedQuantity: number;
  totalPreviouslyReturned: number;
  eligibleReturnQuantity: number;
  priorReturns: ReturnOrder[];
  canReturn: boolean;
}

export const returnsApi = {
  list: (params?: PaginationParams & { returnType?: string }) =>
    api.get<ApiResponse<ReturnOrder[]>>('/returns', { params }),

  get: (id: string) => api.get<ApiResponse<ReturnOrder>>(`/returns/${id}`),

  create: (data: Partial<ReturnOrder>) =>
    api.post<ApiResponse<ReturnOrder>>('/returns', data),

  update: (id: string, data: Partial<ReturnOrder>) =>
    api.put<ApiResponse<ReturnOrder>>(`/returns/${id}`, data),

  delete: (id: string) => api.delete(`/returns/${id}`),

  summary: (params?: PaginationParams) =>
    api.get('/returns/summary/category', { params }),

  // QR Scanning & Inspection Endpoints
  lookup: (code: string, accountId?: string) =>
    api.post<ApiResponse<ReturnLookupResult>>('/returns/lookup', { code, accountId }),

  processReturn: (data: {
    orderId: string;
    returnType: 'customer_return' | 'rto_return';
    receivedQuantity: number;
    goodQuantity?: number;
    damagedQuantity?: number;
    pendingInspectionQuantity?: number;
    returnReason?: string;
    damageReason?: string;
    notes?: string;
    scannedQrCode?: string;
    photos?: string[];
    receivedDate?: string;
    allowAuthorizedOverride?: boolean;
  }) => api.post<ApiResponse<ReturnOrder>>('/returns/process', data),

  inspectPending: (id: string, data: {
    goodQuantity: number;
    damagedQuantity: number;
    damageReason?: string;
    damagePhotos?: string[];
  }) => api.post<ApiResponse<ReturnOrder>>(`/returns/${id}/inspect`, data),

  damagedAction: (data: {
    productId: string;
    accountId: string;
    action: 'repair' | 'dispose' | 'approve_resale';
    quantity: number;
    reason?: string;
    notes?: string;
  }) => api.post<ApiResponse<any>>('/returns/damaged-action', data),

  registers: (params?: PaginationParams & { returnType?: string; condition?: string; operatorId?: string }) =>
    api.get<ApiResponse<ReturnOrder[]>>('/returns/registers', { params }),

  exceptions: (params?: PaginationParams & { module?: string; exceptionType?: string }) =>
    api.get<ApiResponse<ScanException[]>>('/returns/exceptions', { params }),
};
