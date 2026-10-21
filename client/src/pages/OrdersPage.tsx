import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, ShoppingCart, QrCode, Printer } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ordersApi } from '../services/orders.service';
import { productsApi } from '../services/inventory.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatDate, rupeesToPaise, paiseToRupees, dateRangePresets } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import Modal from '../components/ui/Modal';
import { EmptyState, LoadingSpinner, ConfirmDialog } from '../components/ui/Feedback';
import { PrintableQrLabel } from '../components/ui/PrintableQrLabel';
import toast from 'react-hot-toast';
import type { DateRange, Order } from '../types';

const schema = z.object({
  orderDate: z.string().min(1, 'Required'),
  meeshoOrderId: z.string().optional(),
  subOrderId: z.string().optional(),
  product: z.string().min(1, 'Required'),
  sellingPrice: z.number().positive('Must be positive'),
  quantity: z.number().int().positive('Must be positive'),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const OrdersPage: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const qc = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange>(dateRangePresets().thisMonth);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [keepOpen, setKeepOpen] = useState(false);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);

  const params = {
    accountId: activeAccountId === 'all' ? undefined : activeAccountId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    search: search || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['orders', params],
    queryFn: () => ordersApi.list(params),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.list(),
  });

  const orders = data?.data?.data || [];
  const products = productsData?.data?.data || [];
  const totalSales = orders.reduce((sum: number, o: Order) => sum + o.grossAmount, 0);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { orderDate: new Date().toISOString().split('T')[0], quantity: 1 },
  });

  const selectedProduct = watch('product');
  const sellingPrice = watch('sellingPrice');
  const quantity = watch('quantity');

  React.useEffect(() => {
    const prod = products.find((p: { _id: string; sellingPrice: number }) => p._id === selectedProduct);
    if (prod) setValue('sellingPrice', paiseToRupees(prod.sellingPrice));
  }, [selectedProduct, products, setValue]);

  const createMut = useMutation({
    mutationFn: (data: Partial<Order>) => ordersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Order added!');
      if (!keepOpen) { setIsModalOpen(false); reset(); }
      else reset({ orderDate: new Date().toISOString().split('T')[0], quantity: 1 });
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error saving order');
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Order> }) => ordersApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setIsModalOpen(false); setEditingOrder(null); reset();
      toast.success('Order updated!');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => ordersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Order deleted');
      setDeleteId(null);
    },
  });

  const onSubmit = (formData: FormData) => {
    const payload = {
      ...formData,
      sellingPrice: rupeesToPaise(formData.sellingPrice),
      grossAmount: rupeesToPaise(formData.sellingPrice * formData.quantity),
      businessAccount: activeAccountId === 'all' ? undefined : activeAccountId,
    };
    if (editingOrder) {
      updateMut.mutate({ id: editingOrder._id, data: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const openEdit = (order: Order) => {
    setEditingOrder(order);
    reset({
      orderDate: order.orderDate.split('T')[0],
      meeshoOrderId: order.meeshoOrderId,
      subOrderId: order.subOrderId,
      product: typeof order.product === 'string' ? order.product : order.product._id,
      sellingPrice: paiseToRupees(order.sellingPrice),
      quantity: order.quantity,
      notes: order.notes,
    });
    setIsModalOpen(true);
  };

  const openAdd = () => {
    setEditingOrder(null);
    reset({ orderDate: new Date().toISOString().split('T')[0], quantity: 1 });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500">Total sales: <strong>{formatCurrency(totalSales)}</strong> · {orders.length} orders</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Order
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search order ID or product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Table */}
      <div className="card">
        {isLoading ? (
          <LoadingSpinner />
        ) : orders.length === 0 ? (
          <EmptyState
            title="No orders found"
            description="Add your first order using the button above."
            icon={<ShoppingCart className="w-12 h-12" />}
            action={<button onClick={openAdd} className="btn-primary">Add Order</button>}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Meesho ID</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Price</th>
                  <th>Qty</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order: Order) => {
                  const prod = typeof order.product === 'object' ? order.product : null;
                  return (
                    <tr key={order._id}>
                      <td className="whitespace-nowrap">{formatDate(order.orderDate)}</td>
                      <td className="font-mono text-xs">{order.meeshoOrderId || '—'}</td>
                      <td>{prod?.name || '—'}</td>
                      <td className="font-mono text-xs">{order.sku}</td>
                      <td>{formatCurrency(order.sellingPrice)}</td>
                      <td>{order.quantity}</td>
                      <td className="font-semibold">{formatCurrency(order.grossAmount)}</td>
                      <td>
                        <span className={`badge ${
                          order.status === 'delivered' || order.status === 'packed' ? 'badge-green' :
                          order.status === 'returned' || order.status === 'rto_received' ? 'badge-red' :
                          order.status === 'cancelled' ? 'badge-gray' :
                          order.status === 'dispatched' ? 'badge-blue' :
                          'badge-yellow'
                        }`}>{order.status}</span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setPrintOrder(order)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Print Internal QR Label">
                            <QrCode className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => openEdit(order)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteId(order._id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingOrder(null); }}
        title={editingOrder ? 'Edit Order' : 'Add Order'}
        size="md"
        footer={
          <div className="flex items-center justify-between">
            {!editingOrder && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={keepOpen} onChange={e => setKeepOpen(e.target.checked)} className="rounded" />
                Keep form open for bulk entry
              </label>
            )}
            <div className="flex gap-2 ml-auto">
              <button onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancel</button>
              <button form="order-form" type="submit" disabled={isSubmitting || createMut.isPending || updateMut.isPending} className="btn-primary">
                {editingOrder ? 'Update Order' : 'Save Order'}
              </button>
            </div>
          </div>
        }
      >
        <form id="order-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Order Date *</label>
              <input type="date" {...register('orderDate')} className="input" />
              {errors.orderDate && <p className="text-xs text-red-500 mt-1">{errors.orderDate.message}</p>}
            </div>
            <div>
              <label className="label">Meesho Order ID</label>
              <input {...register('meeshoOrderId')} className="input" placeholder="Optional" />
            </div>
          </div>

          <div>
            <label className="label">Sub Order ID
              <span className="ml-1.5 text-[10px] font-normal text-gray-400">(Use when shipping label is not available)</span>
            </label>
            <input
              {...register('subOrderId')}
              className="input font-mono"
              placeholder="e.g. Meesho sub-order ID"
            />
          </div>

          <div>
            <label className="label">Product *</label>
            <select {...register('product')} className="select">
              <option value="">Select product</option>
              {products.map((p: { _id: string; name: string; sku: string }) => (
                <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>
              ))}
            </select>
            {errors.product && <p className="text-xs text-red-500 mt-1">{errors.product.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Selling Price (₹) *</label>
              <input type="number" step="0.01" {...register('sellingPrice', { valueAsNumber: true })} className="input" />
              {errors.sellingPrice && <p className="text-xs text-red-500 mt-1">{errors.sellingPrice.message}</p>}
            </div>
            <div>
              <label className="label">Quantity *</label>
              <input type="number" {...register('quantity', { valueAsNumber: true })} className="input" />
              {errors.quantity && <p className="text-xs text-red-500 mt-1">{errors.quantity.message}</p>}
            </div>
          </div>

          {sellingPrice && quantity && (
            <div className="p-3 bg-primary-50 rounded-lg text-sm">
              <span className="text-primary-700">
                Gross Amount: <strong>{formatCurrency(rupeesToPaise(sellingPrice * quantity))}</strong>
              </span>
            </div>
          )}

          <div>
            <label className="label">Notes</label>
            <textarea {...register('notes')} className="input resize-none" rows={2} placeholder="Optional notes..." />
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete Order"
        message="This will soft-delete the order and reverse stock movements. This action cannot be undone easily."
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        confirmText="Delete"
        isDangerous
      />

      {printOrder && (
        <PrintableQrLabel
          order={printOrder}
          isOpen={true}
          onClose={() => setPrintOrder(null)}
        />
      )}
    </div>
  );
};

export default OrdersPage;
