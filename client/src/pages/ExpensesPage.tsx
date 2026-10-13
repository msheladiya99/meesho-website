import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Users } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { expensesApi, partnersApi } from '../services/expenses.service';
import { productsApi } from '../services/inventory.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatDate, rupeesToPaise, paiseToRupees, dateRangePresets } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import Modal from '../components/ui/Modal';
import { EmptyState, LoadingSpinner, ConfirmDialog } from '../components/ui/Feedback';
import toast from 'react-hot-toast';
import type { DateRange, Expense, Partner } from '../types';
import { EXPENSE_CATEGORIES } from '../types';

const schema = z.object({
  expenseDate: z.string().min(1, 'Required'),
  category: z.string().min(1, 'Required'),
  description: z.string().min(1, 'Required'),
  amount: z.number().positive('Must be positive'),
  paidBy: z.enum(['partner1', 'partner2', 'partner3', 'business']),
  paidByPartner: z.string().optional(),
  allocationMethod: z.enum(['equal', 'custom']),
  vendor: z.string().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const ExpensesPage: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const qc = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange>(dateRangePresets().thisMonth);
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
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { expenseDate: new Date().toISOString().split('T')[0], allocationMethod: 'equal', paidBy: 'business' },
  });

  const paidBy = watch('paidBy');

  const createMut = useMutation({
    mutationFn: (d: Partial<Expense>) => expensesApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Expense recorded!'); setIsModalOpen(false); reset(); },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Expense deleted'); setDeleteId(null); },
  });

  const onSubmit = (d: FormData) => {
    const payload = {
      ...d,
      amount: rupeesToPaise(d.amount),
      businessAccount: activeAccountId === 'all' ? undefined : activeAccountId,
    };
    createMut.mutate(payload);
  };

  const categoryTotals = EXPENSE_CATEGORIES.map(cat => ({
    category: cat,
    total: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500">Total: <strong>{formatCurrency(totalExpenses)}</strong> · {expenses.length} records</p>
        </div>
        <button onClick={() => { setEditingExpense(null); reset({ expenseDate: new Date().toISOString().split('T')[0], allocationMethod: 'equal', paidBy: 'business' }); setIsModalOpen(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Expense
        </button>
      </div>

      <div className="card p-4"><DateRangePicker value={dateRange} onChange={setDateRange} /></div>

      {/* Category breakdown */}
      {categoryTotals.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Category Breakdown</h2>
          <div className="space-y-2">
            {categoryTotals.map(c => (
              <div key={c.category} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-40 truncate">{c.category}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(c.total / totalExpenses) * 100}%` }} />
                </div>
                <span className="text-xs font-medium text-gray-700 w-24 text-right">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        {isLoading ? <LoadingSpinner /> : expenses.length === 0 ? (
          <EmptyState title="No expenses" description="Record business expenses to track profitability." icon={<Users className="w-12 h-12" />} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Paid By</th><th>Method</th><th>Allocation</th><th>Actions</th></tr></thead>
              <tbody>
                {expenses.map(e => (
                  <tr key={e._id}>
                    <td className="whitespace-nowrap">{formatDate(e.expenseDate)}</td>
                    <td><span className="badge badge-blue">{e.category}</span></td>
                    <td>{e.description}</td>
                    <td className="font-semibold">{formatCurrency(e.amount)}</td>
                    <td className="capitalize">{e.paidBy}</td>
                    <td>{e.paymentMethod || '—'}</td>
                    <td><span className="badge badge-gray">{e.allocationMethod}</span></td>
                    <td>
                      <button onClick={() => setDeleteId(e._id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingExpense(null); }} title="Add Expense" size="lg"
        footer={<div className="flex gap-2 justify-end"><button onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancel</button><button form="expense-form" type="submit" className="btn-primary">Save Expense</button></div>}>
        <form id="expense-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Date *</label><input type="date" {...register('expenseDate')} className="input" /></div>
            <div>
              <label className="label">Category *</label>
              <select {...register('category')} className="select">
                <option value="">Select category</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {errors.category && <p className="text-xs text-red-500 mt-1">{errors.category.message}</p>}
            </div>
          </div>
          <div><label className="label">Description *</label><input {...register('description')} className="input" />{errors.description && <p className="text-xs text-red-500 mt-1">{errors.description.message}</p>}</div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Amount (₹) *</label><input type="number" step="0.01" {...register('amount', { valueAsNumber: true })} className="input" />{errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount.message}</p>}</div>
            <div>
              <label className="label">Paid By *</label>
              <select {...register('paidBy')} className="select">
                <option value="business">Business Account</option>
                {partners.map((p, i) => <option key={p._id} value={`partner${i + 1}`}>{p.name} (Partner {i + 1})</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Vendor/Recipient</label><input {...register('vendor')} className="input" /></div>
            <div><label className="label">Payment Method</label><input {...register('paymentMethod')} className="input" placeholder="Cash, UPI, Bank..." /></div>
          </div>
          <div>
            <label className="label">Sharing Method</label>
            <select {...register('allocationMethod')} className="select">
              <option value="equal">Equal (÷ {partners.length || 3})</option>
              <option value="custom">Custom percentages</option>
            </select>
          </div>
          <div><label className="label">Notes</label><textarea {...register('notes')} className="input resize-none" rows={2} /></div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} title="Delete Expense" message="Remove this expense record?" onConfirm={() => deleteId && deleteMut.mutate(deleteId)} onCancel={() => setDeleteId(null)} confirmText="Delete" isDangerous />
    </div>
  );
};

export default ExpensesPage;
