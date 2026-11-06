import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Building2, Calendar, IndianRupee, CreditCard, User, FileText, Sparkles } from 'lucide-react';
import Modal from './Modal';
import { useAccountStore } from '../../store/accountStore';
import { expensesApi, partnersApi } from '../../services/expenses.service';
import { rupeesToPaise, paiseToRupees } from '../../lib/utils';
import toast from 'react-hot-toast';
import type { Partner } from '../../types';

interface AdSpendModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingAd?: any | null;
  defaultAccountId?: string;
}

const PLATFORMS = [
  { id: 'Meesho Ads', name: 'Meesho Ads', icon: '🛍️', color: 'border-pink-300 bg-pink-50 text-pink-700' },
  { id: 'Meta / Facebook Ads', name: 'Meta / FB Ads', icon: '📱', color: 'border-blue-300 bg-blue-50 text-blue-700' },
  { id: 'Instagram Ads', name: 'Instagram Ads', icon: '📸', color: 'border-purple-300 bg-purple-50 text-purple-700' },
  { id: 'Google Ads', name: 'Google Ads', icon: '🔍', color: 'border-amber-300 bg-amber-50 text-amber-700' },
  { id: 'Other', name: 'Other / Influencer', icon: '🎯', color: 'border-gray-300 bg-gray-50 text-gray-700' },
];

const QUICK_AMOUNTS = [200, 500, 1000, 2000, 5000];

const PAYMENT_METHODS = [
  'Meesho Payout Deduction',
  'UPI (GPay / PhonePe / Paytm)',
  'Net Banking / Bank Transfer',
  'Credit / Debit Card',
  'Cash',
];

