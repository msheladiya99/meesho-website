import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { accountsApi } from '../services/accounts.service';
import { useAuthStore } from '../store/authStore';
import Modal from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/Feedback';
import toast from 'react-hot-toast';
import type { BusinessAccount } from '../types';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  tradeName: z.string().min(1, 'Required'),
  gstin: z.string().length(15, 'GSTIN must be 15 characters').toUpperCase(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

type FormData = z.infer<typeof schema>;

const SettingsPage: React.FC = () => {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BusinessAccount | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['accounts'], queryFn: () => accountsApi.list() });
  const accounts: BusinessAccount[] = data?.data?.data || [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { isActive: true },
  });

  const createMut = useMutation({
    mutationFn: (d: Partial<BusinessAccount>) => accountsApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); toast.success('Account created!'); setIsModalOpen(false); reset(); },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<BusinessAccount> }) => accountsApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); toast.success('Account updated!'); setIsModalOpen(false); setEditingAccount(null); reset(); },
  });

  const onSubmit = (d: FormData) => {
    if (editingAccount) updateMut.mutate({ id: editingAccount._id, d });
    else createMut.mutate(d);
  };

  const openEdit = (a: BusinessAccount) => {
    setEditingAccount(a);
    reset({ name: a.name, tradeName: a.tradeName, gstin: a.gstin, address: a.address, phone: a.phone, email: a.email, isActive: a.isActive });
    setIsModalOpen(true);
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">GSTIN & Business Settings</h1>
        {isAdmin && (
          <button onClick={() => { setEditingAccount(null); reset({ isActive: true }); setIsModalOpen(true); }} className="btn-primary">
            <Plus className="w-4 h-4" /> Add GSTIN Account
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          Only administrators can modify GSTIN accounts.
        </div>
      )}

      {isLoading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {accounts.map((a, i) => (
            <div key={a._id} className={`card p-6 ${!a.isActive ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${i === 0 ? 'bg-primary-100 text-primary-700' : 'bg-purple-100 text-purple-700'} flex items-center justify-center font-bold text-sm`}>
                    G{i + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{a.tradeName}</p>
                    <p className="text-xs text-gray-500">{a.name}</p>
                  </div>
                </div>
                {isAdmin && (
                  <button onClick={() => openEdit(a)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><Edit2 className="w-4 h-4" /></button>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex gap-2"><span className="text-xs text-gray-500 w-20">GSTIN</span><span className="text-xs font-mono font-medium text-gray-900">{a.gstin}</span></div>
                {a.address && <div className="flex gap-2"><span className="text-xs text-gray-500 w-20">Address</span><span className="text-xs text-gray-700 break-words whitespace-normal max-w-[200px]">{a.address}</span></div>}
                {a.phone && <div className="flex gap-2"><span className="text-xs text-gray-500 w-20">Phone</span><span className="text-xs text-gray-700">{a.phone}</span></div>}
                {a.email && <div className="flex gap-2"><span className="text-xs text-gray-500 w-20">Email</span><span className="text-xs text-gray-700">{a.email}</span></div>}
              </div>

              <div className="mt-4">
                <span className={`badge ${a.isActive ? 'badge-green' : 'badge-gray'}`}>{a.isActive ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingAccount(null); }} title={editingAccount ? 'Edit GSTIN Account' : 'Add GSTIN Account'} size="md"
        footer={<div className="flex gap-2 justify-end"><button onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancel</button><button form="account-form" type="submit" className="btn-primary">{editingAccount ? 'Update' : 'Create'}</button></div>}>
        <form id="account-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div><label className="label">Business Name (Short) *</label><input {...register('name')} className="input" placeholder="e.g., Account A" />{errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}</div>
          <div><label className="label">Trade Name *</label><input {...register('tradeName')} className="input" placeholder="Registered trade name" />{errors.tradeName && <p className="text-xs text-red-500 mt-1">{errors.tradeName.message}</p>}</div>
          <div><label className="label">GSTIN * (15 characters)</label><input {...register('gstin')} className="input font-mono uppercase" placeholder="22AAAAA0000A1Z5" maxLength={15} />{errors.gstin && <p className="text-xs text-red-500 mt-1">{errors.gstin.message}</p>}</div>
          <div><label className="label">Address</label><textarea {...register('address')} className="input resize-none" rows={2} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Phone</label><input {...register('phone')} className="input" /></div>
            <div><label className="label">Email</label><input {...register('email')} type="email" className="input" /></div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isActive" {...register('isActive')} className="rounded" />
            <label htmlFor="isActive" className="text-sm text-gray-700">Active account</label>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SettingsPage;
