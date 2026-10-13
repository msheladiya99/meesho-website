import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, RotateCcw } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { returnsApi } from '../services/returns.service';
import { productsApi } from '../services/inventory.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatDate, rupeesToPaise, paiseToRupees, dateRangePresets } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import Modal from '../components/ui/Modal';
import { EmptyState, LoadingSpinner, ConfirmDialog } from '../components/ui/Feedback';
import toast from 'react-hot-toast';
import type { DateRange, ReturnOrder } from '../types';

const schema = z.object({
  returnDate: z.string().min(1, 'Required'),
  meeshoOrderId: z.string().optional(),
  product: z.string().min(1, 'Required'),
  returnedQuantity: z.number().int().positive('Must be positive'),
  originalSellingPrice: z.number().positive('Must be positive'),
  returnReason: z.string().optional(),
  itemCondition: z.enum(['sellable', 'damaged', 'opened', 'pending_inspection']),
  stockDisposition: z.enum(['restock', 'discard', 'pending']),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const ReturnsPage: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const qc = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange>(dateRangePresets().thisMonth);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReturn, setEditingReturn] = useState<ReturnOrder | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const params = {
    accountId: activeAccountId === 'all' ? undefined : activeAccountId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    search: search || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['returns', params],
    queryFn: () => returnsApi.list(params),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.list(),
  });

  const returns: ReturnOrder[] = data?.data?.data || [];
  const products = productsData?.data?.data || [];
  const totalReturnValue = returns.reduce((sum, r) => sum + r.returnAmount, 0);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      returnDate: new Date().toISOString().split('T')[0],
      returnedQuantity: 1,
      itemCondition: 'pending_inspection',
      stockDisposition: 'pending',
    },
  });

  const qty = watch('returnedQuantity');
  const price = watch('originalSellingPrice');

  const createMut = useMutation({
    mutationFn: (d: Partial<ReturnOrder>) => returnsApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      toast.success('Return recorded!');
      setIsModalOpen(false); reset();
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ReturnOrder> }) => returnsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      setIsModalOpen(false); setEditingReturn(null); reset();
      toast.success('Return updated!');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => returnsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      toast.success('Return deleted');
      setDeleteId(null);
    },
  });

  const onSubmit = (formData: FormData) => {
    const payload = {
      ...formData,
      originalSellingPrice: rupeesToPaise(formData.originalSellingPrice),
      returnAmount: rupeesToPaise(formData.originalSellingPrice * formData.returnedQuantity),
      businessAccount: activeAccountId === 'all' ? undefined : activeAccountId,
    };
    if (editingReturn) updateMut.mutate({ id: editingReturn._id, data: payload });
    else createMut.mutate(payload);
  };

  const openEdit = (ret: ReturnOrder) => {
    setEditingReturn(ret);
    reset({
      returnDate: ret.returnDate.split('T')[0],
      meeshoOrderId: ret.meeshoOrderId,
      product: typeof ret.product === 'string' ? ret.product : (ret.product as { _id: string })._id,
      returnedQuantity: ret.returnedQuantity,
      originalSellingPrice: paiseToRupees(ret.originalSellingPrice),
      returnReason: ret.returnReason,
      itemCondition: ret.itemCondition,
      stockDisposition: ret.stockDisposition,
      notes: ret.notes,
    });
    setIsModalOpen(true);
  };

  const conditionColors: Record<string, string> = {
    sellable: 'badge-green',
    damaged: 'badge-red',
    opened: 'badge-yellow',
    pending_inspection: 'badge-gray',
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Return Orders</h1>
          <p className="text-sm text-gray-500">Total return value: <strong>{formatCurrency(totalReturnValue)}</strong> · {returns.length} returns</p>
        </div>
        <button onClick={() => { setEditingReturn(null); reset({ returnDate: new Date().toISOString().split('T')[0], returnedQuantity: 1, itemCondition: 'pending_inspection', stockDisposition: 'pending' }); setIsModalOpen(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Return
        </button>
      </div>

      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <div className="card">
        {isLoading ? <LoadingSpinner /> : returns.length === 0 ? (
          <EmptyState title="No returns found" description="Record your first return above." icon={<RotateCcw className="w-12 h-12" />} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th><th>Meesho ID</th><th>Product</th><th>Qty</th>
                  <th>Return Amount</th><th>Condition</th><th>Disposition</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((ret) => {
                  const prod = typeof ret.product === 'object' ? ret.product : null;
                  return (
                    <tr key={ret._id}>
                      <td className="whitespace-nowrap">{formatDate(ret.returnDate)}</td>
                      <td className="font-mono text-xs">{ret.meeshoOrderId || '—'}</td>
                      <td>{(prod as { name?: string })?.name || '—'}</td>
                      <td>{ret.returnedQuantity}</td>
                      <td className="font-semibold">{formatCurrency(ret.returnAmount)}</td>
                      <td><span className={`badge ${conditionColors[ret.itemCondition] || 'badge-gray'}`}>{ret.itemCondition.replace('_', ' ')}</span></td>
                      <td><span className={`badge ${ret.stockDisposition === 'restock' ? 'badge-green' : ret.stockDisposition === 'discard' ? 'badge-red' : 'badge-gray'}`}>{ret.stockDisposition}</span></td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(ret)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDeleteId(ret._id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
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

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingReturn(null); }} title={editingReturn ? 'Edit Return' : 'Add Return'} size="lg"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancel</button>
            <button form="return-form" type="submit" className="btn-primary">{editingReturn ? 'Update' : 'Save Return'}</button>
          </div>
        }>
        <form id="return-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Return Date *</label>
              <input type="date" {...register('returnDate')} className="input" />
              {errors.returnDate && <p className="text-xs text-red-500 mt-1">{errors.returnDate.message}</p>}
            </div>
            <div>
              <label className="label">Meesho Order ID</label>
              <input {...register('meeshoOrderId')} className="input" placeholder="Optional" />
            </div>
          </div>

          <div>
            <label className="label">Product *</label>
            <select {...register('product')} className="select">
              <option value="">Select product</option>
              {products.map((p: { _id: string; name: string; sku: string }) => <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>)}
            </select>
            {errors.product && <p className="text-xs text-red-500 mt-1">{errors.product.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Returned Qty *</label>
              <input type="number" {...register('returnedQuantity', { valueAsNumber: true })} className="input" />
              {errors.returnedQuantity && <p className="text-xs text-red-500 mt-1">{errors.returnedQuantity.message}</p>}
            </div>
            <div>
              <label className="label">Original Selling Price (₹) *</label>
              <input type="number" step="0.01" {...register('originalSellingPrice', { valueAsNumber: true })} className="input" />
              {errors.originalSellingPrice && <p className="text-xs text-red-500 mt-1">{errors.originalSellingPrice.message}</p>}
            </div>
          </div>

          {qty && price && (
            <div className="p-3 bg-red-50 rounded-lg text-sm text-red-700">
              Return Amount: <strong>{formatCurrency(rupeesToPaise(qty * price))}</strong>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Item Condition *</label>
              <select {...register('itemCondition')} className="select">
                <option value="sellable">Sellable</option>
                <option value="damaged">Damaged</option>
                <option value="opened">Opened</option>
                <option value="pending_inspection">Pending Inspection</option>
              </select>
            </div>
            <div>
              <label className="label">Stock Disposition *</label>
              <select {...register('stockDisposition')} className="select">
                <option value="pending">Pending</option>
                <option value="restock">Restock</option>
                <option value="discard">Discard</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Return Reason</label>
            <input {...register('returnReason')} className="input" placeholder="e.g., Wrong item, Quality issue..." />
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea {...register('notes')} className="input resize-none" rows={2} />
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} title="Delete Return" message="This will remove the return record and reverse any stock changes. Confirm?" onConfirm={() => deleteId && deleteMut.mutate(deleteId)} onCancel={() => setDeleteId(null)} confirmText="Delete" isDangerous />
    </div>
  );
};

export default ReturnsPage;
