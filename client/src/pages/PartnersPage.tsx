import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Users } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { partnersApi, expensesApi } from '../services/expenses.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, dateRangePresets } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import Modal from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/Feedback';
import toast from 'react-hot-toast';
import type { DateRange, Partner } from '../types';

const partnerSchema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  profitSharePercent: z.number().min(0).max(100),
  capitalContributed: z.number().min(0),
});

type PartnerForm = z.infer<typeof partnerSchema>;

const PartnersPage: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const qc = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange>(dateRangePresets().thisMonth);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['partners'], queryFn: () => partnersApi.list() });
  const { data: balanceData } = useQuery({
    queryKey: ['partner-balance', { accountId: activeAccountId === 'all' ? undefined : activeAccountId, ...dateRange }],
    queryFn: () => partnersApi.balance({
      accountId: activeAccountId === 'all' ? undefined : activeAccountId,
      startDate: dateRange.startDate, endDate: dateRange.endDate,
    }),
  });

  const partners: Partner[] = data?.data?.data || [];
  const balances = balanceData?.data?.data || {};
  const totalProfitShare = partners.reduce((s, p) => s + p.profitSharePercent, 0);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PartnerForm>({
    resolver: zodResolver(partnerSchema),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<Partner> }) => partnersApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['partners'] }); toast.success('Partner updated!'); setEditingPartner(null); reset(); },
  });

  const onSubmit = (d: PartnerForm) => {
    if (editingPartner) updateMut.mutate({ id: editingPartner._id, d: { ...d, capitalContributed: d.capitalContributed * 100 } });
  };

  const openEdit = (p: Partner) => {
    setEditingPartner(p);
    reset({ name: p.name, email: p.email, phone: p.phone, profitSharePercent: p.profitSharePercent, capitalContributed: p.capitalContributed / 100 });
  };

  const colors = ['bg-primary-100 text-primary-700', 'bg-purple-100 text-purple-700', 'bg-emerald-100 text-emerald-700'];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Partners</h1>
        {totalProfitShare !== 100 && (
          <span className="text-xs text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-200">
            ⚠ Profit shares total {totalProfitShare}% (should be 100%)
          </span>
        )}
      </div>

      <div className="card p-4"><DateRangePicker value={dateRange} onChange={setDateRange} /></div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {partners.map((p, i) => {
            const bal = balances[p._id] || {};
            return (
              <div key={p._id} className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${colors[i]} flex items-center justify-center text-lg font-bold`}>
                      {p.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.profitSharePercent}% profit share</p>
                    </div>
                  </div>
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  {[
                    { label: 'Capital Contributed', value: formatCurrency(p.capitalContributed) },
                    { label: 'Expenses Paid', value: formatCurrency(bal.expensesPaid || 0) },
                    { label: 'Expenses Allocated', value: formatCurrency(bal.expensesAllocated || 0) },
                    { label: 'Balance to Reimburse', value: formatCurrency(bal.balance || 0) },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between text-sm">
                      <span className="text-gray-500">{item.label}</span>
                      <span className="font-medium text-gray-900">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={!!editingPartner} onClose={() => { setEditingPartner(null); reset(); }} title="Edit Partner" size="sm"
        footer={<div className="flex gap-2 justify-end"><button onClick={() => setEditingPartner(null)} className="btn-secondary">Cancel</button><button form="partner-form" type="submit" className="btn-primary">Update</button></div>}>
        <form id="partner-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div><label className="label">Name *</label><input {...register('name')} className="input" />{errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}</div>
          <div><label className="label">Email</label><input {...register('email')} type="email" className="input" /></div>
          <div><label className="label">Phone</label><input {...register('phone')} className="input" /></div>
          <div><label className="label">Profit Share %</label><input type="number" step="0.01" {...register('profitSharePercent', { valueAsNumber: true })} className="input" /></div>
          <div><label className="label">Capital Contributed (₹)</label><input type="number" step="0.01" {...register('capitalContributed', { valueAsNumber: true })} className="input" /></div>
        </form>
      </Modal>
    </div>
  );
};

export default PartnersPage;
