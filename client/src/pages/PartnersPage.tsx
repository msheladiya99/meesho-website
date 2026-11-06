import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Users, Plus, Trash2, ArrowUpRight, ArrowDownLeft, CheckCircle2, AlertCircle, Receipt, DollarSign, Wallet } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { partnersApi } from '../services/expenses.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatDate, dateRangePresets } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import Modal from '../components/ui/Modal';
import { LoadingSpinner, ConfirmDialog } from '../components/ui/Feedback';
import toast from 'react-hot-toast';
import type { DateRange, Partner } from '../types';

const partnerSchema = z.object({
  name: z.string().min(1, 'Partner name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  profitSharePercent: z.number().min(0).max(100),
  capitalContributed: z.number().min(0),
});

type PartnerForm = z.infer<typeof partnerSchema>;

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
  'bg-teal-100 text-teal-700 border-teal-200',
];

interface PartnerBalanceItem {
  expensesPaid: number;
  expensesAllocated: number;
  balance: number;
  paidExpenses?: Array<{
    _id: string;
    description: string;
    amount: number;
    expenseDate: string;
    category: string;
  }>;
}

const PartnersPage: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const qc = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange>(dateRangePresets().thisMonth);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [deletePartnerId, setDeletePartnerId] = useState<string | null>(null);
  const [viewExpensesPartner, setViewExpensesPartner] = useState<Partner | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['partners'], queryFn: () => partnersApi.list() });
  const { data: balanceData } = useQuery({
    queryKey: ['partner-balance', { accountId: activeAccountId === 'all' ? undefined : activeAccountId, ...dateRange }],
    queryFn: () => partnersApi.balance({
      accountId: activeAccountId === 'all' ? undefined : activeAccountId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    }),
  });

  const partners: Partner[] = data?.data?.data || [];
  const balances: Record<string, PartnerBalanceItem> = balanceData?.data?.data || {};
  const totalProfitShare = Number(partners.reduce((s, p) => s + (p.profitSharePercent || 0), 0).toFixed(2));
  const totalCapital = partners.reduce((s, p) => s + (p.capitalContributed || 0), 0);
  const totalExpensesPaid = Object.values(balances).reduce((s, b) => s + (b.expensesPaid || 0), 0);
  const totalExpensesAllocated = Object.values(balances).reduce((s, b) => s + (b.expensesAllocated || 0), 0);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<PartnerForm>({
    resolver: zodResolver(partnerSchema),
  });

  // Create Partner
  const createMut = useMutation({
    mutationFn: (d: Partial<Partner>) => partnersApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partners'] });
      qc.invalidateQueries({ queryKey: ['partner-balance'] });
      toast.success('Partner added successfully!');
      setIsAddModalOpen(false);
      reset();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to add partner'),
  });

  // Update Partner
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<Partner> }) => partnersApi.update(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partners'] });
      qc.invalidateQueries({ queryKey: ['partner-balance'] });
      toast.success('Partner updated!');
      setEditingPartner(null);
      reset();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to update partner'),
  });

  // Delete Partner
  const deleteMut = useMutation({
    mutationFn: (id: string) => partnersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partners'] });
      qc.invalidateQueries({ queryKey: ['partner-balance'] });
      toast.success('Partner removed');
      setDeletePartnerId(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to remove partner'),
  });

  const onAddSubmit = (d: PartnerForm) => {
    createMut.mutate({
      ...d,
      capitalContributed: Math.round(d.capitalContributed * 100),
      isActive: true,
    });
  };

  const onEditSubmit = (d: PartnerForm) => {
    if (editingPartner) {
      updateMut.mutate({
        id: editingPartner._id,
        d: { ...d, capitalContributed: Math.round(d.capitalContributed * 100) },
      });
    }
  };

  const openAdd = () => {
    // Propose an equal share for the new partner based on total count
    const targetCount = partners.length + 1;
    const equalShare = Number((100 / targetCount).toFixed(2));
    reset({
      name: '',
      email: '',
      phone: '',
      profitSharePercent: equalShare,
      capitalContributed: 0,
    });
    setIsAddModalOpen(true);
  };

  const openEdit = (p: Partner) => {
    setEditingPartner(p);
    reset({
      name: p.name,
      email: p.email || '',
      phone: p.phone || '',
      profitSharePercent: p.profitSharePercent,
      capitalContributed: (p.capitalContributed || 0) / 100,
    });
  };

  // Equalize profit shares across all current partners
  const handleAutoEqualize = async () => {
    if (partners.length === 0) return;
    const equalShare = Number((100 / partners.length).toFixed(2));
    try {
      await Promise.all(
        partners.map((p) => partnersApi.update(p._id, { profitSharePercent: equalShare }))
      );
      qc.invalidateQueries({ queryKey: ['partners'] });
      toast.success(`Equalized: ${equalShare}% per partner`);
    } catch {
      toast.error('Failed to auto-equalize profit shares');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">Partners & Capital Accounts</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-200">
              {partners.length} {partners.length === 1 ? 'Partner' : 'Partners'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage partners, track out-of-pocket spending, expense allocations, and reimbursement balances.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {totalProfitShare !== 100 && (
            <button
              onClick={handleAutoEqualize}
              className="px-2.5 py-1.5 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors font-semibold"
              title="Click to divide 100% equally among all partners"
            >
              ⚠ Total {totalProfitShare}% · Auto Equalize (÷ {partners.length})
            </button>
          )}

          <button onClick={openAdd} className="btn-primary py-2 px-3.5 text-xs flex items-center gap-1.5 font-semibold shadow-xs">
            <Plus className="w-4 h-4" /> Add Partner
          </button>
        </div>
      </div>

      {/* Date Range Picker */}
      <div className="card p-4 shadow-xs">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Overall Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="card p-3 sm:p-4 border-l-4 border-l-primary-500">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Active Partners</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{partners.length}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Total Share: {totalProfitShare}%</p>
        </div>

        <div className="card p-3 sm:p-4 border-l-4 border-l-blue-500">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Capital</p>
          <p className="text-xl sm:text-2xl font-bold text-blue-700 mt-1">{formatCurrency(totalCapital)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Contributed by partners</p>
        </div>

        <div className="card p-3 sm:p-4 border-l-4 border-l-emerald-500">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Expenses Paid (Spend)</p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(totalExpensesPaid)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Paid out-of-pocket</p>
        </div>

        <div className="card p-3 sm:p-4 border-l-4 border-l-purple-500">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Expenses Allocated</p>
          <p className="text-xl sm:text-2xl font-bold text-purple-700 mt-1">{formatCurrency(totalExpensesAllocated)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Assigned shares</p>
        </div>
      </div>

      {/* Partners Grid */}
      {isLoading ? (
        <div className="py-16 flex flex-col items-center justify-center">
          <LoadingSpinner />
          <p className="text-xs text-gray-500 mt-3 font-medium">Loading partners...</p>
        </div>
      ) : partners.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-2 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40 text-primary-400" />
          <p className="font-semibold text-gray-700 text-sm">No partners registered yet</p>
          <p className="text-xs mt-1 text-gray-500">Click &quot;Add Partner&quot; to set up your business partners.</p>
          <button onClick={openAdd} className="btn-primary mt-4 py-1.5 px-3 text-xs inline-flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add Partner
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {partners.map((p, i) => {
            const bal = balances[p._id] || { expensesPaid: 0, expensesAllocated: 0, balance: 0, paidExpenses: [] };
            const isOwed = bal.balance > 0;
            const owesBusiness = bal.balance < 0;
            const colorClass = AVATAR_COLORS[i % AVATAR_COLORS.length];

            return (
              <div key={p._id} className="card p-5 space-y-4 hover:shadow-md transition-shadow relative group">
                {/* Partner Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl border flex items-center justify-center text-lg font-bold shadow-2xs ${colorClass}`}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm sm:text-base leading-tight">{p.name}</h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-50 text-primary-700 border border-primary-100">
                          {p.profitSharePercent}% profit share
                        </span>
                        {p.phone && <span className="text-[10px] text-gray-400">· {p.phone}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(p)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                      title="Edit Partner"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletePartnerId(p._id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                      title="Remove Partner"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Financial Summary Breakdown */}
                <div className="bg-gray-50/70 p-3 rounded-xl space-y-2 border border-gray-100 text-xs">
                  <div className="flex justify-between items-center text-gray-600">
                    <span>Capital Contributed:</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(p.capitalContributed)}</span>
                  </div>

                  {/* Which person spent how much */}
                  <div className="flex justify-between items-center text-gray-700 pt-1 border-t border-gray-200/50">
                    <span className="flex items-center gap-1 text-emerald-800 font-medium">
                      <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                      Expenses Paid (Spend):
                    </span>
                    <span className="font-extrabold text-emerald-700 text-xs sm:text-sm">
                      {formatCurrency(bal.expensesPaid || 0)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-gray-600">
                    <span>Expenses Allocated:</span>
                    <span className="font-medium text-gray-800">{formatCurrency(bal.expensesAllocated || 0)}</span>
                  </div>

                  {/* Net Balance Pill */}
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                    <span className="font-semibold text-gray-700">Net Balance:</span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded-full text-xs flex items-center gap-1 ${
                        isOwed
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : owesBusiness
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {isOwed ? <ArrowUpRight className="w-3 h-3" /> : owesBusiness ? <ArrowDownLeft className="w-3 h-3" /> : null}
                      {formatCurrency(Math.abs(bal.balance || 0))}
                      <span className="text-[10px] font-normal opacity-90">
                        {isOwed ? '(To Receive)' : owesBusiness ? '(Owes)' : '(Settled)'}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Action button: View exact spend history */}
                <button
                  onClick={() => setViewExpensesPartner(p)}
                  className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-primary-50 hover:text-primary-700 text-gray-700 flex items-center justify-center gap-1.5 transition-colors border border-gray-200/60"
                >
                  <Receipt className="w-3.5 h-3.5 text-gray-500" />
                  View Spending Breakdown ({bal.paidExpenses?.length || 0})
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Partner Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); reset(); }}
        title="Add New Business Partner"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setIsAddModalOpen(false)} className="btn-secondary text-xs">Cancel</button>
            <button form="add-partner-form" type="submit" disabled={createMut.isPending} className="btn-primary text-xs">
              {createMut.isPending ? <LoadingSpinner size="sm" /> : 'Add Partner'}
            </button>
          </div>
        }
      >
        <form id="add-partner-form" onSubmit={handleSubmit(onAddSubmit)} className="space-y-4 text-xs">
          <div>
            <label className="label">Partner Name *</label>
            <input {...register('name')} placeholder="e.g. Rahul Sharma" className="input text-xs" />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email Address</label>
              <input {...register('email')} type="email" placeholder="partner@gmail.com" className="input text-xs" />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">Phone Number</label>
              <input {...register('phone')} placeholder="+91 98765 43210" className="input text-xs" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Profit Share %</label>
              <input type="number" step="0.01" {...register('profitSharePercent', { valueAsNumber: true })} className="input text-xs" />
              {errors.profitSharePercent && <p className="text-xs text-red-500 mt-1">{errors.profitSharePercent.message}</p>}
            </div>
            <div>
              <label className="label">Capital Contributed (₹)</label>
              <input type="number" step="0.01" {...register('capitalContributed', { valueAsNumber: true })} placeholder="0.00" className="input text-xs" />
            </div>
          </div>
        </form>
      </Modal>

      {/* Edit Partner Modal */}
      <Modal
        isOpen={!!editingPartner}
        onClose={() => { setEditingPartner(null); reset(); }}
        title={`Edit Partner: ${editingPartner?.name}`}
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditingPartner(null)} className="btn-secondary text-xs">Cancel</button>
            <button form="edit-partner-form" type="submit" disabled={updateMut.isPending} className="btn-primary text-xs">
              {updateMut.isPending ? <LoadingSpinner size="sm" /> : 'Save Changes'}
            </button>
          </div>
        }
      >
        <form id="edit-partner-form" onSubmit={handleSubmit(onEditSubmit)} className="space-y-4 text-xs">
          <div>
            <label className="label">Partner Name *</label>
            <input {...register('name')} className="input text-xs" />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email</label>
              <input {...register('email')} type="email" className="input text-xs" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input {...register('phone')} className="input text-xs" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Profit Share %</label>
              <input type="number" step="0.01" {...register('profitSharePercent', { valueAsNumber: true })} className="input text-xs" />
            </div>
            <div>
              <label className="label">Capital Contributed (₹)</label>
              <input type="number" step="0.01" {...register('capitalContributed', { valueAsNumber: true })} className="input text-xs" />
            </div>
          </div>
        </form>
      </Modal>

      {/* View Expenses Paid by Partner Modal */}
      {viewExpensesPartner && (
        <Modal
          isOpen={true}
          onClose={() => setViewExpensesPartner(null)}
          title={`Out-of-Pocket Expenses: ${viewExpensesPartner.name}`}
          size="lg"
          footer={
            <div className="flex justify-end">
              <button onClick={() => setViewExpensesPartner(null)} className="btn-secondary text-xs">Close</button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex items-center justify-between text-xs">
              <div>
                <p className="font-semibold text-emerald-900">{viewExpensesPartner.name}</p>
                <p className="text-[11px] text-emerald-700">Total Spent in Period: <strong>{formatCurrency(balances[viewExpensesPartner._id]?.expensesPaid || 0)}</strong></p>
              </div>
              <span className="badge bg-emerald-600 text-white font-bold text-xs px-2.5 py-1">
                {balances[viewExpensesPartner._id]?.paidExpenses?.length || 0} Records
              </span>
            </div>

            {(!balances[viewExpensesPartner._id]?.paidExpenses || balances[viewExpensesPartner._id]?.paidExpenses?.length === 0) ? (
              <p className="text-xs text-gray-400 py-8 text-center">No expenses recorded as paid by {viewExpensesPartner.name} in this period.</p>
            ) : (
              <div className="table-container max-h-80 overflow-y-auto">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th className="text-right">Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances[viewExpensesPartner._id]?.paidExpenses?.map((e) => (
                      <tr key={e._id}>
                        <td className="whitespace-nowrap">{formatDate(e.expenseDate)}</td>
                        <td><span className="badge badge-blue text-[10px]">{e.category}</span></td>
                        <td className="font-medium text-gray-800">{e.description}</td>
                        <td className="text-right font-bold text-emerald-700">{formatCurrency(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Delete Partner Confirmation */}
      <ConfirmDialog
        isOpen={!!deletePartnerId}
        title="Remove Partner"
        message="Are you sure you want to remove this partner? Historical expenses and records will be preserved."
        onConfirm={() => deletePartnerId && deleteMut.mutate(deletePartnerId)}
        onCancel={() => setDeletePartnerId(null)}
        confirmText="Remove Partner"
        isDangerous
      />
    </div>
  );
};

export default PartnersPage;
