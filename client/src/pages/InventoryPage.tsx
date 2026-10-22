import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi, categoriesApi } from '../services/inventory.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, formatNumber } from '../lib/utils';
import { Warehouse, AlertTriangle } from 'lucide-react';
import { EmptyState, LoadingSpinner } from '../components/ui/Feedback';
import type { Product, Category } from '../types';

const InventoryPage: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list(),
  });
  const categories: Category[] = categoriesData?.data?.data || [];

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', activeAccountId, search, selectedCategory],
    queryFn: () => inventoryApi.list({
      accountId: activeAccountId === 'all' ? undefined : activeAccountId,
      search: search || undefined,
      categoryId: selectedCategory === 'all' ? undefined : selectedCategory,
    }),
  });

  const products: Product[] = data?.data?.data || [];
  const totalAvailableStock: number = (data?.data as any)?.totalAvailableStock !== undefined
    ? (data?.data as any).totalAvailableStock
    : (products.length > 0 ? (products[0].currentStock ?? 0) : 0);

  const getProductCost = (p: Product) => (p.defaultPurchaseCost > 0 ? p.defaultPurchaseCost : (p.weightedAvgCost || 0));
  const totalQty = totalAvailableStock;
  const avgCost = products.length > 0
    ? (products.reduce((s, p) => s + getProductCost(p), 0) / products.length)
    : 0;
  const totalValue = Math.round(totalQty * avgCost);
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

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="card p-2.5 sm:p-4 text-center">
          <p className="text-[10px] sm:text-xs text-gray-500 uppercase font-semibold tracking-wider truncate">Total SKUs</p>
          <p className="text-base sm:text-2xl font-bold text-gray-900 mt-0.5 sm:mt-1">{products.length}</p>
        </div>
        <div className="card p-2.5 sm:p-4 text-center">
          <p className="text-[10px] sm:text-xs text-gray-500 uppercase font-semibold tracking-wider truncate">Total Units</p>
          <p className="text-base sm:text-2xl font-bold text-gray-900 mt-0.5 sm:mt-1">{formatNumber(totalQty)}</p>
        </div>
        <div className="card p-2.5 sm:p-4 text-center">
          <p className="text-[10px] sm:text-xs text-gray-500 uppercase font-semibold tracking-wider truncate">Value</p>
          <p className="text-base sm:text-2xl font-bold text-gray-900 mt-0.5 sm:mt-1 truncate">{formatCurrency(totalValue)}</p>
        </div>
      </div>

      <div className="card p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <input className="input flex-1 sm:max-w-xs" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="select flex-1 sm:max-w-xs"
        >
          <option value="all">All Categories</option>
          {categories.map(c => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="card">
        {isLoading ? <LoadingSpinner /> : products.length === 0 ? (
          <EmptyState title="No inventory" description="Add products and stock purchases to track inventory." icon={<Warehouse className="w-12 h-12" />} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="hidden sm:table-cell">SKU</th>
                  <th className="hidden md:table-cell">Category</th>
                  <th className="text-center sm:text-left">Stock</th>
                  <th className="hidden lg:table-cell">Reorder</th>
                  <th className="hidden md:table-cell">Cost</th>
                  <th className="text-right sm:text-left">Value</th>
                  <th className="text-center sm:text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => {
                  const lowStock = p.currentStock <= p.reorderThreshold;
                  const outOfStock = p.currentStock === 0;
                  const cat = typeof p.category === 'object' ? p.category : null;
                  const unitCost = getProductCost(p);
                  return (
                    <tr key={p._id}>
                      <td className="font-medium">
                        <div>{p.name}</div>
                        <div className="sm:hidden font-mono text-[10px] text-gray-400">
                          {p.sku} {cat ? `• ${(cat as any).name}` : ''}
                        </div>
                      </td>
                      <td className="hidden sm:table-cell font-mono text-xs">{p.sku}</td>
                      <td className="hidden md:table-cell">{(cat as { name?: string })?.name || '—'}</td>
                      <td className={`text-center sm:text-left ${outOfStock ? 'text-red-600 font-bold' : lowStock ? 'text-orange-600 font-semibold' : 'font-medium'}`}>
                        <span>{p.currentStock}</span>
                        {p.isSharedStock && (
                          <span className="ml-1 px-1 py-0.5 rounded text-[9px] bg-purple-100 text-purple-700 font-bold" title="Shared stock">
                            Shared
                          </span>
                        )}
                        {lowStock && !outOfStock && <AlertTriangle className="inline w-3 h-3 ml-0.5" />}
                      </td>
                      <td className="hidden lg:table-cell text-gray-500">{p.reorderThreshold}</td>
                      <td className="hidden md:table-cell">{formatCurrency(unitCost)}</td>
                      <td className="text-right sm:text-left font-semibold">{formatCurrency(p.currentStock * unitCost)}</td>
                      <td className="text-center sm:text-left">
                        {outOfStock ? <span className="badge badge-red">Out</span> :
                         lowStock ? <span className="badge badge-yellow">Low</span> :
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
