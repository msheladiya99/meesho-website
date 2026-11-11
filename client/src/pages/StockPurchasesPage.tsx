import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit2, Trash2, TruckIcon, Search, Eye,
  Package, CreditCard, Calendar, AlertCircle, Loader2,
  CheckCircle2, Building2, Receipt, ArrowRight, Clock,
  Check, X, BookOpen, ArrowUpRight, ArrowDownLeft, FileText
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { stockPurchasesApi, vendorsApi } from '../services/inventory.service';
import { partnersApi } from '../services/expenses.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatDate, rupeesToPaise, paiseToRupees, dateRangePresets, calculateNextInvoiceNumber } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import Modal from '../components/ui/Modal';
import { EmptyState, LoadingSpinner, ConfirmDialog } from '../components/ui/Feedback';
import { Pagination, TableSummaryStatus } from '../components/ui/Pagination';
import toast from 'react-hot-toast';
import type { DateRange, StockPurchase, Vendor, Partner, PaymentMode } from '../types';

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

const paymentModeLabels: Record<PaymentMode, string> = {
  upi: 'UPI (GPay / PhonePe / Paytm / BHIM)',
  bank_transfer: 'Bank Transfer (NEFT / IMPS / RTGS)',
  cash: 'Cash',
  cheque: 'Cheque',
  partner_out_of_pocket: 'Partner Out-of-Pocket (Personal Expense)',
  other: 'Other Mode',
};

const paymentColors: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  unpaid: 'bg-rose-50 text-rose-700 border-rose-200'
};

