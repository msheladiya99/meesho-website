import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  RotateCcw,
  Settings,
  Receipt,
  History,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  Search,
  Filter,
  RefreshCw,
  Info,
  DollarSign,
  Package,
  Layers,
  Calendar,
} from 'lucide-react';
import { customerReturnChargeApi } from '../services/customerReturnCharge.service';
import { useAccountStore } from '../store/accountStore';
import { useAuthStore } from '../store/authStore';
import { formatCurrency, formatDate, formatDateTime, dateRangePresets } from '../lib/utils';
import DateRangePicker from '../components/ui/DateRangePicker';
import Modal from '../components/ui/Modal';
import { LoadingSpinner, EmptyState } from '../components/ui/Feedback';
import type {
  ChargeCalculationType,
  HandlingCalculationType,
  DateRange,
} from '../types';
import axios from '../lib/axios';

const CustomerReturnChargesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeAccountId, accounts } = useAccountStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  // Active Top Tab
  const [activeTab, setActiveTab] = useState<'settings' | 'records' | 'recalculate'>('settings');

  // Categories list query for scope selectors
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await axios.get('/categories');
      return res.data?.data || [];
    },
  });
  const categories: Array<{ _id: string; name: string }> = categoriesData || [];

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB 1: SETTINGS STATE & LOGIC
  // ─────────────────────────────────────────────────────────────────────────────
  const { data: settingsData, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['returnChargeSettings', activeAccountId],
    queryFn: () =>
      customerReturnChargeApi.getSettings(
        activeAccountId === 'all' ? undefined : { accountId: activeAccountId }
      ),
  });

  const activeSettings = settingsData?.data?.data?.activeSettings;

  // Form states
  const [isEditing, setIsEditing] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [calcType, setCalcType] = useState<ChargeCalculationType>('fixed_order');
  const [chargeAmountRupees, setChargeAmountRupees] = useState<string>('60');
  const [percentageRate, setPercentageRate] = useState<string>('5');
  const [hasHandling, setHasHandling] = useState(false);
  const [handlingCalcType, setHandlingCalcType] = useState<HandlingCalculationType>('fixed_order');
  const [handlingAmountRupees, setHandlingAmountRupees] = useState<string>('10');
  const [effectiveDate, setEffectiveDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [accountScope, setAccountScope] = useState<'all' | 'selected'>('all');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [categoryScope, setCategoryScope] = useState<'all' | 'selected'>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [notes, setNotes] = useState<string>('');

  // Sample order interactive calculator
  const [sampleOrderValueRupees, setSampleOrderValueRupees] = useState<string>('499');
  const [sampleReturnedUnits, setSampleReturnedUnits] = useState<string>('1');

  // Populate form when settings load
  React.useEffect(() => {
    if (activeSettings) {
      setIsEnabled(activeSettings.isEnabled);
      setCalcType(activeSettings.calculationType || 'fixed_order');
      setChargeAmountRupees(((activeSettings.chargeAmount || 0) / 100).toString());
      setPercentageRate((activeSettings.percentageRate || 0).toString());
      setHasHandling(!!activeSettings.hasHandlingCharge);
      setHandlingCalcType(activeSettings.handlingCalculationType || 'fixed_order');
      setHandlingAmountRupees(((activeSettings.handlingChargeAmount || 0) / 100).toString());
      if (activeSettings.effectiveFrom) {
        setEffectiveDate(new Date(activeSettings.effectiveFrom).toISOString().slice(0, 10));
      }
      setAccountScope(activeSettings.businessAccountScope || 'all');
      setSelectedAccounts(
        (activeSettings.applicableAccounts || []).map((a: any) =>
          typeof a === 'string' ? a : a._id
        )
      );
      setCategoryScope(activeSettings.categoryScope || 'all');
      setSelectedCategories(
        (activeSettings.applicableCategories || []).map((c: any) =>
          typeof c === 'string' ? c : c._id
        )
      );
      setNotes(activeSettings.notes || '');
    }
  }, [activeSettings]);

  const saveSettingsMutation = useMutation({
    mutationFn: (payload: any) => customerReturnChargeApi.updateSettings(payload),
    onSuccess: () => {
      toast.success('Customer return charge settings saved successfully!');
      queryClient.invalidateQueries({ queryKey: ['returnChargeSettings'] });
      queryClient.invalidateQueries({ queryKey: ['returnChargeRecords'] });
      queryClient.invalidateQueries({ queryKey: ['pnl'] });
      setIsEditing(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

  const handleSaveSettings = () => {
    const chargePaise = Math.round((parseFloat(chargeAmountRupees) || 0) * 100);
    const handlingPaise = hasHandling
      ? Math.round((parseFloat(handlingAmountRupees) || 0) * 100)
      : 0;
    const rate = parseFloat(percentageRate) || 0;

    saveSettingsMutation.mutate({
      settingsId: activeSettings?._id,
      isEnabled,
      calculationType: calcType,
      chargeAmount: chargePaise,
      percentageRate: rate,
      hasHandlingCharge: hasHandling,
      handlingCalculationType: handlingCalcType,
      handlingChargeAmount: handlingPaise,
      effectiveFrom: effectiveDate,
      businessAccountScope: accountScope,
      applicableAccounts: accountScope === 'selected' ? selectedAccounts : [],
      categoryScope,
      applicableCategories: categoryScope === 'selected' ? selectedCategories : [],
      notes,
    });
  };

  const handleResetSettings = () => {
    if (activeSettings) {
      setIsEnabled(activeSettings.isEnabled);
      setCalcType(activeSettings.calculationType || 'fixed_order');
      setChargeAmountRupees(((activeSettings.chargeAmount || 0) / 100).toString());
      setPercentageRate((activeSettings.percentageRate || 0).toString());
      setHasHandling(!!activeSettings.hasHandlingCharge);
      setHandlingCalcType(activeSettings.handlingCalculationType || 'fixed_order');
      setHandlingAmountRupees(((activeSettings.handlingChargeAmount || 0) / 100).toString());
      if (activeSettings.effectiveFrom) {
        setEffectiveDate(new Date(activeSettings.effectiveFrom).toISOString().slice(0, 10));
      }
      setAccountScope(activeSettings.businessAccountScope || 'all');
      setSelectedAccounts(
        (activeSettings.applicableAccounts || []).map((a: any) =>
          typeof a === 'string' ? a : a._id
        )
      );
      setCategoryScope(activeSettings.categoryScope || 'all');
      setSelectedCategories(
        (activeSettings.applicableCategories || []).map((c: any) =>
          typeof c === 'string' ? c : c._id
        )
      );
      setNotes(activeSettings.notes || '');
    }
    setIsEditing(false);
  };

  // Live calculator calculation
  const sampleVal = Math.max(0, parseFloat(sampleOrderValueRupees) || 0);
  const sampleQty = Math.max(1, parseInt(sampleReturnedUnits, 10) || 1);
  let sampleBase = 0;
  if (calcType === 'fixed_order') {
    sampleBase = Math.max(0, parseFloat(chargeAmountRupees) || 0);
  } else if (calcType === 'fixed_unit') {
    sampleBase = Math.max(0, parseFloat(chargeAmountRupees) || 0) * sampleQty;
  } else {
    sampleBase = (sampleVal * (parseFloat(percentageRate) || 0)) / 100;
  }
  let sampleHandling = 0;
  if (hasHandling) {
    if (handlingCalcType === 'fixed_unit') {
      sampleHandling = (parseFloat(handlingAmountRupees) || 0) * sampleQty;
    } else {
      sampleHandling = parseFloat(handlingAmountRupees) || 0;
    }
  }
  const sampleTotal = isEnabled ? sampleBase + sampleHandling : 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB 2: RECORDS STATE & LOGIC
  // ─────────────────────────────────────────────────────────────────────────────
  const [recordsDateRange, setRecordsDateRange] = useState<DateRange>(
    dateRangePresets().thisMonth
  );
  const [recordsCategory, setRecordsCategory] = useState<string>('all');
  const [recordsStatus, setRecordsStatus] = useState<string>('all');
  const [recordsSearch, setRecordsSearch] = useState<string>('');
  const [recordsPage, setRecordsPage] = useState<number>(1);
  const recordsLimit = 25;

  const recordsParams = {
    accountId: activeAccountId === 'all' ? undefined : activeAccountId,
    categoryId: recordsCategory === 'all' ? undefined : recordsCategory,
    status: recordsStatus === 'all' ? undefined : recordsStatus,
    startDate: recordsDateRange.startDate,
    endDate: recordsDateRange.endDate,
    search: recordsSearch.trim() || undefined,
    page: recordsPage,
    limit: recordsLimit,
  };

  const { data: recordsData, isLoading: isLoadingRecords } = useQuery({
    queryKey: ['returnChargeRecords', recordsParams],
    queryFn: () => customerReturnChargeApi.getRecords(recordsParams),
  });

  const records = recordsData?.data?.data?.records || [];
  const recordsTotal = recordsData?.data?.data?.total || 0;
  const recordsTotalPages = recordsData?.data?.data?.totalPages || 1;
  const recordsSummary = recordsData?.data?.data?.summary || {
    totalBaseCharge: 0,
    totalHandlingCharge: 0,
    totalCharge: 0,
    appliedCount: 0,
    reversedCount: 0,
  };

  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const handleExportCsv = async () => {
    try {
      setIsExportingCsv(true);
      const res = await customerReturnChargeApi.exportCsv({
        accountId: activeAccountId === 'all' ? undefined : activeAccountId,
        categoryId: recordsCategory === 'all' ? undefined : recordsCategory,
        status: recordsStatus === 'all' ? undefined : recordsStatus,
        startDate: recordsDateRange.startDate,
        endDate: recordsDateRange.endDate,
        search: recordsSearch.trim() || undefined,
      });

      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Customer_Return_Charges_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('CSV export generated successfully');
    } catch {
      toast.error('Failed to export CSV');
    } finally {
      setIsExportingCsv(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB 3: RECALCULATION STATE & LOGIC
  // ─────────────────────────────────────────────────────────────────────────────
  const [recalcDateRange, setRecalcDateRange] = useState<DateRange>(
    dateRangePresets().thisMonth
  );
  const [recalcCategory, setRecalcCategory] = useState<string>('all');
  const [recalcAccount, setRecalcAccount] = useState<string>(activeAccountId);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);

  const previewMutation = useMutation({
    mutationFn: (payload: any) => customerReturnChargeApi.previewRecalculation(payload),
    onSuccess: (res) => {
      setPreviewData(res.data?.data);
      toast.success('Recalculation preview computed!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to preview recalculation');
    },
  });

  const executeRecalcMutation = useMutation({
    mutationFn: (payload: any) => customerReturnChargeApi.executeRecalculation(payload),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Recalculation executed successfully!');
      setIsConfirmModalOpen(false);
      setConfirmCheckbox(false);
      setPreviewData(null);
      queryClient.invalidateQueries({ queryKey: ['returnChargeRecords'] });
      queryClient.invalidateQueries({ queryKey: ['pnl'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to execute recalculation');
    },
  });

  const handleComputePreview = () => {
    previewMutation.mutate({
      accountId: recalcAccount === 'all' ? undefined : recalcAccount,
      categoryId: recalcCategory === 'all' ? undefined : recalcCategory,
      startDate: recalcDateRange.startDate,
      endDate: recalcDateRange.endDate,
    });
  };

  const handleExecuteRecalc = () => {
    if (!confirmCheckbox) {
      toast.error('Please check the confirmation box to proceed.');
      return;
    }
    executeRecalcMutation.mutate({
      accountId: recalcAccount === 'all' ? undefined : recalcAccount,
      categoryId: recalcCategory === 'all' ? undefined : recalcCategory,
      startDate: recalcDateRange.startDate,
      endDate: recalcDateRange.endDate,
      confirm: true,
    });
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center text-primary-600">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                Customer Return Charges
              </h1>
              <p className="text-xs text-gray-500">
                Manage return expense policies, audit return fee logs, and integrate with Profit & Loss
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation Pills */}
        <div className="flex items-center gap-1 p-1 bg-gray-100/80 rounded-xl">
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'settings'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </button>
          <button
            onClick={() => setActiveTab('records')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'records'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            Return Records
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('recalculate')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'recalculate'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Recalculation
            </button>
          )}
        </div>
      </div>

      {/* RTO Notice Banner */}
      <div className="flex items-start gap-3 p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900 leading-relaxed">
        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">Business Rule Enforcement: </span>
          Customer return charges apply <strong>only to Customer Returns</strong>. 
          RTO orders (Return to Origin) never receive customer return charges and are excluded from customer return expense calculations.
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: SETTINGS VIEW */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Settings Form */}
          <div className="lg:col-span-2 card p-5 sm:p-6 space-y-6">
            {/* Status bar */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isEnabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                  }`}
                />
                <span className="text-sm font-semibold text-gray-900">
                  Status:{' '}
                  <span className={isEnabled ? 'text-green-700 font-bold' : 'text-gray-500'}>
                    {isEnabled ? 'Active & Charging' : 'Disabled'}
                  </span>
                </span>
                {activeSettings?.settingsVersion && (
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium ml-1">
                    v{activeSettings.settingsVersion}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isAdmin && !isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="btn btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Edit Charges
                  </button>
                ) : isAdmin ? (
                  <button
                    onClick={handleResetSettings}
                    className="btn btn-secondary text-xs py-1.5 px-3 text-gray-600"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>

            {/* Toggle Enable/Disable */}
            <div className="flex items-center justify-between p-4 bg-gray-50/70 border border-gray-100 rounded-xl">
              <div>
                <p className="text-sm font-semibold text-gray-900">Enable Customer Return Charges</p>
                <p className="text-xs text-gray-500">
                  When enabled, eligible customer returns will automatically record return charges in P&L
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isEditing}
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600 peer-disabled:opacity-50"></div>
              </label>
            </div>

            {/* Calculation Type Selector */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Charge Calculation Type
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    type: 'fixed_order' as const,
                    title: 'Fixed Per Order',
                    desc: 'Fixed ₹ charge applied once per returned order regardless of quantity',
                  },
                  {
                    type: 'fixed_unit' as const,
                    title: 'Fixed Per Unit',
                    desc: 'Fixed ₹ charge multiplied by the returned perfume quantity',
                  },
                  {
                    type: 'percentage' as const,
                    title: 'Percentage Rate',
                    desc: '% of original order value calculated dynamically',
                  },
                ].map((item) => (
                  <div
                    key={item.type}
                    onClick={() => isEditing && setCalcType(item.type)}
                    className={`p-3.5 rounded-xl border transition-all text-left ${
                      calcType === item.type
                        ? 'border-primary-500 bg-primary-50/40 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    } ${isEditing ? 'cursor-pointer' : 'cursor-default opacity-90'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-gray-900">{item.title}</span>
                      <input
                        type="radio"
                        disabled={!isEditing}
                        checked={calcType === item.type}
                        onChange={() => setCalcType(item.type)}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500 leading-snug">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Charge Amount / Percentage Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Customer Return Charge Amount (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400 font-semibold text-sm">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!isEditing || calcType === 'percentage'}
                    value={chargeAmountRupees}
                    onChange={(e) => setChargeAmountRupees(e.target.value)}
                    placeholder="60.00"
                    className="input pl-8"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  {calcType === 'fixed_order' ? 'Base fee per order' : calcType === 'fixed_unit' ? 'Base fee per returned bottle' : 'Disabled in percentage mode'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Percentage Rate (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    disabled={!isEditing || calcType !== 'percentage'}
                    value={percentageRate}
                    onChange={(e) => setPercentageRate(e.target.value)}
                    placeholder="5.0"
                    className="input pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-gray-400 font-semibold text-sm">%</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Calculated against original order gross value
                </p>
              </div>
            </div>

            {/* Optional Additional Handling Charge */}
            <div className="p-4 bg-gray-50/70 border border-gray-100 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-900">
                    Additional Return Handling Charge (Optional)
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Separate surcharge for perfume inspection, repackaging, or restocking
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isEditing}
                    checked={hasHandling}
                    onChange={(e) => setHasHandling(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600 peer-disabled:opacity-50"></div>
                </label>
              </div>

              {hasHandling && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-200/60">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">
                      Handling Charge Calculation
                    </label>
                    <select
                      disabled={!isEditing}
                      value={handlingCalcType}
                      onChange={(e) => setHandlingCalcType(e.target.value as any)}
                      className="input text-xs"
                    >
                      <option value="fixed_order">Fixed per Order</option>
                      <option value="fixed_unit">Fixed per Returned Unit</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">
                      Handling Charge Amount (₹)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-gray-400 font-semibold text-xs">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={!isEditing}
                        value={handlingAmountRupees}
                        onChange={(e) => setHandlingAmountRupees(e.target.value)}
                        placeholder="10.00"
                        className="input pl-7 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Scope & Date Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Effective From Date
                </label>
                <input
                  type="date"
                  disabled={!isEditing}
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Applicable GST Account
                </label>
                <select
                  disabled={!isEditing}
                  value={accountScope}
                  onChange={(e) => setAccountScope(e.target.value as any)}
                  className="input text-xs"
                >
                  <option value="all">All GST Accounts</option>
                  <option value="selected">Selected GST Account</option>
                </select>
                {accountScope === 'selected' && (
                  <div className="mt-2 space-y-1 max-h-24 overflow-y-auto p-1.5 bg-gray-50 border rounded-lg">
                    {accounts.map((acc) => (
                      <label key={acc._id} className="flex items-center gap-1.5 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          disabled={!isEditing}
                          checked={selectedAccounts.includes(acc._id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedAccounts([...selectedAccounts, acc._id]);
                            } else {
                              setSelectedAccounts(selectedAccounts.filter((id) => id !== acc._id));
                            }
                          }}
                        />
                        <span className="truncate">{acc.tradeName || acc.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Perfume Categories
                </label>
                <select
                  disabled={!isEditing}
                  value={categoryScope}
                  onChange={(e) => setCategoryScope(e.target.value as any)}
                  className="input text-xs"
                >
                  <option value="all">All Categories</option>
                  <option value="selected">Selected Categories</option>
                </select>
                {categoryScope === 'selected' && (
                  <div className="mt-2 space-y-1 max-h-24 overflow-y-auto p-1.5 bg-gray-50 border rounded-lg">
                    {categories.map((cat) => (
                      <label key={cat._id} className="flex items-center gap-1.5 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          disabled={!isEditing}
                          checked={selectedCategories.includes(cat._id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCategories([...selectedCategories, cat._id]);
                            } else {
                              setSelectedCategories(selectedCategories.filter((id) => id !== cat._id));
                            }
                          }}
                        />
                        <span className="truncate">{cat.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            {isEditing && (
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleResetSettings}
                  className="btn btn-secondary text-xs"
                >
                  Cancel / Reset
                </button>
                <button
                  type="button"
                  disabled={saveSettingsMutation.isPending}
                  onClick={handleSaveSettings}
                  className="btn btn-primary text-xs flex items-center gap-1.5"
                >
                  {saveSettingsMutation.isPending ? <LoadingSpinner size="sm" /> : <CheckCircle2 className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Live Calculation Simulation & Meta Info */}
          <div className="space-y-5">
            {/* Live Calculation Preview Card */}
            <div className="card p-5 bg-gradient-to-br from-gray-900 to-gray-800 text-white shadow-md">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-primary-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary-300">
                  Live Calculation Simulator
                </h3>
              </div>
              <p className="text-xs text-gray-300 mb-4">
                Test how the active return rules will apply to a customer return order:
              </p>

              <div className="grid grid-cols-2 gap-2.5 mb-4">
                <div>
                  <label className="text-[10px] text-gray-400 uppercase font-semibold">
                    Order Value (₹)
                  </label>
                  <input
                    type="number"
                    value={sampleOrderValueRupees}
                    onChange={(e) => setSampleOrderValueRupees(e.target.value)}
                    className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs font-semibold focus:outline-hidden focus:border-primary-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 uppercase font-semibold">
                    Returned Qty
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={sampleReturnedUnits}
                    onChange={(e) => setSampleReturnedUnits(e.target.value)}
                    className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs font-semibold focus:outline-hidden focus:border-primary-400"
                  />
                </div>
              </div>

              <div className="space-y-2 py-3 border-t border-b border-gray-700/60 text-xs">
                <div className="flex justify-between text-gray-300">
                  <span>Base Return Charge:</span>
                  <span className="font-semibold text-white">₹{sampleBase.toFixed(2)}</span>
                </div>
                {hasHandling && (
                  <div className="flex justify-between text-gray-300">
                    <span>Handling Charge:</span>
                    <span className="font-semibold text-white">₹{sampleHandling.toFixed(2)}</span>
                  </div>
                )}
                {!isEnabled && (
                  <div className="text-[11px] text-amber-300 italic">
                    Charges disabled: total charge will be ₹0.00
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-xs font-semibold text-gray-300">Total Return Expense:</span>
                <span className="text-xl font-bold text-emerald-400">
                  ₹{sampleTotal.toFixed(2)}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                This ₹{sampleTotal.toFixed(2)} will be debited as an operating expense in Profit & Loss.
              </p>
            </div>

            {/* Metadata Card */}
            <div className="card p-4 space-y-3 text-xs text-gray-600">
              <h4 className="font-semibold text-gray-900 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-gray-400" />
                Audit & Version Details
              </h4>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-400">Settings Version:</span>
                  <span className="font-medium text-gray-800">
                    v{activeSettings?.settingsVersion || 1}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Effective Date:</span>
                  <span className="font-medium text-gray-800">
                    {activeSettings?.effectiveFrom ? formatDate(activeSettings.effectiveFrom) : 'Now'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Last Updated:</span>
                  <span className="font-medium text-gray-800">
                    {activeSettings?.updatedAt ? formatDateTime(activeSettings.updatedAt) : 'N/A'}
                  </span>
                </div>
                {activeSettings?.updatedBy && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Updated By:</span>
                    <span className="font-medium text-gray-800 truncate max-w-[140px]">
                      {(activeSettings.updatedBy as any)?.name || 'Admin'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: RETURN CHARGE RECORDS VIEW */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'records' && (
        <div className="space-y-4">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="stat-card">
              <p className="text-[11px] font-semibold text-gray-500 uppercase">Base Return Charges</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(recordsSummary.totalBaseCharge)}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">{recordsSummary.appliedCount} applied returns</p>
            </div>
            <div className="stat-card">
              <p className="text-[11px] font-semibold text-gray-500 uppercase">Handling Charges</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(recordsSummary.totalHandlingCharge)}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">Repackaging / Inspection</p>
            </div>
            <div className="stat-card border-emerald-100 bg-emerald-50/30">
              <p className="text-[11px] font-semibold text-emerald-800 uppercase">Total Return Expense</p>
              <p className="text-lg sm:text-2xl font-bold text-emerald-700 mt-1">
                {formatCurrency(recordsSummary.totalCharge)}
              </p>
              <p className="text-[10px] text-emerald-600 mt-0.5">Debited to P&L</p>
            </div>
            <div className="stat-card">
              <p className="text-[11px] font-semibold text-gray-500 uppercase">Reversals / Adjustments</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                {recordsSummary.reversedCount}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">Changed to RTO/Cancelled</p>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="card p-3 sm:p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
                <DateRangePicker value={recordsDateRange} onChange={setRecordsDateRange} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Category Filter */}
                <select
                  value={recordsCategory}
                  onChange={(e) => {
                    setRecordsCategory(e.target.value);
                    setRecordsPage(1);
                  }}
                  className="input text-xs py-1.5 h-8 w-auto min-w-[130px]"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                {/* Status Filter */}
                <select
                  value={recordsStatus}
                  onChange={(e) => {
                    setRecordsStatus(e.target.value);
                    setRecordsPage(1);
                  }}
                  className="input text-xs py-1.5 h-8 w-auto"
                >
                  <option value="all">All Statuses</option>
                  <option value="applied">Applied</option>
                  <option value="reversed">Reversed</option>
                  <option value="adjusted">Adjusted</option>
                </select>

                {/* CSV Export Button */}
                <button
                  onClick={handleExportCsv}
                  disabled={isExportingCsv}
                  className="btn btn-secondary text-xs py-1.5 h-8 flex items-center gap-1.5 whitespace-nowrap"
                >
                  {isExportingCsv ? <LoadingSpinner size="sm" /> : <Download className="w-3.5 h-3.5 text-gray-600" />}
                  Export CSV
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by Transaction ID, Order ID, SKU, or Perfume Name..."
                value={recordsSearch}
                onChange={(e) => {
                  setRecordsSearch(e.target.value);
                  setRecordsPage(1);
                }}
                className="input pl-9 text-xs py-1.5 h-9 w-full"
              />
            </div>
          </div>

          {/* Records Table */}
          <div className="card overflow-hidden">
            {isLoadingRecords ? (
              <div className="p-12 flex justify-center">
                <LoadingSpinner />
              </div>
            ) : records.length === 0 ? (
              <EmptyState
                icon={<Receipt className="w-10 h-10" />}
                title="No customer return charge records found"
                description="Eligible customer returns will appear here with calculated charge details."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base w-full text-left text-xs">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100 text-gray-500 uppercase font-semibold text-[10px] tracking-wider">
                      <th className="py-2.5 px-3">Transaction / Order</th>
                      <th className="py-2.5 px-3">Return Date</th>
                      <th className="py-2.5 px-3">GST Account</th>
                      <th className="py-2.5 px-3">Perfume / SKU</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Order Value</th>
                      <th className="py-2.5 px-3">Charge Rate</th>
                      <th className="py-2.5 px-3 text-right">Return Fee</th>
                      <th className="py-2.5 px-3 text-right">Handling Fee</th>
                      <th className="py-2.5 px-3 text-right">Total Expense</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {records.map((r) => {
                      const ord = r.order as any;
                      const orderId =
                        ord?.meeshoOrderId || ord?.subOrderId || (typeof r.order === 'string' ? r.order : r.order?._id);

                      return (
                        <tr key={r._id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-2.5 px-3">
                            <p className="font-semibold text-gray-900">{r.transactionId}</p>
                            <p className="text-[10px] text-gray-400 font-mono">Ord: {orderId}</p>
                          </td>
                          <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                            {formatDate(r.returnDate)}
                          </td>
                          <td className="py-2.5 px-3 text-gray-700">
                            <span className="font-medium truncate block max-w-[120px]">
                              {r.businessAccount?.tradeName || r.businessAccount?.name || 'Account'}
                            </span>
                            <span className="text-[10px] text-gray-400 block font-mono">
                              {r.businessAccount?.gstin}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="font-medium text-gray-900 truncate max-w-[150px]">
                              {r.productName || r.product?.name || 'Perfume'}
                            </p>
                            <p className="text-[10px] text-gray-400 font-mono">{r.sku}</p>
                          </td>
                          <td className="py-2.5 px-3 text-center font-semibold text-gray-800">
                            {r.returnedQuantity}
                          </td>
                          <td className="py-2.5 px-3 text-right text-gray-600">
                            {formatCurrency(r.originalOrderValue)}
                          </td>
                          <td className="py-2.5 px-3 text-gray-600">
                            <span className="badge badge-gray text-[10px]">
                              {r.chargeType === 'percentage'
                                ? `${r.appliedRate}%`
                                : formatCurrency(r.appliedRate)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-gray-700 font-medium">
                            {formatCurrency(r.baseCharge)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-gray-500">
                            {r.handlingCharge > 0 ? formatCurrency(r.handlingCharge) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-gray-900">
                            {formatCurrency(r.totalCharge)}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span
                              className={`badge text-[10px] uppercase font-bold ${
                                r.status === 'applied'
                                  ? 'badge-success'
                                  : r.status === 'reversed'
                                  ? 'badge-danger'
                                  : 'badge-info'
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {recordsTotal > recordsLimit && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-500">
                <span>
                  Showing {(recordsPage - 1) * recordsLimit + 1}–
                  {Math.min(recordsPage * recordsLimit, recordsTotal)} of {recordsTotal}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRecordsPage((p) => Math.max(1, p - 1))}
                    disabled={recordsPage === 1}
                    className="btn btn-secondary py-1 px-2.5 text-xs disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="font-semibold text-gray-700">
                    {recordsPage} / {recordsTotalPages}
                  </span>
                  <button
                    onClick={() => setRecordsPage((p) => Math.min(recordsTotalPages, p + 1))}
                    disabled={recordsPage === recordsTotalPages}
                    className="btn btn-secondary py-1 px-2.5 text-xs disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* TAB 3: HISTORICAL RECALCULATION VIEW (ADMIN ONLY) */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'recalculate' && isAdmin && (
        <div className="space-y-6">
          <div className="card p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  Explicit Historical Recalculation Engine
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed mt-0.5">
                  Normal settings modifications apply only to future customer returns. Use this tool
                  to re-evaluate previous return transactions against the active settings.
                  You can safely preview the exact financial impact on Profit & Loss before confirming.
                </p>
              </div>
            </div>

            {/* Filter scope for recalculation */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-100">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Target GST Account
                </label>
                <select
                  value={recalcAccount}
                  onChange={(e) => setRecalcAccount(e.target.value)}
                  className="input text-xs"
                >
                  <option value="all">All GST Accounts</option>
                  {accounts.map((acc) => (
                    <option key={acc._id} value={acc._id}>
                      {acc.tradeName || acc.name} ({acc.gstin})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Perfume Category Scope
                </label>
                <select
                  value={recalcCategory}
                  onChange={(e) => setRecalcCategory(e.target.value)}
                  className="input text-xs"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Date Range
                </label>
                <DateRangePicker value={recalcDateRange} onChange={setRecalcDateRange} />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleComputePreview}
                disabled={previewMutation.isPending}
                className="btn btn-primary text-xs flex items-center gap-1.5"
              >
                {previewMutation.isPending ? <LoadingSpinner size="sm" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Calculate Recalculation Preview
              </button>
            </div>
          </div>

          {/* Preview Results Display */}
          {previewData && (
            <div className="card p-5 sm:p-6 space-y-5 border-primary-100 bg-primary-50/20 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">
                    Recalculation Impact Analysis
                  </h4>
                  <p className="text-xs text-gray-500">
                    Comparison between historical expenses and active policy
                  </p>
                </div>
                <button
                  onClick={() => setIsConfirmModalOpen(true)}
                  className="btn bg-primary-600 hover:bg-primary-700 text-white text-xs px-4 py-2 font-semibold shadow-xs"
                >
                  Apply Recalculation
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-white rounded-xl border border-gray-100">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">Affected Returns</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{previewData.totalRecords}</p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-gray-100">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">Current Expense (Old)</p>
                  <p className="text-xl font-bold text-gray-700 mt-1">
                    {formatCurrency(previewData.currentTotalExpense)}
                  </p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-gray-100">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">Recalculated (New)</p>
                  <p className="text-xl font-bold text-primary-700 mt-1">
                    {formatCurrency(previewData.newTotalExpense)}
                  </p>
                </div>
                <div
                  className={`p-3 rounded-xl border ${
                    previewData.difference <= 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}
                >
                  <p className="text-[10px] uppercase font-semibold">Net P&L Difference</p>
                  <p className="text-xl font-bold mt-1">
                    {previewData.difference > 0 ? '+' : ''}
                    {formatCurrency(previewData.difference)}
                  </p>
                  <p className="text-[10px] mt-0.5">
                    {previewData.difference <= 0 ? 'Decreases expense (Higher Profit)' : 'Increases expense'}
                  </p>
                </div>
              </div>

              {/* Sample Items Table */}
              {previewData.sampleItems?.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Sample Affected Returns (Top {previewData.sampleItems.length})
                  </h5>
                  <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase">
                          <th className="p-2.5">Tx ID</th>
                          <th className="p-2.5">Order ID</th>
                          <th className="p-2.5 text-center">Qty</th>
                          <th className="p-2.5 text-right">Current Charge</th>
                          <th className="p-2.5 text-right">New Charge</th>
                          <th className="p-2.5 text-right">Difference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {previewData.sampleItems.map((item: any) => (
                          <tr key={item.transactionId}>
                            <td className="p-2.5 font-mono text-[11px] text-gray-900">{item.transactionId}</td>
                            <td className="p-2.5 font-mono text-[11px] text-gray-600">{item.orderId}</td>
                            <td className="p-2.5 text-center">{item.returnedQuantity}</td>
                            <td className="p-2.5 text-right text-gray-600">{formatCurrency(item.currentCharge)}</td>
                            <td className="p-2.5 text-right font-medium text-primary-700">
                              {formatCurrency(item.newCharge)}
                            </td>
                            <td
                              className={`p-2.5 text-right font-bold ${
                                item.diff > 0 ? 'text-amber-600' : item.diff < 0 ? 'text-emerald-600' : 'text-gray-400'
                              }`}
                            >
                              {item.diff > 0 ? '+' : ''}
                              {formatCurrency(item.diff)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Confirmation Modal */}
          <Modal
            isOpen={isConfirmModalOpen}
            onClose={() => setIsConfirmModalOpen(false)}
            title="Confirm Historical Return Charge Recalculation"
            size="md"
            footer={
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!confirmCheckbox || executeRecalcMutation.isPending}
                  onClick={handleExecuteRecalc}
                  className="btn bg-red-600 hover:bg-red-700 text-white text-xs disabled:opacity-40 flex items-center gap-1.5"
                >
                  {executeRecalcMutation.isPending ? <LoadingSpinner size="sm" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  Execute Recalculation
                </button>
              </div>
            }
          >
            <div className="space-y-4 text-xs text-gray-600">
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-800">Irreversible Action Notice</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed">
                    This will update {previewData?.totalRecords || 0} historical customer return transactions.
                    Profit & Loss reports for previous periods will reflect the adjusted return charges.
                    An audit log will be created recording your identity and the exact adjustments.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-gray-50 rounded-xl space-y-1">
                <div className="flex justify-between">
                  <span>Target Records:</span>
                  <span className="font-bold text-gray-900">{previewData?.totalRecords}</span>
                </div>
                <div className="flex justify-between">
                  <span>Net P&L Impact:</span>
                  <span className="font-bold text-gray-900">
                    {previewData ? formatCurrency(previewData.difference) : '—'}
                  </span>
                </div>
              </div>

              <label className="flex items-start gap-2.5 pt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmCheckbox}
                  onChange={(e) => setConfirmCheckbox(e.target.checked)}
                  className="mt-0.5 rounded text-red-600 focus:ring-red-500"
                />
                <span className="text-gray-800 font-medium">
                  I understand and authorize updating historical customer return charges in Profit & Loss.
                </span>
              </label>
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
};

export default CustomerReturnChargesPage;
