import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { vendorsApi } from '../services/inventory.service';
import Modal from '../components/ui/Modal';
import { EmptyState, LoadingSpinner, ConfirmDialog } from '../components/ui/Feedback';
import toast from 'react-hot-toast';
import type { Vendor } from '../types';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  company: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  gstin: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const VendorsPage: React.FC = () => {
  const qc = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['vendors'], queryFn: () => vendorsApi.list() });
  const vendors: Vendor[] = data?.data?.data || [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const createMut = useMutation({
    mutationFn: (d: Partial<Vendor>) => vendorsApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); toast.success('Vendor added!'); setIsModalOpen(false); reset(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<Vendor> }) => vendorsApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); toast.success('Vendor updated!'); setIsModalOpen(false); setEditingVendor(null); reset(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => vendorsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); toast.success('Vendor deleted'); setDeleteId(null); },
  });

  const onSubmit = (d: FormData) => {
    if (editingVendor) updateMut.mutate({ id: editingVendor._id, d });
    else createMut.mutate(d);
  };

  const openEdit = (v: Vendor) => {
    setEditingVendor(v);
    reset({ name: v.name, company: v.company, phone: v.phone, email: v.email, address: v.address, gstin: v.gstin, notes: v.notes });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Vendors</h1>
        <button onClick={() => { setEditingVendor(null); reset(); setIsModalOpen(true); }} className="btn-primary"><Plus className="w-4 h-4" /> Add Vendor</button>
      </div>

      <div className="card">
        {isLoading ? <LoadingSpinner /> : vendors.length === 0 ? (
          <EmptyState title="No vendors" description="Add suppliers you purchase perfume stock from." />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th className="hidden sm:table-cell">Company</th>
                  <th>Phone</th>
                  <th className="hidden md:table-cell">Email</th>
                  <th className="hidden lg:table-cell">GSTIN</th>
                  <th className="text-right pr-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map(v => (
                  <tr key={v._id}>
                    <td className="font-medium">
                      <div className="text-xs text-gray-900">{v.name}</div>
                      {v.company && <div className="sm:hidden text-[10px] text-gray-400">{v.company}</div>}
                    </td>
                    <td className="hidden sm:table-cell text-xs">{v.company || '—'}</td>
                    <td className="text-xs text-gray-700">{v.phone || '—'}</td>
                    <td className="hidden md:table-cell text-xs text-gray-500">{v.email || '—'}</td>
                    <td className="hidden lg:table-cell font-mono text-xs">{v.gstin || '—'}</td>
                    <td className="text-right pr-2">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(v)} className="p-1 sm:p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setDeleteId(v._id)} className="p-1 sm:p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingVendor(null); }} title={editingVendor ? 'Edit Vendor' : 'Add Vendor'} size="md"
        footer={<div className="flex gap-2 justify-end"><button onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancel</button><button form="vendor-form" type="submit" className="btn-primary">{editingVendor ? 'Update' : 'Create'}</button></div>}>
        <form id="vendor-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Name *</label><input {...register('name')} className="input" />{errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}</div>
            <div><label className="label">Company</label><input {...register('company')} className="input" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Phone</label><input {...register('phone')} className="input" /></div>
            <div><label className="label">Email</label><input {...register('email')} type="email" className="input" /></div>
          </div>
          <div><label className="label">Address</label><textarea {...register('address')} className="input resize-none" rows={2} /></div>
          <div><label className="label">GSTIN</label><input {...register('gstin')} className="input font-mono" placeholder="Vendor's GSTIN (optional)" /></div>
          <div><label className="label">Notes</label><textarea {...register('notes')} className="input resize-none" rows={2} /></div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} title="Delete Vendor" message="Remove this vendor?" onConfirm={() => deleteId && deleteMut.mutate(deleteId)} onCancel={() => setDeleteId(null)} confirmText="Delete" isDangerous />
    </div>
  );
};

export default VendorsPage;
