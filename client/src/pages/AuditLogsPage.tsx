import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import { formatDateTime } from '../lib/utils';
import { LoadingSpinner } from '../components/ui/Feedback';
import Modal from '../components/ui/Modal';
import {
  ScrollText,
  Search,
  RotateCcw,
  Eye,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  Globe,
  Clock,
  Layers,
  FileCode,
  ArrowRight,
  ShieldAlert,
  PlusCircle,
  Edit,
  Trash2,
  LogIn,
  Download,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

interface AuditLogUser {
  _id?: string;
  name?: string;
  email?: string;
  role?: string;
}

interface AuditLogItem {
  _id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'EXPORT' | string;
  resource: string;
  resourceId?: string;
  user?: AuditLogUser;
  ip?: string;
  userAgent?: string;
  details?: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt?: string;
}

const actionStyles: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
  CREATE: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: <PlusCircle className="w-3.5 h-3.5 mr-1 text-emerald-600" />,
  },
  UPDATE: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: <Edit className="w-3.5 h-3.5 mr-1 text-blue-600" />,
  },
  DELETE: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    icon: <Trash2 className="w-3.5 h-3.5 mr-1 text-rose-600" />,
  },
  LOGIN: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    icon: <LogIn className="w-3.5 h-3.5 mr-1 text-purple-600" />,
  },
  EXPORT: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: <Download className="w-3.5 h-3.5 mr-1 text-amber-600" />,
  },
};

const resourceOptions = [
  'ALL',
  'Order',
  'Product',
  'StockPurchase',
  'StockMovement',
  'ReturnOrder',
  'Expense',
  'BusinessAccount',
  'Partner',
  'Vendor',
  'User',
];

