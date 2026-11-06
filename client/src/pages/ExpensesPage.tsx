import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Users, Building2, Check, Percent, DollarSign, Wallet, Divide } from 'lucide-react';
import { expensesApi, partnersApi } from '../services/expenses.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatDate, rupeesToPaise, paiseToRupees, dateRangePresets } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import Modal from '../components/ui/Modal';
import { EmptyState, LoadingSpinner, ConfirmDialog } from '../components/ui/Feedback';
import { Pagination, TableSummaryStatus } from '../components/ui/Pagination';
import toast from 'react-hot-toast';
import type { DateRange, Expense, Partner } from '../types';
import { EXPENSE_CATEGORIES } from '../types';

type SharingMode = 'equal_all' | 'equal_selected' | 'custom_percent' | 'custom_amount' | 'none';

const ExpensesPage: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const qc = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange>(dateRangePresets().thisMonth);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const params = {
    accountId: activeAccountId === 'all' ? undefined : activeAccountId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  };

  const { data, isLoading } = useQuery({ queryKey: ['expenses', params], queryFn: () => expensesApi.list(params) });
  const { data: partnersData } = useQuery({ queryKey: ['partners'], queryFn: () => partnersApi.list() });

  const expenses: Expense[] = data?.data?.data || [];
  const partners: Partner[] = partnersData?.data?.data || [];
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  const paginatedExpenses = React.useMemo(() => {
    return expenses.slice((page - 1) * pageSize, page * pageSize);
  }, [expenses, page, pageSize]);

  // Form State
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formCategory, setFormCategory] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAmountRupees, setFormAmountRupees] = useState<number | ''>('');
  const [formPaidBy, setFormPaidBy] = useState<'business' | string>('business'); // 'business' or partner._id
  const [formVendor, setFormVendor] = useState('');
  const [formPaymentMethod, setFormPaymentMethod] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Sharing Division State
  const [sharingMode, setSharingMode] = useState<SharingMode>('equal_all');
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);
  const [customPercents, setCustomPercents] = useState<Record<string, number>>({});
  const [customAmountsRupees, setCustomAmountsRupees] = useState<Record<string, number>>({});

  // Reset or initialize modal
  const openAddModal = () => {
    setEditingExpense(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormCategory(EXPENSE_CATEGORIES[0] || 'Office Expenses');
    setFormDescription('');
    setFormAmountRupees('');
    setFormPaidBy('business');
    setFormVendor('');
    setFormPaymentMethod('');
    setFormNotes('');
    setSharingMode(partners.length === 2 ? 'equal_selected' : 'equal_all');
    // Default selected partners: all partners (or top 2)
    const initialIds = partners.map(p => p._id);
    setSelectedPartnerIds(initialIds);

    // Initial equal percents
    const initPercents: Record<string, number> = {};
    const initAmts: Record<string, number> = {};
    const equalShare = partners.length > 0 ? Number((100 / partners.length).toFixed(2)) : 0;
    partners.forEach(p => {
      initPercents[p._id] = equalShare;
      initAmts[p._id] = 0;
    });
    setCustomPercents(initPercents);
    setCustomAmountsRupees(initAmts);

    setIsModalOpen(true);
  };

  const openEditModal = (exp: Expense) => {
    setEditingExpense(exp);
    setFormDate(exp.expenseDate ? new Date(exp.expenseDate).toISOString().split('T')[0] : '');
    setFormCategory(exp.category || '');
    setFormDescription(exp.description || '');
    setFormAmountRupees(paiseToRupees(exp.amount));

    // Determine paidBy
    const partnerId = typeof exp.paidByPartner === 'object' ? exp.paidByPartner?._id : exp.paidByPartner;
    setFormPaidBy(partnerId || (exp.paidBy !== 'business' ? exp.paidBy : 'business'));
    setFormVendor(exp.vendor || '');
    setFormPaymentMethod(exp.paymentMethod || '');
    setFormNotes(exp.notes || '');

    // Reconstruct allocations
    if (exp.allocations && exp.allocations.length > 0) {
      const allocPartnerIds = exp.allocations.map(a => typeof a.partner === 'object' ? a.partner._id : a.partner).filter(Boolean);
      setSelectedPartnerIds(allocPartnerIds);

      const percents: Record<string, number> = {};
      const amts: Record<string, number> = {};
      exp.allocations.forEach(a => {
        const pid = typeof a.partner === 'object' ? a.partner._id : a.partner;
        if (pid) {
          percents[pid] = a.percent || 0;
          amts[pid] = paiseToRupees(a.amount || 0);
        }
      });
      setCustomPercents(percents);
      setCustomAmountsRupees(amts);

      if (exp.allocationMethod === 'custom') {
        setSharingMode('custom_percent');
      } else if (allocPartnerIds.length < partners.length && allocPartnerIds.length > 0) {
        setSharingMode('equal_selected');
      } else {
        setSharingMode('equal_all');
      }
    } else {
      setSelectedPartnerIds(partners.map(p => p._id));
      setSharingMode(exp.allocationMethod === 'custom' ? 'custom_percent' : 'equal_all');
    }

    setIsModalOpen(true);
  };

  const createMut = useMutation({
    mutationFn: (d: Partial<Expense>) => expensesApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['partner-balance'] });
      toast.success('Expense recorded successfully!');
      setIsModalOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to save expense'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<Expense> }) => expensesApi.update(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['partner-balance'] });
      toast.success('Expense updated!');
      setIsModalOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to update expense'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['partner-balance'] });
      toast.success('Expense deleted');
      setDeleteId(null);
    },
  });

  // Calculate allocations based on sharingMode
  const computeAllocations = () => {
    const totalPaise = rupeesToPaise(Number(formAmountRupees) || 0);
    if (totalPaise <= 0) return [];

    if (sharingMode === 'none') {
      return [];
    }

    if (sharingMode === 'equal_all') {
      if (partners.length === 0) return [];
      const perPartner = Math.round(totalPaise / partners.length);
      const rem = totalPaise - perPartner * partners.length;
      return partners.map((p, i) => ({
        partner: p._id,
        amount: i === 0 ? perPartner + rem : perPartner,
        percent: Math.round(100 / partners.length),
      }));
    }

    if (sharingMode === 'equal_selected') {
      if (selectedPartnerIds.length === 0) return [];
      const count = selectedPartnerIds.length;
      const perPartner = Math.round(totalPaise / count);
      const rem = totalPaise - perPartner * count;
      return selectedPartnerIds.map((pid, i) => ({
        partner: pid,
        amount: i === 0 ? perPartner + rem : perPartner,
        percent: Math.round(100 / count),
      }));
    }

    if (sharingMode === 'custom_percent') {
      return partners.map((p, i) => {
        const pct = customPercents[p._id] || 0;
        const amt = Math.round((totalPaise * pct) / 100);
        return {
          partner: p._id,
          amount: amt,
          percent: pct,
        };
      });
    }

    if (sharingMode === 'custom_amount') {
      return partners.map((p) => {
        const amtPaise = rupeesToPaise(customAmountsRupees[p._id] || 0);
        const pct = totalPaise > 0 ? Math.round((amtPaise / totalPaise) * 100) : 0;
        return {
          partner: p._id,
          amount: amtPaise,
          percent: pct,
        };
      });
    }

    return [];
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(formAmountRupees);
    if (!formCategory) {
      toast.error('Please select an expense category');
      return;
    }
    if (!formDescription.trim()) {
      toast.error('Please enter a description');
      return;
    }
    if (!amt || amt <= 0) {
      toast.error('Please enter a valid expense amount');
      return;
    }

    const totalPaise = rupeesToPaise(amt);
    const allocations = computeAllocations();

    // Validations
    if (sharingMode === 'equal_selected' && selectedPartnerIds.length === 0) {
      toast.error('Please select at least 1 partner to divide this expense');
      return;
    }

    if (sharingMode === 'custom_percent') {
      const sumPct = Object.values(customPercents).reduce((s, v) => s + (v || 0), 0);
      if (Math.abs(sumPct - 100) > 0.5) {
        toast.error(`Custom percentages total ${sumPct}%. It must equal 100%.`);
        return;
      }
    }

    if (sharingMode === 'custom_amount') {
      const sumAmtRupees = Object.values(customAmountsRupees).reduce((s, v) => s + (v || 0), 0);
      if (Math.abs(sumAmtRupees - amt) > 0.1) {
        toast.error(`Custom amounts total ₹${sumAmtRupees.toFixed(2)}. It must equal expense amount ₹${amt.toFixed(2)}.`);
        return;
      }
    }

    // Resolve paidByPartner
    const isBusiness = formPaidBy === 'business';
    const selectedPartner = partners.find(p => p._id === formPaidBy);
    const paidByName = isBusiness ? 'business' : selectedPartner?.name || 'partner';
    const paidByPartnerId = isBusiness ? undefined : formPaidBy;

    const payload: Partial<Expense> = {
      businessAccount: activeAccountId === 'all' ? undefined : activeAccountId,
      expenseDate: formDate,
      category: formCategory,
      description: formDescription.trim(),
      amount: totalPaise,
      paidBy: paidByName,
      paidByPartner: paidByPartnerId,
      allocationMethod: sharingMode === 'custom_percent' || sharingMode === 'custom_amount' ? 'custom' : 'equal',
      allocations,
      vendor: formVendor.trim() || undefined,
      paymentMethod: formPaymentMethod.trim() || undefined,
      notes: formNotes.trim() || undefined,
    };

    if (editingExpense) {
      updateMut.mutate({ id: editingExpense._id, d: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const categoryTotals = EXPENSE_CATEGORIES.map(cat => ({
    category: cat,
    total: expenses.filter(e => e.category === cat).reduce((s, e) => s + (e.amount || 0), 0),
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  // Helper to format who paid an expense
  const renderPaidBy = (e: Expense) => {
    if (e.paidByPartner && typeof e.paidByPartner === 'object') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <Wallet className="w-3 h-3 text-emerald-600" />
          {e.paidByPartner.name}
        </span>
      );
    }
    if (e.paidBy && e.paidBy !== 'business') {
      // Find partner matching ID or name or legacy partner1/2
      const matched = partners.find(p => p._id === e.paidBy || p.name.toLowerCase() === e.paidBy.toLowerCase());
      if (matched) {
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <Wallet className="w-3 h-3 text-emerald-600" />
            {matched.name}
          </span>
        );
      }
      return <span className="capitalize font-medium text-emerald-700">{e.paidBy}</span>;
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
        <Building2 className="w-3 h-3 text-gray-400" />
        Business Account
      </span>
    );
  };

  // Helper to format allocation pill
  const renderAllocation = (e: Expense) => {
    const allocCount = e.allocations?.length || 0;
    if (allocCount === 0) {
      return <span className="badge badge-gray text-[10px]">No split</span>;
    }
    if (e.allocationMethod === 'custom') {
      return <span className="badge badge-purple text-[10px] font-semibold">Custom ({allocCount} partners)</span>;
    }
    return (
      <span className="badge badge-blue text-[10px] font-semibold">
        Equal (÷ {allocCount})
      </span>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Expenses</h1>
          <p className="text-xs sm:text-sm text-gray-500">
            Total: <strong>{formatCurrency(totalExpenses)}</strong> · {expenses.length} records
          </p>
        </div>
        <button onClick={openAddModal} className="btn-primary py-2 px-3.5 text-xs flex items-center gap-1.5 font-semibold shadow-xs">
          <Plus className="w-4 h-4" /> Add Expense
        </button>
      </div>

      <div className="card p-4 space-y-3 shadow-xs">
        <DateRangePicker value={dateRange} onChange={r => { setDateRange(r); setPage(1); }} />
        {expenses.length > 0 && (
          <TableSummaryStatus
            page={page}
            total={expenses.length}
            pageSize={pageSize}
            itemName="expenses"
          />
        )}
      </div>

      {/* Category breakdown */}
      {categoryTotals.length > 0 && (
        <div className="card p-4 sm:p-5 shadow-xs">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Category Breakdown</h2>
          <div className="space-y-2">
            {categoryTotals.map(c => (
              <div key={c.category} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-36 sm:w-44 truncate">{c.category}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(c.total / totalExpenses) * 100}%` }} />
                </div>
                <span className="text-xs font-semibold text-gray-800 w-24 text-right">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expenses Table */}
      <div className="card shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center">
            <LoadingSpinner />
            <p className="text-xs text-gray-500 mt-3 font-medium">Loading expenses...</p>
          </div>
        ) : expenses.length === 0 ? (
          <EmptyState title="No expenses recorded" description="Record business expenses to track out-of-pocket spending and profitability." icon={<Users className="w-12 h-12" />} />
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th className="hidden sm:table-cell">Description</th>
                    <th className="text-right sm:text-left">Amount</th>
                    <th className="text-left">Paid By</th>
                    <th className="hidden md:table-cell">Method</th>
                    <th className="hidden lg:table-cell">Sharing Allocation</th>
                    <th className="text-right pr-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedExpenses.map(e => (
                    <tr key={e._id} className="hover:bg-primary-50/20 transition-colors">
                      <td className="whitespace-nowrap text-[11px] sm:text-xs text-gray-600">{formatDate(e.expenseDate)}</td>
                      <td>
                        <div>
                          <span className="badge badge-blue text-[10px] font-medium">{e.category}</span>
                          <div className="sm:hidden text-[10px] text-gray-500 mt-0.5 truncate max-w-[120px]">
                            {e.description}
                          </div>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell text-xs font-medium text-gray-900">{e.description}</td>
                      <td className="text-right sm:text-left font-bold text-xs sm:text-sm text-gray-900">{formatCurrency(e.amount)}</td>
                      <td className="text-left">{renderPaidBy(e)}</td>
                      <td className="hidden md:table-cell text-xs text-gray-500">{e.paymentMethod || '—'}</td>
                      <td className="hidden lg:table-cell">{renderAllocation(e)}</td>
                      <td className="text-right pr-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(e)}
                            className="p-1 sm:p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                            title="Edit Expense"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteId(e._id)}
                            className="p-1 sm:p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                            title="Delete Expense"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              total={expenses.length}
              pageSize={pageSize}
              pageSizeOptions={[10, 25, 50, 100]}
              itemName="expenses"
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>

      {/* Add / Edit Expense Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingExpense(null); }}
        title={editingExpense ? 'Edit Expense & Partner Split' : 'Add Expense & Partner Split'}
        size="lg"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setIsModalOpen(false); setEditingExpense(null); }} className="btn-secondary text-xs">
              Cancel
            </button>
            <button
              onClick={handleFormSubmit}
              disabled={createMut.isPending || updateMut.isPending}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              {createMut.isPending || updateMut.isPending ? <LoadingSpinner size="sm" /> : <Check className="w-4 h-4" />}
              {editingExpense ? 'Update Expense' : 'Save Expense'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
          {/* Row 1: Date & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Date *</label>
              <input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                className="input text-xs"
                required
              />
            </div>
            <div>
              <label className="label">Category *</label>
              <select
                value={formCategory}
                onChange={e => setFormCategory(e.target.value)}
                className="select text-xs"
                required
              >
                <option value="">Select category</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label">Description *</label>
            <input
              type="text"
              value={formDescription}
              onChange={e => setFormDescription(e.target.value)}
              placeholder="e.g. 100 pcs box, printing roll"
              className="input text-xs"
              required
            />
          </div>

          {/* Row 2: Amount & Paid By */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Amount (₹) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formAmountRupees}
                  onChange={e => setFormAmountRupees(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="0.00"
                  className="input pl-7 text-xs font-semibold"
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">Paid By (Who spent this money?) *</label>
              <select
                value={formPaidBy}
                onChange={e => setFormPaidBy(e.target.value)}
                className="select text-xs font-medium"
              >
                <option value="business">🏢 Business Account</option>
                <optgroup label="👤 Partner (Paid out-of-pocket)">
                  {partners.map(p => (
                    <option key={p._id} value={p._id}>
                      👤 {p.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* Row 3: Vendor & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Vendor / Recipient</label>
              <input
                type="text"
                value={formVendor}
                onChange={e => setFormVendor(e.target.value)}
                placeholder="Vendor or shop name"
                className="input text-xs"
              />
            </div>
            <div>
              <label className="label">Payment Method</label>
              <input
                type="text"
                value={formPaymentMethod}
                onChange={e => setFormPaymentMethod(e.target.value)}
                placeholder="Cash, GPay, UPI, Netbanking..."
                className="input text-xs"
              />
            </div>
          </div>

          {/* ───────────────────────────────────────────────────────────── */}
          {/* SHARING & DIVISION SECTION ("divide by custom / default 2") */}
          {/* ───────────────────────────────────────────────────────────── */}
          <div className="pt-3 border-t border-gray-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="label mb-0 font-bold text-gray-800 flex items-center gap-1.5">
                <Divide className="w-4 h-4 text-primary-600" />
                How should this expense be divided between partners?
              </label>
              <span className="text-[10px] text-gray-400 font-medium">
                {partners.length} active {partners.length === 1 ? 'partner' : 'partners'}
              </span>
            </div>

            {/* Sharing Mode Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setSharingMode('equal_all')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  sharingMode === 'equal_all'
                    ? 'border-primary-500 bg-primary-50 text-primary-900 font-semibold shadow-xs ring-1 ring-primary-400'
                    : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                }`}
              >
                <div className="font-bold text-[11px]">Divide All (÷ {partners.length})</div>
                <div className="text-[10px] text-gray-500 mt-0.5">Equal split among all partners</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSharingMode('equal_selected');
                  if (selectedPartnerIds.length === 0) {
                    setSelectedPartnerIds(partners.slice(0, 2).map(p => p._id));
                  }
                }}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  sharingMode === 'equal_selected'
                    ? 'border-primary-500 bg-primary-50 text-primary-900 font-semibold shadow-xs ring-1 ring-primary-400'
                    : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                }`}
              >
                <div className="font-bold text-[11px]">Select Partners (÷ {selectedPartnerIds.length || 2})</div>
                <div className="text-[10px] text-gray-500 mt-0.5">e.g. Divide by 2 partners</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSharingMode('custom_percent');
                  const count = partners.length || 1;
                  const eq = Number((100 / count).toFixed(2));
                  const init: Record<string, number> = {};
                  partners.forEach(p => { init[p._id] = customPercents[p._id] ?? eq; });
                  setCustomPercents(init);
                }}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  sharingMode === 'custom_percent'
                    ? 'border-primary-500 bg-primary-50 text-primary-900 font-semibold shadow-xs ring-1 ring-primary-400'
                    : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                }`}
              >
                <div className="font-bold text-[11px]">Custom % Split</div>
                <div className="text-[10px] text-gray-500 mt-0.5">Specify % per partner</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSharingMode('custom_amount');
                  const total = Number(formAmountRupees) || 0;
                  const share = partners.length > 0 ? Number((total / partners.length).toFixed(2)) : 0;
                  const init: Record<string, number> = {};
                  partners.forEach(p => { init[p._id] = customAmountsRupees[p._id] ?? share; });
                  setCustomAmountsRupees(init);
                }}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  sharingMode === 'custom_amount'
                    ? 'border-primary-500 bg-primary-50 text-primary-900 font-semibold shadow-xs ring-1 ring-primary-400'
                    : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                }`}
              >
                <div className="font-bold text-[11px]">Custom ₹ Amount</div>
                <div className="text-[10px] text-gray-500 mt-0.5">Exact rupees per partner</div>
              </button>
            </div>

            {/* Mode 1: Equal Split Among All */}
            {sharingMode === 'equal_all' && (
              <div className="bg-primary-50/60 p-3 rounded-xl border border-primary-100 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-primary-900">Equal split among all {partners.length} partners:</span>
                  <div className="text-[11px] text-primary-700 mt-0.5">
                    {partners.map(p => p.name).join(' • ')}
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-extrabold text-primary-900 text-sm">
                    {Number(formAmountRupees) > 0 && partners.length > 0
                      ? formatCurrency(Math.round(rupeesToPaise(Number(formAmountRupees)) / partners.length))
                      : '₹0.00'}
                  </span>
                  <p className="text-[10px] text-primary-600 font-medium">per person</p>
                </div>
              </div>
            )}

            {/* Mode 2: Divide between selected partners (Default 2 divide) */}
            {sharingMode === 'equal_selected' && (
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800 text-xs">
                    Select which partners divide this expense ({selectedPartnerIds.length} selected):
                  </span>
                  <span className="text-xs font-bold text-primary-700">
                    {Number(formAmountRupees) > 0 && selectedPartnerIds.length > 0
                      ? `${formatCurrency(Math.round(rupeesToPaise(Number(formAmountRupees)) / selectedPartnerIds.length))} each`
                      : 'Select partners'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {partners.map(p => {
                    const isChecked = selectedPartnerIds.includes(p._id);
                    return (
                      <label
                        key={p._id}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-primary-50 border-primary-300 text-primary-900 font-semibold'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedPartnerIds(prev => [...prev, p._id]);
                            } else {
                              setSelectedPartnerIds(prev => prev.filter(id => id !== p._id));
                            }
                          }}
                          className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4"
                        />
                        <span className="truncate">{p.name}</span>
                      </label>
                    );
                  })}
                </div>

                {selectedPartnerIds.length === 2 && (
                  <p className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 font-medium">
                    ✓ Dividing 50/50 between the 2 selected partners (÷ 2)
                  </p>
                )}
              </div>
            )}

            {/* Mode 3: Custom Percentages */}
            {sharingMode === 'custom_percent' && (
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800 text-xs">Specify percentage per partner:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const count = partners.length || 1;
                        const eq = Number((100 / count).toFixed(2));
                        const upd: Record<string, number> = {};
                        partners.forEach(p => { upd[p._id] = eq; });
                        setCustomPercents(upd);
                      }}
                      className="px-2 py-0.5 rounded bg-gray-200 hover:bg-gray-300 text-[10px] font-semibold text-gray-700"
                    >
                      Equal %
                    </button>
                    {partners.length >= 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          const upd: Record<string, number> = {};
                          partners.forEach((p, i) => { upd[p._id] = i < 2 ? 50 : 0; });
                          setCustomPercents(upd);
                        }}
                        className="px-2 py-0.5 rounded bg-gray-200 hover:bg-gray-300 text-[10px] font-semibold text-gray-700"
                      >
                        50 / 50 (Top 2)
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {partners.map(p => {
                    const pct = customPercents[p._id] || 0;
                    const calculatedAmt = (Number(formAmountRupees) || 0) * (pct / 100);
                    return (
                      <div key={p._id} className="flex items-center justify-between gap-3 bg-white p-2 rounded-lg border border-gray-200">
                        <span className="font-medium text-gray-800 truncate w-36 sm:w-48">{p.name}</span>
                        <div className="flex items-center gap-2">
                          <div className="relative w-20">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={pct}
                              onChange={e => setCustomPercents(prev => ({ ...prev, [p._id]: parseFloat(e.target.value) || 0 }))}
                              className="input py-1 px-2 text-right text-xs pr-6"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                          </div>
                          <span className="font-bold text-primary-700 w-24 text-right">
                            ₹{calculatedAmt.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Percentage Total Checker */}
                {(() => {
                  const sumPct = Object.values(customPercents).reduce((s, v) => s + (v || 0), 0);
                  const isExact = Math.abs(sumPct - 100) < 0.1;
                  return (
                    <div className="flex justify-between items-center text-xs font-semibold pt-1">
                      <span>Total Allocated:</span>
                      <span className={isExact ? 'text-emerald-700' : 'text-red-600 font-bold'}>
                        {sumPct.toFixed(2)}% {isExact ? '✓ (100% matched)' : '⚠ (must equal 100%)'}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Mode 4: Custom Exact Rupee Amounts */}
            {sharingMode === 'custom_amount' && (
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800 text-xs">Enter exact rupee share per partner:</span>
                  <span className="text-xs text-gray-500">Total: <strong>₹{(Number(formAmountRupees) || 0).toFixed(2)}</strong></span>
                </div>

                <div className="space-y-2">
                  {partners.map(p => {
                    const amtVal = customAmountsRupees[p._id] || 0;
                    return (
                      <div key={p._id} className="flex items-center justify-between gap-3 bg-white p-2 rounded-lg border border-gray-200">
                        <span className="font-medium text-gray-800 truncate w-36 sm:w-48">{p.name}</span>
                        <div className="relative w-28">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={amtVal}
                            onChange={e => setCustomAmountsRupees(prev => ({ ...prev, [p._id]: parseFloat(e.target.value) || 0 }))}
                            className="input py-1 pl-6 pr-2 text-right text-xs font-semibold"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Amount Total Checker */}
                {(() => {
                  const sumAmt = Object.values(customAmountsRupees).reduce((s, v) => s + (v || 0), 0);
                  const target = Number(formAmountRupees) || 0;
                  const diff = target - sumAmt;
                  const isExact = Math.abs(diff) < 0.1;
                  return (
                    <div className="flex justify-between items-center text-xs font-semibold pt-1">
                      <span>Total: ₹{sumAmt.toFixed(2)}</span>
                      <span className={isExact ? 'text-emerald-700' : 'text-red-600 font-bold'}>
                        {isExact ? '✓ Exact match' : `⚠ Remaining: ₹${diff.toFixed(2)}`}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes / Additional Details</label>
            <textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              className="input text-xs resize-none"
              rows={2}
              placeholder="Optional notes or invoice references..."
            />
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete Expense"
        message="Are you sure you want to delete this expense record? This will also reverse the partner allocations."
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        confirmText="Delete"
        isDangerous
      />
    </div>
  );
};

export default ExpensesPage;
