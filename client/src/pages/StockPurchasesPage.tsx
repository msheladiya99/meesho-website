import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit2, Trash2, TruckIcon, Search, Eye,
  Package, CreditCard, Calendar, AlertCircle, Loader2
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { stockPurchasesApi, vendorsApi } from '../services/inventory.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatDate, rupeesToPaise, paiseToRupees, dateRangePresets } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import Modal from '../components/ui/Modal';
import { EmptyState, LoadingSpinner, ConfirmDialog } from '../components/ui/Feedback';
import toast from 'react-hot-toast';
import type { DateRange, StockPurchase, Vendor } from '../types';

interface FormData {
  purchaseDate: string;
  vendor: string;
  vendorInvoiceNumber?: string;
  totalQuantity: number;
  purchasePricePerUnit: number;
  discount: number;
  additionalCosts: number;
  taxAmount: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  notes?: string;
}

const StockPurchasesPage: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const qc = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange>(dateRangePresets().thisMonth);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [viewingPurchase, setViewingPurchase] = useState<StockPurchase | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<StockPurchase | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const params = {
    accountId: activeAccountId === 'all' ? undefined : activeAccountId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['stock-purchases', params],
    queryFn: () => stockPurchasesApi.list(params),
  });

  const { data: vendorsData } = useQuery({ queryKey: ['vendors'], queryFn: () => vendorsApi.list() });

  const rawPurchases: StockPurchase[] = data?.data?.data || [];
  const vendors: Vendor[] = vendorsData?.data?.data || [];

  // Filter purchases by search and payment status
  const purchases = useMemo(() => {
    return rawPurchases.filter(p => {
      const vend = typeof p.vendor === 'object' ? p.vendor : vendors.find(v => v._id === p.vendor);
      const vendorName = vend?.name?.toLowerCase() || '';
      const invoiceNo = (p.vendorInvoiceNumber || '').toLowerCase();
      const s = search.toLowerCase().trim();

      const matchesSearch = !s || vendorName.includes(s) || invoiceNo.includes(s);
      const matchesPayment = paymentFilter === 'all' || p.paymentStatus === paymentFilter;

      return matchesSearch && matchesPayment;
    });
  }, [rawPurchases, search, paymentFilter, vendors]);

  // Overall Statistics
  const totalSpend = useMemo(() => rawPurchases.reduce((s, p) => s + (p.totalAmount || 0), 0), [rawPurchases]);
  const totalUnits = useMemo(() => {
    return rawPurchases.reduce((sum, p) => {
      if (p.totalQuantity) return sum + p.totalQuantity;
      const pItems = Array.isArray(p.items) ? p.items : [];
      return sum + pItems.reduce((iSum: number, item: any) => iSum + (item.quantityPurchased || 0), 0);
    }, 0);
  }, [rawPurchases]);
  const unpaidCount = useMemo(() => rawPurchases.filter(p => p.paymentStatus === 'unpaid').length, [rawPurchases]);
  const paidCount = useMemo(() => rawPurchases.filter(p => p.paymentStatus === 'paid').length, [rawPurchases]);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      purchaseDate: new Date().toISOString().split('T')[0],
      paymentStatus: 'paid',
      totalQuantity: 1,
      purchasePricePerUnit: 0,
      discount: 0,
      additionalCosts: 0,
      taxAmount: 0,
      notes: '',
      vendorInvoiceNumber: '',
    },
  });

  const qty = watch('totalQuantity') || 0;
  const unitPrice = watch('purchasePricePerUnit') || 0;
  const disc = watch('discount') || 0;
  const addCosts = watch('additionalCosts') || 0;
  const tax = watch('taxAmount') || 0;
  const itemsSubtotal = Math.round(qty * unitPrice * 100) / 100;
  const total = Math.max(0, itemsSubtotal - disc + addCosts + tax);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['stock-purchases'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const isSubmittingRef = useRef(false);

  const createMut = useMutation({
    mutationFn: (d: Partial<StockPurchase>) => stockPurchasesApi.create(d),
    onSuccess: () => {
      invalidateAll();
      toast.success('Stock purchase recorded successfully!');
      setIsModalOpen(false);
      reset();
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error recording purchase'),
    onSettled: () => {
      isSubmittingRef.current = false;
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<StockPurchase> }) => stockPurchasesApi.update(id, d),
    onSuccess: () => {
      invalidateAll();
      toast.success('Stock purchase updated successfully!');
      setIsModalOpen(false);
      setEditingPurchase(null);
      reset();
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error updating purchase'),
    onSettled: () => {
      isSubmittingRef.current = false;
    },
  });

  const isSubmitting = createMut.isPending || updateMut.isPending;

  const deleteMut = useMutation({
    mutationFn: (id: string) => stockPurchasesApi.delete(id),
    onSuccess: () => {
      invalidateAll();
      toast.success('Purchase deleted and inventory stock restored');
      setDeleteId(null);
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error deleting purchase'),
  });

  const onSubmit = (d: FormData) => {
    if (isSubmittingRef.current || createMut.isPending || updateMut.isPending) return;

    if (!d.totalQuantity || d.totalQuantity <= 0) {
      toast.error('Please enter a valid total quantity');
      return;
    }

    isSubmittingRef.current = true;

    const subtotal = d.totalQuantity * (d.purchasePricePerUnit || 0);
    const calculatedTotal = Math.max(0, subtotal - (d.discount || 0) + (d.additionalCosts || 0) + (d.taxAmount || 0));

    const payload = {
      purchaseDate: d.purchaseDate,
      vendor: d.vendor,
      vendorInvoiceNumber: d.vendorInvoiceNumber || '',
      totalQuantity: d.totalQuantity,
      purchasePricePerUnit: rupeesToPaise(d.purchasePricePerUnit),
      discount: rupeesToPaise(d.discount || 0),
      additionalCosts: rupeesToPaise(d.additionalCosts || 0),
      taxAmount: rupeesToPaise(d.taxAmount || 0),
      totalAmount: rupeesToPaise(calculatedTotal),
      paymentStatus: d.paymentStatus,
      notes: d.notes || '',
      businessAccount: activeAccountId === 'all' ? undefined : activeAccountId,
    };

    if (editingPurchase) updateMut.mutate({ id: editingPurchase._id, d: payload });
    else createMut.mutate(payload);
  };

  const openEdit = (p: StockPurchase) => {
    setEditingPurchase(p);
    const parsedQty = p.totalQuantity || (Array.isArray(p.items) ? p.items.reduce((s, it) => s + (it.quantityPurchased || 0), 0) : 1);
    const parsedUnitPrice = p.purchasePricePerUnit !== undefined && p.purchasePricePerUnit > 0
      ? paiseToRupees(p.purchasePricePerUnit)
      : (parsedQty > 0 ? paiseToRupees(Math.round(p.totalAmount / parsedQty)) : 0);

    reset({
      purchaseDate: p.purchaseDate.split('T')[0],
      vendor: typeof p.vendor === 'string' ? p.vendor : (p.vendor as Vendor)._id,
      vendorInvoiceNumber: p.vendorInvoiceNumber || '',
      totalQuantity: parsedQty,
      purchasePricePerUnit: parsedUnitPrice,
      discount: paiseToRupees(p.discount || 0),
      additionalCosts: paiseToRupees(p.additionalCosts || 0),
      taxAmount: paiseToRupees(p.taxAmount || 0),
      paymentStatus: p.paymentStatus,
      notes: p.notes || '',
    });
    setIsModalOpen(true);
  };

  const openAdd = () => {
    setEditingPurchase(null);
    reset({
      purchaseDate: new Date().toISOString().split('T')[0],
      paymentStatus: 'paid',
      totalQuantity: 1,
      purchasePricePerUnit: 0,
      discount: 0,
      additionalCosts: 0,
      taxAmount: 0,
      notes: '',
      vendorInvoiceNumber: '',
    });
    setIsModalOpen(true);
  };

  const paymentColors: Record<string, string> = {
    paid: 'bg-green-100 text-green-800 border-green-200',
    partial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    unpaid: 'bg-red-100 text-red-800 border-red-200'
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Stock Purchases</h1>
          <p className="text-sm text-gray-500 mt-1">
            Directly add total stock quantities and costs without needing to select perfume names or categories.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="btn-primary shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm shadow-sm hover:shadow"
        >
          <Plus className="w-4 h-4" /> Add Stock Purchase
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <TruckIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Purchases</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{rawPurchases.length}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Units</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{totalUnits.toLocaleString()} units</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Spend</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{formatCurrency(totalSpend)}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Payment Status</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">
              <span className="text-red-600">{unpaidCount} unpaid</span> · <span className="text-green-600">{paidCount} paid</span>
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Date Bar */}
      <div className="card p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex flex-1 flex-col sm:flex-row gap-3 max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by vendor, invoice #..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-9"
            />
          </div>

          <select
            value={paymentFilter}
            onChange={e => setPaymentFilter(e.target.value)}
            className="select sm:w-40"
          >
            <option value="all">All Payments</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>

        <div className="shrink-0">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {/* Main Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingSpinner />
        ) : purchases.length === 0 ? (
          <EmptyState
            title="No purchases found"
            description="Add your first stock purchase to intake total quantity and track costs."
            icon={<TruckIcon className="w-12 h-12 text-gray-400" />}
            action={
              <button onClick={openAdd} className="btn-primary mt-3">
                <Plus className="w-4 h-4 mr-1" /> Add Stock Purchase
              </button>
            }
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-28">Date</th>
                  <th>Vendor</th>
                  <th>Invoice #</th>
                  <th className="text-center">Total Quantity</th>
                  <th className="text-right">Price / Unit</th>
                  <th className="text-right">Total Amount</th>
                  <th className="text-center">Payment</th>
                  <th className="text-right pr-5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map(p => {
                  const vend = typeof p.vendor === 'object' ? p.vendor : vendors.find(v => v._id === p.vendor);
                  const rowQty = p.totalQuantity || (Array.isArray(p.items) ? p.items.reduce((acc: number, it: any) => acc + (it.quantityPurchased || 0), 0) : 0);
                  const rowUnitPrice = p.purchasePricePerUnit !== undefined && p.purchasePricePerUnit > 0
                    ? p.purchasePricePerUnit
                    : (rowQty > 0 ? Math.round(p.totalAmount / rowQty) : 0);

                  return (
                    <tr key={p._id} className="transition-colors hover:bg-gray-50/80">
                      {/* Date */}
                      <td className="whitespace-nowrap font-medium text-gray-900 align-middle">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span>{formatDate(p.purchaseDate)}</span>
                        </div>
                      </td>

                      {/* Vendor */}
                      <td className="align-middle">
                        <div className="font-semibold text-gray-900">{(vend as Vendor)?.name || '—'}</div>
                        {(vend as Vendor)?.company && (
                          <div className="text-xs text-gray-500">{(vend as Vendor)?.company}</div>
                        )}
                      </td>

                      {/* Invoice Number */}
                      <td className="align-middle font-mono text-xs">
                        {p.vendorInvoiceNumber ? (
                          <span className="inline-block px-2 py-0.5 bg-gray-100 rounded text-gray-700 font-semibold">
                            #{p.vendorInvoiceNumber}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* Total Quantity */}
                      <td className="text-center align-middle">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-primary-50 text-primary-700 border border-primary-200">
                          {rowQty.toLocaleString()} units
                        </span>
                      </td>

                      {/* Price Per Unit */}
                      <td className="text-right align-middle font-medium text-gray-700 text-sm">
                        {formatCurrency(rowUnitPrice)}
                      </td>

                      {/* Total Amount */}
                      <td className="text-right align-middle font-bold text-gray-900 text-sm">
                        {formatCurrency(p.totalAmount)}
                        {(p.discount > 0 || p.taxAmount > 0 || p.additionalCosts > 0) && (
                          <div className="text-[10px] text-gray-400 font-normal">
                            {p.discount > 0 && <span>-Disc </span>}
                            {p.taxAmount > 0 && <span>+Tax </span>}
                          </div>
                        )}
                      </td>

                      {/* Payment Status */}
                      <td className="text-center align-middle">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize border ${paymentColors[p.paymentStatus] || 'bg-gray-100 text-gray-800'}`}>
                          {p.paymentStatus}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="text-right pr-5 align-middle">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewingPurchase(p)}
                            className="p-1.5 rounded-lg hover:bg-primary-50 text-gray-400 hover:text-primary-600 transition-colors"
                            title="View Invoice Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEdit(p)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                            title="Edit Purchase"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteId(p._id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                            title="Delete Purchase"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Purchase Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingPurchase(null);
        }}
        title={editingPurchase ? 'Edit Stock Purchase' : 'Add Stock Purchase'}
        size="md"
        footer={
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setIsModalOpen(false);
                setEditingPurchase(null);
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              form="purchase-form"
              type="submit"
              disabled={isSubmitting}
              className="btn-primary min-w-[140px] flex items-center justify-center gap-1.5"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting
                ? (editingPurchase ? 'Updating Purchase...' : 'Saving Purchase...')
                : (editingPurchase ? 'Update Purchase' : 'Save Purchase')}
            </button>
          </div>
        }
      >
        <form id="purchase-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="bg-primary-50/70 border border-primary-200 rounded-xl p-3 text-xs text-primary-800">
            <span className="font-bold">⚡ Direct Total Quantity Mode:</span> Simply enter the total quantity and price. No need to select perfume names or categories. The purchased units add straight to your total stock pool.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Purchase Date *</label>
              <input type="date" {...register('purchaseDate')} className="input" />
              {errors.purchaseDate && <p className="text-xs text-red-500 mt-1">{errors.purchaseDate.message}</p>}
            </div>
            <div>
              <label className="label">Vendor *</label>
              <select {...register('vendor')} className="select">
                <option value="">Select vendor</option>
                {vendors.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
              </select>
              {errors.vendor && <p className="text-xs text-red-500 mt-1">{errors.vendor.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Invoice Number</label>
              <input {...register('vendorInvoiceNumber')} className="input font-mono" placeholder="e.g. INV-2026-001" />
            </div>
            <div>
              <label className="label">Payment Status</label>
              <select {...register('paymentStatus')} className="select">
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>
          </div>

          {/* Direct Quantity & Unit Price */}
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label font-bold text-gray-800">Total Quantity Purchased *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  {...register('totalQuantity', { valueAsNumber: true })}
                  className="input font-bold text-base bg-white"
                  placeholder="e.g. 100"
                />
                {errors.totalQuantity && <p className="text-xs text-red-500 mt-1">{errors.totalQuantity.message}</p>}
              </div>

              <div>
                <label className="label font-bold text-gray-800">Price Per Unit (₹) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  {...register('purchasePricePerUnit', { valueAsNumber: true })}
                  className="input font-bold text-base bg-white"
                  placeholder="e.g. 55.00"
                />
                {errors.purchasePricePerUnit && <p className="text-xs text-red-500 mt-1">{errors.purchasePricePerUnit.message}</p>}
              </div>
            </div>
          </div>

          {/* Adjustments: Discount, Additional Costs, Tax */}
          <div className="border-t border-gray-200 pt-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label text-xs">Discount (₹)</label>
                <input type="number" step="0.01" {...register('discount', { valueAsNumber: true })} className="input text-sm" />
              </div>
              <div>
                <label className="label text-xs">Additional Costs (₹)</label>
                <input type="number" step="0.01" {...register('additionalCosts', { valueAsNumber: true })} className="input text-sm" />
              </div>
              <div>
                <label className="label text-xs">Tax (₹)</label>
                <input type="number" step="0.01" {...register('taxAmount', { valueAsNumber: true })} className="input text-sm" />
              </div>
            </div>
          </div>

          {/* Calculation Summary */}
          {itemsSubtotal > 0 && (
            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-sm space-y-1.5">
              <div className="flex justify-between text-gray-600">
                <span>Items Subtotal ({qty} units × ₹{unitPrice}):</span>
                <span>{formatCurrency(rupeesToPaise(itemsSubtotal))}</span>
              </div>
              {disc > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>− Discount:</span>
                  <span>− {formatCurrency(rupeesToPaise(disc))}</span>
                </div>
              )}
              {addCosts > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>+ Additional Costs:</span>
                  <span>+ {formatCurrency(rupeesToPaise(addCosts))}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>+ Tax:</span>
                  <span>+ {formatCurrency(rupeesToPaise(tax))}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-2 text-base">
                <span>Total Amount:</span>
                <span className="text-primary-700">{formatCurrency(rupeesToPaise(total))}</span>
              </div>
            </div>
          )}

          <div>
            <label className="label text-xs">Notes</label>
            <textarea {...register('notes')} className="input resize-none text-sm" rows={2} placeholder="Optional purchase notes..." />
          </div>
        </form>
      </Modal>

      {/* Invoice Details Quick View Modal */}
      {viewingPurchase && (
        <Modal
          isOpen={!!viewingPurchase}
          onClose={() => setViewingPurchase(null)}
          title={`Purchase Invoice: #${viewingPurchase.vendorInvoiceNumber || viewingPurchase._id.slice(-6)}`}
          size="md"
          footer={
            <div className="flex gap-2 justify-end">
              <button onClick={() => setViewingPurchase(null)} className="btn-secondary">Close</button>
              <button
                onClick={() => {
                  const p = viewingPurchase;
                  setViewingPurchase(null);
                  openEdit(p);
                }}
                className="btn-primary"
              >
                <Edit2 className="w-4 h-4" /> Edit Purchase
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Header info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3.5 rounded-xl border border-gray-200 text-xs">
              <div>
                <span className="text-gray-400 block font-medium">Date</span>
                <span className="font-semibold text-gray-800">{formatDate(viewingPurchase.purchaseDate)}</span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">Vendor</span>
                <span className="font-semibold text-gray-800">
                  {(typeof viewingPurchase.vendor === 'object' ? viewingPurchase.vendor?.name : null) || '—'}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">Invoice #</span>
                <span className="font-mono font-semibold text-gray-800">{viewingPurchase.vendorInvoiceNumber || '—'}</span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">Payment</span>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase ${paymentColors[viewingPurchase.paymentStatus]}`}>
                  {viewingPurchase.paymentStatus}
                </span>
              </div>
            </div>

            {/* Quantity and Price summary */}
            <div className="p-4 bg-primary-50/50 rounded-xl border border-primary-200 flex justify-between items-center">
              <div>
                <span className="text-xs text-gray-500 font-medium block">Total Units Added</span>
                <span className="text-2xl font-bold text-primary-700">
                  {(viewingPurchase.totalQuantity || (Array.isArray(viewingPurchase.items) ? viewingPurchase.items.reduce((s, it) => s + (it.quantityPurchased || 0), 0) : 0)).toLocaleString()} units
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-500 font-medium block">Price / Unit</span>
                <span className="text-lg font-bold text-gray-900">
                  {formatCurrency(
                    viewingPurchase.purchasePricePerUnit !== undefined && viewingPurchase.purchasePricePerUnit > 0
                      ? viewingPurchase.purchasePricePerUnit
                      : ((viewingPurchase.totalQuantity || 1) > 0 ? Math.round(viewingPurchase.totalAmount / (viewingPurchase.totalQuantity || 1)) : 0)
                  )}
                </span>
              </div>
            </div>

            {/* Total breakdown */}
            <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 text-xs space-y-1.5 ml-auto max-w-xs">
              {viewingPurchase.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount:</span>
                  <span>− {formatCurrency(viewingPurchase.discount)}</span>
                </div>
              )}
              {viewingPurchase.taxAmount > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Tax:</span>
                  <span>+ {formatCurrency(viewingPurchase.taxAmount)}</span>
                </div>
              )}
              {viewingPurchase.additionalCosts > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Additional Costs:</span>
                  <span>+ {formatCurrency(viewingPurchase.additionalCosts)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                <span>Grand Total:</span>
                <span className="text-primary-700">{formatCurrency(viewingPurchase.totalAmount)}</span>
              </div>
            </div>

            {viewingPurchase.notes && (
              <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <strong>Notes:</strong> {viewingPurchase.notes}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete Stock Purchase"
        message="This will reverse the inventory stock quantities and costs associated with this purchase. Confirm deletion?"
        onConfirm={() => {
          if (deleteId && !deleteMut.isPending) {
            deleteMut.mutate(deleteId);
          }
        }}
        onCancel={() => {
          if (!deleteMut.isPending) setDeleteId(null);
        }}
        confirmText={deleteMut.isPending ? 'Deleting...' : 'Delete'}
        isLoading={deleteMut.isPending}
        isDangerous
      />
    </div>
  );
};

export default StockPurchasesPage;
