import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  QrCode, Camera, CheckCircle2, AlertCircle, PackageCheck, Truck,
  Printer, Search, RotateCcw, Clock, Layers, ArrowRight, ShieldAlert,
  ChevronRight, Sparkles, Filter, Plus, Package, Tag, Building2
} from 'lucide-react';
import { packingApi, type PackingLookupResult } from '../services/packing.service';
import { productsApi } from '../services/inventory.service';
import { ordersApi } from '../services/orders.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatDate, paiseToRupees, rupeesToPaise } from '../lib/utils';
import { CameraScannerModal } from '../components/ui/CameraScannerModal';
import { PrintableQrLabel } from '../components/ui/PrintableQrLabel';
import { LoadingSpinner, EmptyState } from '../components/ui/Feedback';
import Modal from '../components/ui/Modal';
import toast from 'react-hot-toast';
import type { Order, PackingRecord, Product } from '../types';

export const PackingDispatchPage: React.FC = () => {
  const { activeAccountId, accounts, getActiveAccount } = useAccountStore();
  const qc = useQueryClient();
  const activeAccount = getActiveAccount();

  // Scanner state
  const [scanInput, setScanInput] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeLookup, setActiveLookup] = useState<PackingLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [packQuantity, setPackQuantity] = useState<number>(1);
  const [packingNotes, setPackingNotes] = useState('');
  const [labelModalOrder, setLabelModalOrder] = useState<Order | null>(null);

  // Quick Add Order from Scan state
  const [isQuickOrderOpen, setIsQuickOrderOpen] = useState(false);
  const [newOrderCode, setNewOrderCode] = useState('');
  const [newOrderAccountId, setNewOrderAccountId] = useState('');
  const [newOrderProductId, setNewOrderProductId] = useState('');
  const [newOrderQty, setNewOrderQty] = useState(1);
  const [newOrderPriceRupees, setNewOrderPriceRupees] = useState(0);
  const [newOrderCarrier, setNewOrderCarrier] = useState('Shadowfax');
  const [newOrderNotes, setNewOrderNotes] = useState('');
  const [newOrderAutoPack, setNewOrderAutoPack] = useState(true);

  // Dispatch modal state
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null);
  const [carrierName, setCarrierName] = useState('Shadowfax');
  const [dispatchAwb, setDispatchAwb] = useState('');

  // Table filter state
  const [packingFilter, setPackingFilter] = useState<'pending' | 'partially_packed' | 'packed' | 'dispatched'>('pending');
  const [orderSearch, setOrderSearch] = useState('');

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus input automatically on mount and after successful scans
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeLookup]);

  // Fetch summary counts for today
  const { data: summaryData } = useQuery({
    queryKey: ['packing-summary', activeAccountId],
    queryFn: () => packingApi.summary(activeAccountId),
  });
  const summary = summaryData?.data?.data;

  // Fetch recent packing records
  const { data: recordsData, isLoading: recordsLoading } = useQuery({
    queryKey: ['packing-records', activeAccountId],
    queryFn: () => packingApi.records({ accountId: activeAccountId === 'all' ? undefined : activeAccountId, limit: 15 }),
  });
  const recentRecords: PackingRecord[] = recordsData?.data?.data || [];

  // Fetch orders based on filter
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['packing-orders', activeAccountId, packingFilter, orderSearch],
    queryFn: () => packingApi.orders({
      accountId: activeAccountId === 'all' ? undefined : activeAccountId,
      packingStatus: packingFilter,
      search: orderSearch || undefined,
      limit: 50,
    }),
  });
  const filteredOrders: Order[] = ordersData?.data?.data || [];

  // Fetch products for quick order creation
  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.list({ limit: 100 }),
  });
  const products: Product[] = productsData?.data?.data || [];

  // Cache last selected product for rapid consecutive packing
  const [lastSelectedProductId, setLastSelectedProductId] = useState<string>(() => {
    return localStorage.getItem('last_packed_product_id') || '';
  });

  const handleOpenQuickOrder = (code?: string) => {
    const raw = (code !== undefined ? code : scanInput).trim();
    const defaultAcc = activeAccountId !== 'all' ? activeAccountId : (accounts[0]?._id || '');
    setNewOrderCode(raw || '');
    setNewOrderAccountId(defaultAcc);

    // Pick last selected product or fallback to first product
    const savedId = lastSelectedProductId || localStorage.getItem('last_packed_product_id');
    const matched = products.find((p) => p._id === savedId);
    const targetProd = matched || products[0];

    if (targetProd) {
      setNewOrderProductId(targetProd._id);
      setNewOrderPriceRupees(paiseToRupees(targetProd.sellingPrice || 0));
    }
    setNewOrderQty(1);
    setNewOrderCarrier('Shadowfax');
    setNewOrderNotes('');
    setNewOrderAutoPack(true);
    setIsQuickOrderOpen(true);
  };

  const handleProductSelect = (prodId: string) => {
    setNewOrderProductId(prodId);
    setLastSelectedProductId(prodId);
    localStorage.setItem('last_packed_product_id', prodId);
    const prod = products.find((p) => p._id === prodId);
    if (prod) {
      setNewOrderPriceRupees(paiseToRupees(prod.sellingPrice || 0));
    }
  };

  const createOrderMutation = useMutation({
    mutationFn: (data: any) => ordersApi.create(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['packing-summary'] });
      qc.invalidateQueries({ queryKey: ['packing-records'] });
      qc.invalidateQueries({ queryKey: ['packing-orders'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['products'] });

      const created = res.data.data;
      toast.success(newOrderAutoPack ? '🎉 Order created & marked as PACKED!' : 'Order created successfully!');
      setIsQuickOrderOpen(false);
      setScanInput('');
      setLookupError(null);

      // Automatically look up the newly created order
      const codeToLookup = newOrderCode || created.meeshoOrderId || created.shippingLabelId || created._id;
      if (codeToLookup) {
        lookupMutation.mutate(codeToLookup);
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to create order');
    },
  });

  const handleCreateQuickOrderSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newOrderAccountId) {
      toast.error('Please select a GSTIN account');
      return;
    }
    if (!newOrderProductId) {
      toast.error('Please select a product');
      return;
    }
    if (newOrderQty <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    const payload: any = {
      businessAccount: newOrderAccountId,
      orderDate: new Date(),
      meeshoOrderId: newOrderCode.trim() || undefined,
      shippingLabelId: newOrderCode.trim() || undefined,
      carrierName: newOrderCarrier,
      product: newOrderProductId,
      sellingPrice: rupeesToPaise(newOrderPriceRupees),
      quantity: newOrderQty,
      notes: newOrderNotes.trim() || undefined,
      status: newOrderAutoPack ? 'packed' : 'pending',
    };

    createOrderMutation.mutate(payload);
  };

  // Lookup mutation
  const lookupMutation = useMutation({
    mutationFn: (code: string) => packingApi.lookup(code, activeAccountId),
    onSuccess: (res) => {
      const data = res.data.data;
      setActiveLookup(data);
      setLookupError(null);
      setPackQuantity(data.remainingQuantity > 0 ? data.remainingQuantity : 1);
      toast.success(`Matched Order: ${data.order.meeshoOrderId || data.order._id}`);
    },
    onError: (err: any, variables: string) => {
      const msg = err?.response?.data?.message || 'Order Not Found';
      setLookupError(msg);
      setActiveLookup(null);

      // Directly open Quick Add Order popup with the fresh scanned code prefilled!
      const targetCode = (variables || scanInput).trim();
      handleOpenQuickOrder(targetCode);
      toast('📦 Fresh QR detected! Select product to create & pack.', {
        icon: '✨',
        duration: 4000,
      });
    },
  });

  const handleScanSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = scanInput.trim();
    if (!clean) return;
    lookupMutation.mutate(clean);
  };

  // Pack mutation
  const packMutation = useMutation({
    mutationFn: (data: { orderId: string; quantityToPack: number; scannedCode: string; notes?: string }) =>
      packingApi.pack(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['packing-summary'] });
      qc.invalidateQueries({ queryKey: ['packing-records'] });
      qc.invalidateQueries({ queryKey: ['packing-orders'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });

      toast.success(res.data.message || 'Order successfully packed!');
      setActiveLookup(null);
      setScanInput('');
      setPackingNotes('');
      inputRef.current?.focus();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to pack order');
    },
  });

  // Dispatch mutation
  const dispatchMutation = useMutation({
    mutationFn: (data: { orderId: string; carrierName?: string; shippingLabelId?: string }) =>
      packingApi.dispatch(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['packing-summary'] });
      qc.invalidateQueries({ queryKey: ['packing-orders'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });

      toast.success('Order marked as DISPATCHED');
      setDispatchOrder(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to dispatch order');
    },
  });

  const handlePack = () => {
    if (!activeLookup) return;
    packMutation.mutate({
      orderId: activeLookup.order._id,
      quantityToPack: packQuantity,
      scannedCode: scanInput || activeLookup.order.shippingLabelId || activeLookup.order.meeshoOrderId || activeLookup.order._id,
      notes: packingNotes,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">Packing & Dispatch</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-100 text-primary-700">
              Live Scanner
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Scan carrier shipping label QR/barcode to verify, pack, and dispatch orders safely.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeAccount && (
            <div className="hidden sm:flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 text-xs">
              <span className="text-gray-400">Active GSTIN:</span>
              <span className="font-mono font-bold text-gray-800">{activeAccount.gstin}</span>
              <span className="text-gray-400">({activeAccount.tradeName})</span>
            </div>
          )}
          <button
            onClick={() => handleOpenQuickOrder()}
            className="btn-primary py-1.5 px-3.5 text-xs flex items-center gap-1.5 font-semibold shadow-xs"
          >
            <Plus className="w-4 h-4" />
            + New Order
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-4 border-l-4 border-l-amber-500">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400">Pending Packing</p>
            <p className="text-xl font-bold text-gray-900">{summary?.pendingPacking ?? '—'}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-4 border-l-4 border-l-blue-500">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400">Partially Packed</p>
            <p className="text-xl font-bold text-gray-900">{summary?.partiallyPacked ?? '—'}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-4 border-l-4 border-l-emerald-500">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <PackageCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400">Packed Today (Units)</p>
            <p className="text-xl font-bold text-emerald-700">{summary?.packedToday ?? 0}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-4 border-l-4 border-l-indigo-500">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400">Dispatched Today</p>
            <p className="text-xl font-bold text-indigo-700">{summary?.dispatchedToday ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Main Scanner Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Scan Input & Matched Order Details */}
        <div className="lg:col-span-7 space-y-4">
          <div className="card p-5 border-2 border-primary-200 shadow-md">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-primary-700 flex items-center gap-1.5">
                <QrCode className="w-4 h-4" /> Barcode & QR Scan Input
              </span>
              <span className="text-xs text-gray-400">USB Scanner & Mobile Ready</span>
            </div>

            <form onSubmit={handleScanSubmit} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Scan shipping label barcode / QR, or paste Order ID..."
                  className="input pl-4 pr-10 py-2.5 sm:py-3 text-sm sm:text-base font-mono w-full border-gray-300 focus:border-primary-500 shadow-sm"
                  autoFocus
                />
                {scanInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setScanInput('');
                      setActiveLookup(null);
                      setLookupError(null);
                      inputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={lookupMutation.isPending || !scanInput.trim()}
                  className="btn-primary flex-1 sm:flex-initial px-5 py-2.5 sm:py-3 text-sm font-semibold justify-center whitespace-nowrap"
                >
                  {lookupMutation.isPending ? <LoadingSpinner size="sm" /> : 'Lookup'}
                </button>

                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="btn-secondary px-4 py-2.5 sm:py-3 text-sm text-gray-700 flex items-center justify-center gap-1.5"
                  title="Open Camera Scanner"
                >
                  <Camera className="w-5 h-5 text-gray-600" />
                  <span className="sm:inline">Camera</span>
                </button>
              </div>
            </form>

            <p className="text-[11px] text-gray-400 mt-2">
              Tip: Plug in any USB handheld barcode or 2D scanner. Scanned inputs are automatically parsed and verified.
            </p>
          </div>

          {/* Error Notification with Direct Action */}
          {lookupError && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900 animate-fade-in shadow-xs">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm space-y-2">
                <div>
                  <p className="font-semibold text-amber-900">{lookupError}</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    No order is registered with this code yet. You can create it right now from this scan to begin packing.
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => handleOpenQuickOrder(scanInput)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    + Add New Order with Code: <span className="font-mono underline">{scanInput || 'This Label'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Order Details Panel */}
          {activeLookup ? (
            <div className="card p-5 border border-primary-100 shadow-sm space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className={`badge ${
                    activeLookup.order.status === 'packed' ? 'badge-green' :
                    activeLookup.order.status === 'dispatched' ? 'badge-blue' :
                    'badge-yellow'
                  }`}>
                    {activeLookup.order.status.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-400 font-mono">Matched by {activeLookup.matchedBy}</span>
                </div>
                <button
                  onClick={() => setLabelModalOrder(activeLookup.order)}
                  className="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-1 font-medium"
                >
                  <Printer className="w-3.5 h-3.5" /> Print QR Label
                </button>
              </div>

              {/* Order Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-50 p-3.5 rounded-xl text-xs">
                <div>
                  <span className="text-gray-400">Meesho Order ID:</span>
                  <p className="font-mono font-bold text-gray-900 text-sm">{activeLookup.order.meeshoOrderId || '—'}</p>
                </div>
                <div>
                  <span className="text-gray-400">Internal Order ID:</span>
                  <p className="font-mono text-gray-700 truncate">{activeLookup.order._id}</p>
                </div>
                <div>
                  <span className="text-gray-400">Order Date:</span>
                  <p className="font-medium text-gray-800">{formatDate(activeLookup.order.orderDate)}</p>
                </div>
                <div>
                  <span className="text-gray-400">Product:</span>
                  <p className="font-bold text-gray-900 truncate">{(activeLookup.order.product as any)?.name || 'Product'}</p>
                </div>
                <div>
                  <span className="text-gray-400">SKU:</span>
                  <p className="font-mono font-bold text-primary-700">{activeLookup.order.sku}</p>
                </div>
                <div>
                  <span className="text-gray-400">Selling Price:</span>
                  <p className="font-semibold text-gray-900">{formatCurrency(activeLookup.order.sellingPrice)}</p>
                </div>
              </div>

              {/* Quantities Status Bar */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                  <p className="text-xs text-blue-600 font-medium">Ordered Qty</p>
                  <p className="text-xl font-bold text-blue-900">{activeLookup.orderedQuantity}</p>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <p className="text-xs text-emerald-600 font-medium">Previously Packed</p>
                  <p className="text-xl font-bold text-emerald-900">{activeLookup.previouslyPacked}</p>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <p className="text-xs text-amber-600 font-medium">Remaining to Pack</p>
                  <p className="text-xl font-bold text-amber-900">{activeLookup.remainingQuantity}</p>
                </div>
              </div>

              {/* Duplicate Packing Warning */}
              {activeLookup.isFullyPacked ? (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-xs">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="font-bold">This order is already fully packed!</p>
                    <p className="text-emerald-700">Duplicate packing has been prevented to protect inventory accuracy.</p>
                  </div>
                </div>
              ) : (
                /* Packing action form */
                <div className="space-y-3 border-t pt-3">
                  <div className="flex items-center gap-4">
                    <div className="w-36">
                      <label className="text-xs font-semibold text-gray-700 block mb-1">
                        Quantity to Pack:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={activeLookup.remainingQuantity}
                        value={packQuantity}
                        onChange={(e) => setPackQuantity(parseInt(e.target.value, 10) || 1)}
                        className="input font-bold text-base text-center"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-gray-700 block mb-1">
                        Notes / Batch (Optional):
                      </label>
                      <input
                        type="text"
                        value={packingNotes}
                        onChange={(e) => setPackingNotes(e.target.value)}
                        placeholder="e.g. Batch 2, verified seal"
                        className="input text-xs"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handlePack}
                    disabled={packMutation.isPending || packQuantity <= 0 || packQuantity > activeLookup.remainingQuantity}
                    className="btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 shadow"
                  >
                    {packMutation.isPending ? <LoadingSpinner size="sm" /> : <PackageCheck className="w-5 h-5" />}
                    Mark as Packed ({packQuantity} unit{packQuantity > 1 ? 's' : ''})
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="card p-10 text-center border-dashed border-2 text-gray-400">
              <QrCode className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium text-sm text-gray-600">No Order Selected</p>
              <p className="text-xs mt-1">Scan a shipping label barcode or use search to begin packing.</p>
            </div>
          )}
        </div>

        {/* Right: Recent Scans Register */}
        <div className="lg:col-span-5 space-y-4">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3 border-b pb-2">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary-500" /> Recent Packing Scans
              </h3>
              <span className="text-xs text-gray-400">{recentRecords.length} recent</span>
            </div>

            {recordsLoading ? (
              <LoadingSpinner />
            ) : recentRecords.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-400">
                No packing scans recorded today yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[380px] overflow-y-auto pr-1">
                {recentRecords.map((rec) => (
                  <div key={rec._id} className="py-2.5 flex items-start justify-between gap-2 text-xs">
                    <div>
                      <div className="flex items-center gap-1.5 font-medium text-gray-900">
                        <span>{rec.sku}</span>
                        <span className="badge badge-green">+{rec.packedQuantity} packed</span>
                      </div>
                      <p className="text-[11px] text-gray-400 font-mono mt-0.5 truncate max-w-[200px]">
                        Tx: {rec.transactionId}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        By {(rec.operator as any)?.name || 'Operator'} • {new Date(rec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className="font-mono text-[11px] bg-gray-50 px-2 py-0.5 rounded border text-gray-600">
                      {(rec.order as any)?.meeshoOrderId || 'Order'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Orders By Packing Status Table */}
      <div className="card space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            {(['pending', 'partially_packed', 'packed', 'dispatched'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setPackingFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all whitespace-nowrap ${
                  packingFilter === tab
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search Meesho ID, SKU, label..."
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              className="input pl-8 py-1.5 text-xs w-full"
            />
          </div>
        </div>

        {/* Table Content */}
        {ordersLoading ? (
          <LoadingSpinner />
        ) : filteredOrders.length === 0 ? (
          <EmptyState
            title={`No ${packingFilter.replace('_', ' ')} orders found`}
            description="Orders matching this status will appear here."
            icon={<Filter className="w-10 h-10 text-gray-300" />}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Order Date</th>
                  <th>Meesho Order ID</th>
                  <th>Product & SKU</th>
                  <th>Ordered</th>
                  <th>Packed</th>
                  <th>Remaining</th>
                  <th>Carrier Label</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const packed = order.packedQuantity || 0;
                  const remaining = Math.max(0, order.quantity - packed);
                  const prod = typeof order.product === 'object' ? order.product : null;

                  return (
                    <tr key={order._id}>
                      <td className="whitespace-nowrap">{formatDate(order.orderDate)}</td>
                      <td className="font-mono font-bold text-xs text-gray-900">{order.meeshoOrderId || '—'}</td>
                      <td>
                        <div className="font-medium text-gray-900 truncate max-w-[180px]">{(prod as any)?.name || '—'}</div>
                        <div className="font-mono text-[11px] text-gray-400">{order.sku}</div>
                      </td>
                      <td className="font-semibold">{order.quantity}</td>
                      <td className="text-emerald-700 font-semibold">{packed}</td>
                      <td className="font-semibold text-amber-700">{remaining}</td>
                      <td className="font-mono text-xs">
                        {order.shippingLabelId ? (
                          <span className="text-gray-700 font-medium">{order.shippingLabelId}</span>
                        ) : order.internalQrCode ? (
                          <span className="text-xs text-gray-400">{order.internalQrCode}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${
                          order.status === 'packed' ? 'badge-green' :
                          order.status === 'dispatched' ? 'badge-blue' :
                          'badge-yellow'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {order.status !== 'packed' && order.status !== 'dispatched' && (
                            <button
                              onClick={() => {
                                setScanInput(order.meeshoOrderId || order._id);
                                lookupMutation.mutate(order.meeshoOrderId || order._id);
                              }}
                              className="px-2 py-1 rounded bg-primary-50 text-primary-700 hover:bg-primary-100 text-xs font-medium"
                            >
                              Pack
                            </button>
                          )}
                          {order.status === 'packed' && (
                            <button
                              onClick={() => {
                                setDispatchOrder(order);
                                setDispatchAwb(order.shippingLabelId || '');
                              }}
                              className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-medium flex items-center gap-1"
                            >
                              <Truck className="w-3 h-3" /> Dispatch
                            </button>
                          )}
                          <button
                            onClick={() => setLabelModalOrder(order)}
                            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                            title="Print QR Label"
                          >
                            <Printer className="w-3.5 h-3.5" />
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

      {/* Dispatch Modal */}
      {dispatchOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Truck className="w-4 h-4 text-indigo-600" /> Mark as Dispatched
              </h3>
              <button onClick={() => setDispatchOrder(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="text-xs bg-gray-50 p-3 rounded-xl space-y-1">
              <p>Meesho Order: <span className="font-bold text-gray-900">{dispatchOrder.meeshoOrderId || dispatchOrder._id}</span></p>
              <p>Product: <span className="font-medium text-gray-800">{(dispatchOrder.product as any)?.name}</span> ({dispatchOrder.sku})</p>
              <p>Quantity: <span className="font-bold text-gray-900">{dispatchOrder.quantity} units</span></p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Carrier Partner:</label>
                <select
                  value={carrierName}
                  onChange={(e) => setCarrierName(e.target.value)}
                  className="input text-xs"
                >
                  <option value="Shadowfax">Shadowfax</option>
                  <option value="Delhivery">Delhivery</option>
                  <option value="Xpressbees">Xpressbees</option>
                  <option value="Ecom Express">Ecom Express</option>
                  <option value="Valmo">Valmo</option>
                  <option value="BlueDart">BlueDart</option>
                  <option value="Other">Other Courier</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Shipping Label / AWB Number:</label>
                <input
                  type="text"
                  value={dispatchAwb}
                  onChange={(e) => setDispatchAwb(e.target.value)}
                  placeholder="Scan or enter AWB / tracking number"
                  className="input text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <button onClick={() => setDispatchOrder(null)} className="btn-secondary text-xs">Cancel</button>
              <button
                onClick={() => {
                  dispatchMutation.mutate({
                    orderId: dispatchOrder._id,
                    carrierName,
                    shippingLabelId: dispatchAwb,
                  });
                }}
                disabled={dispatchMutation.isPending}
                className="btn-primary text-xs"
              >
                {dispatchMutation.isPending ? <LoadingSpinner size="sm" /> : 'Confirm Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Scanner Modal */}
      <CameraScannerModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onScan={(code) => {
          setIsCameraOpen(false);
          setScanInput(code);
          lookupMutation.mutate(code);
        }}
      />

      {/* Quick Add Order from Scan Modal */}
      {isQuickOrderOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsQuickOrderOpen(false)}
          title="📦 Fresh Label Scanned — Add & Pack"
          size="lg"
          footer={
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
              <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newOrderAutoPack}
                  onChange={(e) => setNewOrderAutoPack(e.target.checked)}
                  className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4"
                />
                <span>Mark order as <strong>PACKED</strong> immediately</span>
              </label>
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setIsQuickOrderOpen(false)}
                  className="btn-secondary text-xs flex-1 sm:flex-initial"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateQuickOrderSubmit}
                  disabled={createOrderMutation.isPending || !newOrderProductId || !newOrderAccountId}
                  className="btn-primary text-xs font-semibold flex-1 sm:flex-initial justify-center"
                >
                  {createOrderMutation.isPending ? (
                    <LoadingSpinner size="sm" />
                  ) : newOrderAutoPack ? (
                    'Create & Pack Now'
                  ) : (
                    'Save Order'
                  )}
                </button>
              </div>
            </div>
          }
        >
          <form onSubmit={handleCreateQuickOrderSubmit} className="space-y-4 text-xs">
            {/* Scanned Code / Order Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  Scanned Shipping Label / Barcode:
                </label>
                <input
                  type="text"
                  value={newOrderCode}
                  onChange={(e) => setNewOrderCode(e.target.value)}
                  placeholder="e.g. 811709477610"
                  className="input font-mono text-xs font-semibold bg-gray-50 border-primary-200"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  GSTIN Business Account:
                </label>
                <select
                  value={newOrderAccountId}
                  onChange={(e) => setNewOrderAccountId(e.target.value)}
                  className="input text-xs"
                  required
                >
                  <option value="">Select Account</option>
                  {accounts.map((acc) => (
                    <option key={acc._id} value={acc._id}>
                      {acc.tradeName || acc.name} ({acc.gstin})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Product selection */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-gray-700">
                  Select Perfume Product:
                </label>
                {newOrderProductId && (
                  <span className="text-[11px] text-primary-600 font-medium">
                    Stock: {products.find((p) => p._id === newOrderProductId)?.currentStock ?? 0} units
                  </span>
                )}
              </div>
              <select
                value={newOrderProductId}
                onChange={(e) => handleProductSelect(e.target.value)}
                className="input text-xs font-medium"
                required
              >
                <option value="">Select a perfume</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} — SKU: {p.sku} (Available: {p.currentStock})
                  </option>
                ))}
              </select>

              {/* Quick 1-tap product chips */}
              {products.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  <span className="text-[11px] text-gray-400 self-center">Quick pick:</span>
                  {products.slice(0, 6).map((p) => (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => handleProductSelect(p._id)}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-all ${
                        newOrderProductId === p._id
                          ? 'bg-primary-50 border-primary-500 text-primary-700 font-bold shadow-xs ring-1 ring-primary-500'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {p.name} ({p.currentStock})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quantity, Selling Price & Carrier */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Quantity:</label>
                <input
                  type="number"
                  min="1"
                  value={newOrderQty}
                  onChange={(e) => setNewOrderQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="input text-xs font-bold"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Selling Price (₹):</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newOrderPriceRupees}
                  onChange={(e) => setNewOrderPriceRupees(parseFloat(e.target.value) || 0)}
                  className="input text-xs font-bold"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Carrier Name:</label>
                <select
                  value={newOrderCarrier}
                  onChange={(e) => setNewOrderCarrier(e.target.value)}
                  className="input text-xs"
                >
                  <option value="Shadowfax">Shadowfax</option>
                  <option value="Delhivery">Delhivery</option>
                  <option value="Xpressbees">Xpressbees</option>
                  <option value="Ecom Express">Ecom Express</option>
                  <option value="Meesho Express">Meesho Express</option>
                  <option value="Blue Dart">Blue Dart</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="font-semibold text-gray-700 block mb-1">Order Notes (Optional):</label>
              <input
                type="text"
                value={newOrderNotes}
                onChange={(e) => setNewOrderNotes(e.target.value)}
                placeholder="Operator remarks / shipping batch"
                className="input text-xs"
              />
            </div>
          </form>
        </Modal>
      )}

      {/* Printable QR Label Modal */}
      {labelModalOrder && (
        <PrintableQrLabel
          order={labelModalOrder}
          isOpen={true}
          onClose={() => setLabelModalOrder(null)}
        />
      )}
    </div>
  );
};

export default PackingDispatchPage;
