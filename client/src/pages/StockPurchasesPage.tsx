import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, TruckIcon, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { stockPurchasesApi, vendorsApi, productsApi } from '../services/inventory.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatDate, rupeesToPaise, paiseToRupees, dateRangePresets } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import Modal from '../components/ui/Modal';
import { EmptyState, LoadingSpinner, ConfirmDialog } from '../components/ui/Feedback';
import toast from 'react-hot-toast';
import type { DateRange, StockPurchase, Vendor, Product } from '../types';

const schema = z.object({
  purchaseDate: z.string().min(1, 'Required'),
  vendor: z.string().min(1, 'Required'),
  vendorInvoiceNumber: z.string().optional(),
  discount: z.number().min(0).default(0),
  additionalCosts: z.number().min(0).default(0),
  taxAmount: z.number().min(0).default(0),
  paymentStatus: z.enum(['paid', 'partial', 'unpaid']),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const StockPurchasesPage: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const qc = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange>(dateRangePresets().thisMonth);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<StockPurchase | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{ id: string; product: string; quantityPurchased: number; purchasePricePerUnit: number; totalAmount: number }>>([
    { id: Date.now().toString(), product: '', quantityPurchased: 1, purchasePricePerUnit: 0, totalAmount: 0 }
  ]);

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
  const { data: productsData } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });

  const purchases: StockPurchase[] = data?.data?.data || [];
  const vendors: Vendor[] = vendorsData?.data?.data || [];
  const products: Product[] = productsData?.data?.data || [];
  const totalCost = purchases.reduce((s, p) => s + p.totalAmount, 0);

  const { register, handleSubmit, watch, reset } = useForm<FormData>({
    defaultValues: { purchaseDate: new Date().toISOString().split('T')[0], paymentStatus: 'paid', discount: 0, additionalCosts: 0, taxAmount: 0 },
  });

  const disc = watch('discount') || 0;
  const addCosts = watch('additionalCosts') || 0;
  const tax = watch('taxAmount') || 0;
  const itemsSubtotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
  const total = itemsSubtotal - disc + addCosts + tax;

  const addItem = () => {
    setItems([...items, { id: Date.now().toString(), product: '', quantityPurchased: 1, purchasePricePerUnit: 0, totalAmount: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    if (field === 'quantityPurchased' || field === 'purchasePricePerUnit') {
      newItems[index][field] = Number(value);
      newItems[index].totalAmount = newItems[index].quantityPurchased * newItems[index].purchasePricePerUnit;
    } else if (field === 'totalAmount') {
      newItems[index].totalAmount = Number(value);
    } else {
      newItems[index][field] = value;
    }
    setItems(newItems);
  };

  const createMut = useMutation({
    mutationFn: (d: Partial<StockPurchase>) => stockPurchasesApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-purchases'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); toast.success('Purchase recorded!'); setIsModalOpen(false); reset(); },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<StockPurchase> }) => stockPurchasesApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-purchases'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); toast.success('Purchase updated!'); setIsModalOpen(false); setEditingPurchase(null); reset(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => stockPurchasesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-purchases'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); toast.success('Purchase deleted'); setDeleteId(null); },
  });

  const onSubmit = (d: FormData) => {
    // Validate items manually
    const invalidItem = items.find(item => !item.product || item.quantityPurchased <= 0 || item.purchasePricePerUnit <= 0);
    if (invalidItem) {
      toast.error('Please fill in all item fields correctly');
      return;
    }

    const payload = {
      ...d,
      items: items.map(({ id, ...item }) => ({
        ...item,
        purchasePricePerUnit: rupeesToPaise(item.purchasePricePerUnit),
        totalAmount: rupeesToPaise(item.totalAmount),
      })),
      discount: rupeesToPaise(d.discount),
      additionalCosts: rupeesToPaise(d.additionalCosts),
      taxAmount: rupeesToPaise(d.taxAmount),
      totalAmount: rupeesToPaise(total),
      businessAccount: activeAccountId === 'all' ? undefined : activeAccountId,
    };
    if (editingPurchase) updateMut.mutate({ id: editingPurchase._id, d: payload });
    else createMut.mutate(payload);
  };

  const openEdit = (p: StockPurchase) => {
    setEditingPurchase(p);
    const purchaseItems = Array.isArray(p.items) ? p.items : [];
    const formattedItems = purchaseItems.map((item: any) => ({
      id: Date.now().toString() + Math.random(),
      product: typeof item.product === 'string' ? item.product : item.product._id,
      quantityPurchased: item.quantityPurchased,
      purchasePricePerUnit: paiseToRupees(item.purchasePricePerUnit),
      totalAmount: paiseToRupees(item.totalAmount),
    }));
    setItems(formattedItems.length > 0 ? formattedItems : [{ id: Date.now().toString(), product: '', quantityPurchased: 1, purchasePricePerUnit: 0, totalAmount: 0 }]);
    reset({
      purchaseDate: p.purchaseDate.split('T')[0],
      vendor: typeof p.vendor === 'string' ? p.vendor : (p.vendor as Vendor)._id,
      vendorInvoiceNumber: p.vendorInvoiceNumber,
      discount: paiseToRupees(p.discount),
      additionalCosts: paiseToRupees(p.additionalCosts),
      taxAmount: paiseToRupees(p.taxAmount),
      paymentStatus: p.paymentStatus,
      notes: p.notes,
    });
    setIsModalOpen(true);
  };

  const paymentColors: Record<string, string> = { paid: 'badge-green', partial: 'badge-yellow', unpaid: 'badge-red' };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Stock Purchases</h1>
          <p className="text-sm text-gray-500">Total: <strong>{formatCurrency(totalCost)}</strong> · {purchases.length} purchases</p>
        </div>
        <button onClick={() => { setEditingPurchase(null); setItems([{ id: Date.now().toString(), product: '', quantityPurchased: 1, purchasePricePerUnit: 0, totalAmount: 0 }]); reset({ purchaseDate: new Date().toISOString().split('T')[0], paymentStatus: 'paid', discount: 0, additionalCosts: 0, taxAmount: 0 }); setIsModalOpen(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Purchase
        </button>
      </div>

      <div className="card p-4">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <div className="card">
        {isLoading ? <LoadingSpinner /> : purchases.length === 0 ? (
          <EmptyState title="No purchases found" description="Record your first stock purchase." icon={<TruckIcon className="w-12 h-12" />} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Date</th><th>Vendor</th><th>Invoice #</th><th>Items</th><th>Total</th><th>Payment</th><th>Actions</th></tr></thead>
              <tbody>
                {purchases.map(p => {
                  const vend = typeof p.vendor === 'object' ? p.vendor : null;
                  const itemsList = Array.isArray(p.items) ? p.items : [];
                  return (
                    <tr key={p._id}>
                      <td className="whitespace-nowrap">{formatDate(p.purchaseDate)}</td>
                      <td>{(vend as Vendor)?.name || '—'}</td>
                      <td className="font-mono text-xs">{p.vendorInvoiceNumber || '—'}</td>
                      <td>
                        <div className="text-xs space-y-1">
                          {itemsList.map((item: any, idx: number) => {
                            const prod = typeof item.product === 'object' ? item.product : null;
                            return (
                              <div key={idx} className="text-gray-700">
                                {(prod as Product)?.name || '—'} × {item.quantityPurchased}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="font-semibold">{formatCurrency(p.totalAmount)}</td>
                      <td><span className={`badge ${paymentColors[p.paymentStatus]}`}>{p.paymentStatus}</span></td>
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDeleteId(p._id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
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

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingPurchase(null); setItems([{ id: Date.now().toString(), product: '', quantityPurchased: 1, purchasePricePerUnit: 0, totalAmount: 0 }]); }} title={editingPurchase ? 'Edit Purchase' : 'Add Stock Purchase'} size="lg"
        footer={<div className="flex gap-2 justify-end"><button onClick={() => { setIsModalOpen(false); setEditingPurchase(null); setItems([{ id: Date.now().toString(), product: '', quantityPurchased: 1, purchasePricePerUnit: 0, totalAmount: 0 }]); }} className="btn-secondary">Cancel</button><button form="purchase-form" type="submit" className="btn-primary">{editingPurchase ? 'Update' : 'Save'}</button></div>}>
        <form id="purchase-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Purchase Date *</label><input type="date" {...register('purchaseDate')} className="input" /></div>
            <div>
              <label className="label">Vendor *</label>
              <select {...register('vendor')} className="select">
                <option value="">Select vendor</option>
                {vendors.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
              </select>
            </div>
          </div>
          <div><label className="label">Invoice Number</label><input {...register('vendorInvoiceNumber')} className="input" placeholder="Optional" /></div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Items *</label>
              <button type="button" onClick={addItem} className="text-xs text-primary-600 hover:text-primary-700 font-medium">+ Add Item</button>
            </div>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="p-3 border border-gray-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="label text-xs">Product</label>
                      <select
                        value={item.product}
                        onChange={(e) => updateItem(index, 'product', e.target.value)}
                        className="select text-sm"
                      >
                        <option value="">Select product</option>
                        {products.map(p => <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>)}
                      </select>
                    </div>
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(index)} className="p-1.5 text-red-500 hover:bg-red-50 rounded mt-5">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="label text-xs">Qty</label>
                      <input
                        type="number"
                        value={item.quantityPurchased}
                        onChange={(e) => updateItem(index, 'quantityPurchased', e.target.value)}
                        className="input text-sm"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Price/Unit (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.purchasePricePerUnit}
                        onChange={(e) => updateItem(index, 'purchasePricePerUnit', e.target.value)}
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Item Total (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.totalAmount}
                        onChange={(e) => updateItem(index, 'totalAmount', e.target.value)}
                        className="input text-sm bg-gray-50"
                        readOnly
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div><label className="label">Discount (₹)</label><input type="number" step="0.01" {...register('discount', { valueAsNumber: true })} className="input" /></div>
            <div><label className="label">Additional Costs (₹)</label><input type="number" step="0.01" {...register('additionalCosts', { valueAsNumber: true })} className="input" /></div>
            <div><label className="label">Tax (₹)</label><input type="number" step="0.01" {...register('taxAmount', { valueAsNumber: true })} className="input" /></div>
          </div>

          {itemsSubtotal > 0 && (
            <div className="p-3 bg-gray-50 rounded-lg text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(rupeesToPaise(itemsSubtotal))}</span></div>
              {disc > 0 && <div className="flex justify-between text-green-600"><span>− Discount</span><span>− {formatCurrency(rupeesToPaise(disc))}</span></div>}
              {addCosts > 0 && <div className="flex justify-between"><span className="text-gray-500">+ Additional Costs</span><span>+ {formatCurrency(rupeesToPaise(addCosts))}</span></div>}
              {tax > 0 && <div className="flex justify-between"><span className="text-gray-500">+ Tax</span><span>+ {formatCurrency(rupeesToPaise(tax))}</span></div>}
              <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1 mt-1"><span>Total</span><span>{formatCurrency(rupeesToPaise(total))}</span></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Payment Status</label>
              <select {...register('paymentStatus')} className="select">
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>
          </div>
          <div><label className="label">Notes</label><textarea {...register('notes')} className="input resize-none" rows={2} /></div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} title="Delete Purchase" message="This will reverse the stock increase from this purchase. Confirm deletion?" onConfirm={() => deleteId && deleteMut.mutate(deleteId)} onCancel={() => setDeleteId(null)} confirmText="Delete" isDangerous />
    </div>
  );
};

export default StockPurchasesPage;
