import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit2, Trash2, TruckIcon, X, Search, Eye,
  ChevronDown, ChevronUp, Package, CreditCard, ShoppingBag,
  Calendar, AlertCircle, CheckCircle2, Receipt, Loader2
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { stockPurchasesApi, vendorsApi, productsApi, categoriesApi } from '../services/inventory.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatDate, rupeesToPaise, paiseToRupees, dateRangePresets } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import Modal from '../components/ui/Modal';
import { EmptyState, LoadingSpinner, ConfirmDialog } from '../components/ui/Feedback';
import toast from 'react-hot-toast';
import type { DateRange, StockPurchase, Vendor, Product, Category } from '../types';

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
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [viewingPurchase, setViewingPurchase] = useState<StockPurchase | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<StockPurchase | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{ id: string; category?: string; product: string; quantityPurchased: number; purchasePricePerUnit: number; totalAmount: number }>>([
    { id: Date.now().toString(), category: '', product: '', quantityPurchased: 1, purchasePricePerUnit: 0, totalAmount: 0 }
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
  const { data: categoriesData } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesApi.list() });

  const rawPurchases: StockPurchase[] = data?.data?.data || [];
  const vendors: Vendor[] = vendorsData?.data?.data || [];
  const products: Product[] = productsData?.data?.data || [];
  const categories: Category[] = categoriesData?.data?.data || [];

  // Filter purchases by search and payment status
  const purchases = useMemo(() => {
    return rawPurchases.filter(p => {
      const vend = typeof p.vendor === 'object' ? p.vendor : vendors.find(v => v._id === p.vendor);
      const vendorName = vend?.name?.toLowerCase() || '';
      const invoiceNo = (p.vendorInvoiceNumber || '').toLowerCase();
      const s = search.toLowerCase().trim();

      const matchesSearch = !s ||
        vendorName.includes(s) ||
        invoiceNo.includes(s) ||
        (Array.isArray(p.items) && p.items.some((it: any) => {
          const pr = typeof it.product === 'object' ? it.product : products.find(prod => prod._id === it.product);
          return pr?.name?.toLowerCase().includes(s) || pr?.sku?.toLowerCase().includes(s);
        }));

      const matchesPayment = paymentFilter === 'all' || p.paymentStatus === paymentFilter;

      return matchesSearch && matchesPayment;
    });
  }, [rawPurchases, search, paymentFilter, vendors, products]);

  // Overall Statistics
  const totalSpend = useMemo(() => rawPurchases.reduce((s, p) => s + (p.totalAmount || 0), 0), [rawPurchases]);
  const totalUnits = useMemo(() => {
    return rawPurchases.reduce((sum, p) => {
      const pItems = Array.isArray(p.items) ? p.items : [];
      return sum + pItems.reduce((iSum: number, item: any) => iSum + (item.quantityPurchased || 0), 0);
    }, 0);
  }, [rawPurchases]);
  const unpaidCount = useMemo(() => rawPurchases.filter(p => p.paymentStatus === 'unpaid').length, [rawPurchases]);
  const paidCount = useMemo(() => rawPurchases.filter(p => p.paymentStatus === 'paid').length, [rawPurchases]);

  const { register, handleSubmit, watch, reset } = useForm<FormData>({
    defaultValues: { purchaseDate: new Date().toISOString().split('T')[0], paymentStatus: 'paid', discount: 0, additionalCosts: 0, taxAmount: 0 },
  });

  const disc = watch('discount') || 0;
  const addCosts = watch('additionalCosts') || 0;
  const tax = watch('taxAmount') || 0;
  const itemsSubtotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
  const total = itemsSubtotal - disc + addCosts + tax;

  const addItem = () => {
    setItems([...items, { id: Date.now().toString() + Math.random(), category: '', product: '', quantityPurchased: 1, purchasePricePerUnit: 0, totalAmount: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    const currentItem = { ...newItems[index] };

    if (field === 'category') {
      currentItem.category = value;
      // If the current product doesn't belong to this category, reset product and price
      if (value && currentItem.product) {
        const prod = products.find(p => p._id === currentItem.product);
        const prodCatId = prod ? (typeof prod.category === 'object' ? prod.category._id : prod.category) : '';
        if (prodCatId !== value) {
          currentItem.product = '';
          currentItem.purchasePricePerUnit = 0;
          currentItem.totalAmount = 0;
        }
      }
    } else if (field === 'product') {
      currentItem.product = value;
      const selectedProd = products.find(p => p._id === value);
      if (selectedProd) {
        // Auto-fill category
        const catId = typeof selectedProd.category === 'object' ? selectedProd.category._id : selectedProd.category;
        if (catId) {
          currentItem.category = catId;
        }
        // Auto-fill unit price from product purchase cost or weightedAvgCost
        const unitCostRupees = paiseToRupees(selectedProd.defaultPurchaseCost || selectedProd.weightedAvgCost || 0);
        currentItem.purchasePricePerUnit = unitCostRupees;
        currentItem.totalAmount = Math.round((currentItem.quantityPurchased || 1) * unitCostRupees * 100) / 100;
      }
    } else if (field === 'quantityPurchased' || field === 'purchasePricePerUnit') {
      (currentItem as any)[field] = Number(value);
      const qty = field === 'quantityPurchased' ? Number(value) : currentItem.quantityPurchased;
      const price = field === 'purchasePricePerUnit' ? Number(value) : currentItem.purchasePricePerUnit;
      currentItem.totalAmount = Math.round(qty * price * 100) / 100;
    } else if (field === 'totalAmount') {
      currentItem.totalAmount = Number(value);
    } else {
      (currentItem as any)[field] = value;
    }

    newItems[index] = currentItem;
    setItems(newItems);
  };

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
      toast.success('Purchase recorded successfully!');
      setIsModalOpen(false);
      setItems([{ id: Date.now().toString(), category: '', product: '', quantityPurchased: 1, purchasePricePerUnit: 0, totalAmount: 0 }]);
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
      toast.success('Purchase updated successfully!');
      setIsModalOpen(false);
      setEditingPurchase(null);
      setItems([{ id: Date.now().toString(), category: '', product: '', quantityPurchased: 1, purchasePricePerUnit: 0, totalAmount: 0 }]);
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
      toast.success('Purchase deleted and stock restored');
      setDeleteId(null);
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error deleting purchase'),
  });

  const onSubmit = (d: FormData) => {
    if (isSubmittingRef.current || createMut.isPending || updateMut.isPending) return;

    const invalidItem = items.find(item => !item.product || item.quantityPurchased <= 0 || item.purchasePricePerUnit <= 0);
    if (invalidItem) {
      toast.error('Please ensure all items have a product, quantity and price');
      return;
    }

    const productIds = items.map(item => item.product).filter(Boolean);
    const uniqueProductIds = new Set(productIds);
    if (productIds.length !== uniqueProductIds.size) {
      toast.error('Please remove duplicate products from the items list');
      return;
    }

    isSubmittingRef.current = true;

    const payload = {
      ...d,
      items: items.map(({ id, category, ...item }) => ({
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
    const formattedItems = purchaseItems.map((item: any) => {
      const prodId = typeof item.product === 'string' ? item.product : item.product?._id;
      const prodObj = products.find(prod => prod._id === prodId) || (typeof item.product === 'object' ? item.product : null);
      const catId = prodObj ? (typeof prodObj.category === 'object' ? prodObj.category._id : prodObj.category) : '';

      return {
        id: Date.now().toString() + Math.random(),
        category: catId || '',
        product: prodId || '',
        quantityPurchased: item.quantityPurchased,
        purchasePricePerUnit: paiseToRupees(item.purchasePricePerUnit),
        totalAmount: paiseToRupees(item.totalAmount),
      };
    });

    setItems(formattedItems.length > 0 ? formattedItems : [{ id: Date.now().toString(), category: '', product: '', quantityPurchased: 1, purchasePricePerUnit: 0, totalAmount: 0 }]);
    reset({
      purchaseDate: p.purchaseDate.split('T')[0],
      vendor: typeof p.vendor === 'string' ? p.vendor : (p.vendor as Vendor)._id,
      vendorInvoiceNumber: p.vendorInvoiceNumber || '',
      discount: paiseToRupees(p.discount),
      additionalCosts: paiseToRupees(p.additionalCosts),
      taxAmount: paiseToRupees(p.taxAmount),
      paymentStatus: p.paymentStatus,
      notes: p.notes || '',
    });
    setIsModalOpen(true);
  };

  const openAdd = () => {
    setEditingPurchase(null);
    setItems([{ id: Date.now().toString(), category: '', product: '', quantityPurchased: 1, purchasePricePerUnit: 0, totalAmount: 0 }]);
    reset({ purchaseDate: new Date().toISOString().split('T')[0], paymentStatus: 'paid', discount: 0, additionalCosts: 0, taxAmount: 0, notes: '', vendorInvoiceNumber: '' });
    setIsModalOpen(true);
  };

  const toggleExpand = (id: string) => {
    setExpandedRowId(prev => prev === id ? null : id);
  };

  const paymentColors: Record<string, string> = {
    paid: 'bg-green-100 text-green-800 border-green-200',
    partial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    unpaid: 'bg-red-100 text-red-800 border-red-200'
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Stock Purchases</h1>
          <p className="text-sm text-gray-500">Track and manage inventory purchase invoices from vendors</p>
        </div>
        <button onClick={openAdd} className="btn-primary shrink-0 shadow-sm hover:shadow">
          <Plus className="w-4 h-4" /> Add Purchase
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-5 h-5" />
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
            <p className="text-xl font-bold text-gray-900 mt-0.5">{totalUnits.toLocaleString()} pcs</p>
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
              placeholder="Search by vendor, invoice #, product..."
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
            description="Record your stock purchase to intake inventory and update costs."
            icon={<TruckIcon className="w-12 h-12 text-gray-400" />}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-28">Date</th>
                  <th>Vendor</th>
                  <th>Invoice #</th>
                  <th>Purchased Items</th>
                  <th className="text-right">Total Amount</th>
                  <th className="text-center">Payment</th>
                  <th className="text-right pr-5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map(p => {
                  const vend = typeof p.vendor === 'object' ? p.vendor : vendors.find(v => v._id === p.vendor);
                  const itemsList = Array.isArray(p.items) ? p.items : [];
                  const totalItemsQty = itemsList.reduce((acc: number, it: any) => acc + (it.quantityPurchased || 0), 0);
                  const isExpanded = expandedRowId === p._id;

                  // Product summary preview
                  const previewNames = itemsList.slice(0, 2).map((it: any) => {
                    const pr = typeof it.product === 'object' ? it.product : products.find(prod => prod._id === it.product);
                    return `${pr?.name || 'Item'} (${it.quantityPurchased})`;
                  });
                  const remainingCount = itemsList.length - 2;

                  return (
                    <React.Fragment key={p._id}>
                      <tr className={`transition-colors hover:bg-gray-50/80 ${isExpanded ? 'bg-primary-50/20' : ''}`}>
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

                        {/* Items Column - Compact & Expandable */}
                        <td className="align-middle">
                          <button
                            type="button"
                            onClick={() => toggleExpand(p._id)}
                            className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200/80 text-gray-800 text-xs font-medium rounded-lg transition-colors border border-gray-200"
                            title="Click to view full items breakdown"
                          >
                            <Package className="w-3.5 h-3.5 text-primary-600" />
                            <span><strong>{itemsList.length} items</strong> ({totalItemsQty} units)</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                          </button>
                          <div className="text-[11px] text-gray-500 mt-1 truncate max-w-xs">
                            {previewNames.join(', ')}
                            {remainingCount > 0 && <span className="text-primary-600 font-medium"> +{remainingCount} more</span>}
                          </div>
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

                      {/* Expandable Breakdown Drawer Row */}
                      {isExpanded && (
                        <tr className="bg-gray-50/70 border-b border-gray-200">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-xs space-y-3">
                              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                                  <Receipt className="w-4 h-4 text-primary-600" />
                                  Items Breakdown ({itemsList.length} Products)
                                </h4>
                                <span className="text-xs text-gray-500 font-medium">
                                  Total: <strong>{totalItemsQty} units</strong>
                                </span>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500 border-b border-gray-100">
                                      <th className="text-left py-1.5 font-semibold">#</th>
                                      <th className="text-left py-1.5 font-semibold">Product Name</th>
                                      <th className="text-left py-1.5 font-semibold">SKU</th>
                                      <th className="text-left py-1.5 font-semibold">Category</th>
                                      <th className="text-right py-1.5 font-semibold">Qty</th>
                                      <th className="text-right py-1.5 font-semibold">Price / Unit</th>
                                      <th className="text-right py-1.5 font-semibold">Item Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50">
                                    {itemsList.map((it: any, idx: number) => {
                                      const prod = typeof it.product === 'object' ? it.product : products.find(pr => pr._id === it.product);
                                      const prodCat = prod && typeof prod.category === 'object' ? prod.category : categories.find(c => c._id === prod?.category);
                                      const catName = prodCat?.name;

                                      return (
                                        <tr key={idx} className="hover:bg-gray-50/50">
                                          <td className="py-2 text-gray-400">{idx + 1}</td>
                                          <td className="py-2 font-medium text-gray-900">{prod?.name || '—'}</td>
                                          <td className="py-2 font-mono text-[11px] text-gray-500">{prod?.sku || '—'}</td>
                                          <td className="py-2 text-gray-600">
                                            {catName && catName.toLowerCase() !== prod?.name?.toLowerCase() ? (
                                              <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] text-gray-700">
                                                {catName}
                                              </span>
                                            ) : (
                                              <span className="text-gray-400">—</span>
                                            )}
                                          </td>
                                          <td className="py-2 text-right font-medium text-gray-800">{it.quantityPurchased}</td>
                                          <td className="py-2 text-right text-gray-600">{formatCurrency(it.purchasePricePerUnit)}</td>
                                          <td className="py-2 text-right font-semibold text-gray-900">{formatCurrency(it.totalAmount)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {p.notes && (
                                <div className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded border border-gray-100">
                                  <strong>Notes:</strong> {p.notes}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
          if (!isSubmitting) {
            setIsModalOpen(false);
            setEditingPurchase(null);
          }
        }}
        title={editingPurchase ? 'Edit Stock Purchase' : 'Add Stock Purchase'}
        size="lg"
        footer={
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                if (!isSubmitting) {
                  setIsModalOpen(false);
                  setEditingPurchase(null);
                }
              }}
              className="btn-secondary disabled:opacity-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              form="purchase-form"
              type="submit"
              disabled={isSubmitting}
              className="btn-primary flex items-center justify-center gap-2 min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Purchase Date *</label>
              <input type="date" {...register('purchaseDate')} className="input" />
            </div>
            <div>
              <label className="label">Vendor *</label>
              <select {...register('vendor')} className="select">
                <option value="">Select vendor</option>
                {vendors.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Invoice Number</label>
              <input {...register('vendorInvoiceNumber')} className="input" placeholder="e.g. INV-2026-001" />
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

          {/* Items Section */}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <label className="label mb-0">Purchase Items *</label>
                <p className="text-xs text-gray-500">Select product, specify quantity and purchase price per unit</p>
              </div>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 bg-primary-50 px-2.5 py-1 rounded-md transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Another Item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => {
                const filteredProducts = item.category
                  ? products.filter(p => {
                      const prodCatId = typeof p.category === 'object' ? p.category._id : p.category;
                      return prodCatId === item.category;
                    })
                  : products;

                return (
                  <div key={item.id} className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-3 relative group">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Item #{index + 1}</span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                          title="Remove item"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label text-xs">Filter by Category</label>
                        <select
                          value={item.category || ''}
                          onChange={(e) => updateItem(index, 'category', e.target.value)}
                          className="select text-sm bg-white"
                        >
                          <option value="">All Categories</option>
                          {categories.map(c => (
                            <option key={c._id} value={c._id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="label text-xs">Product *</label>
                        <select
                          value={item.product}
                          onChange={(e) => updateItem(index, 'product', e.target.value)}
                          className="select text-sm bg-white font-medium"
                        >
                          <option value="">Select product</option>
                          {filteredProducts.map(p => (
                            <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="label text-xs">Quantity *</label>
                        <input
                          type="number"
                          value={item.quantityPurchased}
                          onChange={(e) => updateItem(index, 'quantityPurchased', e.target.value)}
                          className="input text-sm bg-white"
                          min="1"
                        />
                      </div>
                      <div>
                        <label className="label text-xs">Price/Unit (₹) *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.purchasePricePerUnit}
                          onChange={(e) => updateItem(index, 'purchasePricePerUnit', e.target.value)}
                          className="input text-sm bg-white"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="label text-xs">Item Total (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.totalAmount}
                          className="input text-sm bg-gray-100 font-semibold text-gray-800"
                          readOnly
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
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
                <span>Items Subtotal:</span>
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
          size="lg"
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

            {/* Items table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 text-gray-600 border-b border-gray-200">
                  <tr>
                    <th className="py-2 px-3 text-left">#</th>
                    <th className="py-2 px-3 text-left">Product</th>
                    <th className="py-2 px-3 text-left">SKU</th>
                    <th className="py-2 px-3 text-right">Quantity</th>
                    <th className="py-2 px-3 text-right">Unit Price</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(viewingPurchase.items || []).map((it: any, idx: number) => {
                    const prod = typeof it.product === 'object' ? it.product : products.find(pr => pr._id === it.product);
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="py-2 px-3 text-gray-400">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold text-gray-900">{prod?.name || '—'}</td>
                        <td className="py-2 px-3 font-mono text-gray-500">{prod?.sku || '—'}</td>
                        <td className="py-2 px-3 text-right font-medium">{it.quantityPurchased}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{formatCurrency(it.purchasePricePerUnit)}</td>
                        <td className="py-2 px-3 text-right font-bold text-gray-900">{formatCurrency(it.totalAmount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
