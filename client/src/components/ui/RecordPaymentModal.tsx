import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet,
  Calendar,
  Building,
  CreditCard,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import Modal from './Modal';
import { paymentsApi } from '../../services/payments.service';
import { useAccountStore } from '../../store/accountStore';
import { formatCurrency, rupeesToPaise, paiseToRupees } from '../../lib/utils';
import toast from 'react-hot-toast';
import type { Payment, PaymentStatus } from '../../types';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingPayment?: Payment | null;
  onSuccess?: () => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  editingPayment,
  onSuccess,
}) => {
  const qc = useQueryClient();
  const { accounts, activeAccountId } = useAccountStore();

  const [accountId, setAccountId] = useState<string>('');
  const [status, setStatus] = useState<PaymentStatus>('completed');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [neftId, setNeftId] = useState<string>('');
  const [bankName, setBankName] = useState<string>('Axis Bank');
  const [ordersAmountRupees, setOrdersAmountRupees] = useState<number | ''>('');
  const [adsCostRupees, setAdsCostRupees] = useState<number | ''>('');
  const [programCostRupees, setProgramCostRupees] = useState<number | ''>('');
  const [programBenefitsRupees, setProgramBenefitsRupees] = useState<number | ''>('');
  const [referralEarningsRupees, setReferralEarningsRupees] = useState<number | ''>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (editingPayment) {
      setAccountId(
        typeof editingPayment.businessAccount === 'string'
          ? editingPayment.businessAccount
          : editingPayment.businessAccount._id
      );
      setStatus(editingPayment.status);
      setPaymentDate(new Date(editingPayment.paymentDate).toISOString().slice(0, 10));
      setNeftId(editingPayment.neftId || '');
      setBankName(editingPayment.bankName || 'Axis Bank');
      setOrdersAmountRupees(paiseToRupees(editingPayment.ordersAmount));
      setAdsCostRupees(editingPayment.adsCost ? paiseToRupees(editingPayment.adsCost) : '');
      setProgramCostRupees(editingPayment.programCost ? paiseToRupees(editingPayment.programCost) : '');
      setProgramBenefitsRupees(editingPayment.programBenefits ? paiseToRupees(editingPayment.programBenefits) : '');
      setReferralEarningsRupees(editingPayment.referralEarnings ? paiseToRupees(editingPayment.referralEarnings) : '');
      setNotes(editingPayment.notes || '');
    } else {
      setAccountId(activeAccountId !== 'all' ? activeAccountId : accounts[0]?._id || '');
      setStatus('completed');
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setNeftId('');
      setBankName('Axis Bank');
      setOrdersAmountRupees('');
      setAdsCostRupees('');
      setProgramCostRupees('');
      setProgramBenefitsRupees('');
      setReferralEarningsRupees('');
      setNotes('');
    }
  }, [editingPayment, activeAccountId, accounts, isOpen]);

  // Compute live net amount
  const numOrders = typeof ordersAmountRupees === 'number' ? ordersAmountRupees : 0;
  const numAds = typeof adsCostRupees === 'number' ? adsCostRupees : 0;
  const numProg = typeof programCostRupees === 'number' ? programCostRupees : 0;
  const numBenefits = typeof programBenefitsRupees === 'number' ? programBenefitsRupees : 0;
  const numReferral = typeof referralEarningsRupees === 'number' ? referralEarningsRupees : 0;

  const liveNetRupees = numOrders - (numAds + numProg) + (numBenefits + numReferral);
  const liveNetPaise = Math.round(liveNetRupees * 100);

  const mutation = useMutation({
    mutationFn: (payload: any) => {
      if (editingPayment) {
        return paymentsApi.update(editingPayment._id, payload);
      }
      return paymentsApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['payments-dashboard'] });
      toast.success(
        editingPayment
          ? 'Payment record updated successfully'
          : `Payment receive of ₹${liveNetRupees.toFixed(2)} recorded successfully!`
      );
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to save payment record');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) {
      toast.error('Please select a GSTIN business account');
      return;
    }
    if (ordersAmountRupees === '' || Number(ordersAmountRupees) < 0) {
      toast.error('Please enter a valid Orders amount');
      return;
    }

    const payload = {
      businessAccount: accountId,
      status,
      paymentDate: new Date(paymentDate).toISOString(),
      neftId: neftId.trim() || undefined,
      bankName: bankName.trim() || 'Axis Bank',
      ordersAmount: rupeesToPaise(Number(ordersAmountRupees)),
      adsCost: rupeesToPaise(Number(adsCostRupees || 0)),
      programCost: rupeesToPaise(Number(programCostRupees || 0)),
      programBenefits: rupeesToPaise(Number(programBenefitsRupees || 0)),
      referralEarnings: rupeesToPaise(Number(referralEarningsRupees || 0)),
      netAmount: liveNetPaise,
      notes: notes.trim() || undefined,
    };

    mutation.mutate(payload);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingPayment ? 'Edit Payment Record' : 'Record Payment Receive'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Status Toggle & Account */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Business Account (GSTIN) *
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
              className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-3 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            >
              <option value="" disabled>Select Business Account</option>
              {accounts.map((acc) => (
                <option key={acc._id} value={acc._id}>
                  {acc.tradeName || acc.name} ({acc.gstin})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Payment Status *
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setStatus('completed')}
                className={`py-1.5 text-xs font-bold rounded-md transition ${
                  status === 'completed'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                Completed (Credited)
              </button>
              <button
                type="button"
                onClick={() => setStatus('upcoming')}
                className={`py-1.5 text-xs font-bold rounded-md transition ${
                  status === 'upcoming'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                Upcoming
              </button>
            </div>
          </div>
        </div>

        {/* Date & NEFT / Bank */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Payout Date *
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
              className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-3 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              NEFT / UTR ID {status === 'completed' ? '(Recommended)' : '(Optional)'}
            </label>
            <input
              type="text"
              placeholder="e.g. AXISCN1536203342"
              value={neftId}
              onChange={(e) => setNeftId(e.target.value)}
              className="w-full text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-3 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500 focus:outline-none uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Bank Name
            </label>
            <input
              type="text"
              placeholder="e.g. Axis Bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-3 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Amount Breakdown Section (Meesho Style) */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/80 pb-2">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-primary-500" />
              Meesho Payout Breakdown
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Amounts in Rupees (₹)</span>
          </div>

          {/* Orders: Sales and returns */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                1. Orders (Sales and returns) *
              </label>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">+ Credit</span>
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 font-medium text-xs">
                ₹
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00 (e.g. 1225.66 or 803.86)"
                value={ordersAmountRupees}
                onChange={(e) => setOrdersAmountRupees(e.target.value === '' ? '' : Number(e.target.value))}
                required
                className="w-full text-xs pl-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/90 px-3 py-2 font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Recoveries (Deductions) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Ads Cost (Recovery)
                </label>
                <span className="text-[10px] text-rose-500 dark:text-rose-400 font-bold">- Debit</span>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 font-medium text-xs">
                  ₹
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={adsCostRupees}
                  onChange={(e) => setAdsCostRupees(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full text-xs pl-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/90 px-3 py-1.5 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Program Cost (Recovery)
                </label>
                <span className="text-[10px] text-rose-500 dark:text-rose-400 font-bold">- Debit</span>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 font-medium text-xs">
                  ₹
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={programCostRupees}
                  onChange={(e) => setProgramCostRupees(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full text-xs pl-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/90 px-3 py-1.5 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Compensations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Program Benefits
                </label>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">+ Credit</span>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 font-medium text-xs">
                  ₹
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={programBenefitsRupees}
                  onChange={(e) => setProgramBenefitsRupees(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full text-xs pl-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/90 px-3 py-1.5 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Referral Earnings
                </label>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">+ Credit</span>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 font-medium text-xs">
                  ₹
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={referralEarningsRupees}
                  onChange={(e) => setReferralEarningsRupees(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full text-xs pl-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/90 px-3 py-1.5 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Computed Net Amount Banner */}
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/80 flex items-center justify-between bg-emerald-50/80 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/60">
            <div>
              <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 block">
                Net Payout Amount:
              </span>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Credited directly to bank account
              </p>
            </div>
            <div className="text-right">
              <span className="text-xl font-black text-emerald-700 dark:text-emerald-400 block tracking-tight">
                ₹{liveNetRupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                {liveNetPaise} paise
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Notes / Details (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Sales and returns settlement from Meesho"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-3 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500 focus:outline-none"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition border border-slate-200 dark:border-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-5 py-2 text-xs font-bold bg-primary-600 hover:bg-primary-700 active:scale-98 text-white rounded-lg shadow-sm hover:shadow-md transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : editingPayment ? 'Update Payment' : 'Save Payment Receive'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default RecordPaymentModal;