const actionOptions = ['ALL', 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT'];

const AuditLogsPage: React.FC = () => {
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [resourceFilter, setResourceFilter] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['audit-logs', page, actionFilter, resourceFilter, search],
    queryFn: () =>
      api.get('/audit-logs', {
        params: {
          page,
          limit: 10,
          action: actionFilter !== 'ALL' ? actionFilter : undefined,
          resource: resourceFilter !== 'ALL' ? resourceFilter : undefined,
          search: search.trim() ? search.trim() : undefined,
        },
      }),
  });

  const logs: AuditLogItem[] = data?.data?.data || [];
  const total: number = data?.data?.total || 0;
  const totalPages: number = data?.data?.totalPages || Math.ceil(total / 10) || 1;

  if (user?.role !== 'admin') {
    return (
      <div className="card p-10 text-center max-w-lg mx-auto my-12 shadow-sm border border-gray-100">
        <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Restricted Access</h2>
        <p className="text-sm text-gray-500">
          Only administrators have permission to view security audit logs and system mutation trails.
        </p>
      </div>
    );
  }

  const resetFilters = () => {
    setSearch('');
    setActionFilter('ALL');
    setResourceFilter('ALL');
    setPage(1);
  };

  const hasActiveFilters = search.trim() !== '' || actionFilter !== 'ALL' || resourceFilter !== 'ALL';

  // Compute pagination range
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (page < totalPages - 2) pages.push('...');
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }
    return pages;
  };

  // Helper to format values in the diff view
  const formatDiffValue = (val: unknown): string => {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">Audit Logs & History</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-200">
              {total} Total Events
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
              10 per page
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Complete track record of data mutations, creations, updates, logins, and system actions.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 shadow-sm transition-all"
        >
          <RotateCcw className={`w-4 h-4 text-gray-500 ${isFetching ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filters Card */}
      <div className="card p-4 bg-white border border-gray-100 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          {/* Search Input */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by details, resource, IP..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
            />
          </div>

          {/* Action Filter */}
          <div className="sm:col-span-3">
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
            >
              <option value="ALL">All Actions</option>
              {actionOptions.filter((a) => a !== 'ALL').map((act) => (
                <option key={act} value={act}>
                  Action: {act}
                </option>
              ))}
            </select>
          </div>

          {/* Resource Filter */}
          <div className="sm:col-span-3">
            <select
              value={resourceFilter}
              onChange={(e) => {
                setResourceFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
            >
              <option value="ALL">All Resources</option>
              {resourceOptions.filter((r) => r !== 'ALL').map((res) => (
                <option key={res} value={res}>
                  Resource: {res}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Filters */}
          <div className="sm:col-span-1 flex justify-end">
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                title="Clear all filters"
                className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Summary Status */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-50">
          <div>
            Showing <span className="font-semibold text-gray-800">{total === 0 ? 0 : (page - 1) * 10 + 1}</span> to{' '}
            <span className="font-semibold text-gray-800">{Math.min(page * 10, total)}</span> of{' '}
            <span className="font-semibold text-gray-800">{total}</span> logs
          </div>
          <div className="text-gray-400">Page {page} of {totalPages}</div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card overflow-hidden border border-gray-100 shadow-sm bg-white">
        {isLoading ? (
          <div className="py-20 flex justify-center items-center">
            <LoadingSpinner />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <ScrollText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-gray-900 mb-1">No Audit Logs Found</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
              {hasActiveFilters
                ? 'No audit entries match the selected filters. Try resetting search or filter criteria.'
                : 'No audit records have been generated yet.'}
            </p>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="btn-secondary text-xs">
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-3">Action</th>
                    <th className="py-3 px-3">Resource</th>
                    <th className="py-3 px-3">Resource ID</th>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-3">IP Address</th>
                    <th className="py-3 px-4">Details</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => {
                    const style = actionStyles[log.action] || {
                      bg: 'bg-gray-50',
                      text: 'text-gray-700',
                      border: 'border-gray-200',
                      icon: null,
                    };
                    return (
                      <tr
                        key={log._id}
                        onClick={() => {
                          setSelectedLog(log);
                          setShowRawJson(false);
                        }}
                        className="hover:bg-primary-50/30 cursor-pointer transition-colors group"
                      >
                        {/* Timestamp */}
                        <td className="py-3 px-4 whitespace-nowrap text-gray-700 font-mono">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            <span>{formatDateTime(log.createdAt)}</span>
                          </div>
                        </td>

                        {/* Action Badge */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${style.bg} ${style.text} ${style.border}`}
                          >
                            {style.icon}
                            {log.action}
                          </span>
                        </td>

                        {/* Resource */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded text-[11px]">
                            <Layers className="w-3 h-3 text-gray-500" />
                            {log.resource}
                          </span>
                        </td>

                        {/* Resource ID */}
                        <td className="py-3 px-3 whitespace-nowrap font-mono text-gray-500">
                          {log.resourceId ? (
                            <span
                              title={log.resourceId}
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(log.resourceId!, `res-${log._id}`);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-gray-50 hover:bg-gray-100 text-gray-700 cursor-copy border border-gray-100"
                            >
                              <span>#{log.resourceId.slice(-6)}</span>
                              {copiedKey === `res-${log._id}` ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3 text-gray-400 opacity-60 group-hover:opacity-100" />
                              )}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>

                        {/* User */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-[10px]">
                              {log.user?.name ? log.user.name.charAt(0).toUpperCase() : 'S'}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 leading-tight">
                                {log.user?.name || 'System / Auto'}
                              </p>
                              {log.user?.email && (
                                <p className="text-[10px] text-gray-400 leading-none mt-0.5">
                                  {log.user.email}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* IP Address */}
                        <td className="py-3 px-3 whitespace-nowrap font-mono text-gray-500">
                          <span className="text-[11px] text-gray-600">{log.ip || '—'}</span>
                        </td>

                        {/* Details */}
                        <td className="py-3 px-4 text-gray-600 max-w-xs truncate" title={log.details || ''}>
                          {log.details ? (
                            <span className="font-medium">{log.details}</span>
                          ) : log.changes ? (
                            <span className="text-gray-400 italic">Contains mutation changes</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>

                        {/* View Details Action */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                              setShowRawJson(false);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Details</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 10-per-page Pagination Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 bg-gray-50/70 border-t border-gray-100">
              <div className="text-xs text-gray-500">
                Showing{' '}
                <span className="font-semibold text-gray-800">{(page - 1) * 10 + 1}</span> to{' '}
                <span className="font-semibold text-gray-800">{Math.min(page * 10, total)}</span> of{' '}
                <span className="font-semibold text-gray-800">{total}</span> logs (
                <span className="font-medium text-primary-600">10 per page</span>)
              </div>

              <div className="flex items-center gap-1.5">
                {/* Previous Button */}
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                {/* Page Numbers */}
                <div className="flex items-center gap-1">
                  {getPageNumbers().map((pNum, idx) => {
                    if (pNum === '...') {
                      return (
                        <span key={`dots-${idx}`} className="px-2 text-xs text-gray-400 font-semibold select-none">
                          ...
                        </span>
                      );
                    }
                    const num = pNum as number;
                    const isActive = page === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setPage(num)}
                        className={`min-w-[32px] h-8 text-xs font-semibold rounded-lg transition-all ${
                          isActive
                            ? 'bg-primary-600 text-white shadow-sm'
                            : 'border border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>

                {/* Next Button */}
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Log Details Modal */}
      {selectedLog && (
        <Modal
          isOpen={!!selectedLog}
          onClose={() => setSelectedLog(null)}
          title="Audit Log Details"
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => copyToClipboard(JSON.stringify(selectedLog, null, 2), 'full-json')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-all"
              >
                {copiedKey === 'full-json' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Payload Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-gray-500" />
                    <span>Copy Raw JSON</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="btn-primary text-xs px-4 py-1.5"
              >
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-5 py-1">
            {/* Top Status Banner */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${
                    actionStyles[selectedLog.action]?.bg || 'bg-gray-100'
                  } ${actionStyles[selectedLog.action]?.text || 'text-gray-800'} ${
                    actionStyles[selectedLog.action]?.border || 'border-gray-200'
                  }`}
                >
                  {actionStyles[selectedLog.action]?.icon}
                  {selectedLog.action}
                </span>

                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span>{selectedLog.resource}</span>
                    {selectedLog.resourceId && (
                      <span className="font-mono text-xs font-normal text-gray-500">
                        ({selectedLog.resourceId})
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3 text-gray-400" />
                    <span>{formatDateTime(selectedLog.createdAt)}</span>
                  </p>
                </div>
              </div>

              {/* Log ID copy */}
              <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-gray-200 shadow-2xs">
                <span className="text-[11px] text-gray-400 font-mono">Log ID:</span>
                <span className="text-xs font-mono font-medium text-gray-700">
                  {selectedLog._id.slice(-8)}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(selectedLog._id, 'log-id')}
                  className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700"
                  title="Copy full log ID"
                >
                  {copiedKey === 'log-id' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Information Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Actor / User Card */}
              <div className="p-4 rounded-xl border border-gray-100 bg-white shadow-2xs space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-primary-500" />
                  <span>Actor / Performed By</span>
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Name:</span>
                    <span className="font-semibold text-gray-900">
                      {selectedLog.user?.name || 'System / Automated Job'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Email:</span>
                    <span className="font-mono text-gray-700">
                      {selectedLog.user?.email || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Role:</span>
                    <span className="font-medium text-gray-800 capitalize">
                      {selectedLog.user?.role || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Network / Context Card */}
              <div className="p-4 rounded-xl border border-gray-100 bg-white shadow-2xs space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-500" />
                  <span>Network & Target</span>
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">IP Address:</span>
                    <span className="font-mono text-gray-800">{selectedLog.ip || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Resource:</span>
                    <span className="font-semibold text-gray-900">{selectedLog.resource}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Resource ID:</span>
                    <span className="font-mono text-[11px] text-gray-700 truncate max-w-[150px]">
                      {selectedLog.resourceId || '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Details / Message */}
            {selectedLog.details && (
              <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-100 text-xs text-blue-900 space-y-1">
                <p className="font-bold text-[11px] uppercase tracking-wider text-blue-600">Event Details</p>
                <p className="font-medium">{selectedLog.details}</p>
              </div>
            )}

            {/* Changes / Mutation Diff Viewer */}
            {selectedLog.changes && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-primary-600" />
                    <span>Changed Fields & Diff</span>
                  </h4>
                  <span className="text-[11px] text-gray-400">Before & After comparison</span>
                </div>

                {/* If changes has before and after */}
                {selectedLog.changes.before || selectedLog.changes.after ? (
                  (() => {
                    const before = (selectedLog.changes?.before as Record<string, unknown>) || {};
                    const after = (selectedLog.changes?.after as Record<string, unknown>) || {};
                    const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

                    if (allKeys.length === 0) {
                      return (
                        <p className="text-xs text-gray-400 italic p-3 bg-gray-50 rounded-lg">
                          No specific field changes recorded.
                        </p>
                      );
                    }

                    return (
                      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="bg-gray-100 text-gray-600 font-semibold border-b border-gray-200 text-[11px]">
                              <th className="py-2 px-3 w-1/3">Field</th>
                              <th className="py-2 px-3 w-1/3 text-rose-700 bg-rose-50/50">Previous Value</th>
                              <th className="py-2 px-3 w-1/3 text-emerald-700 bg-emerald-50/50">New Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {allKeys.map((key) => {
                              const prevVal = formatDiffValue(before[key]);
                              const nextVal = formatDiffValue(after[key]);
                              const isDiff = prevVal !== nextVal;
                              return (
                                <tr key={key} className={isDiff ? 'bg-amber-50/20' : ''}>
                                  <td className="py-2 px-3 font-semibold text-gray-800 font-mono text-[11px]">
                                    {key}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-[11px] text-rose-700 bg-rose-50/30 break-all">
                                    {prevVal}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-[11px] text-emerald-700 bg-emerald-50/30 font-medium break-all flex items-center gap-1.5">
                                    {isDiff && <ArrowRight className="w-3 h-3 text-emerald-500 shrink-0" />}
                                    <span>{nextVal}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()
                ) : (
                  // Generic changes object
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs font-mono overflow-x-auto max-h-48">
                    <pre className="text-gray-800">{JSON.stringify(selectedLog.changes, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}

            {/* Collapsible Raw JSON viewer */}
            <div className="pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowRawJson(!showRawJson)}
                className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <span>{showRawJson ? 'Hide Raw JSON Payload' : 'Show Full Raw JSON Payload'}</span>
              </button>

              {showRawJson && (
                <div className="mt-2 p-3 bg-gray-900 text-emerald-400 rounded-xl font-mono text-xs overflow-x-auto max-h-56 shadow-inner">
                  <pre>{JSON.stringify(selectedLog, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AuditLogsPage;
