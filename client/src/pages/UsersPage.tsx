import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Shield } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { usersApi } from '../services/auth.service';
import { useAuthStore } from '../store/authStore';
import Modal from '../components/ui/Modal';
import { LoadingSpinner, ConfirmDialog } from '../components/ui/Feedback';
import toast from 'react-hot-toast';
import type { User } from '../types';

const createSchema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Minimum 6 characters'),
  role: z.enum(['admin', 'manager', 'viewer']),
});

const editSchema = createSchema.omit({ password: true }).extend({
  isActive: z.boolean().optional(),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;

const roleColors: Record<string, string> = {
  admin: 'badge-red',
  manager: 'badge-blue',
  viewer: 'badge-gray',
};

const UsersPage: React.FC = () => {
  const { user: me } = useAuthStore();
  const qc = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPwUserId, setResetPwUserId] = useState<string | null>(null);
  const [newPw, setNewPw] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    enabled: me?.role === 'admin',
  });

  const users: User[] = data?.data?.data || [];

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema), defaultValues: { role: 'viewer' } });
  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  const createMut = useMutation({
    mutationFn: (d: CreateForm) => usersApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User created!'); setIsModalOpen(false); createForm.reset(); },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<User> }) => usersApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User updated!'); setIsModalOpen(false); setEditingUser(null); editForm.reset(); },
  });

  const resetPwMut = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => usersApi.resetPassword(id, password),
    onSuccess: () => { toast.success('Password reset!'); setResetPwUserId(null); setNewPw(''); },
  });

  const onCreateSubmit = (d: CreateForm) => createMut.mutate(d);
  const onEditSubmit = (d: EditForm) => {
    if (editingUser) updateMut.mutate({ id: editingUser._id, d: d as Partial<User> });
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    editForm.reset({ name: u.name, email: u.email, role: u.role });
    setIsModalOpen(true);
  };

  if (me?.role !== 'admin') {
    return (
      <div className="card p-8 text-center">
        <Shield className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Access restricted to administrators only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">User Management</h1>
        <button onClick={() => { setEditingUser(null); createForm.reset({ role: 'viewer' }); setIsModalOpen(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="card">
        {isLoading ? <LoadingSpinner /> : (
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u._id} className={u._id === me._id ? 'bg-primary-50/50' : ''}>
                    <td className="font-medium">
                      {u.name}
                      {u._id === me._id && <span className="ml-2 text-xs text-primary-600">(you)</span>}
                    </td>
                    <td>{u.email}</td>
                    <td><span className={`badge ${roleColors[u.role]}`}>{u.role}</span></td>
                    <td className="text-gray-500 text-xs">{new Date(u.createdAt).toLocaleDateString('en-IN')}</td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(u)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 text-xs">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setResetPwUserId(u._id); setNewPw(''); }} className="px-2 py-1 text-xs rounded hover:bg-orange-50 text-gray-400 hover:text-orange-600 border border-transparent hover:border-orange-200">
                          Reset PW
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      <Modal isOpen={isModalOpen && !editingUser} onClose={() => setIsModalOpen(false)} title="Create User" size="sm"
        footer={<div className="flex gap-2 justify-end"><button onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancel</button><button form="create-user-form" type="submit" className="btn-primary">Create</button></div>}>
        <form id="create-user-form" onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
          <div><label className="label">Name *</label><input {...createForm.register('name')} className="input" />{createForm.formState.errors.name && <p className="text-xs text-red-500 mt-1">{createForm.formState.errors.name.message}</p>}</div>
          <div><label className="label">Email *</label><input {...createForm.register('email')} type="email" className="input" />{createForm.formState.errors.email && <p className="text-xs text-red-500 mt-1">{createForm.formState.errors.email.message}</p>}</div>
          <div><label className="label">Password *</label><input {...createForm.register('password')} type="password" className="input" />{createForm.formState.errors.password && <p className="text-xs text-red-500 mt-1">{createForm.formState.errors.password.message}</p>}</div>
          <div>
            <label className="label">Role *</label>
            <select {...createForm.register('role')} className="select">
              <option value="viewer">Viewer (read only)</option>
              <option value="manager">Manager (read + write)</option>
              <option value="admin">Admin (full access)</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={isModalOpen && !!editingUser} onClose={() => { setIsModalOpen(false); setEditingUser(null); }} title="Edit User" size="sm"
        footer={<div className="flex gap-2 justify-end"><button onClick={() => { setIsModalOpen(false); setEditingUser(null); }} className="btn-secondary">Cancel</button><button form="edit-user-form" type="submit" className="btn-primary">Update</button></div>}>
        <form id="edit-user-form" onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
          <div><label className="label">Name *</label><input {...editForm.register('name')} className="input" /></div>
          <div><label className="label">Email *</label><input {...editForm.register('email')} type="email" className="input" /></div>
          <div>
            <label className="label">Role *</label>
            <select {...editForm.register('role')} className="select">
              <option value="viewer">Viewer</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* Reset password */}
      <ConfirmDialog
        isOpen={!!resetPwUserId}
        title="Reset Password"
        message="Enter a new password for this user:"
        onConfirm={() => resetPwUserId && newPw.length >= 6 && resetPwMut.mutate({ id: resetPwUserId, password: newPw })}
        onCancel={() => { setResetPwUserId(null); setNewPw(''); }}
        confirmText="Reset"
      />
      {resetPwUserId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Reset Password</h3>
            <input type="password" className="input mb-4" placeholder="New password (min 6 chars)" value={newPw} onChange={e => setNewPw(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setResetPwUserId(null); setNewPw(''); }} className="btn-secondary">Cancel</button>
              <button disabled={newPw.length < 6} onClick={() => resetPwMut.mutate({ id: resetPwUserId!, password: newPw })} className="btn-primary">Reset Password</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
