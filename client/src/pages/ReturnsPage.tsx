import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RotateCcw, QrCode, Camera, CheckCircle2, AlertTriangle, ShieldAlert,
  Search, Plus, Printer, Image, Trash2, Edit2, Layers, Clock, Sparkles,
  ArrowRight, Wrench, PackageX
} from 'lucide-react';
import { returnsApi, type ReturnLookupResult } from '../services/returns.service';
import { productsApi } from '../services/inventory.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatDate, paiseToRupees, rupeesToPaise } from '../lib/utils';
import { CameraScannerModal } from '../components/ui/CameraScannerModal';
import { LoadingSpinner, EmptyState } from '../components/ui/Feedback';
import Modal from '../components/ui/Modal';
import toast from 'react-hot-toast';
import type { ReturnOrder, Product, ScanException } from '../types';

export const ReturnsPage: React.FC = () => {
  const { activeAccountId, getActiveAccount } = useAccountStore();
  const qc = useQueryClient();
  const activeAccount = getActiveAccount();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'returns' | 'rto' | 'customer' | 'pending_inspection' | 'damaged_stock' | 'exceptions'>('returns');

  // Scanner & Lookup State
  const [scanInput, setScanInput] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeLookup, setActiveLookup] = useState<ReturnLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  // Return Processing Form State
  const [returnType, setReturnType] = useState<'customer_return' | 'rto_return'>('customer_return');
  const [receivedQuantity, setReceivedQuantity] = useState<number>(1);
  const [goodQuantity, setGoodQuantity] = useState<number>(1);
  const [damagedQuantity, setDamagedQuantity] = useState<number>(0);
  const [pendingQuantity, setPendingQuantity] = useState<number>(0);
  const [returnReason, setReturnReason] = useState('Customer returned parcel');
  const [damageReason, setDamageReason] = useState('');
  const [notes, setNotes] = useState('');
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [authorizedOverride, setAuthorizedOverride] = useState(false);

  // Inspection Modal State (for pending inspection RTOs)
  const [inspectModalReturn, setInspectModalReturn] = useState<ReturnOrder | null>(null);
  const [inspectGoodQty, setInspectGoodQty] = useState<number>(0);
  const [inspectDmgQty, setInspectDmgQty] = useState<number>(0);
  const [inspectDamageReason, setInspectDamageReason] = useState('');

  // Damaged Stock Resolution Modal
  const [damagedModalProduct, setDamagedModalProduct] = useState<Product | null>(null);
  const [damagedActionType, setDamagedActionType] = useState<'repair' | 'dispose' | 'approve_resale'>('repair');
  const [damagedActionQty, setDamagedActionQty] = useState<number>(1);
  const [damagedActionReason, setDamagedActionReason] = useState('');

  // Search in tables
  const [searchQuery, setSearchQuery] = useState('');

  // Focus scan input
  useEffect(() => {
    scanInputRef.current?.focus();
  }, [activeLookup]);

  // Adjust quantities when returnType or receivedQuantity changes
  const handleReceivedQtyChange = (qty: number) => {
    setReceivedQuantity(qty);
    if (returnType === 'customer_return') {
      // Default all to good
      setGoodQuantity(qty);
      setDamagedQuantity(0);
      setPendingQuantity(0);
    } else {
      // For RTO, default all to good or pending inspection
      setGoodQuantity(qty);
      setDamagedQuantity(0);
      setPendingQuantity(0);
    }
  };

  // Lookup mutation
  const lookupMutation = useMutation({
    mutationFn: (code: string) => returnsApi.lookup(code, activeAccountId),
    onSuccess: (res) => {
      const data = res.data.data;
      setActiveLookup(data);
      setLookupError(null);
      const initialQty = data.eligibleReturnQuantity > 0 ? 1 : 0;
      setReceivedQuantity(initialQty);
      setGoodQuantity(initialQty);
      setDamagedQuantity(0);
      setPendingQuantity(0);
      toast.success(`Matched Order: ${data.order.meeshoOrderId || data.order._id}`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Order Not Found';
      setLookupError(msg);
      setActiveLookup(null);
      toast.error(msg);
    },
  });

  const handleScanSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = scanInput.trim();
    if (!clean) return;
    lookupMutation.mutate(clean);
  };

  // Photo upload handling (convert to base64)
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Image must be under 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setPhotoPreviews((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Process Return Mutation
  const processMutation = useMutation({
    mutationFn: (data: any) => returnsApi.processReturn(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      qc.invalidateQueries({ queryKey: ['return-registers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['products'] });

      toast.success(res.data.message || 'Return processed successfully!');
      setActiveLookup(null);
      setScanInput('');
      setPhotoPreviews([]);
      setNotes('');
      setDamageReason('');
      setAuthorizedOverride(false);
      scanInputRef.current?.focus();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to process return');
    },
  });

  const handleProcessReturn = () => {
    if (!activeLookup) return;

    if (goodQuantity + damagedQuantity + pendingQuantity !== receivedQuantity) {
      toast.error(`Good (${goodQuantity}) + Damaged (${damagedQuantity}) + Pending (${pendingQuantity}) must equal ${receivedQuantity}`);
      return;
    }

    processMutation.mutate({
      orderId: activeLookup.order._id,
      returnType,
      receivedQuantity,
      goodQuantity,
      damagedQuantity,
      pendingInspectionQuantity: pendingQuantity,
      returnReason,
      damageReason,
      notes,
      scannedQrCode: scanInput || activeLookup.order.shippingLabelId || activeLookup.order.meeshoOrderId || activeLookup.order._id,
      photos: photoPreviews,
      allowAuthorizedOverride: authorizedOverride,
    });
  };

  // Fetch Returns data based on active tab
  const { data: registersData, isLoading: registersLoading } = useQuery({
    queryKey: ['return-registers', activeAccountId, activeTab, searchQuery],
    queryFn: () => {
      const rType = activeTab === 'rto' ? 'rto_return' : activeTab === 'customer' ? 'customer_return' : undefined;
      const cond = activeTab === 'pending_inspection' ? 'pending_inspection' : undefined;
      return returnsApi.registers({
        accountId: activeAccountId === 'all' ? undefined : activeAccountId,
        returnType: rType,
        condition: cond,
        search: searchQuery || undefined,
        limit: 50,
      });
    },
    enabled: activeTab !== 'damaged_stock' && activeTab !== 'exceptions',
  });

  // Fetch Exceptions log
  const { data: exceptionsData, isLoading: exceptionsLoading } = useQuery({
    queryKey: ['return-exceptions', activeAccountId],
    queryFn: () => returnsApi.exceptions({ accountId: activeAccountId === 'all' ? undefined : activeAccountId, limit: 50 }),
    enabled: activeTab === 'exceptions',
  });

  // Fetch Products with damaged stock
  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.list(),
  });
  const allProducts: Product[] = productsData?.data?.data || [];
  const damagedProducts = allProducts.filter((p) => (p.damagedStock || 0) > 0);

  // Inspect Pending Mutation
  const inspectMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => returnsApi.inspectPending(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['return-registers'] });
      qc.invalidateQueries({ queryKey: ['returns'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Pending parcel inspected & stock updated!');
      setInspectModalReturn(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Inspection failed'),
  });

  // Damaged Stock Action Mutation
  const damagedActionMutation = useMutation({
    mutationFn: (data: any) => returnsApi.damagedAction(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Damaged inventory updated!');
      setDamagedModalProduct(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Damaged action failed'),
  });

  const tableReturns: ReturnOrder[] = registersData?.data?.data || [];
  const tableExceptions: ScanException[] = exceptionsData?.data?.data || [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">Return Processing & Inspection</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">
              RTO & Customer Returns
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Scan returned parcels, inspect item conditions, allocate to saleable or damaged buckets, and protect inventory.
          </p>
        </div>

        {activeAccount && (
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 text-xs">
            <span className="text-gray-400">Active GSTIN:</span>
            <span className="font-mono font-bold text-gray-800">{activeAccount.gstin}</span>
            <span className="text-gray-400">({activeAccount.tradeName})</span>
          </div>
        )}
      </div>

      {/* Main Scanning & Processing Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Scan Input & Return Wizard */}
        <div className="lg:col-span-8 space-y-4">
          <div className="card p-5 border-2 border-rose-200 shadow-md">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                <QrCode className="w-4 h-4" /> Returned Parcel QR / Barcode Scan
              </span>
              <span className="text-xs text-gray-400">USB Barcode & Mobile Camera</span>
            </div>

            <form onSubmit={handleScanSubmit} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  ref={scanInputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Scan returned parcel label or enter Order ID..."
                  className="input pl-4 pr-10 py-2.5 sm:py-3 text-sm sm:text-base font-mono w-full border-gray-300 focus:border-rose-500 shadow-sm"
                  autoFocus
                />
                {scanInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setScanInput('');
                      setActiveLookup(null);
                      setLookupError(null);
                      scanInputRef.current?.focus();
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
                  className="btn-primary bg-rose-600 hover:bg-rose-700 flex-1 sm:flex-initial px-5 py-2.5 sm:py-3 text-sm font-semibold justify-center whitespace-nowrap"
                >
                  {lookupMutation.isPending ? <LoadingSpinner size="sm" /> : 'Lookup'}
                </button>

                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="btn-secondary px-4 py-2.5 sm:py-3 text-sm text-gray-700 flex items-center justify-center gap-1.5"
                  title="Camera Scanner"
                >
                  <Camera className="w-5 h-5 text-gray-600" />
                  <span className="sm:inline">Camera</span>
                </button>
              </div>
            </form>
          </div>

          {/* Lookup Error Banner */}
          {lookupError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 animate-fade-in">
              <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-semibold">{lookupError}</p>
                <p className="text-xs text-red-600 mt-0.5">
                  No inventory or return data was changed. Check that the parcel code matches an order in this GSTIN account.
                </p>
              </div>
            </div>
          )}

          {/* Active Lookup Panel */}
          {activeLookup ? (
            <div className="card p-5 border border-gray-200 shadow-sm space-y-5 animate-fade-in">
              {/* Order Details Header */}
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 text-sm">Original Order Found</span>
                  <span className="badge badge-blue">Matched: {activeLookup.matchedBy}</span>
                </div>
                <span className="text-xs text-gray-400">Order Status: <strong className="text-gray-800">{activeLookup.order.status}</strong></span>
              </div>

              {/* Order Info Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3.5 rounded-xl text-xs">
                <div>
                  <span className="text-gray-400">Meesho Order ID:</span>
                  <p className="font-mono font-bold text-gray-900">{activeLookup.order.meeshoOrderId || '—'}</p>
                </div>
                <div>
                  <span className="text-gray-400">Product & SKU:</span>
                  <p className="font-semibold text-gray-900 truncate">{(activeLookup.order.product as any)?.name}</p>
                  <p className="font-mono text-primary-700">{activeLookup.order.sku}</p>
                </div>
                <div>
                  <span className="text-gray-400">Ordered / Packed:</span>
                  <p className="font-bold text-gray-900">{activeLookup.orderedQuantity} ordered · {activeLookup.packedQuantity} packed</p>
                </div>
                <div>
                  <span className="text-gray-400">Eligible Unreturned:</span>
                  <p className="font-bold text-rose-600 text-sm">{activeLookup.eligibleReturnQuantity} unit(s)</p>
                </div>
              </div>

              {/* Prior Returns Warning */}
              {activeLookup.totalPreviouslyReturned > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Prior Returns Recorded: </span>
                    <span>{activeLookup.totalPreviouslyReturned} unit(s) previously returned for this order across {activeLookup.priorReturns.length} event(s).</span>
                  </div>
                </div>
              )}

              {/* Duplicate Return Protection */}
              {!activeLookup.canReturn && !authorizedOverride && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <ShieldAlert className="w-5 h-5 text-red-600" />
                    <span>Duplicate Return Attempt Blocked</span>
                  </div>
                  <p>All ordered units ({activeLookup.orderedQuantity}) have already been marked returned. Duplicate processing is disallowed to preserve stock safety.</p>
                  <button
                    onClick={() => setAuthorizedOverride(true)}
                    className="text-xs text-red-700 underline font-semibold mt-1"
                  >
                    Authorized Manager Override
                  </button>
                </div>
              )}

              {/* Return Processing Form */}
              {(activeLookup.canReturn || authorizedOverride) && (
                <div className="space-y-4 border-t pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Return Type */}
                    <div>
                      <label className="text-xs font-bold text-gray-800 block mb-1">
                        Select Return Type:
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReturnType('customer_return');
                            setPendingQuantity(0);
                            setGoodQuantity(receivedQuantity);
                            setDamagedQuantity(0);
                          }}
                          className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                            returnType === 'customer_return'
                              ? 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-200'
                              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          Customer Return
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReturnType('rto_return');
                            setReturnReason('Return to Origin (RTO)');
                          }}
                          className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                            returnType === 'rto_return'
                              ? 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-200'
                              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          RTO Return (Courier)
                        </button>
                      </div>
                    </div>

                    {/* Received Quantity */}
                    <div>
                      <label className="text-xs font-bold text-gray-800 block mb-1">
                        Actual Received Quantity:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={authorizedOverride ? 100 : activeLookup.eligibleReturnQuantity}
                        value={receivedQuantity}
                        onChange={(e) => handleReceivedQtyChange(parseInt(e.target.value, 10) || 1)}
                        className="input font-bold text-base"
                      />
                    </div>
                  </div>

                  {/* Condition Inspection Box */}
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-800">
                        Condition Inspection Allocation
                      </span>
                      <span className="text-xs text-gray-500">
                        Total Allocated: {goodQuantity + damagedQuantity + pendingQuantity} / {receivedQuantity}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Good / Saleable */}
                      <div className="p-3 bg-white border border-emerald-200 rounded-xl shadow-xs">
                        <label className="text-xs font-bold text-emerald-800 block mb-1 flex items-center justify-between">
                          <span>A. Good Condition</span>
                          <span className="badge badge-green">Saleable</span>
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={receivedQuantity}
                          value={goodQuantity}
                          onChange={(e) => setGoodQuantity(parseInt(e.target.value, 10) || 0)}
                          className="input font-bold text-center text-sm"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">Directly added back to saleable stock.</p>
                      </div>

                      {/* Damaged */}
                      <div className="p-3 bg-white border border-red-200 rounded-xl shadow-xs">
                        <label className="text-xs font-bold text-red-800 block mb-1 flex items-center justify-between">
                          <span>B. Damaged</span>
                          <span className="badge badge-red">Damaged Bucket</span>
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={receivedQuantity}
                          value={damagedQuantity}
                          onChange={(e) => setDamagedQuantity(parseInt(e.target.value, 10) || 0)}
                          className="input font-bold text-center text-sm"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">Moved to damaged stock bucket. Never sold.</p>
                      </div>

                      {/* Pending Inspection (Only for RTO) */}
                      <div className={`p-3 bg-white border rounded-xl shadow-xs ${
                        returnType === 'rto_return' ? 'border-amber-200' : 'opacity-40 pointer-events-none'
                      }`}>
                        <label className="text-xs font-bold text-amber-800 block mb-1 flex items-center justify-between">
                          <span>C. Pending Inspection</span>
                          <span className="badge badge-yellow">RTO Only</span>
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={receivedQuantity}
                          value={pendingQuantity}
                          onChange={(e) => setPendingQuantity(parseInt(e.target.value, 10) || 0)}
                          className="input font-bold text-center text-sm"
                          disabled={returnType !== 'rto_return'}
                        />
                        <p className="text-[10px] text-gray-400 mt-1">Awaits seal check. Saleable stock unaffected.</p>
                      </div>
                    </div>

                    {/* Damage Reason if damaged > 0 */}
                    {damagedQuantity > 0 && (
                      <div className="animate-fade-in pt-1">
                        <label className="text-xs font-semibold text-red-800 block mb-1">
                          Damage Reason / Notes:
                        </label>
                        <input
                          type="text"
                          value={damageReason}
                          onChange={(e) => setDamageReason(e.target.value)}
                          placeholder="e.g. Broken nozzle, cracked bottle, leaked fragrance"
                          className="input text-xs border-red-300"
                        />
                      </div>
                    )}
                  </div>

                  {/* Return Reason, Notes & Photo Upload */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Return Reason:</label>
                      <select
                        value={returnReason}
                        onChange={(e) => setReturnReason(e.target.value)}
                        className="input text-xs"
                      >
                        <option value="Customer returned parcel">Customer returned parcel</option>
                        <option value="Return to Origin (RTO)">Return to Origin (RTO)</option>
                        <option value="Wrong product received">Wrong product received</option>
                        <option value="Quality issue / Fragrance disliked">Quality issue / Fragrance disliked</option>
                        <option value="Damaged in transit">Damaged in transit</option>
                        <option value="Customer refused delivery">Customer refused delivery</option>
                        <option value="Other">Other Reason</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Inspection Notes:</label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Operator remarks / seal condition"
                        className="input text-xs"
                      />
                    </div>
                  </div>

                  {/* Optional Photos */}
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">
                      Parcel / Damage Photos (Optional):
                    </label>
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg text-xs font-medium text-gray-700 shadow-xs">
                        <Image className="w-4 h-4 text-gray-500" />
                        <span>Upload Photos</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>
                      <span className="text-xs text-gray-400">
                        {photoPreviews.length} photo(s) selected
                      </span>
                    </div>

                    {photoPreviews.length > 0 && (
                      <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                        {photoPreviews.map((p, idx) => (
                          <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border">
                            <img src={p} alt="Proof" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setPhotoPreviews((prev) => prev.filter((_, i) => i !== idx))}
                              className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5 hover:bg-red-600"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Confirm Button */}
                  <button
                    onClick={handleProcessReturn}
                    disabled={
                      processMutation.isPending ||
                      goodQuantity + damagedQuantity + pendingQuantity !== receivedQuantity
                    }
                    className="btn-primary bg-rose-600 hover:bg-rose-700 w-full py-3.5 text-sm font-bold shadow flex items-center justify-center gap-2"
                  >
                    {processMutation.isPending ? <LoadingSpinner size="sm" /> : <RotateCcw className="w-5 h-5" />}
                    Confirm & Update Return Stock ({receivedQuantity} Unit{receivedQuantity > 1 ? 's' : ''})
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="card p-10 text-center border-dashed border-2 text-gray-400">
              <RotateCcw className="w-12 h-12 mx-auto mb-3 opacity-40 text-rose-400" />
              <p className="font-medium text-sm text-gray-600">Scan Return Parcel to Begin</p>
              <p className="text-xs mt-1">Point your barcode reader at the returned parcel's shipping label.</p>
            </div>
          )}
        </div>

        {/* Right: Return Workflows & Damaged Stock Quick Glance */}
        <div className="lg:col-span-4 space-y-4">
          <div className="card p-4 space-y-3">
            <h3 className="font-bold text-sm text-gray-900 border-b pb-2 flex items-center gap-2">
              <Layers className="w-4 h-4 text-rose-500" /> Stock Safety Rules
            </h3>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-100 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span><strong>Good Units:</strong> Added to saleable stock only after inspection approval.</span>
              </div>
              <div className="p-2.5 bg-red-50 rounded-lg border border-red-100 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <span><strong>Damaged Units:</strong> Moved to damaged bucket. Never added to saleable stock.</span>
              </div>
              <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-100 flex items-start gap-2">
                <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span><strong>Pending Units:</strong> Unpacked RTO parcels wait in queue until seal inspection.</span>
              </div>
            </div>
          </div>

          {/* Damaged Stock Bucket Summary */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                <PackageX className="w-4 h-4 text-red-500" /> Damaged Stock Bucket
              </h3>
              <button
                onClick={() => setActiveTab('damaged_stock')}
                className="text-xs text-primary-600 hover:underline font-medium"
              >
                Manage
              </button>
            </div>

            {damagedProducts.length === 0 ? (
              <p className="text-xs text-gray-400 py-3 text-center">No damaged stock currently recorded.</p>
            ) : (
              <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {damagedProducts.slice(0, 5).map((p) => (
                  <div key={p._id} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-medium text-gray-900">{p.name}</p>
                      <p className="font-mono text-[10px] text-gray-400">{p.sku}</p>
                    </div>
                    <span className="font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">
                      {p.damagedStock} damaged
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs & Registers Section */}
      <div className="card p-5 space-y-4">
        {/* Navigation Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'returns', label: 'All Returns' },
              { id: 'rto', label: 'RTO Register' },
              { id: 'customer', label: 'Customer Returns' },
              { id: 'pending_inspection', label: 'Pending Inspection' },
              { id: 'damaged_stock', label: 'Damaged Stock Actions' },
              { id: 'exceptions', label: 'Exceptions Log' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search ID, Meesho Order, SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-8 py-1.5 text-xs w-full"
            />
          </div>
        </div>

        {/* Tab 1: Damaged Stock Management */}
        {activeTab === 'damaged_stock' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-gray-900">Damaged Inventory Governance</h3>
                <p className="text-xs text-gray-500">Repair items, scrap damaged stock, or approve repaired items for resale.</p>
              </div>
            </div>

            {damagedProducts.length === 0 ? (
              <EmptyState title="No Damaged Products" description="There is currently zero damaged stock." icon={<CheckCircle2 className="w-10 h-10 text-emerald-500" />} />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Saleable Stock</th>
                      <th>Damaged Stock</th>
                      <th>Pending Inspection</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {damagedProducts.map((p) => (
                      <tr key={p._id}>
                        <td className="font-medium text-gray-900">{p.name}</td>
                        <td className="font-mono text-xs">{p.sku}</td>
                        <td className="font-semibold text-emerald-700">{p.currentStock}</td>
                        <td className="font-bold text-red-600">{p.damagedStock}</td>
                        <td className="font-semibold text-amber-700">{p.pendingInspectionStock || 0}</td>
                        <td>
                          <button
                            onClick={() => {
                              setDamagedModalProduct(p);
                              setDamagedActionQty(p.damagedStock || 1);
                            }}
                            className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 font-semibold"
                          >
                            <Wrench className="w-3.5 h-3.5" /> Manage Damaged
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeTab === 'exceptions' ? (
          /* Tab: Scan Exception Log */
          exceptionsLoading ? (
            <LoadingSpinner />
          ) : tableExceptions.length === 0 ? (
            <EmptyState title="No exceptions logged" description="Scan exceptions and warnings will appear here." icon={<ShieldAlert className="w-10 h-10 text-emerald-500" />} />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Module</th>
                    <th>Exception Type</th>
                    <th>Scanned Identifier</th>
                    <th>Reason / Details</th>
                    <th>Operator</th>
                  </tr>
                </thead>
                <tbody>
                  {tableExceptions.map((exc) => (
                    <tr key={exc._id}>
                      <td className="whitespace-nowrap">{formatDate(exc.createdAt)}</td>
                      <td>
                        <span className="badge badge-gray font-mono uppercase text-[10px]">
                          {exc.module}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-red font-semibold">
                          {exc.exceptionType.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="font-mono text-xs font-semibold text-gray-800">{exc.scannedCode}</td>
                      <td className="text-gray-600 text-xs">{exc.reason || exc.details || exc.attemptedAction}</td>
                      <td className="text-gray-500 text-xs">{exc.operatorName || (typeof exc.operator === 'object' ? (exc.operator as any)?.name : exc.operator) || 'System'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* Tab: Standard Returns, RTO, Customer, Pending */
          registersLoading ? (
            <LoadingSpinner />
          ) : tableReturns.length === 0 ? (
            <EmptyState title="No records found" description="Matching transactions will appear here." icon={<RotateCcw className="w-10 h-10 text-gray-300" />} />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Transaction ID</th>
                    <th>Type</th>
                    <th>Meesho ID</th>
                    <th>Product</th>
                    <th>Returned</th>
                    <th>Good</th>
                    <th>Damaged</th>
                    <th>Pending</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tableReturns.map((ret: any) => {
                    const prod = typeof ret.product === 'object' ? ret.product : null;
                    return (
                      <tr key={ret._id}>
                        <td className="whitespace-nowrap">{formatDate(ret.returnDate || ret.createdAt)}</td>
                        <td className="font-mono text-xs font-semibold text-gray-800">{ret.returnTransactionId || ret.transactionId || '—'}</td>
                        <td>
                          <span className={`badge ${ret.returnType === 'rto_return' ? 'badge-yellow' : 'badge-purple'}`}>
                            {ret.returnType === 'rto_return' ? 'RTO' : 'Customer'}
                          </span>
                        </td>
                        <td className="font-mono text-xs font-bold">{ret.meeshoOrderId || '—'}</td>
                        <td>{(prod as any)?.name || '—'}</td>
                        <td className="font-bold">{ret.returnedQuantity}</td>
                        <td className="text-emerald-700 font-semibold">{ret.goodQuantity || 0}</td>
                        <td className="text-red-600 font-semibold">{ret.damagedQuantity || 0}</td>
                        <td className="text-amber-700 font-semibold">{ret.pendingInspectionQuantity || 0}</td>
                        <td>
                          <span className={`badge ${
                            ret.status === 'stock_updated' ? 'badge-green' :
                            ret.status === 'inspection_pending' ? 'badge-yellow' :
                            'badge-gray'
                          }`}>
                            {(ret.status || 'processed').replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            {ret.pendingInspectionQuantity > 0 && (
                              <button
                                onClick={() => {
                                  setInspectModalReturn(ret);
                                  setInspectGoodQty(ret.pendingInspectionQuantity);
                                  setInspectDmgQty(0);
                                }}
                                className="px-2 py-1 rounded bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-medium"
                              >
                                Inspect
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Inspect Pending RTO Modal */}
      {inspectModalReturn && (
        <Modal
          isOpen={true}
          onClose={() => setInspectModalReturn(null)}
          title="Inspect Pending RTO Parcel"
          footer={
            <div className="flex gap-2 justify-end">
              <button onClick={() => setInspectModalReturn(null)} className="btn-secondary text-xs">Cancel</button>
              <button
                onClick={() => {
                  inspectMutation.mutate({
                    id: inspectModalReturn._id,
                    data: {
                      goodQuantity: inspectGoodQty,
                      damagedQuantity: inspectDmgQty,
                      damageReason: inspectDamageReason,
                    },
                  });
                }}
                disabled={inspectMutation.isPending || inspectGoodQty + inspectDmgQty !== inspectModalReturn.pendingInspectionQuantity}
                className="btn-primary text-xs"
              >
                {inspectMutation.isPending ? <LoadingSpinner size="sm" /> : 'Confirm Inspection'}
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <p>
              Parcel Tx: <strong className="font-mono">{inspectModalReturn.returnTransactionId}</strong> · Meesho ID: <strong>{inspectModalReturn.meeshoOrderId}</strong>
            </p>
            <div className="p-3 bg-amber-50 rounded-xl text-amber-800">
              Pending Units to Inspect: <strong>{inspectModalReturn.pendingInspectionQuantity}</strong>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-emerald-800 block mb-1">Approved Good (Saleable):</label>
                <input
                  type="number"
                  min={0}
                  max={inspectModalReturn.pendingInspectionQuantity}
                  value={inspectGoodQty}
                  onChange={(e) => setInspectGoodQty(parseInt(e.target.value, 10) || 0)}
                  className="input font-bold text-center"
                />
              </div>

              <div>
                <label className="font-bold text-red-800 block mb-1">Damaged:</label>
                <input
                  type="number"
                  min={0}
                  max={inspectModalReturn.pendingInspectionQuantity}
                  value={inspectDmgQty}
                  onChange={(e) => setInspectDmgQty(parseInt(e.target.value, 10) || 0)}
                  className="input font-bold text-center"
                />
              </div>
            </div>

            {inspectDmgQty > 0 && (
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Damage Reason:</label>
                <input
                  type="text"
                  value={inspectDamageReason}
                  onChange={(e) => setInspectDamageReason(e.target.value)}
                  placeholder="e.g. Seal opened, leaked bottle"
                  className="input text-xs"
                />
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Damaged Stock Resolution Modal */}
      {damagedModalProduct && (
        <Modal
          isOpen={true}
          onClose={() => setDamagedModalProduct(null)}
          title={`Damaged Stock: ${damagedModalProduct.name}`}
          footer={
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDamagedModalProduct(null)} className="btn-secondary text-xs">Cancel</button>
              <button
                onClick={() => {
                  damagedActionMutation.mutate({
                    productId: damagedModalProduct._id,
                    accountId: activeAccountId === 'all' ? (activeAccount?._id || '') : activeAccountId,
                    action: damagedActionType,
                    quantity: damagedActionQty,
                    reason: damagedActionReason,
                  });
                }}
                disabled={damagedActionMutation.isPending || damagedActionQty <= 0 || damagedActionQty > (damagedModalProduct.damagedStock || 0)}
                className="btn-primary text-xs"
              >
                {damagedActionMutation.isPending ? <LoadingSpinner size="sm" /> : 'Confirm Action'}
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <p>Product: <strong>{damagedModalProduct.name}</strong> ({damagedModalProduct.sku})</p>
            <p>Current Damaged Units: <strong className="text-red-600">{damagedModalProduct.damagedStock}</strong></p>

            <div>
              <label className="font-bold text-gray-800 block mb-1">Select Action:</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'repair', label: 'Repair & Restock' },
                  { id: 'dispose', label: 'Scrap / Dispose' },
                  { id: 'approve_resale', label: 'Approve Resale' },
                ].map((act) => (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => setDamagedActionType(act.id as any)}
                    className={`p-2 rounded-lg border text-xs font-semibold ${
                      damagedActionType === act.id
                        ? 'border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-300'
                        : 'border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    {act.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="font-bold text-gray-800 block mb-1">Quantity:</label>
              <input
                type="number"
                min={1}
                max={damagedModalProduct.damagedStock}
                value={damagedActionQty}
                onChange={(e) => setDamagedActionQty(parseInt(e.target.value, 10) || 1)}
                className="input font-bold text-sm"
              />
            </div>

            <div>
              <label className="font-semibold text-gray-700 block mb-1">Notes / Justification:</label>
              <input
                type="text"
                value={damagedActionReason}
                onChange={(e) => setDamagedActionReason(e.target.value)}
                placeholder="e.g. Re-boxed and sealed or disposed due to shattered bottle"
                className="input text-xs"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Camera Scanner Modal */}
      <CameraScannerModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onScan={(code) => {
          setScanInput(code);
          lookupMutation.mutate(code);
        }}
      />
    </div>
  );
};

export default ReturnsPage;
