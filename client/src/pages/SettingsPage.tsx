import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Edit2,
  Building2,
  Layers,
  Copy,
  Check,
  MapPin,
  Phone,
  Mail,
  ShieldCheck,
  CheckCircle2,
  FileSpreadsheet,
  ExternalLink,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { accountsApi } from '../services/accounts.service';
import { useAuthStore } from '../store/authStore';
import { useAccountStore } from '../store/accountStore';
import Modal from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/Feedback';
import toast from 'react-hot-toast';
import type { BusinessAccount } from '../types';

const schema = z.object({
  name: z.string().min(1, 'Business name is required'),
  tradeName: z.string().min(1, 'Trade name is required'),
  gstin: z
    .string()
    .length(15, 'GSTIN must be exactly 15 characters')
    .toUpperCase(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof schema>;

const getGstState = (gstin?: string): string => {
  if (!gstin || gstin.length < 2) return 'Unknown';
  const code = gstin.substring(0, 2);
  const states: Record<string, string> = {
    '01': 'Jammu & Kashmir',
    '02': 'Himachal Pradesh',
    '03': 'Punjab',
    '04': 'Chandigarh',
    '05': 'Uttarakhand',
    '06': 'Haryana',
    '07': 'Delhi',
    '08': 'Rajasthan',
    '09': 'Uttar Pradesh',
    '10': 'Bihar',
    '11': 'Sikkim',
    '12': 'Arunachal Pradesh',
    '13': 'Nagaland',
    '14': 'Manipur',
    '15': 'Mizoram',
    '16': 'Tripura',
    '17': 'Meghalaya',
    '18': 'Assam',
    '19': 'West Bengal',
    '20': 'Jharkhand',
    '21': 'Odisha',
    '22': 'Chhattisgarh',
    '23': 'Madhya Pradesh',
    '24': 'Gujarat',
    '25': 'Daman & Diu',
    '26': 'Dadra & Nagar Haveli',
    '27': 'Maharashtra',
    '28': 'Andhra Pradesh',
    '29': 'Karnataka',
    '30': 'Goa',
    '31': 'Lakshadweep',
    '32': 'Kerala',
    '33': 'Tamil Nadu',
    '34': 'Puducherry',
    '35': 'Andaman & Nicobar Islands',
    '36': 'Telangana',
    '37': 'Andhra Pradesh (New)',
    '38': 'Ladakh',
  };
  return states[code] ? `${states[code]} (Code ${code})` : `Code ${code}`;
};

const SettingsPage: React.FC = () => {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { activeAccountId, setActiveAccountId, setAccounts } = useAccountStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BusinessAccount | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Tab: 'all' or specific account _id
  const [selectedTab, setSelectedTab] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list(),
  });

  const accounts: BusinessAccount[] = data?.data?.data || [];

  // Keep accountStore synced with latest accounts list
  useEffect(() => {
    if (accounts.length > 0) {
      setAccounts(accounts);
      // If user has an activeAccountId selected from top bar, sync tab to that account
      if (activeAccountId && activeAccountId !== 'all') {
        setSelectedTab(activeAccountId);
      }
    }
  }, [accounts, setAccounts, activeAccountId]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { isActive: true },
  });

  const createMut = useMutation({
    mutationFn: (d: Partial<BusinessAccount>) => accountsApi.create(d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('GSTIN account registered successfully!');
      setIsModalOpen(false);
      reset();
      if (res.data?.data?._id) {
        setSelectedTab(res.data.data._id);
        setActiveAccountId(res.data.data._id);
      }
    },
    onError: (e: unknown) =>
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Failed to create account'
      ),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<BusinessAccount> }) =>
      accountsApi.update(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('GSTIN account updated successfully!');
      setIsModalOpen(false);
      setEditingAccount(null);
      reset();
    },
    onError: (e: unknown) =>
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Failed to update account'
      ),
  });

  const onSubmit = (d: FormData) => {
    if (editingAccount) updateMut.mutate({ id: editingAccount._id, d });
    else createMut.mutate(d);
  };

  const openEdit = (a: BusinessAccount) => {
    setEditingAccount(a);
    reset({
      name: a.name,
      tradeName: a.tradeName,
      gstin: a.gstin,
      address: a.address,
      phone: a.phone,
      email: a.email,
      isActive: a.isActive,
    });
    setIsModalOpen(true);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const copyFullGstProfile = (a: BusinessAccount) => {
    const profile = `GSTIN: ${a.gstin}\nTrade Name: ${a.tradeName}\nLegal Name: ${a.name}\nState: ${getGstState(a.gstin)}\nAddress:\n${a.address || 'N/A'}\nPhone: ${a.phone || 'N/A'}\nEmail: ${a.email || 'N/A'}`;
    copyToClipboard(profile, `profile-${a._id}`);
  };

  const isAdmin = user?.role === 'admin';

  // Active account being focused
  const focusedAccount =
    selectedTab !== 'all' ? accounts.find((a) => a._id === selectedTab) : null;

  return (
    <div className="space-y-6">
      {/* Page Title & Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">GSTIN & Business Account Settings</h1>
          <p className="text-xs text-gray-500 mt-1">
            Manage your registered GST numbers, principal business addresses, and account credentials.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setEditingAccount(null);
              reset({ isActive: true });
              setIsModalOpen(true);
            }}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add GSTIN Account</span>
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Only administrators have permission to modify or add GSTIN accounts.</span>
        </div>
      )}

      {/* Account Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
        <button
          type="button"
          onClick={() => {
            setSelectedTab('all');
            setActiveAccountId('all');
          }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            selectedTab === 'all'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>All Accounts Overview ({accounts.length})</span>
        </button>

        {accounts.map((acc) => {
          const isCurrentActive = activeAccountId === acc._id;
          const isTabActive = selectedTab === acc._id;
          return (
            <button
              key={acc._id}
              type="button"
              onClick={() => {
                setSelectedTab(acc._id);
                setActiveAccountId(acc._id);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                isTabActive
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Building2 className={`w-3.5 h-3.5 ${isTabActive ? 'text-white' : 'text-primary-500'}`} />
              <span>{acc.tradeName || acc.name}</span>
              <span
                className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                  isTabActive ? 'bg-primary-700/60 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {acc.gstin.slice(0, 2)}..{acc.gstin.slice(-3)}
              </span>
              {isCurrentActive && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Active Account" />
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="py-24 flex justify-center items-center">
          <LoadingSpinner />
        </div>
      ) : focusedAccount ? (
        /* ══════════════════════════════════════════════════════════════════════
           SPECIFIC ACCOUNT GST DETAILS VIEW (Own GST Details)
        ══════════════════════════════════════════════════════════════════════ */
        <div className="space-y-6">
          {/* Certificate-Style Header Banner */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 text-white p-6 shadow-md border border-emerald-950/20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Registered GSTIN Profile
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-white/10 text-emerald-100 backdrop-blur-xs">
                    {getGstState(focusedAccount.gstin)}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                      focusedAccount.isActive
                        ? 'bg-emerald-400 text-emerald-950 font-semibold'
                        : 'bg-gray-500 text-gray-100'
                    }`}
                  >
                    {focusedAccount.isActive ? 'Active' : 'Inactive'}
                  </span>
                  {activeAccountId === focusedAccount._id && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-400 text-amber-950">
                      Active In Top Bar
                    </span>
                  )}
                </div>

                <h2 className="text-2xl font-bold tracking-tight text-white">
                  {focusedAccount.tradeName}
                </h2>
                <p className="text-xs text-emerald-200/80">
                  Legal Name of Business:{' '}
                  <span className="font-semibold text-white">{focusedAccount.name}</span>
                </p>

                {/* Big GSTIN Display */}
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <div className="px-3.5 py-1.5 rounded-lg bg-black/40 border border-white/15 font-mono text-base md:text-lg font-bold tracking-wider text-emerald-300">
                    {focusedAccount.gstin}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(focusedAccount.gstin, `gstin-${focusedAccount._id}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-all"
                  >
                    {copiedKey === `gstin-${focusedAccount._id}` ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>GSTIN Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy GSTIN</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyFullGstProfile(focusedAccount)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-xs transition-all"
                  >
                    {copiedKey === `profile-${focusedAccount._id}` ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Full Profile Copied</span>
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Copy Profile Summary</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Header Right Actions */}
              <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => openEdit(focusedAccount)}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white text-gray-900 hover:bg-emerald-50 text-xs font-semibold shadow-sm transition-all"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-gray-700" />
                    <span>Edit GST Account</span>
                  </button>
                )}
                {activeAccountId !== focusedAccount._id && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveAccountId(focusedAccount._id);
                      toast.success(`Active account set to ${focusedAccount.tradeName}`);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 border border-emerald-400/30 text-xs font-medium transition-all"
                  >
                    <span>Set as Active Account</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Detailed GST Data Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Column 1: Registration Details */}
            <div className="card p-5 bg-white border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 pb-3">
                <Building2 className="w-4 h-4 text-primary-500" />
                <span>GST Registration Info</span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <p className="text-gray-400 font-medium">Trade Name</p>
                  <p className="font-semibold text-gray-900 text-sm mt-0.5">
                    {focusedAccount.tradeName}
                  </p>
                </div>

                <div>
                  <p className="text-gray-400 font-medium">Legal Name of Taxpayer</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{focusedAccount.name}</p>
                </div>

                <div>
                  <p className="text-gray-400 font-medium">GST Identification Number</p>
                  <p className="font-mono font-bold text-gray-900 text-sm mt-0.5">
                    {focusedAccount.gstin}
                  </p>
                </div>

                <div>
                  <p className="text-gray-400 font-medium">State & State Code</p>
                  <p className="font-medium text-gray-800 mt-0.5">
                    {getGstState(focusedAccount.gstin)}
                  </p>
                </div>

                <div>
                  <p className="text-gray-400 font-medium">Taxpayer Type</p>
                  <p className="font-medium text-gray-800 mt-0.5">Regular / Taxable Person</p>
                </div>
              </div>
            </div>

            {/* Column 2: Principal Place of Business (Address) */}
            <div className="card p-5 bg-white border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                  <MapPin className="w-4 h-4 text-rose-500" />
                  <span>Principal Place of Business</span>
                </div>
                {focusedAccount.address && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(focusedAccount.address!, `addr-${focusedAccount._id}`)}
                    className="text-gray-400 hover:text-gray-700 p-1"
                    title="Copy full address"
                  >
                    {copiedKey === `addr-${focusedAccount._id}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>

              {focusedAccount.address ? (
                <div className="space-y-2">
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs font-medium text-gray-700 space-y-1">
                    {focusedAccount.address.split('\n').map((line, idx) => {
                      if (!line.trim()) return null;
                      return (
                        <div key={idx} className="flex gap-2">
                          <span className="text-gray-400 select-none">•</span>
                          <span className="leading-relaxed">{line}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Official address as recorded on the GST portal for tax invoices & e-way bills.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic py-6 text-center">
                  No address has been provided for this account yet.
                </p>
              )}
            </div>

            {/* Column 3: Contact Details & Status */}
            <div className="card p-5 bg-white border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 pb-3">
                <Phone className="w-4 h-4 text-emerald-500" />
                <span>Contact & Account Status</span>
              </div>

              <div className="space-y-4 text-xs">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-gray-400 font-medium">Registered Phone</p>
                    <p className="font-semibold text-gray-900 mt-0.5">
                      {focusedAccount.phone || 'Not specified'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-gray-400 font-medium">Registered Email</p>
                    <p className="font-semibold text-gray-900 mt-0.5">
                      {focusedAccount.email || 'Not specified'}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <p className="text-gray-400 font-medium mb-1">Account Operational Status</p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`badge ${
                        focusedAccount.isActive ? 'badge-green' : 'badge-gray'
                      }`}
                    >
                      {focusedAccount.isActive ? 'Active for Transactions' : 'Inactive / Disabled'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Switch to Other Registered Accounts */}
          <div className="card p-5 bg-white border border-gray-100 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Other Registered GSTIN Accounts
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {accounts.map((acc) => {
                const isSelected = acc._id === focusedAccount._id;
                return (
                  <div
                    key={acc._id}
                    onClick={() => {
                      setSelectedTab(acc._id);
                      setActiveAccountId(acc._id);
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50/40 ring-2 ring-primary-500/20'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xs">
                        {acc.tradeName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-xs">{acc.tradeName}</p>
                        <p className="font-mono text-[11px] text-gray-500">{acc.gstin}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isSelected ? (
                        <span className="text-[10px] font-bold text-primary-700 bg-primary-100 px-2 py-0.5 rounded-full">
                          Viewing
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-gray-500 hover:text-gray-800">
                          Switch →
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════════
           ALL ACCOUNTS CONSOLIDATED OVERVIEW
        ══════════════════════════════════════════════════════════════════════ */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {accounts.map((a, i) => {
              const isCurrentActive = activeAccountId === a._id;
              return (
                <div
                  key={a._id}
                  className={`card p-6 bg-white border transition-all relative ${
                    isCurrentActive
                      ? 'border-primary-300 ring-2 ring-primary-500/10 shadow-md'
                      : 'border-gray-100 shadow-sm'
                  } ${!a.isActive ? 'opacity-60' : ''}`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-11 h-11 rounded-xl ${
                          i % 2 === 0
                            ? 'bg-primary-100 text-primary-700'
                            : 'bg-purple-100 text-purple-700'
                        } flex items-center justify-center font-bold text-sm`}
                      >
                        G{i + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900 text-base">{a.tradeName}</p>
                          {isCurrentActive && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{a.name}</p>
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => openEdit(a)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        title="Edit Account"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Account Properties */}
                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
                      <span className="text-gray-500 font-medium">GSTIN</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-gray-900">{a.gstin}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(a.gstin, `gstin-${a._id}`)}
                          className="p-1 text-gray-400 hover:text-gray-700"
                        >
                          {copiedKey === `gstin-${a._id}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-between py-1">
                      <span className="text-gray-500">State</span>
                      <span className="font-medium text-gray-800">{getGstState(a.gstin)}</span>
                    </div>

                    {a.address && (
                      <div className="py-1">
                        <span className="text-gray-500 block mb-1">Registered Address</span>
                        <p className="text-gray-700 text-[11px] bg-gray-50/50 p-2 rounded-lg border border-gray-100 line-clamp-2 leading-relaxed">
                          {a.address}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <span className="text-gray-400 block text-[11px]">Phone</span>
                        <span className="text-gray-800 font-medium">{a.phone || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[11px]">Email</span>
                        <span className="text-gray-800 font-medium truncate block">
                          {a.email || '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="mt-5 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <span className={`badge ${a.isActive ? 'badge-green' : 'badge-gray'}`}>
                      {a.isActive ? 'Active' : 'Inactive'}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTab(a._id);
                        setActiveAccountId(a._id);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700"
                    >
                      <span>View Full GST Details</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add / Edit Account Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingAccount(null);
        }}
        title={editingAccount ? 'Edit GSTIN Account' : 'Register New GSTIN Account'}
        size="md"
        footer={
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setIsModalOpen(false);
                setEditingAccount(null);
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              form="account-form"
              type="submit"
              disabled={createMut.isPending || updateMut.isPending}
              className="btn-primary"
            >
              {createMut.isPending || updateMut.isPending
                ? 'Saving...'
                : editingAccount
                ? 'Update Account'
                : 'Register Account'}
            </button>
          </div>
        }
      >
        <form id="account-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Legal Business Name (as on GST Certificate) *</label>
            <input
              {...register('name')}
              className="input"
              placeholder="e.g., MEET GHANSHYAMBHAI SHELADIYA"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="label">Trade Name *</label>
            <input
              {...register('tradeName')}
              className="input"
              placeholder="e.g., Zevaro"
            />
            {errors.tradeName && (
              <p className="text-xs text-red-500 mt-1">{errors.tradeName.message}</p>
            )}
          </div>

          <div>
            <label className="label">GSTIN * (15 alphanumeric characters)</label>
            <input
              {...register('gstin')}
              className="input font-mono uppercase"
              placeholder="24PUXPS3218A1Z6"
              maxLength={15}
            />
            {errors.gstin && <p className="text-xs text-red-500 mt-1">{errors.gstin.message}</p>}
          </div>

          <div>
            <label className="label">Principal Place of Business (Full Address)</label>
            <textarea
              {...register('address')}
              className="input resize-none font-mono text-xs"
              rows={4}
              placeholder="Building No./Flat No.:&#10;Road/Street:&#10;City:&#10;District:&#10;State:&#10;PIN Code:"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Contact Phone</label>
              <input
                {...register('phone')}
                className="input"
                placeholder="e.g., 9876543210"
              />
            </div>
            <div>
              <label className="label">Contact Email</label>
              <input
                {...register('email')}
                type="email"
                className="input"
                placeholder="accounts@example.com"
              />
              {errors.email && (
                <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActive"
              {...register('isActive')}
              className="rounded text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="isActive" className="text-xs font-medium text-gray-700">
              Active account (eligible for orders and stock transactions)
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SettingsPage;
