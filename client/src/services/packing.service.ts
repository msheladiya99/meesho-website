import api from '../lib/axios';
import type { ApiResponse, Order, PackingRecord, PaginationParams } from '../types';

export interface PackingLookupResult {
  order: Order;
  matchedBy: string;
  orderedQuantity: number;
  previouslyPacked: number;
  remainingQuantity: number;
  isFullyPacked: boolean;
}

export interface PackingSummaryData {
  pendingPacking: number;
  partiallyPacked: number;
  packedToday: number;
  packedScansToday: number;
  dispatchedToday: number;
}

export const packingApi = {
  lookup: (code: string, accountId?: string) =>
    api.post<ApiResponse<PackingLookupResult>>('/packing/lookup', { code, accountId }),

  pack: (data: {
    orderId: string;
    quantityToPack: number;
    scannedCode: string;
    scanType?: 'internal_qr' | 'carrier_label' | 'meesho_order_id' | 'order_id' | 'manual';
    notes?: string;
  }) => api.post<ApiResponse<{ order: Order; packingRecord: PackingRecord; remainingQuantity: number }>>('/packing/pack', data),

  dispatch: (data: {
    orderId: string;
    carrierName?: string;
    shippingLabelId?: string;
    notes?: string;
  }) => api.post<ApiResponse<Order>>('/packing/dispatch', data),

  assignLabel: (data: {
    orderId: string;
    shippingLabelId?: string;
    carrierName?: string;
    generateInternalQr?: boolean;
  }) => api.post<ApiResponse<Order>>('/packing/assign-label', data),

  records: (params?: PaginationParams & { operatorId?: string }) =>
    api.get<ApiResponse<PackingRecord[]>>('/packing/records', { params }),

  orders: (params?: PaginationParams & { packingStatus?: 'pending' | 'partially_packed' | 'packed' | 'dispatched' }) =>
    api.get<ApiResponse<Order[]>>('/packing/orders', { params }),

  summary: (accountId?: string) =>
    api.get<ApiResponse<PackingSummaryData>>('/packing/summary', { params: { accountId: accountId === 'all' ? undefined : accountId } }),
};
