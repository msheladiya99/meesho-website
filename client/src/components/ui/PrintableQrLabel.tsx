import React from 'react';
import { Printer, X } from 'lucide-react';
import type { Order } from '../../types';
import { formatCurrency, formatDate } from '../../lib/utils';

interface PrintableQrLabelProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
}

// Simple deterministic QR-like SVG pattern generator
const renderQrSvgPattern = (data: string, size = 160) => {
  // Generate a 21x21 visual QR matrix deterministically from string
  const matrixSize = 21;
  const cells: boolean[][] = Array(matrixSize).fill(null).map(() => Array(matrixSize).fill(false));

  // 1. Draw standard finder patterns at 3 corners
  const drawFinder = (startX: number, startY: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          cells[startY + r][startX + c] = true;
        }
      }
    }
  };

  drawFinder(0, 0); // Top-left
  drawFinder(matrixSize - 7, 0); // Top-right
  drawFinder(0, matrixSize - 7); // Bottom-left

  // 2. Hash string to populate data area
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data.charCodeAt(i);
    hash |= 0;
  }

  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      // Don't overwrite finders
      if (
        (r < 8 && c < 8) ||
        (r < 8 && c >= matrixSize - 8) ||
        (r >= matrixSize - 8 && c < 8)
      ) {
        continue;
      }
      // Timing tracks
      if (r === 6 || c === 6) {
        cells[r][c] = (r + c) % 2 === 0;
        continue;
      }
      const val = Math.sin(hash * (r * matrixSize + c + 1)) * 10000;
      cells[r][c] = (val - Math.floor(val)) > 0.45;
    }
  }

  const cellSize = size / matrixSize;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      <rect width={size} height={size} fill="white" />
      {cells.map((row, r) =>
        row.map((active, c) =>
          active ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize}
              height={cellSize}
              fill="#111827"
            />
          ) : null
        )
      )}
    </svg>
  );
};

export const PrintableQrLabel: React.FC<PrintableQrLabelProps> = ({
  order,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const qrCodeText = order.internalQrCode || order.shippingLabelId || order.meeshoOrderId || order._id;
  const prod = typeof order.product === 'object' ? order.product : null;
  const acct = typeof order.businessAccount === 'object' ? order.businessAccount : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 print:hidden">
          <h3 className="font-semibold text-gray-900 text-sm">Internal Packing Label</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Label Area */}
        <div id="printable-label" className="p-6 bg-white flex flex-col items-center space-y-4 text-center border-2 border-dashed border-gray-300 m-4 rounded-xl print:m-0 print:border-none">
          {/* Header */}
          <div className="w-full border-b pb-2">
            <p className="text-xs uppercase font-bold tracking-widest text-primary-600">
              {acct?.tradeName || acct?.name || 'Perfume Business'}
            </p>
            <p className="text-[10px] text-gray-400 font-mono">GSTIN: {acct?.gstin || '—'}</p>
          </div>

          {/* QR Code */}
          <div className="p-2 border border-gray-200 rounded-lg bg-white shadow-sm">
            {renderQrSvgPattern(qrCodeText, 140)}
          </div>
          <p className="font-mono text-xs font-semibold tracking-wider text-gray-800 bg-gray-50 px-3 py-1 rounded border">
            {qrCodeText}
          </p>

          {/* Order Details */}
          <div className="w-full text-left space-y-1 text-xs border-t pt-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Meesho Order:</span>
              <span className="font-mono font-bold text-gray-900">{order.meeshoOrderId || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Product:</span>
              <span className="font-medium text-gray-800 truncate max-w-[200px]">{(prod as any)?.name || 'Perfume'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">SKU:</span>
              <span className="font-mono font-bold text-gray-900">{order.sku}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Quantity:</span>
              <span className="font-bold text-primary-700">{order.quantity} unit(s)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date:</span>
              <span>{formatDate(order.orderDate)}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-gray-50 border-t border-gray-100 print:hidden">
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button onClick={handlePrint} className="btn-primary">
            <Printer className="w-4 h-4" /> Print Label
          </button>
        </div>
      </div>
    </div>
  );
};
