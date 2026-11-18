import React, { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  FileText,
  Building,
} from 'lucide-react';
import Modal from './Modal';
import { paymentsApi } from '../../services/payments.service';
import { useAccountStore } from '../../store/accountStore';
import toast from 'react-hot-toast';

interface PaymentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const PaymentImportModal: React.FC<PaymentImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const qc = useQueryClient();
  const { accounts, activeAccountId } = useAccountStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    activeAccountId !== 'all' ? activeAccountId : accounts[0]?._id || ''
  );
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<any | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validExtensions = ['.xlsx', '.xls', '.csv'];
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!validExtensions.includes(ext)) {
        toast.error('Please upload an Excel (.xlsx, .xls) or CSV file');
        return;
      }
      setSelectedFile(file);
      setImportResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const validExtensions = ['.xlsx', '.xls', '.csv'];
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!validExtensions.includes(ext)) {
        toast.error('Please upload an Excel (.xlsx, .xls) or CSV file');
        return;
      }
      setSelectedFile(file);
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast.error('Please select a payment file to upload');
      return;
    }
    if (!selectedAccountId) {
      toast.error('Please select a business account (GSTIN)');
      return;
    }

    try {
      setIsImporting(true);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('businessAccount', selectedAccountId);

      const res = await paymentsApi.importSheet(formData);
      setImportResult(res.data.data);
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['payments-dashboard'] });
      toast.success(res.data.message || 'Payment sheet imported successfully!');
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to import payment sheet');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setImportResult(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Upload Meesho Payment Sheet"
      size="md"
    >
      <div className="space-y-4">
        {/* Business Account Select */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Business Account (GSTIN) *
          </label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full text-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none"
          >
            <option value="" disabled>Select Business Account</option>
            {accounts.map((acc) => (
              <option key={acc._id} value={acc._id}>
                {acc.tradeName || acc.name} ({acc.gstin})
              </option>
            ))}
          </select>
        </div>

        {/* Drag & Drop Upload Zone */}
        {!importResult ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 hover:border-primary-500 rounded-xl p-6 text-center cursor-pointer transition bg-gray-50/70 hover:bg-gray-100/70"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />
            <div className="w-12 h-12 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <UploadCloud className="w-6 h-6" />
            </div>
            {selectedFile ? (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-900 flex items-center justify-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  {selectedFile.name}
                </p>
                <p className="text-[11px] text-gray-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB — Click to change file
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-800">
                  Drop your Meesho Payment export file here
                </p>
                <p className="text-[11px] text-gray-500">
                  Supports .xlsx, .xls, or .csv downloaded from Meesho Payments
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Import Result Banner */
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <h4 className="text-sm font-bold text-emerald-900">
              Payment Import Complete!
            </h4>
            <div className="grid grid-cols-3 gap-2 pt-2">
              <div className="bg-white p-2 rounded-lg border border-emerald-100">
                <span className="text-[10px] text-gray-500 block">Total Rows</span>
                <span className="text-sm font-bold text-gray-900">
                  {importResult.totalRows}
                </span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-emerald-100">
                <span className="text-[10px] text-gray-500 block">Created</span>
                <span className="text-sm font-bold text-emerald-600">
                  +{importResult.paymentsCreated}
                </span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-emerald-100">
                <span className="text-[10px] text-gray-500 block">Updated</span>
                <span className="text-sm font-bold text-blue-600">
                  {importResult.paymentsUpdated}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 rounded-lg transition border border-gray-300"
          >
            {importResult ? 'Close' : 'Cancel'}
          </button>
          {!importResult && (
            <button
              type="button"
              onClick={handleImport}
              disabled={!selectedFile || isImporting}
              className="px-4 py-2 text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white rounded-lg shadow-xs hover:shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {isImporting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {isImporting ? 'Importing...' : 'Upload & Process'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default PaymentImportModal;
