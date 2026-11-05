import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  page: number;
  total: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  itemName?: string;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newSize: number) => void;
  className?: string;
}

export const getPaginationRange = (currentPage: number, totalPages: number): (number | string)[] => {
  const pages: (number | string)[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) {
      if (!pages.includes(i)) pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    if (!pages.includes(totalPages)) pages.push(totalPages);
  }
  return pages;
};

export const TableSummaryStatus: React.FC<{
  page: number;
  total: number;
  pageSize?: number;
  itemName?: string;
  start?: number;
  end?: number;
  totalPages?: number;
  className?: string;
}> = ({
  page,
  total,
  pageSize = 10,
  itemName = 'items',
  start,
  end,
  totalPages: propTotalPages,
  className = '',
}) => {
  const calculatedTotalPages = Math.max(1, Math.ceil(total / pageSize));
  const totalPages = propTotalPages !== undefined ? propTotalPages : calculatedTotalPages;
  const from = start !== undefined ? (total === 0 ? 0 : start) : (total === 0 ? 0 : (page - 1) * pageSize + 1);
  const to = end !== undefined ? end : Math.min(page * pageSize, total);

  return (
    <div className={`flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100 ${className}`}>
      <div>
        Showing <span className="font-semibold text-gray-800">{from}</span> to{' '}
        <span className="font-semibold text-gray-800">{to}</span> of{' '}
        <span className="font-semibold text-gray-800">{total}</span> {itemName}
      </div>
      <div className="text-gray-400">
        Page {page} of {totalPages}
      </div>
    </div>
  );
};

export const Pagination: React.FC<PaginationProps> = ({
  page,
  total,
  pageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  itemName = 'items',
  onPageChange,
  onPageSizeChange,
  className = '',
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pageNumbers = getPaginationRange(page, totalPages);

  if (total === 0) return null;

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 bg-gray-50/70 border-t border-gray-100 text-xs ${className}`}
    >
      {/* Left side: showing count & optional page size */}
      <div className="flex items-center gap-2 text-gray-500">
        <span>
          Showing <span className="font-semibold text-gray-800">{from}</span> to{' '}
          <span className="font-semibold text-gray-800">{to}</span> of{' '}
          <span className="font-semibold text-gray-800">{total}</span> {itemName}
        </span>
        {onPageSizeChange && (
          <span className="hidden md:inline-flex items-center gap-1 ml-2 text-gray-400">
            ·
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Select items per page"
              className="ml-1 px-1.5 py-0.5 rounded border border-gray-200 bg-white text-gray-700 font-medium text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} / page
                </option>
              ))}
            </select>
          </span>
        )}
        {!onPageSizeChange && (
          <span className="hidden sm:inline-block font-medium text-primary-600">
            ({pageSize} per page)
          </span>
        )}
      </div>

      {/* Right side: navigation buttons */}
      <div className="flex items-center gap-1.5">
        {/* Previous */}
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Previous</span>
        </button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((pNum, idx) => {
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
                onClick={() => onPageChange(num)}
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

        {/* Next */}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all"
        >
          <span>Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