export const AdSpendModal: React.FC<AdSpendModalProps> = ({
  isOpen,
  onClose,
  editingAd,
  defaultAccountId,
}) => {
  const qc = useQueryClient();
  const { accounts, activeAccountId } = useAccountStore();
  const { data: partnersData } = useQuery({
    queryKey: ['partners'],
    queryFn: () => partnersApi.list(),
  });
  const partners: Partner[] = partnersData?.data?.data || [];

  const initialAccount =
    defaultAccountId && defaultAccountId !== 'all'
      ? defaultAccountId
      : activeAccountId && activeAccountId !== 'all'
      ? activeAccountId
      : accounts[0]?._id || '';

  const [businessAccount, setBusinessAccount] = useState<string>(initialAccount);
  const [expenseDate, setExpenseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [platform, setPlatform] = useState<string>('Meesho Ads');
  const [amountRupees, setAmountRupees] = useState<number | ''>('');
  const [description, setDescription] = useState<string>('Meesho CPC Discovery Ads');
  const [paidBy, setPaidBy] = useState<string>('business');
  const [paymentMethod, setPaymentMethod] = useState<string>('Meesho Payout Deduction');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (editingAd) {
      const acctId =
        typeof editingAd.businessAccount === 'object'
          ? editingAd.businessAccount?._id
          : editingAd.businessAccount;
      setBusinessAccount(acctId || initialAccount);
      setExpenseDate(
        editingAd.expenseDate
          ? new Date(editingAd.expenseDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0]
      );
      setPlatform(editingAd.vendor || 'Meesho Ads');
      setAmountRupees(editingAd.amount ? paiseToRupees(editingAd.amount) : '');
      setDescription(editingAd.description || 'Meesho CPC Discovery Ads');

      const partnerId =
        typeof editingAd.paidByPartner === 'object'
          ? editingAd.paidByPartner?._id
          : editingAd.paidByPartner;
      setPaidBy(partnerId || editingAd.paidBy || 'business');
      setPaymentMethod(editingAd.paymentMethod || 'Meesho Payout Deduction');
      setNotes(editingAd.notes || '');
    } else {
      setBusinessAccount(initialAccount);
      setExpenseDate(new Date().toISOString().split('T')[0]);
      setPlatform('Meesho Ads');
      setAmountRupees('');
      setDescription('Meesho CPC Discovery Ads');
      setPaidBy('business');
      setPaymentMethod('Meesho Payout Deduction');
      setNotes('');
    }
  }, [editingAd, isOpen, initialAccount]);

  // Handle platform change and update description template
  const handlePlatformChange = (pId: string) => {
    setPlatform(pId);
    if (!description || description.includes('Ads') || description.includes('Discovery')) {
      if (pId === 'Meesho Ads') setDescription('Meesho CPC Discovery Ads');
      else if (pId === 'Meta / Facebook Ads') setDescription('Meta / Facebook Catalog Ads');
      else if (pId === 'Instagram Ads') setDescription('Instagram Story & Reel Ads');
      else if (pId === 'Google Ads') setDescription('Google Search & Shopping Ads');
      else setDescription('Marketing & Advertisement Spend');
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingAd?._id) {
        return expensesApi.update(editingAd._id, payload);
      }
      return expensesApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pnl'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['partner-balance'] });
      toast.success(
        editingAd
          ? 'Advertisement spend updated successfully!'
          : `Advertisement spend of ₹${amountRupees} recorded and counted in Profit & Loss!`
      );
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to record advertisement spend');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!businessAccount) {
      toast.error('Please select a GSTIN Business Account');
      return;
    }

    const amt = Number(amountRupees);
    if (!amt || amt <= 0) {
      toast.error('Please enter a valid advertisement spend amount');
      return;
    }

    const amountInPaise = rupeesToPaise(amt);

    // Build payload
    const payload: any = {
      businessAccount,
      expenseDate: new Date(expenseDate),
      category: 'Advertising',
      description: description.trim() || `${platform} Spend`,
      amount: amountInPaise,
      vendor: platform,
      paymentMethod,
      notes: notes.trim(),
      allocationMethod: 'equal',
    };

    if (paidBy === 'business') {
      payload.paidBy = 'business';
      payload.paidByPartner = undefined;
    } else {
      payload.paidBy = paidBy;
      payload.paidByPartner = paidBy;
    }

    // Auto calculate equal allocations across active partners
    if (partners.length > 0) {
      const perPartner = Math.round(amountInPaise / partners.length);
      const rem = amountInPaise - perPartner * partners.length;
      payload.allocations = partners.map((p, i) => ({
        partner: p._id,
        amount: i === 0 ? perPartner + rem : perPartner,
        percent: Math.round(100 / partners.length),
      }));
    }

    saveMutation.mutate(payload);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingAd ? 'Edit Advertisement Spend' : 'Add Advertisement Spend (Count in P&L)'}
      size="md"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <p className="text-[11px] text-gray-500 hidden sm:block">
            Automatically deducted from Gross Profit in P&L
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={saveMutation.isPending}
              className="px-3.5 py-2 text-xs sm:text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saveMutation.isPending}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              <Megaphone className="w-3.5 h-3.5" />
              {saveMutation.isPending ? 'Saving...' : editingAd ? 'Update Ad Spend' : 'Save & Count in P&L'}
            </button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Helper Banner */}
        <div className="flex items-start gap-2.5 p-3 bg-purple-50 border border-purple-100 rounded-xl text-xs text-purple-800">
          <Sparkles className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-purple-900">E-Commerce Ad Spend Tracking</p>
            <p className="text-purple-700 mt-0.5">
              Enter your Meesho Ads or external campaign budget. This spend is counted under operating expenses and reduces your Net Profit in real-time.
            </p>
          </div>
        </div>

        {/* Platform Selection */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Advertising Platform / Channel
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PLATFORMS.map((p) => {
              const isSelected = platform === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePlatformChange(p.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs font-medium transition-all ${
                    isSelected
                      ? `${p.color} border-2 shadow-xs font-bold scale-[1.02]`
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base">{p.icon}</span>
                  <span className="truncate">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Account & Date row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Account selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-gray-400" />
              Business Account (GSTIN)
            </label>
            <select
              value={businessAccount}
              onChange={(e) => setBusinessAccount(e.target.value)}
              className="input text-xs w-full py-2"
              required
            >
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.tradeName || a.name} ({a.gstin})
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              Spend Date
            </label>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="input text-xs w-full py-2"
              required
            />
          </div>
        </div>

        {/* Amount Input with Quick Pills */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <IndianRupee className="w-3.5 h-3.5 text-primary-600" />
              Ad Spend Amount (₹)
            </span>
            <span className="text-[11px] font-normal text-gray-500">Enter in Rupees</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-sm font-bold text-gray-400">₹</span>
            <input
              type="number"
              step="0.01"
              min="1"
              placeholder="e.g. 500"
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value === '' ? '' : Number(e.target.value))}
              className="input text-sm pl-7 font-bold text-gray-900 w-full py-2"
              required
              autoFocus
            />
          </div>

          {/* Quick amount shortcuts */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Quick Add:</span>
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmountRupees((prev) => (Number(prev) || 0) + amt)}
                className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700 hover:bg-purple-100 hover:text-purple-700 transition-colors"
              >
                +₹{amt}
              </button>
            ))}
            {amountRupees !== '' && (
              <button
                type="button"
                onClick={() => setAmountRupees('')}
                className="px-2 py-0.5 rounded text-[10px] text-red-500 hover:bg-red-50 transition-colors ml-auto"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Campaign Description */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5 text-gray-400" />
            Campaign Name / Description
          </label>
          <input
            type="text"
            placeholder="e.g. Meesho CPC Discovery Ads - Perfume 100ml"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input text-xs w-full py-2"
            required
          />
        </div>

        {/* Paid By & Payment Method */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-gray-400" />
              Paid By
            </label>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="input text-xs w-full py-2"
            >
              <option value="business">Company / Business Account</option>
              {partners.map((p) => (
                <option key={p._id} value={p._id}>
                  Partner: {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-gray-400" />
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="input text-xs w-full py-2"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Additional Notes (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Boosted during weekend sale"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input text-xs w-full py-2"
          />
        </div>
      </form>
    </Modal>
  );
};

export default AdSpendModal;
