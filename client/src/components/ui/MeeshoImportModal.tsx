import React, { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  FileSpreadsheet,
  UploadCloud,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Package,
  RotateCcw,
  Tag,
  Check,
  X,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { ordersApi } from '../../services/orders.service';
import { useAccountStore } from '../../store/accountStore';
import { formatCurrency, formatDate } from '../../lib/utils';
import Modal from './Modal';
import toast from 'react-hot-toast';

interface MeeshoImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface PreviewData {
  totalRows: number;
  returnsCount: number;
  ordersCount: number;
  uniqueSkusCount: number;
  previewRows: Array<{
    rowNumber: number;
    subOrderId: string;
    orderDate: string;
    sku: string;
    productName?: string;
    quantity: number;
    sellingPrice: number;
    status: string;
    isReturn: boolean;
    returnType?: string;
    shippingLabelId?: string;
    carrierName?: string;
    rawStatus?: string;
  }>;
  allRows: any[];
}

interface ImportResultSummary {
  totalRows: number;
  ordersCreated: number;
  ordersUpdated: number;
  ordersSkipped: number;
  returnsCreated: number;
  productsAutoCreated: number;
  errors: Array<{ rowNumber: number; subOrderId?: string; error: string }>;
}

export const MeeshoImportModal: React.FC<MeeshoImportModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { activeAccountId, accounts } = useAccountStore();
  const qc = useQueryClient();

  const [selectedAccount, setSelectedAccount] = useState<string>(
    activeAccountId && activeAccountId !== 'all' ? activeAccountId : accounts[0]?._id || ''
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [skipHoldAndReady, setSkipHoldAndReady] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ImportResultSummary | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync selected account when activeAccountId changes
  React.useEffect(() => {
    if (activeAccountId && activeAccountId !== 'all') {
      setSelectedAccount(activeAccountId);
    } else if (accounts.length > 0 && !selectedAccount) {
      setSelectedAccount(accounts[0]._id);
    }
  }, [activeAccountId, accounts]);

  const handleReset = () => {
    setSelectedFile(null);
    setPreview(null);
    setResult(null);
    setIsParsing(false);
    setIsImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Download official sample Excel template
  const handleDownloadTemplate = async () => {
    try {
      const res = await ordersApi.downloadSampleTemplate();
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Meesho_Orders_Sample_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Sample template downloaded!');
    } catch {
      toast.error('Failed to download sample template');
    }
  };

  // Process chosen Excel file
  const handleFileChange = async (file: File, overrideSkip?: boolean) => {
    if (!file) return;

    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const hasValidExt = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!hasValidExt) {
      toast.error('Please upload an Excel file (.xlsx, .xls) or CSV file');
      return;
    }

    setSelectedFile(file);
    setIsParsing(true);
    setResult(null);

    const useSkip = overrideSkip !== undefined ? overrideSkip : skipHoldAndReady;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('skipHoldAndReadyToShip', useSkip ? 'true' : 'false');

    try {
      const res = await ordersApi.previewImport(formData);
      if (res.data?.success && res.data.data) {
        setPreview(res.data.data);
        toast.success(`Parsed ${res.data.data.totalRows} orders/returns from Excel!`);
      } else {
        toast.error('Failed to parse file: No valid rows detected.');
        setPreview(null);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error parsing Excel file';
      toast.error(msg);
      setPreview(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Execute Import
  const handleExecuteImport = async () => {
    if (!selectedAccount) {
      toast.error('Please select a Business Account (GSTIN) to import into');
      return;
    }

    if (!preview || !preview.allRows || preview.allRows.length === 0) {
      toast.error('No rows to import');
      return;
    }

    setIsImporting(true);

    try {
      const res = await ordersApi.executeImport({
        businessAccount: selectedAccount,
        rows: preview.allRows,
        skipHoldAndReadyToShip: skipHoldAndReady,
      } as any);

      if (res.data?.success && res.data.data) {
        const sum: ImportResultSummary = res.data.data;
        setResult(sum);

        // Invalidate and refresh all caches
        qc.invalidateQueries({ queryKey: ['orders'] });
        qc.refetchQueries({ queryKey: ['orders'] });
        qc.invalidateQueries({ queryKey: ['returns'] });
        qc.refetchQueries({ queryKey: ['returns'] });
        qc.invalidateQueries({ queryKey: ['products'] });
        qc.invalidateQueries({ queryKey: ['inventory'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
        qc.invalidateQueries({ queryKey: ['analytics'] });

        toast.success(
          `Import complete! ${sum.ordersCreated} orders added, ${sum.returnsCreated} returns created.`
        );
        if (onSuccess) onSuccess();
      } else {
        toast.error('Import failed');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error executing import';
      toast.error(msg);
    } finally {
      setIsImporting(false);
    }
  };

  const getStatusBadge = (status: string, isReturn: boolean, returnType?: string) => {
    if (isReturn || returnType) {
      if (returnType === 'rto_return' || status === 'rto_received' || status === 'rto_in_transit') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
            <RotateCcw className="w-3 h-3" />
            RTO Return
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
          <RotateCcw className="w-3 h-3" />
          Customer Return
        </span>
      );
    }

    switch (status) {
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
            <Check className="w-3 h-3" />
            Delivered
          </span>
        );
      case 'dispatched':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
            Dispatched
          </span>
        );
      case 'packed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
            Packed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Pending
          </span>
        );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Meesho Orders & Returns"
      size="xl"
    >
      <div className="space-y-5">
        {/* Account Selector & Sample Template Download */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Target GSTIN / Business Account <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full text-sm font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="" disabled>
                Select Business Account
              </option>
              {accounts.map((acc) => (
                <option key={acc._id} value={acc._id}>
                  {acc.name} {acc.tradeName ? `(${acc.tradeName})` : ''} - {acc.gstin || 'No GSTIN'}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:self-end">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300 shadow-sm transition"
              title="Download sample format matching Meesho Supplier Panel export"
            >
              <Download className="w-3.5 h-3.5 text-indigo-500" />
              Download Meesho Template
            </button>
          </div>
        </div>

        {/* Shipped/Delivered Filter Checkbox */}
        <div className="flex items-center gap-2 bg-indigo-50/60 dark:bg-indigo-950/20 px-3.5 py-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/40">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-800 dark:text-slate-200 select-none">
            <input
              type="checkbox"
              checked={skipHoldAndReady}
              onChange={(e) => {
                const next = e.target.checked;
                setSkipHoldAndReady(next);
                if (selectedFile) {
                  handleFileChange(selectedFile, next);
                }
              }}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700"
            />
            <span>Only add Shipped, Delivered & Returned orders (Exclude Hold and Ready to Ship)</span>
          </label>
        </div>

        {/* Success / Final Result Screen */}
        {result ? (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-emerald-900 dark:text-emerald-100">
                  Import Processed Successfully!
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  All order and return entries have been matched and registered in your database.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900 shadow-sm">
                <div className="text-xs text-slate-500 dark:text-slate-400">Orders Added</div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  +{result.ordersCreated}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900 shadow-sm">
                <div className="text-xs text-slate-500 dark:text-slate-400">Returns Created</div>
                <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
                  +{result.returnsCreated}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900 shadow-sm">
                <div className="text-xs text-slate-500 dark:text-slate-400">Orders Updated</div>
                <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {result.ordersUpdated}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900 shadow-sm">
                <div className="text-xs text-slate-500 dark:text-slate-400">New SKUs Added</div>
                <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  {result.productsAutoCreated}
                </div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-red-800 dark:text-red-300 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {result.errors.length} rows encountered issues:
                </div>
                <ul className="text-xs text-red-700 dark:text-red-400 space-y-1 max-h-28 overflow-y-auto pl-4 list-disc">
                  {result.errors.slice(0, 10).map((err, i) => (
                    <li key={i}>
                      Row {err.rowNumber} ({err.subOrderId || 'N/A'}): {err.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300 transition"
              >
                Import Another File
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* File Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                  : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 bg-slate-50/50 dark:bg-slate-900/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />

              <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-sm">
                <UploadCloud className="w-6 h-6" />
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {selectedFile ? (
                    <span className="text-indigo-600 dark:text-indigo-400">
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                  ) : (
                    <>Click to browse or drag and drop your Meesho Excel file</>
                  )}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Supports Meesho Sub-Orders report, Returns & RTO sheet (.xlsx, .xls, .csv)
                </p>
              </div>

              {isParsing && (
                <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 mt-1 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Analyzing columns and detecting orders & returns...
                </div>
              )}
            </div>

            {/* Preview Section */}
            {preview && (
              <div className="space-y-4">
                {/* Stats Header */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                      <Package className="w-3.5 h-3.5 text-indigo-500" /> Total Rows
                    </div>
                    <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {preview.totalRows}
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                      <RotateCcw className="w-3.5 h-3.5 text-orange-500" /> Returns Detected
                    </div>
                    <div className="text-lg font-bold text-orange-600 dark:text-orange-400 mt-0.5">
                      {preview.returnsCount}
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                      <Tag className="w-3.5 h-3.5 text-emerald-500" /> Unique SKUs
                    </div>
                    <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {preview.uniqueSkusCount}
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                      <FileText className="w-3.5 h-3.5 text-blue-500" /> Orders Ready
                    </div>
                    <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {preview.ordersCount}
                    </div>
                  </div>
                </div>

                {/* Table Preview */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-slate-100/70 dark:bg-slate-800/70 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Previewing First {preview.previewRows.length} of {preview.totalRows} Entries
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Returns & RTOs automatically identified
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                      <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="py-2 px-3">Sub Order No</th>
                          <th className="py-2 px-3">SKU</th>
                          <th className="py-2 px-3">Qty</th>
                          <th className="py-2 px-3">Price</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3">AWB / Courier</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {preview.previewRows.map((r, idx) => (
                          <tr
                            key={idx}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                          >
                            <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100 font-mono">
                              {r.subOrderId}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                              {r.sku}
                            </td>
                            <td className="py-2 px-3">{r.quantity}</td>
                            <td className="py-2 px-3 font-medium">
                              {formatCurrency(r.sellingPrice)}
                            </td>
                            <td className="py-2 px-3">
                              {getStatusBadge(r.status, r.isReturn, r.returnType)}
                            </td>
                            <td className="py-2 px-3 text-slate-500">
                              {r.shippingLabelId ? (
                                <span className="font-mono">{r.shippingLabelId}</span>
                              ) : (
                                '-'
                              )}
                              {r.carrierName && (
                                <span className="text-[10px] block text-slate-400">
                                  {r.carrierName}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Import Confirmation & Action Buttons */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  >
                    Clear & Choose Other
                  </button>

                  <button
                    type="button"
                    disabled={isImporting || !selectedAccount}
                    onClick={handleExecuteImport}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-500/20 transition"
                  >
                    {isImporting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Importing {preview.totalRows} entries...
                      </>
                    ) : (
                      <>
                        Confirm & Import {preview.totalRows} Entries
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
