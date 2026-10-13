import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import { formatDateTime } from '../lib/utils';
import { LoadingSpinner } from '../components/ui/Feedback';
import { ScrollText } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const AuditLogsPage: React.FC = () => {
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: () => api.get('/audit-logs', { params: { page, limit: 50 } }),
  });

  const logs = data?.data?.data || [];
  const total = data?.data?.total || 0;
  const totalPages = Math.ceil(total / 50);

  if (user?.role !== 'admin') {
    return (
      <div className="card p-8 text-center">
        <ScrollText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Access restricted to administrators.</p>
      </div>
    );
  }

  const actionColors: Record<string, string> = {
    CREATE: 'badge-green',
    UPDATE: 'badge-blue',
    DELETE: 'badge-red',
    LOGIN: 'badge-gray',
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Audit Logs</h1>

      <div className="card">
        {isLoading ? <LoadingSpinner /> : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>Resource ID</th>
                    <th>User</th>
                    <th>IP</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: {
                    _id: string;
                    createdAt: string;
                    action: string;
                    resource: string;
                    resourceId?: string;
                    user?: { name: string; email: string };
                    ip?: string;
                    details?: string;
                  }) => (
                    <tr key={log._id}>
                      <td className="whitespace-nowrap text-xs font-mono">{formatDateTime(log.createdAt)}</td>
                      <td><span className={`badge ${actionColors[log.action] || 'badge-gray'}`}>{log.action}</span></td>
                      <td className="font-mono text-xs">{log.resource}</td>
                      <td className="font-mono text-xs text-gray-400">{log.resourceId?.slice(-8) || '—'}</td>
                      <td className="text-xs">{log.user?.name || '—'}</td>
                      <td className="font-mono text-xs text-gray-400">{log.ip || '—'}</td>
                      <td className="text-xs text-gray-500 max-w-xs truncate">{log.details || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">{total} total entries</p>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`px-3 py-1 text-xs rounded border ${
                          page === pageNum
                            ? 'bg-primary-600 text-white border-primary-600'
                            : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  {totalPages > 5 && page < totalPages - 2 && (
                    <span className="px-2 text-xs text-gray-400">...</span>
                  )}
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AuditLogsPage;