const StockPurchasesPage: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const qc = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange>(dateRangePresets().thisMonth);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Tab View: 'invoices' | 'ledger'
  const [activeTab, setActiveTab] = useState<'invoices' | 'ledger'>('invoices');

  const [viewingPurchase, setViewingPurchase] = useState<StockPurchase | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<StockPurchase | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Single Invoice Record Payment Modal State
  const [payingPurchase, setPayingPurchase] = useState<StockPurchase | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('upi');
  const [paidByPartner, setPaidByPartner] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<{ purchaseId: string; paymentId: string; amount: number; invoiceNo?: string } | null>(null);

  // Vendor Lump-Sum Payment Modal State ("All Due" / Multiple Bills)
  const [payingVendor, setPayingVendor] = useState<{ vendorId: string; vendorName: string; totalDue: number } | null>(null);
  const [vendorPayAmount, setVendorPayAmount] = useState<number>(0);
  const [vendorPayDate, setVendorPayDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [vendorPayMode, setVendorPayMode] = useState<PaymentMode>('upi');
  const [vendorPaidByPartner, setVendorPaidByPartner] = useState<string>('');
  const [vendorPayRef, setVendorPayRef] = useState<string>('');
  const [vendorPayNotes, setVendorPayNotes] = useState<string>('');

  // Vendor Ledger Modal / Selected State
  const [ledgerVendorId, setLedgerVendorId] = useState<string>('');
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState<boolean>(false);

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
  const { data: partnersData } = useQuery({ queryKey: ['partners'], queryFn: () => partnersApi.list() });

  const { data: nextInvoiceRes } = useQuery({
    queryKey: ['next-invoice-number', activeAccountId],
    queryFn: () => stockPurchasesApi.getNextInvoiceNumber({ accountId: activeAccountId === 'all' ? undefined : activeAccountId }),
  });

  const rawPurchases: StockPurchase[] = data?.data?.data || [];
  const vendors: Vendor[] = vendorsData?.data?.data || [];
  const partners: Partner[] = partnersData?.data?.data || [];

  // Keep viewingPurchase synced if data updates
  const activeViewingPurchase = useMemo(() => {
    if (!viewingPurchase) return null;
    return rawPurchases.find(p => p._id === viewingPurchase._id) || viewingPurchase;
  }, [viewingPurchase, rawPurchases]);

  // Determine next sequential bill/invoice number
  const nextSequenceNumber = useMemo(() => {
    if (nextInvoiceRes?.data?.data?.nextInvoiceNumber) {
      return nextInvoiceRes.data.data.nextInvoiceNumber;
    }
    const invoices = rawPurchases.map(p => p.vendorInvoiceNumber).filter(Boolean) as string[];
    return calculateNextInvoiceNumber(invoices);
  }, [nextInvoiceRes, rawPurchases]);

  // Overall Statistics & Accounts Payable Breakdown
  const totalInvoiced = useMemo(() => rawPurchases.reduce((s, p) => s + (p.totalAmount || 0), 0), [rawPurchases]);
  const totalPaid = useMemo(() => {
    return rawPurchases.reduce((s, p) => {
      const paid = p.paidAmount !== undefined ? p.paidAmount : (p.paymentStatus === 'paid' ? p.totalAmount : 0);
      return s + paid;
    }, 0);
  }, [rawPurchases]);

  const totalDue = useMemo(() => {
    return rawPurchases.reduce((s, p) => {
      const paid = p.paidAmount !== undefined ? p.paidAmount : (p.paymentStatus === 'paid' ? p.totalAmount : 0);
      const due = p.dueAmount !== undefined ? p.dueAmount : Math.max(0, (p.totalAmount || 0) - paid);
      return s + due;
    }, 0);
  }, [rawPurchases]);

  const totalUnits = useMemo(() => {
    return rawPurchases.reduce((sum, p) => {
      if (p.totalQuantity) return sum + p.totalQuantity;
      const pItems = Array.isArray(p.items) ? p.items : [];
      return sum + pItems.reduce((iSum: number, item: any) => iSum + (item.quantityPurchased || 0), 0);
    }, 0);
  }, [rawPurchases]);

  const unpaidCount = useMemo(() => rawPurchases.filter(p => p.paymentStatus === 'unpaid').length, [rawPurchases]);
  const partialCount = useMemo(() => rawPurchases.filter(p => p.paymentStatus === 'partial').length, [rawPurchases]);
  const paidCount = useMemo(() => rawPurchases.filter(p => p.paymentStatus === 'paid').length, [rawPurchases]);

  // Vendor Outstandings Summary
  const vendorSummaries = useMemo(() => {
    const map = new Map<string, {
      vendorId: string;
      vendorName: string;
      vendorPhone?: string;
      totalInvoiced: number;
      totalPaid: number;
      totalDue: number;
      billsCount: number;
      dueBillsCount: number;
    }>();

    for (const p of rawPurchases) {
      const vend = typeof p.vendor === 'object' ? p.vendor : vendors.find(v => v._id === p.vendor);
      const vId = (vend?._id || (typeof p.vendor === 'string' ? p.vendor : 'unknown')) as string;
      const vName = vend?.name || 'Unknown Vendor';
      const vPhone = vend?.phone;

      const pTotal = p.totalAmount || 0;
      const pPaid = p.paidAmount !== undefined ? p.paidAmount : (p.paymentStatus === 'paid' ? pTotal : 0);
      const pDue = p.dueAmount !== undefined ? p.dueAmount : Math.max(0, pTotal - pPaid);

      const existing = map.get(vId) || {
        vendorId: vId,
        vendorName: vName,
        vendorPhone: vPhone,
        totalInvoiced: 0,
        totalPaid: 0,
        totalDue: 0,
        billsCount: 0,
        dueBillsCount: 0,
      };

      existing.totalInvoiced += pTotal;
      existing.totalPaid += pPaid;
      existing.totalDue += pDue;
      existing.billsCount += 1;
      if (pDue > 0) existing.dueBillsCount += 1;

      map.set(vId, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.totalDue - a.totalDue);
  }, [rawPurchases, vendors]);

  // Set default ledger vendor id if not yet selected
  const activeLedgerVendorId = useMemo(() => {
    if (ledgerVendorId) return ledgerVendorId;
    if (vendorSummaries.length > 0) return vendorSummaries[0].vendorId;
    return '';
  }, [ledgerVendorId, vendorSummaries]);

  // Fetch Vendor Ledger Statement for the selected vendor
  const { data: ledgerRes, isLoading: isLedgerLoading } = useQuery({
    queryKey: ['vendor-ledger', activeLedgerVendorId, params],
    queryFn: () => stockPurchasesApi.getVendorLedger(activeLedgerVendorId, params),
    enabled: !!activeLedgerVendorId,
  });

  const ledgerData = ledgerRes?.data?.data;

  // Filter purchases by search, payment status, and vendor
  const purchases = useMemo(() => {
    return rawPurchases.filter(p => {
      const vend = typeof p.vendor === 'object' ? p.vendor : vendors.find(v => v._id === p.vendor);
      const vendorName = vend?.name?.toLowerCase() || '';
      const vendorId = typeof p.vendor === 'object' ? p.vendor._id : p.vendor;
      const invoiceNo = (p.vendorInvoiceNumber || '').toLowerCase();
      const s = search.toLowerCase().trim();

      const matchesSearch = !s || vendorName.includes(s) || invoiceNo.includes(s);

      let matchesPayment = true;
      if (paymentFilter === 'paid') matchesPayment = p.paymentStatus === 'paid';
      else if (paymentFilter === 'partial') matchesPayment = p.paymentStatus === 'partial';
      else if (paymentFilter === 'unpaid') matchesPayment = p.paymentStatus === 'unpaid';
      else if (paymentFilter === 'due') {
        const paid = p.paidAmount !== undefined ? p.paidAmount : (p.paymentStatus === 'paid' ? p.totalAmount : 0);
        const due = p.dueAmount !== undefined ? p.dueAmount : Math.max(0, (p.totalAmount || 0) - paid);
        matchesPayment = due > 0;
      }

      const matchesVendor = selectedVendorFilter === 'all' || vendorId === selectedVendorFilter;

      return matchesSearch && matchesPayment && matchesVendor;
    });
  }, [rawPurchases, search, paymentFilter, selectedVendorFilter, vendors]);

  const paginatedPurchases = useMemo(() => {
    return purchases.slice((page - 1) * pageSize, page * pageSize);
  }, [purchases, page, pageSize]);

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<FormData>({
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
    qc.invalidateQueries({ queryKey: ['vendor-ledger'] });
    qc.invalidateQueries({ queryKey: ['next-invoice-number'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['partners'] });
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

  // Single Invoice Record Payment Mutation
  const recordPaymentMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => stockPurchasesApi.recordPayment(id, data),
    onSuccess: (res) => {
      invalidateAll();
      if (activeViewingPurchase && res?.data?.data) {
        setViewingPurchase(res.data.data);
      }
      setPayingPurchase(null);
      toast.success('Payment recorded successfully!');
    },
    onError: (e: unknown) => {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error recording payment');
    },
  });

  // Vendor Lump-Sum / All Due Payment Mutation
  const payVendorDueMut = useMutation({
    mutationFn: ({ vendorId, data }: { vendorId: string; data: any }) =>
      stockPurchasesApi.payVendorDue(vendorId, data),
    onSuccess: (res) => {
      invalidateAll();
      setPayingVendor(null);
      toast.success(res?.data?.message || 'Vendor payment applied across due bills successfully!');
    },
    onError: (e: unknown) => {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error recording vendor payment');
    },
  });

  // Delete Payment Mutation
  const deletePaymentMut = useMutation({
    mutationFn: ({ purchaseId, paymentId }: { purchaseId: string; paymentId: string }) =>
      stockPurchasesApi.deletePayment(purchaseId, paymentId),
    onSuccess: (res) => {
      invalidateAll();
      if (activeViewingPurchase && res?.data?.data) {
        setViewingPurchase(res.data.data);
      }
      setDeletePaymentTarget(null);
      toast.success('Payment entry deleted and balance restored');
    },
    onError: (e: unknown) => {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error deleting payment');
    },
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

  const openAdd = async () => {
    setEditingPurchase(null);
    let autoInvoice = nextSequenceNumber;
    try {
      const res = await stockPurchasesApi.getNextInvoiceNumber({
        accountId: activeAccountId === 'all' ? undefined : activeAccountId,
      });
      if (res?.data?.data?.nextInvoiceNumber) {
        autoInvoice = res.data.data.nextInvoiceNumber;
      }
    } catch {
      // keep fallback
    }

    reset({
      purchaseDate: new Date().toISOString().split('T')[0],
      paymentStatus: 'unpaid',
      totalQuantity: 1,
      purchasePricePerUnit: 0,
      discount: 0,
      additionalCosts: 0,
      taxAmount: 0,
      notes: '',
      vendorInvoiceNumber: autoInvoice,
    });
    setIsModalOpen(true);
  };

  const openRecordPayment = (p: StockPurchase) => {
    setPayingPurchase(p);
    const paid = p.paidAmount !== undefined ? p.paidAmount : (p.paymentStatus === 'paid' ? p.totalAmount : 0);
    const due = p.dueAmount !== undefined ? p.dueAmount : Math.max(0, p.totalAmount - paid);
    setPaymentAmount(paiseToRupees(due));
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMode('upi');
    setPaidByPartner('');
    setReferenceNumber('');
    setPaymentNotes('');
  };

  const openPayVendor = (v: { vendorId: string; vendorName: string; totalDue: number }) => {
    setPayingVendor(v);
    setVendorPayAmount(paiseToRupees(v.totalDue));
    setVendorPayDate(new Date().toISOString().split('T')[0]);
    setVendorPayMode('upi');
    setVendorPaidByPartner('');
    setVendorPayRef('');
    setVendorPayNotes('');
  };

  const openLedgerForVendor = (vId: string) => {
    setLedgerVendorId(vId);
    setIsLedgerModalOpen(true);
  };

  const handleConfirmInvoicePayment = () => {
    if (!payingPurchase) return;
    const paid = payingPurchase.paidAmount !== undefined ? payingPurchase.paidAmount : (payingPurchase.paymentStatus === 'paid' ? payingPurchase.totalAmount : 0);
    const maxDueRupees = paiseToRupees(payingPurchase.dueAmount !== undefined ? payingPurchase.dueAmount : Math.max(0, payingPurchase.totalAmount - paid));

    if (!paymentAmount || paymentAmount <= 0) {
      toast.error('Please enter a valid payment amount greater than ₹0');
      return;
    }
    if (paymentAmount > maxDueRupees) {
      toast.error(`Payment amount cannot exceed remaining due of ${formatCurrency(rupeesToPaise(maxDueRupees))}`);
      return;
    }
    if (paymentMode === 'partner_out_of_pocket' && !paidByPartner) {
      toast.error('Please select which partner paid for this purchase');
      return;
    }

    recordPaymentMut.mutate({
      id: payingPurchase._id,
      data: {
        amount: rupeesToPaise(paymentAmount),
        paymentDate,
        paymentMode,
        paidByPartner: paymentMode === 'partner_out_of_pocket' ? paidByPartner : undefined,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
      },
    });
  };

  const handleConfirmVendorPayment = () => {
    if (!payingVendor) return;
    const maxDueRupees = paiseToRupees(payingVendor.totalDue);

    if (!vendorPayAmount || vendorPayAmount <= 0) {
      toast.error('Please enter a valid payment amount greater than ₹0');
      return;
    }
    if (vendorPayAmount > maxDueRupees) {
      toast.error(`Payment amount cannot exceed total vendor due of ${formatCurrency(payingVendor.totalDue)}`);
      return;
    }
    if (vendorPayMode === 'partner_out_of_pocket' && !vendorPaidByPartner) {
      toast.error('Please select which partner / person paid for this vendor payment');
      return;
    }

    payVendorDueMut.mutate({
      vendorId: payingVendor.vendorId,
      data: {
        amount: rupeesToPaise(vendorPayAmount),
        paymentDate: vendorPayDate,
        paymentMode: vendorPayMode,
        paidByPartner: vendorPayMode === 'partner_out_of_pocket' ? vendorPaidByPartner : undefined,
        referenceNumber: vendorPayRef.trim() || undefined,
        notes: vendorPayNotes.trim() || undefined,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            Stock Purchases & Vendor Ledger
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-primary-50 text-primary-700 border border-primary-200">
              Accounts Payable
            </span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track purchase bills (Debits), record supplier payments (Credits by person/bank), and maintain vendor ledgers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Tab Switcher: Invoices vs Ledger */}
          <div className="bg-gray-100 p-1 rounded-xl flex items-center border border-gray-200 shrink-0">
            <button
              onClick={() => setActiveTab('invoices')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'invoices'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Bills / Invoices
            </button>
            <button
              onClick={() => setActiveTab('ledger')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'ledger'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Vendor Ledger (Khaata)
            </button>
          </div>

          <button
            onClick={openAdd}
            className="btn-primary shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm shadow-sm hover:shadow"
          >
            <Plus className="w-4 h-4" /> Add Bill
            {nextSequenceNumber && (
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 text-xs font-mono font-bold bg-white/20 rounded">
                #{nextSequenceNumber}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Accounting KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Invoiced (Debits) */}
        <div className="card p-4 flex items-center gap-3.5 border-l-4 border-l-blue-500">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Invoiced</p>
              <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded">DEBIT</span>
            </div>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{formatCurrency(totalInvoiced)}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{rawPurchases.length} bills · {totalUnits.toLocaleString()} units</p>
          </div>
        </div>

        {/* Total Paid (Credits) */}
        <div className="card p-4 flex items-center gap-3.5 border-l-4 border-l-emerald-500">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Paid</p>
              <span className="text-[10px] font-bold px-1.5 py-0.2 bg-emerald-100 text-emerald-700 rounded">CREDIT</span>
            </div>
            <p className="text-xl font-bold text-emerald-700 mt-0.5">{formatCurrency(totalPaid)}</p>
            <p className="text-[11px] text-emerald-600 font-medium mt-0.5">
              {paidCount} paid · {partialCount} partial
            </p>
          </div>
        </div>

        {/* Total Due / Outstanding Balance */}
        <div className={`card p-4 flex items-center gap-3.5 border-l-4 ${totalDue > 0 ? 'border-l-rose-500 bg-rose-50/20' : 'border-l-gray-300'}`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${totalDue > 0 ? 'bg-rose-100 text-rose-600' : 'bg-gray-100 text-gray-400'}`}>
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Due (Payable)</p>
              <span className="text-[10px] font-bold px-1.5 py-0.2 bg-rose-100 text-rose-700 rounded">BALANCE</span>
            </div>
            <p className={`text-xl font-bold mt-0.5 ${totalDue > 0 ? 'text-rose-600' : 'text-gray-900'}`}>
              {formatCurrency(totalDue)}
            </p>
            <p className="text-[11px] text-rose-600 font-medium mt-0.5">
              {unpaidCount + partialCount} bills outstanding
            </p>
          </div>
        </div>

        {/* Vendors with Due */}
        <div className="card p-4 flex items-center gap-3.5 border-l-4 border-l-indigo-500">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Vendors with Due</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">
              {vendorSummaries.filter(v => v.totalDue > 0).length} <span className="text-xs font-normal text-gray-500">/ {vendorSummaries.length} vendors</span>
            </p>
            <p className="text-[11px] text-indigo-600 font-medium mt-0.5">
              {vendorSummaries.filter(v => v.totalDue > 0).length > 0 ? 'Pay lump-sum below' : 'All supplier dues cleared'}
            </p>
          </div>
        </div>
      </div>

      {/* Vendor Outstandings & Quick Ledger / Pay Actions */}
      {vendorSummaries.length > 0 && (
        <div className="card p-3.5 bg-gradient-to-r from-gray-50 to-amber-50/40 border border-amber-200/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Vendor Outstanding Accounts (Pay / Ledger):
              </span>
            </div>
            {selectedVendorFilter !== 'all' && (
              <button
                onClick={() => { setSelectedVendorFilter('all'); setPage(1); }}
                className="text-xs text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1 self-start sm:self-auto"
              >
                <X className="w-3.5 h-3.5" /> Clear vendor filter
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5 mt-2.5">
            {vendorSummaries.map(v => {
              const isSelected = selectedVendorFilter === v.vendorId;
              const hasDue = v.totalDue > 0;
              return (
                <div
                  key={v.vendorId}
                  className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all flex items-center gap-2.5 bg-white shadow-2xs ${
                    hasDue ? 'border-amber-300 hover:border-amber-400' : 'border-gray-200'
                  }`}
                >
                  <button
                    onClick={() => {
                      setSelectedVendorFilter(isSelected ? 'all' : v.vendorId);
                      setPage(1);
                    }}
                    className="flex items-center gap-1.5 hover:underline text-left"
                    title="Click to filter purchases by this vendor"
                  >
                    <span className="font-bold text-gray-900">{v.vendorName}</span>
                    {hasDue ? (
                      <span className="px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-700 text-[11px]">
                        Due: {formatCurrency(v.totalDue)}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 text-[10px]">
                        All Settled
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 font-mono">({v.billsCount} bills)</span>
                  </button>

                  <div className="flex items-center gap-1 pl-1 border-l border-gray-200">
                    {/* View Ledger Button */}
                    <button
                      onClick={() => openLedgerForVendor(v.vendorId)}
                      className="p-1 px-1.5 rounded-md text-[11px] font-semibold text-primary-700 hover:bg-primary-50 transition-colors flex items-center gap-1 border border-primary-200"
                      title="Open full Ledger statement (Debit / Credit / Balance)"
                    >
                      <BookOpen className="w-3 h-3 text-primary-600" /> Ledger
                    </button>

                    {/* Pay Due Button (All Due Lump-sum) */}
                    {hasDue && (
                      <button
                        onClick={() => openPayVendor({ vendorId: v.vendorId, vendorName: v.vendorName, totalDue: v.totalDue })}
                        className="p-1 px-2 rounded-md text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors flex items-center gap-1 border border-emerald-300"
                        title={`Pay against total due of ${formatCurrency(v.totalDue)}`}
                      >
                        <CreditCard className="w-3 h-3" /> Pay Due
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW TAB 1: INVOICES TABLE */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          {/* Filter and Date Bar */}
          <div className="card p-4 space-y-3">
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              <div className="flex flex-1 flex-col sm:flex-row gap-3 max-w-2xl">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search vendor name, invoice #..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    className="input pl-9"
                  />
                </div>

                <select
                  value={paymentFilter}
                  onChange={e => { setPaymentFilter(e.target.value); setPage(1); }}
                  className="select sm:w-44"
                >
                  <option value="all">All Payment Status</option>
                  <option value="due">⚠️ Has Balance Due ({unpaidCount + partialCount})</option>
                  <option value="unpaid">Unpaid ({unpaidCount})</option>
                  <option value="partial">Partial ({partialCount})</option>
                  <option value="paid">Fully Paid ({paidCount})</option>
                </select>

                <select
                  value={selectedVendorFilter}
                  onChange={e => { setSelectedVendorFilter(e.target.value); setPage(1); }}
                  className="select sm:w-44"
                >
                  <option value="all">All Vendors ({vendors.length})</option>
                  {vendors.map(v => (
                    <option key={v._id} value={v._id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="shrink-0">
                <DateRangePicker value={dateRange} onChange={r => { setDateRange(r); setPage(1); }} />
              </div>
            </div>

            {/* Filter Summary Status */}
            {purchases.length > 0 && (
              <TableSummaryStatus
                page={page}
                total={purchases.length}
                pageSize={pageSize}
                itemName="purchases"
              />
            )}
          </div>

          {/* Main Purchases Table */}
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
              <>
                <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Vendor (Khaata)</th>
                      <th className="hidden sm:table-cell">Invoice #</th>
                      <th className="text-center sm:text-left">Qty</th>
                      <th className="hidden md:table-cell text-right">Price / Unit</th>
                      <th className="text-right">Bill Total (Dr)</th>
                      <th className="text-right">Paid (Cr)</th>
                      <th className="text-right">Due Balance</th>
                      <th className="text-center">Status</th>
                      <th className="text-right pr-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPurchases.map(p => {
                      const vend = typeof p.vendor === 'object' ? p.vendor : vendors.find(v => v._id === p.vendor);
                      const vendorId = typeof p.vendor === 'object' ? p.vendor._id : p.vendor;
                      const rowQty = p.totalQuantity || (Array.isArray(p.items) ? p.items.reduce((acc: number, it: any) => acc + (it.quantityPurchased || 0), 0) : 0);
                      const rowUnitPrice = p.purchasePricePerUnit !== undefined && p.purchasePricePerUnit > 0
                        ? p.purchasePricePerUnit
                        : (rowQty > 0 ? Math.round(p.totalAmount / rowQty) : 0);

                      const paidAmt = p.paidAmount !== undefined ? p.paidAmount : (p.paymentStatus === 'paid' ? p.totalAmount : 0);
                      const dueAmt = p.dueAmount !== undefined ? p.dueAmount : Math.max(0, p.totalAmount - paidAmt);
                      const hasDue = dueAmt > 0;

                      return (
                        <tr key={p._id} className="transition-colors hover:bg-gray-50/80">
                          {/* Date */}
                          <td className="whitespace-nowrap font-medium text-gray-900 align-middle text-[11px] sm:text-xs">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-gray-400 sm:inline hidden" />
                              <span>{formatDate(p.purchaseDate)}</span>
                            </div>
                          </td>

                          {/* Vendor with quick Ledger link */}
                          <td className="align-middle">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-gray-900 text-xs truncate max-w-[130px] sm:max-w-none">
                                {(vend as Vendor)?.name || '—'}
                              </span>
                              {vendorId && (
                                <button
                                  onClick={() => openLedgerForVendor(vendorId as string)}
                                  className="text-[10px] text-primary-600 hover:text-primary-800 p-0.5 rounded hover:bg-primary-50 transition-colors"
                                  title="View Vendor Accounting Ledger"
                                >
                                  <BookOpen className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <div className="sm:hidden font-mono text-[10px] text-gray-400">
                              {p.vendorInvoiceNumber ? `#${p.vendorInvoiceNumber}` : ''}
                            </div>
                          </td>

                          {/* Invoice Number */}
                          <td className="hidden sm:table-cell align-middle font-mono text-xs">
                            {p.vendorInvoiceNumber ? (
                              <span className="inline-block px-2 py-0.5 bg-gray-100 rounded text-gray-700 font-semibold">
                                #{p.vendorInvoiceNumber}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>

                          {/* Total Quantity */}
                          <td className="text-center sm:text-left align-middle">
                            <span className="inline-flex items-center px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold bg-primary-50 text-primary-700 border border-primary-200">
                              {rowQty}u
                            </span>
                          </td>

                          {/* Price Per Unit */}
                          <td className="hidden md:table-cell text-right align-middle font-medium text-gray-700 text-sm">
                            {formatCurrency(rowUnitPrice)}
                          </td>

                          {/* Bill Total (Debit) */}
                          <td className="text-right align-middle font-bold text-gray-900 text-xs sm:text-sm">
                            {formatCurrency(p.totalAmount)}
                          </td>

                          {/* Paid (Credit) */}
                          <td className="text-right align-middle font-semibold text-emerald-700 text-xs sm:text-sm">
                            {formatCurrency(paidAmt)}
                          </td>

                          {/* Due / Balance Amount */}
                          <td className="text-right align-middle font-bold text-xs sm:text-sm">
                            {hasDue ? (
                              <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                {formatCurrency(dueAmt)}
                              </span>
                            ) : (
                              <span className="text-emerald-600 text-xs font-medium flex items-center justify-end gap-1">
                                <Check className="w-3.5 h-3.5" /> ₹0.00
                              </span>
                            )}
                          </td>

                          {/* Payment Status */}
                          <td className="text-center align-middle">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold capitalize border ${paymentColors[p.paymentStatus] || 'bg-gray-100 text-gray-800'}`}>
                              {p.paymentStatus}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="text-right pr-3 align-middle">
                            <div className="flex items-center justify-end gap-1">
                              {/* Record Payment Button */}
                              {hasDue ? (
                                <button
                                  onClick={() => openRecordPayment(p)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 text-xs font-semibold inline-flex items-center gap-1 transition-colors shadow-xs"
                                  title="Record Payment against this invoice"
                                >
                                  <CreditCard className="w-3.5 h-3.5" /> Pay
                                </button>
                              ) : (
                                <button
                                  onClick={() => setViewingPurchase(p)}
                                  className="px-2 py-1 rounded-lg bg-gray-50 text-gray-400 hover:text-emerald-700 text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                                  title="Paid in full · View receipt"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Paid
                                </button>
                              )}

                              <button
                                onClick={() => setViewingPurchase(p)}
                                className="p-1.5 rounded-lg hover:bg-primary-50 text-gray-400 hover:text-primary-600 transition-colors"
                                title="View Invoice & Payment Ledger"
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

              <Pagination
                page={page}
                total={purchases.length}
                pageSize={pageSize}
                pageSizeOptions={[10, 25, 50, 100]}
                itemName="purchases"
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </>
            )}
          </div>
        </div>
      )}

      {/* VIEW TAB 2: DEDICATED VENDOR LEDGER (KHAATA) */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          {/* Vendor Selector & Date Filter */}
          <div className="card p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider shrink-0 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-primary-600" /> Select Vendor Ledger:
              </label>
              <select
                value={activeLedgerVendorId}
                onChange={e => setLedgerVendorId(e.target.value)}
                className="select font-semibold text-gray-900 max-w-xs"
              >
                {vendors.map(v => {
                  const summary = vendorSummaries.find(vs => vs.vendorId === v._id);
                  const due = summary?.totalDue || 0;
                  return (
                    <option key={v._id} value={v._id}>
                      {v.name} {due > 0 ? `(Due: ${formatCurrency(due)})` : '(All Settled)'}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <DateRangePicker value={dateRange} onChange={setDateRange} />
              {ledgerData && ledgerData.closingBalance > 0 && (
                <button
                  onClick={() => openPayVendor({
                    vendorId: ledgerData.vendor._id,
                    vendorName: ledgerData.vendor.name,
                    totalDue: ledgerData.closingBalance
                  })}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-700 inline-flex items-center gap-1.5 text-xs px-3.5 py-2 shadow-sm"
                >
                  <CreditCard className="w-4 h-4" /> Record Payment (Credit)
                </button>
              )}
            </div>
          </div>

          {/* Vendor Financial Standing Card */}
          {ledgerData && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Vendor Profile Info */}
              <div className="card p-4 bg-gray-50 border border-gray-200">
                <span className="text-xs text-gray-500 font-semibold uppercase block">Vendor Account</span>
                <h3 className="text-base font-bold text-gray-900 mt-1">{ledgerData.vendor.name}</h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{ledgerData.vendor.phone || 'No phone'}</p>
                {ledgerData.vendor.company && (
                  <p className="text-xs text-gray-600 mt-1">Company: {ledgerData.vendor.company}</p>
                )}
              </div>

              {/* Total Debits (Purchases / Bills) */}
              <div className="card p-4 border-l-4 border-l-blue-500">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-semibold uppercase">Total Debits (Dr)</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">BILLS</span>
                </div>
                <p className="text-xl font-bold text-gray-900 mt-1.5">{formatCurrency(ledgerData.totalDebit)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Total stock purchases from vendor</p>
              </div>

              {/* Total Credits (Payments Made) */}
              <div className="card p-4 border-l-4 border-l-emerald-500">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-semibold uppercase">Total Credits (Cr)</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">PAYMENTS</span>
                </div>
                <p className="text-xl font-bold text-emerald-700 mt-1.5">{formatCurrency(ledgerData.totalCredit)}</p>
                <p className="text-[11px] text-emerald-600 font-medium mt-0.5">Amount paid to supplier</p>
              </div>

              {/* Closing Due Balance */}
              <div className={`card p-4 border-l-4 ${ledgerData.closingBalance > 0 ? 'border-l-rose-500 bg-rose-50/20' : 'border-l-emerald-500'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-rose-600">Net Balance Due</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ledgerData.closingBalance > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {ledgerData.closingBalance > 0 ? 'DR (PAYABLE)' : 'SETTLED'}
                  </span>
                </div>
                <p className={`text-xl font-bold mt-1.5 ${ledgerData.closingBalance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {formatCurrency(ledgerData.closingBalance)}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {ledgerData.closingBalance > 0 ? 'Outstanding balance owed' : 'All accounts settled'}
                </p>
              </div>
            </div>
          )}

          {/* Ledger Statement Table */}
          <div className="card overflow-hidden">
            {isLedgerLoading ? (
              <LoadingSpinner />
            ) : !ledgerData || ledgerData.entries.length === 0 ? (
              <EmptyState
                title="No transactions in this period"
                description="No stock purchase bills or payments found for this vendor in the selected date range."
                icon={<BookOpen className="w-12 h-12 text-gray-400" />}
              />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Invoice / Ref #</th>
                      <th>Particulars / Description</th>
                      <th>Paid By (Person / Mode)</th>
                      <th className="text-right">Debit (Dr - Bill)</th>
                      <th className="text-right">Credit (Cr - Paid)</th>
                      <th className="text-right pr-4">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerData.entries.map((entry, idx) => {
                      const isDebit = entry.type === 'debit';
                      const partnerName = entry.paidByPartner && typeof entry.paidByPartner === 'object'
                        ? (entry.paidByPartner as Partner).name
                        : (partners.find(p => p._id === entry.paidByPartner)?.name || (entry.paymentMode === 'partner_out_of_pocket' ? 'Partner' : ''));

                      return (
                        <tr key={entry.id || idx} className={`transition-colors ${isDebit ? 'hover:bg-blue-50/20' : 'hover:bg-emerald-50/20'}`}>
                          {/* Date */}
                          <td className="whitespace-nowrap font-medium text-gray-800 text-xs">
                            {formatDate(entry.date)}
                          </td>

                          {/* Entry Type Badge */}
                          <td>
                            {isDebit ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <ArrowUpRight className="w-3 h-3 text-blue-600" /> DEBIT (Bill)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <ArrowDownLeft className="w-3 h-3 text-emerald-600" /> CREDIT (Paid)
                              </span>
                            )}
                          </td>

                          {/* Invoice / Reference */}
                          <td className="font-mono text-xs">
                            {entry.invoiceNumber ? (
                              <span className="font-semibold text-gray-800">#{entry.invoiceNumber}</span>
                            ) : entry.referenceNumber ? (
                              <span className="text-gray-600">{entry.referenceNumber}</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>

                          {/* Description */}
                          <td className="text-xs text-gray-800 max-w-xs">
                            <span className="font-medium">{entry.description}</span>
                            {entry.notes && <span className="block text-[11px] text-gray-500 mt-0.5">{entry.notes}</span>}
                          </td>

                          {/* Paid By Person / Mode */}
                          <td className="text-xs">
                            {!isDebit ? (
                              <div>
                                {partnerName ? (
                                  <span className="font-semibold text-indigo-700 block">
                                    👤 {partnerName}
                                  </span>
                                ) : (
                                  <span className="text-gray-700 font-medium block">
                                    {entry.paymentMode ? entry.paymentMode.replace(/_/g, ' ').toUpperCase() : 'Cash / Bank'}
                                  </span>
                                )}
                                {entry.referenceNumber && (
                                  <span className="text-[10px] font-mono text-gray-400 block">
                                    Ref: {entry.referenceNumber}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>

                          {/* Debit Amount */}
                          <td className="text-right font-bold text-gray-900 text-xs sm:text-sm">
                            {isDebit ? formatCurrency(entry.debit) : '—'}
                          </td>

                          {/* Credit Amount */}
                          <td className="text-right font-bold text-emerald-700 text-xs sm:text-sm">
                            {!isDebit ? formatCurrency(entry.credit) : '—'}
                          </td>

                          {/* Running Balance */}
                          <td className="text-right font-bold text-xs sm:text-sm pr-4">
                            {entry.runningBalance > 0 ? (
                              <span className="text-rose-600">
                                {formatCurrency(entry.runningBalance)} <span className="text-[10px] font-semibold">Dr</span>
                              </span>
                            ) : (
                              <span className="text-emerald-600">₹0.00</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Ledger Footer Total */}
                  <tfoot className="bg-gray-50 font-bold text-xs border-t-2 border-gray-300">
                    <tr>
                      <td colSpan={5} className="py-3 px-4 text-right uppercase text-gray-600">
                        Total Statement Summary:
                      </td>
                      <td className="py-3 px-3 text-right text-gray-900 text-sm">
                        {formatCurrency(ledgerData.totalDebit)}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-700 text-sm">
                        {formatCurrency(ledgerData.totalCredit)}
                      </td>
                      <td className="py-3 px-4 text-right text-rose-600 text-sm">
                        {formatCurrency(ledgerData.closingBalance)} Dr
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Pay Vendor All Due (Lump-Sum Payment across bills) */}
      {payingVendor && (
        <Modal
          isOpen={!!payingVendor}
          onClose={() => setPayingVendor(null)}
          title={`Pay Vendor Due: ${payingVendor.vendorName}`}
          size="md"
          footer={
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPayingVendor(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVendorPayment}
                disabled={payVendorDueMut.isPending}
                className="btn-primary min-w-[150px] flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              >
                {payVendorDueMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {payVendorDueMut.isPending ? 'Recording...' : 'Confirm Vendor Payment'}
              </button>
            </div>
          }
        >
          {(() => {
            const maxDueRupees = paiseToRupees(payingVendor.totalDue);
            return (
              <div className="space-y-4">
                {/* Summary Banner */}
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>Supplier: <strong className="text-gray-800 font-semibold">{payingVendor.vendorName}</strong></span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-bold uppercase">OUTSTANDING BALANCE</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-2 border-t border-gray-200">
                    <span className="text-xs text-gray-600 font-medium">Total Balance Owed to Vendor:</span>
                    <span className="text-xl font-bold text-rose-600">{formatCurrency(payingVendor.totalDue)}</span>
                  </div>
                </div>

                {/* Quick Shortcuts */}
                <div className="flex items-center justify-between bg-primary-50/60 p-2.5 rounded-lg border border-primary-200">
                  <span className="text-xs text-primary-800 font-medium">Quick Shortcut:</span>
                  <button
                    type="button"
                    onClick={() => setVendorPayAmount(maxDueRupees)}
                    className="text-xs px-3 py-1 rounded-md bg-primary-600 hover:bg-primary-700 text-white font-semibold flex items-center gap-1 transition-colors"
                  >
                    ⚡ Pay Full Outstanding ({formatCurrency(payingVendor.totalDue)})
                  </button>
                </div>

                {/* Payment Form Fields */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label font-bold text-gray-800">Payment Amount (Credit) ₹ *</label>
                      <input
                        type="number"
                        min="1"
                        max={maxDueRupees}
                        step="0.01"
                        value={vendorPayAmount || ''}
                        onChange={e => setVendorPayAmount(Number(e.target.value))}
                        className="input font-bold text-base bg-white"
                        placeholder="e.g. 5000"
                      />
                      <p className="text-[11px] text-gray-500 mt-1">
                        Max: {formatCurrency(payingVendor.totalDue)} (applies FIFO to oldest bills)
                      </p>
                    </div>

                    <div>
                      <label className="label">Payment Date *</label>
                      <input
                        type="date"
                        value={vendorPayDate}
                        onChange={e => setVendorPayDate(e.target.value)}
                        className="input"
                      />
                    </div>
                  </div>

                  {/* Payment Mode */}
                  <div>
                    <label className="label font-semibold">Payment Mode *</label>
                    <select
                      value={vendorPayMode}
                      onChange={e => setVendorPayMode(e.target.value as PaymentMode)}
                      className="select font-medium"
                    >
                      {(Object.keys(paymentModeLabels) as PaymentMode[]).map(mode => (
                        <option key={mode} value={mode}>
                          {paymentModeLabels[mode]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Paid by Person / Partner dropdown */}
                  {vendorPayMode === 'partner_out_of_pocket' && (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
                      <label className="label font-bold text-amber-900">Paid By Which Person / Partner? *</label>
                      <select
                        value={vendorPaidByPartner}
                        onChange={e => setVendorPaidByPartner(e.target.value)}
                        className="select bg-white border-amber-300"
                      >
                        <option value="">Select Person / Partner</option>
                        {partners.map(p => (
                          <option key={p._id} value={p._id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-amber-800 flex items-center gap-1 mt-1">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                        This payment will be recorded in <strong>Partner Settlements</strong> so this partner gets credited and reimbursed.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs">Reference / UTR / Cheque Number</label>
                      <input
                        type="text"
                        value={vendorPayRef}
                        onChange={e => setVendorPayRef(e.target.value)}
                        placeholder="e.g. UPI-1234567890"
                        className="input font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Payment Notes</label>
                      <input
                        type="text"
                        value={vendorPayNotes}
                        onChange={e => setVendorPayNotes(e.target.value)}
                        placeholder="e.g. Paid from personal account via GPay"
                        className="input text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* MODAL: Vendor Ledger Popup (Triggered from Invoice row or chip) */}
      {isLedgerModalOpen && (
        <Modal
          isOpen={isLedgerModalOpen}
          onClose={() => setIsLedgerModalOpen(false)}
          title={`Vendor Ledger Statement — ${ledgerData?.vendor.name || 'Vendor'}`}
          size="xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <div>
                {ledgerData && ledgerData.closingBalance > 0 && (
                  <button
                    onClick={() => {
                      setIsLedgerModalOpen(false);
                      openPayVendor({
                        vendorId: ledgerData.vendor._id,
                        vendorName: ledgerData.vendor.name,
                        totalDue: ledgerData.closingBalance
                      });
                    }}
                    className="btn-primary bg-emerald-600 hover:bg-emerald-700 inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5"
                  >
                    <CreditCard className="w-4 h-4" /> Pay Outstanding (Credit)
                  </button>
                )}
              </div>
              <button onClick={() => setIsLedgerModalOpen(false)} className="btn-secondary">
                Close
              </button>
            </div>
          }
        >
          {isLedgerLoading ? (
            <LoadingSpinner />
          ) : !ledgerData ? (
            <EmptyState title="Vendor not found" description="Unable to load vendor ledger data." />
          ) : (
            <div className="space-y-4">
              {/* Financial Summary */}
              <div className="grid grid-cols-3 gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-center text-xs">
                <div>
                  <span className="text-gray-500 font-medium block">Total Debits (Bills)</span>
                  <span className="text-base font-bold text-gray-900 mt-0.5 block">{formatCurrency(ledgerData.totalDebit)}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-medium block">Total Credits (Paid)</span>
                  <span className="text-base font-bold text-emerald-700 mt-0.5 block">{formatCurrency(ledgerData.totalCredit)}</span>
                </div>
                <div>
                  <span className="text-rose-500 font-medium block">Net Closing Due</span>
                  <span className={`text-base font-bold mt-0.5 block ${ledgerData.closingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {formatCurrency(ledgerData.closingBalance)} {ledgerData.closingBalance > 0 && 'Dr'}
                  </span>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-[420px] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50 text-gray-600 font-semibold sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-3 text-left">Date</th>
                      <th className="py-2 px-3 text-left">Type</th>
                      <th className="py-2 px-3 text-left">Particulars / Description</th>
                      <th className="py-2 px-3 text-left">Paid By</th>
                      <th className="py-2 px-3 text-right">Debit (Dr)</th>
                      <th className="py-2 px-3 text-right">Credit (Cr)</th>
                      <th className="py-2 px-3 text-right">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {ledgerData.entries.map((entry, idx) => {
                      const isDebit = entry.type === 'debit';
                      const partnerName = entry.paidByPartner && typeof entry.paidByPartner === 'object'
                        ? (entry.paidByPartner as Partner).name
                        : (partners.find(p => p._id === entry.paidByPartner)?.name || (entry.paymentMode === 'partner_out_of_pocket' ? 'Partner' : ''));

                      return (
                        <tr key={entry.id || idx} className={isDebit ? 'hover:bg-blue-50/20' : 'hover:bg-emerald-50/20'}>
                          <td className="py-2 px-3 whitespace-nowrap text-gray-700">
                            {formatDate(entry.date)}
                          </td>
                          <td className="py-2 px-3">
                            {isDebit ? (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                DEBIT
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                CREDIT
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-gray-800">
                            <span className="font-semibold block">{entry.description}</span>
                            {entry.referenceNumber && (
                              <span className="text-[10px] font-mono text-gray-400">Ref: {entry.referenceNumber}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-gray-700">
                            {!isDebit ? (
                              partnerName ? (
                                <span className="font-semibold text-indigo-700">👤 {partnerName}</span>
                              ) : (
                                entry.paymentMode ? entry.paymentMode.replace(/_/g, ' ') : '—'
                              )
                            ) : '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-gray-900">
                            {isDebit ? formatCurrency(entry.debit) : '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-emerald-700">
                            {!isDebit ? formatCurrency(entry.credit) : '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-bold">
                            {entry.runningBalance > 0 ? (
                              <span className="text-rose-600">{formatCurrency(entry.runningBalance)} Dr</span>
                            ) : (
                              <span className="text-emerald-600">₹0.00</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Record Payment for Single Invoice Modal */}
      {payingPurchase && (
        <Modal
          isOpen={!!payingPurchase}
          onClose={() => setPayingPurchase(null)}
          title={`Record Payment — Invoice #${payingPurchase.vendorInvoiceNumber || payingPurchase._id.slice(-6)}`}
          size="md"
          footer={
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPayingPurchase(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmInvoicePayment}
                disabled={recordPaymentMut.isPending}
                className="btn-primary min-w-[140px] flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              >
                {recordPaymentMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {recordPaymentMut.isPending ? 'Recording...' : 'Confirm Payment'}
              </button>
            </div>
          }
        >
          {(() => {
            const vend = typeof payingPurchase.vendor === 'object' ? payingPurchase.vendor : vendors.find(v => v._id === payingPurchase.vendor);
            const paid = payingPurchase.paidAmount !== undefined ? payingPurchase.paidAmount : (payingPurchase.paymentStatus === 'paid' ? payingPurchase.totalAmount : 0);
            const due = payingPurchase.dueAmount !== undefined ? payingPurchase.dueAmount : Math.max(0, payingPurchase.totalAmount - paid);
            const dueInRupees = paiseToRupees(due);

            return (
              <div className="space-y-4">
                {/* Invoice Due Summary Card */}
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>Vendor: <strong className="text-gray-800 font-semibold">{vend?.name || '—'}</strong></span>
                    <span>Date: <strong className="text-gray-800">{formatDate(payingPurchase.purchaseDate)}</strong></span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-200 text-center">
                    <div>
                      <p className="text-[11px] text-gray-400">Total Bill (Dr)</p>
                      <p className="text-sm font-bold text-gray-800">{formatCurrency(payingPurchase.totalAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400">Paid So Far (Cr)</p>
                      <p className="text-sm font-bold text-emerald-600">{formatCurrency(paid)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-rose-500 font-semibold">Remaining Due</p>
                      <p className="text-sm font-bold text-rose-600">{formatCurrency(due)}</p>
                    </div>
                  </div>
                </div>

                {/* Quick Pay Full Balance Button */}
                <div className="flex items-center justify-between bg-primary-50/60 p-2.5 rounded-lg border border-primary-200">
                  <span className="text-xs text-primary-800 font-medium">Quick Shortcut:</span>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(dueInRupees)}
                    className="text-xs px-3 py-1 rounded-md bg-primary-600 hover:bg-primary-700 text-white font-semibold flex items-center gap-1 transition-colors"
                  >
                    ⚡ Pay Full Due ({formatCurrency(due)})
                  </button>
                </div>

                {/* Payment Form Fields */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label font-bold text-gray-800">Payment Amount (Credit) ₹ *</label>
                      <input
                        type="number"
                        min="1"
                        max={dueInRupees}
                        step="0.01"
                        value={paymentAmount || ''}
                        onChange={e => setPaymentAmount(Number(e.target.value))}
                        className="input font-bold text-base bg-white"
                        placeholder="e.g. 5000"
                      />
                      <p className="text-[11px] text-gray-500 mt-1">
                        Max payable: {formatCurrency(due)}
                      </p>
                    </div>

                    <div>
                      <label className="label">Payment Date *</label>
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={e => setPaymentDate(e.target.value)}
                        className="input"
                      />
                    </div>
                  </div>

                  {/* Payment Mode */}
                  <div>
                    <label className="label font-semibold">Payment Mode *</label>
                    <select
                      value={paymentMode}
                      onChange={e => setPaymentMode(e.target.value as PaymentMode)}
                      className="select font-medium"
                    >
                      {(Object.keys(paymentModeLabels) as PaymentMode[]).map(mode => (
                        <option key={mode} value={mode}>
                          {paymentModeLabels[mode]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Partner Selection (When paid out-of-pocket by partner) */}
                  {paymentMode === 'partner_out_of_pocket' && (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
                      <label className="label font-bold text-amber-900">Paid By Which Partner / Person? *</label>
                      <select
                        value={paidByPartner}
                        onChange={e => setPaidByPartner(e.target.value)}
                        className="select bg-white border-amber-300"
                      >
                        <option value="">Select Person / Partner</option>
                        {partners.map(p => (
                          <option key={p._id} value={p._id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-amber-800 flex items-center gap-1 mt-1">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                        This payment will be recorded in <strong>Partner Settlements</strong> so this partner gets reimbursed.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs">Reference / UTR / Cheque Number</label>
                      <input
                        type="text"
                        value={referenceNumber}
                        onChange={e => setReferenceNumber(e.target.value)}
                        placeholder="e.g. UPI-1234567890"
                        className="input font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Payment Notes</label>
                      <input
                        type="text"
                        value={paymentNotes}
                        onChange={e => setPaymentNotes(e.target.value)}
                        placeholder="e.g. Paid via GPay bank transfer"
                        className="input text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

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
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-gray-700">Invoice / Bill Number</label>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ⚡ Auto Seq #{nextSequenceNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => setValue('vendorInvoiceNumber', nextSequenceNumber)}
                    className="text-[11px] text-primary-600 hover:text-primary-800 font-medium hover:underline"
                    title="Reset to next sequential number"
                  >
                    Reset
                  </button>
                </div>
              </div>
              <input
                {...register('vendorInvoiceNumber')}
                className="input font-mono font-semibold text-gray-900"
                placeholder={`e.g. ${nextSequenceNumber}`}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Auto-sequenced from latest bill. You can edit or keep this number.
              </p>
            </div>
            <div>
              <label className="label">Payment Status</label>
              <select {...register('paymentStatus')} className="select">
                <option value="unpaid">Unpaid (Balance Due)</option>
                <option value="paid">Paid (Fully Paid)</option>
                <option value="partial">Partial</option>
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

      {/* Invoice Details & Payment Ledger Quick View Modal */}
      {activeViewingPurchase && (
        <Modal
          isOpen={!!activeViewingPurchase}
          onClose={() => setViewingPurchase(null)}
          title={`Purchase Invoice: #${activeViewingPurchase.vendorInvoiceNumber || activeViewingPurchase._id.slice(-6)}`}
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {(activeViewingPurchase.dueAmount ?? Math.max(0, activeViewingPurchase.totalAmount - (activeViewingPurchase.paidAmount || 0))) > 0 && (
                  <button
                    onClick={() => {
                      const p = activeViewingPurchase;
                      openRecordPayment(p);
                    }}
                    className="btn-primary bg-emerald-600 hover:bg-emerald-700 inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5"
                  >
                    <CreditCard className="w-4 h-4" /> Record Payment
                  </button>
                )}
                <button
                  onClick={() => {
                    const vend = activeViewingPurchase.vendor;
                    const vId = typeof vend === 'object' ? vend._id : vend;
                    if (vId) {
                      setViewingPurchase(null);
                      openLedgerForVendor(vId as string);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg border border-primary-300 text-primary-700 hover:bg-primary-50 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5" /> View Vendor Ledger
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setViewingPurchase(null)} className="btn-secondary">Close</button>
                <button
                  onClick={() => {
                    const p = activeViewingPurchase;
                    setViewingPurchase(null);
                    openEdit(p);
                  }}
                  className="btn-primary"
                >
                  <Edit2 className="w-4 h-4" /> Edit Purchase
                </button>
              </div>
            </div>
          }
        >
          {(() => {
            const vend = typeof activeViewingPurchase.vendor === 'object' ? activeViewingPurchase.vendor : vendors.find(v => v._id === activeViewingPurchase.vendor);
            const paid = activeViewingPurchase.paidAmount !== undefined ? activeViewingPurchase.paidAmount : (activeViewingPurchase.paymentStatus === 'paid' ? activeViewingPurchase.totalAmount : 0);
            const due = activeViewingPurchase.dueAmount !== undefined ? activeViewingPurchase.dueAmount : Math.max(0, activeViewingPurchase.totalAmount - paid);
            const payments = Array.isArray(activeViewingPurchase.payments) ? activeViewingPurchase.payments : [];

            return (
              <div className="space-y-5">
                {/* Header info */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3.5 rounded-xl border border-gray-200 text-xs">
                  <div>
                    <span className="text-gray-400 block font-medium">Date</span>
                    <span className="font-semibold text-gray-800">{formatDate(activeViewingPurchase.purchaseDate)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-medium">Vendor</span>
                    <span className="font-semibold text-gray-800">
                      {vend?.name || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-medium">Invoice #</span>
                    <span className="font-mono font-semibold text-gray-800">{activeViewingPurchase.vendorInvoiceNumber || '—'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-medium">Payment Status</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase ${paymentColors[activeViewingPurchase.paymentStatus]}`}>
                      {activeViewingPurchase.paymentStatus}
                    </span>
                  </div>
                </div>

                {/* Accounting Due Overview Banner */}
                <div className="grid grid-cols-3 gap-3 p-4 bg-gradient-to-r from-gray-50 to-primary-50/30 rounded-xl border border-gray-200 text-center">
                  <div>
                    <span className="text-xs text-gray-500 font-medium block">Total Invoiced (Dr)</span>
                    <span className="text-lg font-bold text-gray-900">{formatCurrency(activeViewingPurchase.totalAmount)}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium block">Amount Paid (Cr)</span>
                    <span className="text-lg font-bold text-emerald-700">{formatCurrency(paid)}</span>
                  </div>
                  <div>
                    <span className="text-xs text-rose-500 font-medium block">Remaining Due</span>
                    <span className={`text-lg font-bold ${due > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatCurrency(due)}
                    </span>
                  </div>
                </div>

                {/* Quantity and Price summary */}
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 flex justify-between items-center text-xs">
                  <div>
                    <span className="text-gray-500 block">Total Units Added:</span>
                    <span className="font-bold text-gray-900 text-sm">
                      {(activeViewingPurchase.totalQuantity || (Array.isArray(activeViewingPurchase.items) ? activeViewingPurchase.items.reduce((s, it) => s + (it.quantityPurchased || 0), 0) : 0)).toLocaleString()} units
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-500 block">Calculated Price / Unit:</span>
                    <span className="font-bold text-gray-900 text-sm">
                      {formatCurrency(
                        activeViewingPurchase.purchasePricePerUnit !== undefined && activeViewingPurchase.purchasePricePerUnit > 0
                          ? activeViewingPurchase.purchasePricePerUnit
                          : ((activeViewingPurchase.totalQuantity || 1) > 0 ? Math.round(activeViewingPurchase.totalAmount / (activeViewingPurchase.totalQuantity || 1)) : 0)
                      )}
                    </span>
                  </div>
                </div>

                {/* Payment History Ledger */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                      Payment History Ledger (Credits)
                      <span className="text-xs font-normal text-gray-500">({payments.length} entries)</span>
                    </h3>
                    {due > 0 && (
                      <button
                        onClick={() => openRecordPayment(activeViewingPurchase)}
                        className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold inline-flex items-center gap-1 hover:underline"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Payment
                      </button>
                    )}
                  </div>

                  {payments.length === 0 ? (
                    <div className="p-4 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-center">
                      <p className="text-xs text-gray-500">
                        {activeViewingPurchase.paymentStatus === 'paid'
                          ? 'This bill was marked as Paid in full directly upon entry.'
                          : 'No individual payment entries recorded yet for this invoice.'}
                      </p>
                      {due > 0 && (
                        <button
                          onClick={() => openRecordPayment(activeViewingPurchase)}
                          className="btn-primary mt-2 text-xs py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700"
                        >
                          <CreditCard className="w-3.5 h-3.5 mr-1" /> Record First Payment
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200 text-xs">
                        <thead className="bg-gray-50 text-gray-600 font-semibold">
                          <tr>
                            <th className="py-2 px-3 text-left">Date</th>
                            <th className="py-2 px-3 text-left">Mode</th>
                            <th className="py-2 px-3 text-left">Reference / Notes</th>
                            <th className="py-2 px-3 text-left">Paid By (Person)</th>
                            <th className="py-2 px-3 text-right">Amount (Cr)</th>
                            <th className="py-2 px-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {payments.map(pay => {
                            const partnerName = pay.paidByPartner && typeof pay.paidByPartner === 'object'
                              ? (pay.paidByPartner as Partner).name
                              : (partners.find(p => p._id === pay.paidByPartner)?.name || (pay.paymentMode === 'partner_out_of_pocket' ? 'Partner' : '—'));

                            return (
                              <tr key={pay._id} className="hover:bg-gray-50/60">
                                <td className="py-2 px-3 whitespace-nowrap text-gray-700">
                                  {formatDate(pay.paymentDate)}
                                </td>
                                <td className="py-2 px-3">
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-100 text-gray-700">
                                    {pay.paymentMode.replace(/_/g, ' ')}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-gray-600 max-w-[150px] truncate">
                                  {pay.referenceNumber && (
                                    <span className="font-mono font-semibold text-gray-800 block">
                                      {pay.referenceNumber}
                                    </span>
                                  )}
                                  {pay.notes && <span className="text-gray-500 text-[11px] block">{pay.notes}</span>}
                                  {!pay.referenceNumber && !pay.notes && '—'}
                                </td>
                                <td className="py-2 px-3 text-gray-700 font-semibold text-indigo-700">
                                  {partnerName !== '—' ? `👤 ${partnerName}` : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                                  {formatCurrency(pay.amount)}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <button
                                    onClick={() => {
                                      if (pay._id) {
                                        setDeletePaymentTarget({
                                          purchaseId: activeViewingPurchase._id,
                                          paymentId: pay._id,
                                          amount: pay.amount,
                                          invoiceNo: activeViewingPurchase.vendorInvoiceNumber,
                                        });
                                      }
                                    }}
                                    className="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                    title="Delete payment entry"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {activeViewingPurchase.notes && (
                  <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <strong>Invoice Notes:</strong> {activeViewingPurchase.notes}
                  </div>
                )}
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Delete Payment Entry Confirmation */}
      <ConfirmDialog
        isOpen={!!deletePaymentTarget}
        title="Delete Payment Entry"
        message={`Delete this payment of ${formatCurrency(deletePaymentTarget?.amount || 0)} against invoice #${deletePaymentTarget?.invoiceNo || ''}? The invoice due balance will increase accordingly.`}
        onConfirm={() => {
          if (deletePaymentTarget && !deletePaymentMut.isPending) {
            deletePaymentMut.mutate({
              purchaseId: deletePaymentTarget.purchaseId,
              paymentId: deletePaymentTarget.paymentId,
            });
          }
        }}
        onCancel={() => {
          if (!deletePaymentMut.isPending) setDeletePaymentTarget(null);
        }}
        confirmText={deletePaymentMut.isPending ? 'Deleting...' : 'Delete Payment'}
        isLoading={deletePaymentMut.isPending}
        isDangerous
      />

      {/* Delete Purchase Confirmation */}
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
