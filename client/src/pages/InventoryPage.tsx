import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../services/inventory.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatNumber } from '../lib/utils';
import { Warehouse, AlertTriangle } from 'lucide-react';
import { EmptyState, LoadingSpinner } from '../components/ui/Feedback';
import type { Product } from '../types';

const InventoryPage: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', activeAccountId, search],
    queryFn: () => inventoryApi.list({
      accountId: activeAccountId === 'all' ? undefined : activeAccountId,
      search: search || undefined,
    }),
  });

  const products: Product[] = data?.data?.data || [];
  const totalQty = products.reduce((s, p) => s + p.currentStock, 0);
  const totalValue = products.reduce((s, p) => s + p.currentStock * p.defaultPurchaseCost, 0);
  const lowStockCount = products.filter(p => p.currentStock <= p.reorderThreshold).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500">
            {formatNumber(totalQty)} units · Value: {formatCurrency(totalValue)}
            {lowStockCount > 0 && <span className="ml-2 text-red-500">⚠ {lowStockCount} low stock</span>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Total SKUs</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{products.length}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Total Units</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(totalQty)}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Inventory Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalValue)}</p>
        </div>
      </div>

      <div className="card p-4">
        <input className="input max-w-xs" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {isLoading ? <LoadingSpinner /> : products.length === 0 ? (
          <EmptyState title="No inventory" description="Add products and stock purchases to track inventory." icon={<Warehouse className="w-12 h-12" />} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Stock Qty</th><th>Reorder At</th><th>Cost/Unit</th><th>Inventory Value</th><th>Status</th></tr></thead>
              <tbody>
                {products.map(p => {
                  const lowStock = p.currentStock <= p.reorderThreshold;
                  const outOfStock = p.currentStock === 0;
                  const cat = typeof p.category === 'object' ? p.category : null;
                  return (
                    <tr key={p._id}>
                      <td className="font-medium">{p.name}</td>
                      <td className="font-mono text-xs">{p.sku}</td>
                      <td>{(cat as { name?: string })?.name || '—'}</td>
                      <td className={outOfStock ? 'text-red-600 font-bold' : lowStock ? 'text-orange-600 font-semibold' : 'font-medium'}>
                        {p.currentStock}
                        {lowStock && !outOfStock && <AlertTriangle className="inline w-3.5 h-3.5 ml-1" />}
                      </td>
                      <td className="text-gray-500">{p.reorderThreshold}</td>
                      <td>{formatCurrency(p.defaultPurchaseCost)}</td>
                      <td className="font-semibold">{formatCurrency(p.currentStock * p.defaultPurchaseCost)}</td>
                      <td>
                        {outOfStock ? <span className="badge badge-red">Out of Stock</span> :
                         lowStock ? <span className="badge badge-yellow">Low Stock</span> :
                         <span className="badge badge-green">OK</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryPage;
