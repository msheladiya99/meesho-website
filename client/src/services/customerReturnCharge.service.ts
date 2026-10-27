import api from '../lib/axios';
import type { CustomerReturnChargeSettings, CustomerReturnCharge } from '../types';

export interface ReturnChargesRecordSummary {
  totalBaseCharge: number;
  totalHandlingCharge: number;
  totalCharge: number;
  appliedCount: number;
  reversedCount: number;
}

export interface ReturnChargesRecordsResponse {
  records: CustomerReturnCharge[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: ReturnChargesRecordSummary;
}

export interface RecalculationPreviewResponse {
  totalRecords: number;
  currentTotalExpense: number;
  newTotalExpense: number;
  difference: number;
  sampleItems: Array<{
    transactionId: string;
    orderId: string;
    returnDate: string;
    returnedQuantity: number;
    originalOrderValue: number;
    currentCharge: number;
    newCharge: number;
    diff: number;
  }>;
}

export const customerReturnChargeApi = {
  getSettings: (params?: { accountId?: string }) =>
    api.get<{ success: boolean; data: { activeSettings: CustomerReturnChargeSettings | null; allSettings: CustomerReturnChargeSettings[] } }>(
      '/customer-return-charges/settings',
      { params }
    ),

  updateSettings: (data: Partial<CustomerReturnChargeSettings> & { settingsId?: string }) =>
    api.put<{ success: boolean; message: string; data: CustomerReturnChargeSettings }>(
      '/customer-return-charges/settings',
      data
    ),

  getRecords: (params?: {
    accountId?: string;
    categoryId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    api.get<{ success: boolean; data: ReturnChargesRecordsResponse }>(
      '/customer-return-charges/records',
      { params }
    ),

  exportCsv: (params?: {
    accountId?: string;
    categoryId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    status?: string;
  }) =>
    api.get('/customer-return-charges/export-csv', {
      params,
      responseType: 'blob',
    }),

  previewRecalculation: (data: {
    accountId?: string;
    categoryId?: string;
    startDate?: string;
    endDate?: string;
    targetSettings?: Partial<CustomerReturnChargeSettings>;
  }) =>
    api.post<{ success: boolean; data: RecalculationPreviewResponse }>(
      '/customer-return-charges/recalculate/preview',
      data
    ),

  executeRecalculation: (data: {
    accountId?: string;
    categoryId?: string;
    startDate?: string;
    endDate?: string;
    confirm: boolean;
  }) =>
    api.post<{ success: boolean; message: string; data: { updatedCount: number; totalDifference: number } }>(
      '/customer-return-charges/recalculate/execute',
      data
    ),
};
