import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit2, Trash2, Package, Tag, CheckSquare2, Square,
  Sparkles, SlidersHorizontal, Check, Search, Filter, RefreshCw, ArrowRight
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { productsApi, categoriesApi } from '../services/inventory.service';
import { useAccountStore } from '../store/accountStore';
import { formatCurrency, paiseToRupees, rupeesToPaise } from '../lib/utils';
import Modal from '../components/ui/Modal';
import { EmptyState, LoadingSpinner, ConfirmDialog } from '../components/ui/Feedback';
import toast from 'react-hot-toast';
import type { Product, Category } from '../types';

const productSchema = z.object({
  name: z.string().min(1, 'Required'),
  sku: z.string().min(1, 'Required'),
  category: z.string().min(1, 'Required'),
  sizeml: z.number().positive(),
  fragranceType: z.string().optional(),
  brand: z.string().optional(),
  sellingPrice: z.number().positive(),
  defaultPurchaseCost: z.number().positive(),
  boxCost: z.number().min(0).default(2),
  stickerCost: z.number().min(0).default(1),
  bagCardCost: z.number().min(0).default(1),
  printLabelCost: z.number().min(0).default(1),
  reorderThreshold: z.number().int().min(0),
  isActive: z.boolean().default(true),
});

const categorySchema = z.object({
  name: z.string().min(1, 'Required'),
  description: z.string().optional(),
});

type ProductForm = z.infer<typeof productSchema>;
type CategoryForm = z.infer<typeof categorySchema>;

const ProductsPage: React.FC = () => {
  const { activeAccountId } = useAccountStore();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'products' | 'packaging' | 'categories'>('products');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isBulkPackingModalOpen, setIsBulkPackingModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  // Bulk packaging customization state
  const [bulkTarget, setBulkTarget] = useState<'selected' | 'all'>('selected');
  const [bulkPreset, setBulkPreset] = useState<'standard' | 'special' | 'custom'>('standard');
  const [customBoxCost, setCustomBoxCost] = useState<number>(2);
  const [customStickerCost, setCustomStickerCost] = useState<number>(1);
  const [customBagCardCost, setCustomBagCardCost] = useState<number>(1);
  const [customPrintLabelCost, setCustomPrintLabelCost] = useState<number>(1);
  const [packagingSearch, setPackagingSearch] = useState('');
  const [packagingFilter, setPackagingFilter] = useState<'all' | 'standard' | 'special' | 'custom'>('all');

  const { data: productsData, isLoading: prodLoading } = useQuery({
    queryKey: ['products', activeAccountId],
    queryFn: () => productsApi.list({ accountId: activeAccountId === 'all' ? undefined : activeAccountId }),
  });

  const { data: categoriesData, isLoading: catLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list(),
  });

  const products: Product[] = productsData?.data?.data || [];
  const categories: Category[] = categoriesData?.data?.data || [];

  // Product form
  const pForm = useForm<ProductForm>({
    resolver: zodResolver(productSchema) as any,
    defaultValues: {
      isActive: true,
      reorderThreshold: 5,
      boxCost: 2,
      stickerCost: 1,
      bagCardCost: 1,
      printLabelCost: 1,
    },
  });

  const getProductCost = (p: Product) => (p.defaultPurchaseCost > 0 ? p.defaultPurchaseCost : (p.weightedAvgCost || 0));
  const getProductPackingCost = (p: Product) => {
    if (p.packingCost !== undefined && p.packingCost > 0) return p.packingCost;
    const b = p.boxCost ?? 200;
    const s = p.stickerCost ?? 100;
    const bc = p.bagCardCost ?? 100;
    const pl = p.printLabelCost ?? 100;
    return b + s + bc + pl;
  };

  const getPresetInfo = (p: Product) => {
    const s = p.stickerCost ?? 100;
    const b = p.boxCost ?? 200;
    const bc = p.bagCardCost ?? 100;
    const pl = p.printLabelCost ?? 100;

    if (s === 400 || p.packingPreset === 'special') {
      return { id: 'special', label: 'Special Perfume (₹8)', badge: '★ Special (₹8)', isSpecial: true, color: 'text-amber-800 bg-amber-50 border-amber-300' };
    }
    if (s === 100 && b === 200 && bc === 100 && pl === 100) {
      return { id: 'standard', label: 'Standard Pack (₹5)', badge: 'Standard (₹5)', isSpecial: false, color: 'text-blue-700 bg-blue-50 border-blue-200' };
    }
    const tot = (b + s + bc + pl) / 100;
    return { id: 'custom', label: `Custom Pack (₹${tot.toFixed(2)})`, badge: `Custom (₹${tot.toFixed(2)})`, isSpecial: false, color: 'text-gray-700 bg-gray-50 border-gray-200' };
  };

  const bulkPackingMut = useMutation({
    mutationFn: (data: {
      productIds: string[] | 'all';
      boxCost: number;
      stickerCost: number;
      bagCardCost: number;
      printLabelCost: number;
      packingPreset?: string;
    }) => productsApi.bulkUpdatePacking(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['pnl'] });
      qc.invalidateQueries({ queryKey: ['perfume-performance'] });
      toast.success(res.data?.message || 'Packaging charges updated successfully!');
      setIsBulkPackingModalOpen(false);
      setSelectedProductIds(new Set());
    },
    onError: (e: unknown) => {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update packaging charges');
    },
  });

  const setProductPreset = (productId: string, preset: 'standard' | 'special') => {
    const isSpecial = preset === 'special';
    bulkPackingMut.mutate({
      productIds: [productId],
      boxCost: rupeesToPaise(2),
      stickerCost: rupeesToPaise(isSpecial ? 4 : 1),
      bagCardCost: rupeesToPaise(1),
      printLabelCost: rupeesToPaise(1),
      packingPreset: preset,
    });
  };

  const handleQuickBulkApply = (preset: 'standard' | 'special', target: 'selected' | 'all' = 'selected') => {
    const isSpecial = preset === 'special';
    const targetIds = target === 'all' ? 'all' : Array.from(selectedProductIds);
    if (target !== 'all' && targetIds.length === 0) {
      toast.error('Please select at least one perfume');
      return;
    }
    bulkPackingMut.mutate({
      productIds: targetIds,
      boxCost: rupeesToPaise(2),
      stickerCost: rupeesToPaise(isSpecial ? 4 : 1),
      bagCardCost: rupeesToPaise(1),
      printLabelCost: rupeesToPaise(1),
      packingPreset: preset,
    });
  };

  const handleApplyBulkPackingModal = () => {
    let b = 2;
    let s = 1;
    let bc = 1;
    let pl = 1;

    if (bulkPreset === 'special') {
      s = 4;
    } else if (bulkPreset === 'custom') {
      b = customBoxCost;
      s = customStickerCost;
      bc = customBagCardCost;
      pl = customPrintLabelCost;
    }

    const targetIds = bulkTarget === 'all' ? 'all' : Array.from(selectedProductIds);
    if (bulkTarget !== 'all' && targetIds.length === 0) {
      toast.error('Please select at least one perfume');
      return;
    }

    bulkPackingMut.mutate({
      productIds: targetIds,
      boxCost: rupeesToPaise(b),
      stickerCost: rupeesToPaise(s),
      bagCardCost: rupeesToPaise(bc),
      printLabelCost: rupeesToPaise(pl),
      packingPreset: bulkPreset,
    });
  };

  const createProductMut = useMutation({
    mutationFn: (d: Partial<Product>) => productsApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Product created!');
      setIsProductModalOpen(false);
      pForm.reset();
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error'),
  });

  const updateProductMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) => productsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Product updated!');
      setIsProductModalOpen(false);
      setEditingProduct(null);
      pForm.reset();
    },
  });

  const deleteProductMut = useMutation({
    mutationFn: (id: string) => productsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Product deleted');
      setDeleteProductId(null);
    },
    onError: (e: unknown) => { toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to delete product'); },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(id => productsApi.delete(id))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success(`${selectedProductIds.size} products deleted`);
      setSelectedProductIds(new Set());
      setShowBulkDelete(false);
    },
    onError: (e: unknown) => { toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to delete products'); },
  });

  const toggleSelectAll = () => {
    if (selectedProductIds.size === products.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(products.map(p => p._id)));
    }
  };

  const toggleSelectProduct = (id: string) => {
    const newSet = new Set(selectedProductIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedProductIds(newSet);
  };

  const onProductSubmit = (d: ProductForm) => {
    const payload = {
      ...d,
      sellingPrice: rupeesToPaise(d.sellingPrice),
      defaultPurchaseCost: rupeesToPaise(d.defaultPurchaseCost),
      boxCost: rupeesToPaise(d.boxCost ?? 2),
      stickerCost: rupeesToPaise(d.stickerCost ?? 1),
      bagCardCost: rupeesToPaise(d.bagCardCost ?? 1),
      printLabelCost: rupeesToPaise(d.printLabelCost ?? 1),
    };
    if (editingProduct) updateProductMut.mutate({ id: editingProduct._id, data: payload });
    else createProductMut.mutate(payload);
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    pForm.reset({
      name: p.name, sku: p.sku,
      category: typeof p.category === 'string' ? p.category : (p.category as Category)._id,
      sizeml: p.sizeml, fragranceType: p.fragranceType, brand: p.brand,
      sellingPrice: paiseToRupees(p.sellingPrice),
      defaultPurchaseCost: paiseToRupees(getProductCost(p)),
      boxCost: p.boxCost !== undefined ? paiseToRupees(p.boxCost) : 2,
      stickerCost: p.stickerCost !== undefined ? paiseToRupees(p.stickerCost) : 1,
      bagCardCost: p.bagCardCost !== undefined ? paiseToRupees(p.bagCardCost) : 1,
      printLabelCost: p.printLabelCost !== undefined ? paiseToRupees(p.printLabelCost) : 1,
      reorderThreshold: p.reorderThreshold, isActive: p.isActive,
    });
    setIsProductModalOpen(true);
  };

  // Category form
  const cForm = useForm<CategoryForm>({ resolver: zodResolver(categorySchema) });

  const createCatMut = useMutation({
    mutationFn: (d: Partial<Category>) => categoriesApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast.success('Category created!'); setIsCategoryModalOpen(false); cForm.reset(); },
  });

  const updateCatMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Category> }) => categoriesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast.success('Category updated!'); setIsCategoryModalOpen(false); setEditingCategory(null); cForm.reset(); },
  });

  const deleteCatMut = useMutation({
    mutationFn: (id: string) => categoriesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast.success('Category deleted'); setDeleteCategoryId(null); },
  });

  const onCategorySubmit = (d: CategoryForm) => {
    if (editingCategory) updateCatMut.mutate({ id: editingCategory._id, data: d });
    else createCatMut.mutate(d);
  };

  const openEditCategory = (c: Category) => {
    setEditingCategory(c);
    cForm.reset({ name: c.name, description: c.description });
    setIsCategoryModalOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Products & Packaging</h1>
          <p className="text-xs text-gray-500">Manage perfume catalogue and customize packaging charges (Standard ₹5 vs Special ₹8)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setBulkTarget('all');
              setBulkPreset('standard');
              setIsBulkPackingModalOpen(true);
            }}
            className="btn-secondary text-xs sm:text-sm font-medium"
          >
            <SlidersHorizontal className="w-4 h-4 text-primary-600" /> Bulk Set Packaging
          </button>
          <button onClick={() => { setEditingCategory(null); cForm.reset(); setIsCategoryModalOpen(true); }} className="btn-secondary text-xs sm:text-sm">
            <Tag className="w-4 h-4" /> Add Category
          </button>
          <button onClick={() => { setEditingProduct(null); pForm.reset({ isActive: true, reorderThreshold: 5, boxCost: 2, stickerCost: 1, bagCardCost: 1, printLabelCost: 1 }); setIsProductModalOpen(true); }} className="btn-primary text-xs sm:text-sm">
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {[
          { id: 'products', label: 'All Products' },
          { id: 'packaging', label: 'Packaging Charges Manager' },
          { id: 'categories', label: 'Categories' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Products Table */}
      {tab === 'products' && (
        <div className="card">
          {prodLoading ? <LoadingSpinner /> : products.length === 0 ? (
            <EmptyState title="No products" description="Add your first perfume product." icon={<Package className="w-12 h-12" />} />
          ) : (
            <>
              {selectedProductIds.size > 0 && (
                <div className="flex flex-wrap items-center justify-between p-2.5 sm:p-3 bg-primary-50 border border-primary-200 mb-4 rounded-xl gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span className="text-xs sm:text-sm font-bold text-primary-900">
                      {selectedProductIds.size} selected:
                    </span>
                    <button
                      onClick={() => handleQuickBulkApply('standard', 'selected')}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 transition-all shadow-2xs"
                    >
                      Set Standard Pack (₹5)
                    </button>
                    <button
                      onClick={() => handleQuickBulkApply('special', 'selected')}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 transition-all shadow-2xs flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3 text-amber-600" />
                      ★ Set Special Pack (₹8)
                    </button>
                    <button
                      onClick={() => {
                        setBulkTarget('selected');
                        setIsBulkPackingModalOpen(true);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-all shadow-2xs flex items-center gap-1"
                    >
                      <SlidersHorizontal className="w-3 h-3 text-gray-500" />
                      Customize...
                    </button>
                  </div>
                  <button
                    onClick={() => setShowBulkDelete(true)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs font-medium ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Selected
                  </button>
                </div>
              )}
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-8 sm:w-10">
                        <button onClick={toggleSelectAll} className="p-1 hover:bg-gray-100 rounded">
                          {selectedProductIds.size === products.length && products.length > 0 ? (
                            <CheckSquare2 className="w-4 h-4 text-primary-600" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </th>
                      <th>Product</th>
                      <th className="hidden sm:table-cell">SKU</th>
                      <th className="hidden md:table-cell">Category</th>
                      <th className="hidden sm:table-cell">Size</th>
                      <th className="text-right sm:text-left">Selling Price</th>
                      <th className="hidden lg:table-cell text-right sm:text-left">Purchase Cost</th>
                      <th className="hidden md:table-cell text-right sm:text-left">Packing Charge</th>
                      <th className="text-center sm:text-left">Stock</th>
                      <th className="hidden sm:table-cell">Status</th>
                      <th className="text-right pr-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => {
                      const cat = typeof p.category === 'object' ? p.category : categories.find(c => c._id === p.category);
                      const lowStock = p.currentStock <= p.reorderThreshold;
                      const isSelected = selectedProductIds.has(p._id);
                      const packCost = getProductPackingCost(p);
                      const purchaseCost = getProductCost(p);
                      const info = getPresetInfo(p);
                      return (
                        <tr key={p._id} className={isSelected ? 'bg-primary-50' : ''}>
                          <td>
                            <button onClick={() => toggleSelectProduct(p._id)} className="p-1 hover:bg-gray-100 rounded">
                              {isSelected ? (
                                <CheckSquare2 className="w-4 h-4 text-primary-600" />
                              ) : (
                                <Square className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
                          </td>
                          <td className="font-medium">
                            <div className="text-xs text-gray-900 truncate max-w-[130px] sm:max-w-none">{p.name}</div>
                            <div className="sm:hidden font-mono text-[10px] text-gray-400">
                              {p.sku} {p.sizeml ? `• ${p.sizeml}ml` : ''} • Cost: {formatCurrency(purchaseCost + packCost)}
                            </div>
                          </td>
                          <td className="hidden sm:table-cell font-mono text-xs">{p.sku}</td>
                          <td className="hidden md:table-cell text-xs">{(cat as Category)?.name || '—'}</td>
                          <td className="hidden sm:table-cell text-xs">{p.sizeml}ml</td>
                          <td className="text-right sm:text-left text-xs font-semibold">{formatCurrency(p.sellingPrice)}</td>
                          <td className="hidden lg:table-cell text-right sm:text-left text-xs text-gray-700 font-mono">
                            {formatCurrency(purchaseCost)}
                          </td>
                          <td className="hidden md:table-cell text-right sm:text-left text-xs font-mono">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const next = info.id === 'special' ? 'standard' : 'special';
                                setProductPreset(p._id, next);
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${info.color}`}
                              title="Click to toggle between Standard (₹5) and Special (₹8) packaging"
                            >
                              {info.badge}
                            </button>
                          </td>
                          <td className={`text-center sm:text-left text-xs ${lowStock ? 'text-red-600 font-semibold' : ''}`}>
                            <span>{p.currentStock}</span>
                            {p.isSharedStock && (
                              <span className="ml-1 px-1 py-0.5 rounded text-[9px] bg-purple-100 text-purple-700 font-bold" title="Shared stock">
                                Shared
                              </span>
                            )}
                            {lowStock && ' ⚠'}
                          </td>
                          <td className="hidden sm:table-cell"><span className={`badge ${p.isActive ? 'badge-green' : 'badge-gray'}`}>{p.isActive ? 'Active' : 'Inactive'}</span></td>
                          <td className="text-right pr-2">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEditProduct(p)} className="p-1 sm:p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Edit2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setDeleteProductId(p._id)} className="p-1 sm:p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Packaging Charges Manager Tab */}
      {tab === 'packaging' && (
        <div className="space-y-4">
          {/* Packaging Presets Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Standard Pack Card */}
            <div className="card p-4 border border-blue-200 bg-gradient-to-br from-blue-50/50 to-white space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-800">
                  Standard Packaging
                </span>
                <span className="text-base font-extrabold text-blue-900">₹5.00</span>
              </div>
              <p className="text-xs text-gray-600">
                Box ₹2.00 + Sticker ₹1.00 + POP Bag/Card ₹1.00 + Print Label ₹1.00
              </p>
              <div className="flex items-center justify-between pt-1 border-t border-blue-100">
                <span className="text-xs font-semibold text-gray-700">
                  {products.filter(p => getPresetInfo(p).id === 'standard').length} perfumes
                </span>
                <button
                  onClick={() => handleQuickBulkApply('standard', 'all')}
                  className="text-xs font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 px-2.5 py-1 rounded-lg transition-colors"
                >
                  Apply to All Perfumes
                </button>
              </div>
            </div>

            {/* Special Pack Card */}
            <div className="card p-4 border border-amber-200 bg-gradient-to-br from-amber-50/50 to-white space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  Special Perfume Pack
                </span>
                <span className="text-base font-extrabold text-amber-900">₹8.00</span>
              </div>
              <p className="text-xs text-gray-600">
                Box ₹2.00 + <strong className="text-amber-800">Special Sticker ₹4.00</strong> + POP Bag/Card ₹1.00 + Print Label ₹1.00
              </p>
              <div className="flex items-center justify-between pt-1 border-t border-amber-100">
                <span className="text-xs font-semibold text-gray-700">
                  {products.filter(p => getPresetInfo(p).id === 'special').length} perfumes
                </span>
                <button
                  onClick={() => {
                    if (selectedProductIds.size === 0) {
                      toast('Select perfumes using checkboxes to assign Special Packaging', { icon: '👉' });
                    } else {
                      handleQuickBulkApply('special', 'selected');
                    }
                  }}
                  className="text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition-colors"
                >
                  {selectedProductIds.size > 0 ? `Apply to ${selectedProductIds.size} Selected` : 'Select for Special'}
                </button>
              </div>
            </div>

            {/* Custom Packaging Card */}
            <div className="card p-4 border border-gray-200 bg-gradient-to-br from-gray-50/50 to-white space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-800">
                  Custom Packaging
                </span>
                <span className="text-xs font-semibold text-gray-500">Custom rates</span>
              </div>
              <p className="text-xs text-gray-600">
                Custom packaging charges tailored for specific perfume lines.
              </p>
              <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                <span className="text-xs font-semibold text-gray-700">
                  {products.filter(p => getPresetInfo(p).id === 'custom').length} perfumes
                </span>
                <button
                  onClick={() => {
                    setBulkTarget(selectedProductIds.size > 0 ? 'selected' : 'all');
                    setBulkPreset('custom');
                    setIsBulkPackingModalOpen(true);
                  }}
                  className="text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg transition-colors"
                >
                  Configure Custom...
                </button>
              </div>
            </div>
          </div>

          {/* Packaging Management Table Card */}
          <div className="card">
            {/* Filter and Bulk Bar */}
            <div className="p-3 sm:p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={packagingSearch}
                    onChange={(e) => setPackagingSearch(e.target.value)}
                    placeholder="Search perfumes..."
                    className="input text-xs pl-8 h-8 w-44"
                  />
                </div>
                <select
                  value={packagingFilter}
                  onChange={(e) => setPackagingFilter(e.target.value as any)}
                  className="select text-xs h-8 py-1"
                >
                  <option value="all">All Packaging Types</option>
                  <option value="standard">Standard Pack (₹5) Only</option>
                  <option value="special">Special Pack (₹8) Only</option>
                  <option value="custom">Custom Pack Only</option>
                </select>
              </div>

              {selectedProductIds.size > 0 ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-primary-800">
                    {selectedProductIds.size} selected:
                  </span>
                  <button
                    onClick={() => handleQuickBulkApply('standard', 'selected')}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100"
                  >
                    Set Standard (₹5)
                  </button>
                  <button
                    onClick={() => handleQuickBulkApply('special', 'selected')}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100 flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    ★ Set Special (₹8)
                  </button>
                </div>
              ) : (
                <div className="text-xs text-gray-500">
                  Select perfumes with checkboxes to change packaging in bulk
                </div>
              )}
            </div>

            {/* Table */}
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-8 sm:w-10">
                      <button onClick={toggleSelectAll} className="p-1 hover:bg-gray-100 rounded">
                        {selectedProductIds.size === products.length && products.length > 0 ? (
                          <CheckSquare2 className="w-4 h-4 text-primary-600" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </th>
                    <th>Perfume Product</th>
                    <th>Assigned Pack</th>
                    <th className="text-right">Box</th>
                    <th className="text-right">Sticker</th>
                    <th className="text-right">Bag+Card</th>
                    <th className="text-right">Print Label</th>
                    <th className="text-right font-bold">Total Pack</th>
                    <th className="text-right">Landed Cost</th>
                    <th className="text-center">Quick Assign</th>
                  </tr>
                </thead>
                <tbody>
                  {products
                    .filter((p) => {
                      if (packagingFilter !== 'all' && getPresetInfo(p).id !== packagingFilter) return false;
                      if (packagingSearch) {
                        const q = packagingSearch.toLowerCase();
                        return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
                      }
                      return true;
                    })
                    .map((p) => {
                      const isSelected = selectedProductIds.has(p._id);
                      const info = getPresetInfo(p);
                      const packCost = getProductPackingCost(p);
                      const purchaseCost = getProductCost(p);
                      const box = (p.boxCost ?? 200) / 100;
                      const sticker = (p.stickerCost ?? 100) / 100;
                      const bagCard = (p.bagCardCost ?? 100) / 100;
                      const label = (p.printLabelCost ?? 100) / 100;

                      return (
                        <tr key={p._id} className={isSelected ? 'bg-primary-50' : ''}>
                          <td>
                            <button onClick={() => toggleSelectProduct(p._id)} className="p-1 hover:bg-gray-100 rounded">
                              {isSelected ? (
                                <CheckSquare2 className="w-4 h-4 text-primary-600" />
                              ) : (
                                <Square className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
                          </td>
                          <td className="font-medium">
                            <div className="text-xs text-gray-900 font-bold">{p.name}</div>
                            <div className="font-mono text-[10px] text-gray-400">
                              {p.sku} {p.sizeml ? `· ${p.sizeml}ml` : ''}
                            </div>
                          </td>
                          <td>
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${info.color}`}>
                              {info.badge}
                            </span>
                          </td>
                          <td className="text-right font-mono text-xs">₹{box.toFixed(2)}</td>
                          <td className="text-right font-mono text-xs">
                            <span className={sticker > 1 ? 'font-bold text-amber-800 bg-amber-50 px-1 py-0.2 rounded border border-amber-200' : ''}>
                              ₹{sticker.toFixed(2)}
                            </span>
                          </td>
                          <td className="text-right font-mono text-xs">₹{bagCard.toFixed(2)}</td>
                          <td className="text-right font-mono text-xs">₹{label.toFixed(2)}</td>
                          <td className="text-right font-mono text-xs font-extrabold text-primary-800">
                            {formatCurrency(packCost)}
                          </td>
                          <td className="text-right font-mono text-xs font-bold text-emerald-700">
                            {formatCurrency(purchaseCost + packCost)}
                          </td>
                          <td className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setProductPreset(p._id, 'standard')}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                                  info.id === 'standard'
                                    ? 'bg-blue-100 text-blue-800 font-bold'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                Standard (₹5)
                              </button>
                              <button
                                onClick={() => setProductPreset(p._id, 'special')}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                                  info.id === 'special'
                                    ? 'bg-amber-100 text-amber-900 font-bold'
                                    : 'bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-800'
                                }`}
                              >
                                ★ Special (₹8)
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Categories Table */}
      {tab === 'categories' && (
        <div className="card">
          {catLoading ? <LoadingSpinner /> : categories.length === 0 ? (
            <EmptyState title="No categories" description="Add product categories like Godfather, White Oud, etc." icon={<Tag className="w-12 h-12" />} />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Name</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {categories.map(c => (
                    <tr key={c._id}>
                      <td className="font-medium">{c.name}</td>
                      <td className="text-gray-500">{c.description || '—'}</td>
                      <td><span className={`badge ${c.isActive ? 'badge-green' : 'badge-gray'}`}>{c.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => openEditCategory(c)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDeleteCategoryId(c._id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Product Modal */}
      <Modal isOpen={isProductModalOpen} onClose={() => { setIsProductModalOpen(false); setEditingProduct(null); }} title={editingProduct ? 'Edit Product' : 'Add Product'} size="lg"
        footer={<div className="flex gap-2 justify-end"><button onClick={() => setIsProductModalOpen(false)} className="btn-secondary">Cancel</button><button form="product-form" type="submit" className="btn-primary">{editingProduct ? 'Update' : 'Create'}</button></div>}>
        <form id="product-form" onSubmit={pForm.handleSubmit(onProductSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Product Name *</label><input {...pForm.register('name')} className="input" />{pForm.formState.errors.name && <p className="text-xs text-red-500 mt-1">{pForm.formState.errors.name.message}</p>}</div>
            <div><label className="label">SKU *</label><input {...pForm.register('sku')} className="input" placeholder="e.g., GF-50ML" />{pForm.formState.errors.sku && <p className="text-xs text-red-500 mt-1">{pForm.formState.errors.sku.message}</p>}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category *</label>
              <select {...pForm.register('category')} className="select">
                <option value="">Select category</option>
                {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
              {pForm.formState.errors.category && <p className="text-xs text-red-500 mt-1">{pForm.formState.errors.category.message}</p>}
            </div>
            <div><label className="label">Size (ml) *</label><input type="number" {...pForm.register('sizeml', { valueAsNumber: true })} className="input" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Fragrance Type</label><input {...pForm.register('fragranceType')} className="input" placeholder="e.g., Oriental, Floral" /></div>
            <div><label className="label">Brand</label><input {...pForm.register('brand')} className="input" /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="label">Selling Price (₹) *</label><input type="number" step="0.01" {...pForm.register('sellingPrice', { valueAsNumber: true })} className="input" />{pForm.formState.errors.sellingPrice && <p className="text-xs text-red-500 mt-1">{pForm.formState.errors.sellingPrice.message}</p>}</div>
            <div><label className="label">Purchase Cost (₹) *</label><input type="number" step="0.01" {...pForm.register('defaultPurchaseCost', { valueAsNumber: true })} className="input" /></div>
            <div><label className="label">Reorder At (Qty)</label><input type="number" {...pForm.register('reorderThreshold', { valueAsNumber: true })} className="input" /></div>
          </div>

          {/* Packaging Cost Breakdown */}
          <div className="border-t border-gray-100 pt-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-primary-600" />
                  <span>Packaging Charges Breakdown</span>
                </h4>
                <p className="text-[11px] text-gray-500">
                  Select standard packaging or special packaging (e.g. Sticker ₹4) for this perfume
                </p>
              </div>
              <span className="text-xs font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded border border-primary-200">
                Pack Total: ₹{((Number(pForm.watch('boxCost') ?? 2) || 0) + (Number(pForm.watch('stickerCost') ?? 1) || 0) + (Number(pForm.watch('bagCardCost') ?? 1) || 0) + (Number(pForm.watch('printLabelCost') ?? 1) || 0)).toFixed(2)}
              </span>
            </div>

            {/* Quick 1-Click Preset Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  pForm.setValue('boxCost', 2);
                  pForm.setValue('stickerCost', 1);
                  pForm.setValue('bagCardCost', 1);
                  pForm.setValue('printLabelCost', 1);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  Number(pForm.watch('stickerCost')) === 1 && Number(pForm.watch('boxCost')) === 2 && Number(pForm.watch('bagCardCost')) === 1 && Number(pForm.watch('printLabelCost')) === 1
                    ? 'bg-blue-50 border-blue-400 text-blue-800 ring-2 ring-blue-100 shadow-xs'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Check className={`w-3.5 h-3.5 ${Number(pForm.watch('stickerCost')) === 1 && Number(pForm.watch('boxCost')) === 2 ? 'opacity-100 text-blue-600' : 'opacity-0'}`} />
                <span>Standard Pack (₹5.00)</span>
                <span className="text-[10px] text-gray-500 font-normal ml-0.5">(Sticker ₹1)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  pForm.setValue('boxCost', 2);
                  pForm.setValue('stickerCost', 4);
                  pForm.setValue('bagCardCost', 1);
                  pForm.setValue('printLabelCost', 1);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  Number(pForm.watch('stickerCost')) === 4 && Number(pForm.watch('boxCost')) === 2 && Number(pForm.watch('bagCardCost')) === 1 && Number(pForm.watch('printLabelCost')) === 1
                    ? 'bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-100 shadow-xs'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Sparkles className={`w-3.5 h-3.5 ${Number(pForm.watch('stickerCost')) === 4 ? 'opacity-100 text-amber-600' : 'text-gray-400'}`} />
                <span>★ Special Perfume Pack (₹8.00)</span>
                <span className="text-[10px] text-amber-700 font-normal ml-0.5">(Sticker ₹4)</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
              <div>
                <label className="text-[11px] font-medium text-gray-700">Box Price (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  {...pForm.register('boxCost', { valueAsNumber: true })}
                  className="input text-xs py-1.5"
                  placeholder="2.00"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-700">Sticker (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  {...pForm.register('stickerCost', { valueAsNumber: true })}
                  className="input text-xs py-1.5"
                  placeholder="1.00 or 4.00"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-700">POP Bag + Card (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  {...pForm.register('bagCardCost', { valueAsNumber: true })}
                  className="input text-xs py-1.5"
                  placeholder="1.00"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-700">Print Label (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  {...pForm.register('printLabelCost', { valueAsNumber: true })}
                  className="input text-xs py-1.5"
                  placeholder="1.00"
                />
              </div>
            </div>

            {/* Live Cost Summary Preview */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-primary-50 border border-primary-100 rounded-lg px-3 py-2 text-xs gap-1">
              <span className="text-gray-700">
                Combined Landed Cost: <strong>₹{(Number(pForm.watch('defaultPurchaseCost') || 0)).toFixed(2)}</strong> (Purchase) +{' '}
                <strong>₹{((Number(pForm.watch('boxCost') ?? 2) || 0) + (Number(pForm.watch('stickerCost') ?? 1) || 0) + (Number(pForm.watch('bagCardCost') ?? 1) || 0) + (Number(pForm.watch('printLabelCost') ?? 1) || 0)).toFixed(2)}</strong> (Packing)
              </span>
              <span className="text-xs font-bold text-primary-900">
                = <span className="text-emerald-700 text-sm font-extrabold">₹{((Number(pForm.watch('defaultPurchaseCost') || 0)) + (Number(pForm.watch('boxCost') ?? 2) || 0) + (Number(pForm.watch('stickerCost') ?? 1) || 0) + (Number(pForm.watch('bagCardCost') ?? 1) || 0) + (Number(pForm.watch('printLabelCost') ?? 1) || 0)).toFixed(2)}</span> / unit
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isActive" {...pForm.register('isActive')} className="rounded" />
            <label htmlFor="isActive" className="text-sm text-gray-700">Active product</label>
          </div>
        </form>
      </Modal>

      {/* Bulk Packaging Charges Customization Modal */}
      <Modal
        isOpen={isBulkPackingModalOpen}
        onClose={() => setIsBulkPackingModalOpen(false)}
        title="Customize & Assign Packaging Charges"
        size="md"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setIsBulkPackingModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleApplyBulkPackingModal}
              disabled={bulkPackingMut.isPending}
              className="btn-primary"
            >
              {bulkPackingMut.isPending ? 'Applying...' : 'Apply Packaging Charges'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Target Selection */}
          <div>
            <label className="label">Apply Packaging Charge To:</label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${bulkTarget === 'selected' ? 'bg-primary-50 border-primary-300 ring-2 ring-primary-100' : 'bg-gray-50 border-gray-200'}`}>
                <input
                  type="radio"
                  name="bulkTarget"
                  checked={bulkTarget === 'selected'}
                  onChange={() => setBulkTarget('selected')}
                  disabled={selectedProductIds.size === 0}
                  className="rounded-full text-primary-600"
                />
                <div>
                  <p className="text-xs font-bold text-gray-900">Selected Perfumes</p>
                  <p className="text-[11px] text-gray-500">
                    {selectedProductIds.size} product(s) selected
                  </p>
                </div>
              </label>

              <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${bulkTarget === 'all' ? 'bg-primary-50 border-primary-300 ring-2 ring-primary-100' : 'bg-gray-50 border-gray-200'}`}>
                <input
                  type="radio"
                  name="bulkTarget"
                  checked={bulkTarget === 'all'}
                  onChange={() => setBulkTarget('all')}
                  className="rounded-full text-primary-600"
                />
                <div>
                  <p className="text-xs font-bold text-gray-900">All Perfumes</p>
                  <p className="text-[11px] text-gray-500">
                    All {products.length} perfume products
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Packaging Preset Selection */}
          <div>
            <label className="label">Choose Packaging Charge Preset:</label>
            <div className="space-y-2 mt-1">
              {/* Standard */}
              <label className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${bulkPreset === 'standard' ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-100' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="bulkPreset"
                    checked={bulkPreset === 'standard'}
                    onChange={() => setBulkPreset('standard')}
                    className="text-blue-600"
                  />
                  <div>
                    <p className="text-xs font-bold text-blue-900">Standard Packaging</p>
                    <p className="text-[11px] text-gray-500">Box ₹2 + Sticker ₹1 + POP Bag/Card ₹1 + Print Label ₹1</p>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-blue-800 bg-blue-100/80 px-2.5 py-1 rounded-lg">₹5.00</span>
              </label>

              {/* Special */}
              <label className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${bulkPreset === 'special' ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-100' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="bulkPreset"
                    checked={bulkPreset === 'special'}
                    onChange={() => setBulkPreset('special')}
                    className="text-amber-600"
                  />
                  <div>
                    <p className="text-xs font-bold text-amber-900 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      Special Perfume Packaging
                    </p>
                    <p className="text-[11px] text-gray-500">Box ₹2 + <strong className="text-amber-800">Special Sticker ₹4</strong> + POP Bag/Card ₹1 + Print Label ₹1</p>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-amber-900 bg-amber-100/80 px-2.5 py-1 rounded-lg">₹8.00</span>
              </label>

              {/* Custom */}
              <label className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${bulkPreset === 'custom' ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-100' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="bulkPreset"
                    checked={bulkPreset === 'custom'}
                    onChange={() => setBulkPreset('custom')}
                    className="text-purple-600"
                  />
                  <div>
                    <p className="text-xs font-bold text-purple-900">Custom Packaging Charge</p>
                    <p className="text-[11px] text-gray-500">Define individual material costs</p>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-purple-900 bg-purple-100/80 px-2.5 py-1 rounded-lg">
                  ₹{(customBoxCost + customStickerCost + customBagCardCost + customPrintLabelCost).toFixed(2)}
                </span>
              </label>
            </div>
          </div>

          {/* If custom is selected, show inputs */}
          {bulkPreset === 'custom' && (
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2.5">
              <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Custom Material Breakdown</h5>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] font-medium text-gray-600">Box (₹)</label>
                  <input type="number" step="0.5" value={customBoxCost} onChange={e => setCustomBoxCost(Number(e.target.value))} className="input text-xs py-1" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-600">Sticker (₹)</label>
                  <input type="number" step="0.5" value={customStickerCost} onChange={e => setCustomStickerCost(Number(e.target.value))} className="input text-xs py-1" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-600">POP Bag/Card (₹)</label>
                  <input type="number" step="0.5" value={customBagCardCost} onChange={e => setCustomBagCardCost(Number(e.target.value))} className="input text-xs py-1" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-600">Print Label (₹)</label>
                  <input type="number" step="0.5" value={customPrintLabelCost} onChange={e => setCustomPrintLabelCost(Number(e.target.value))} className="input text-xs py-1" />
                </div>
              </div>
            </div>
          )}

          {/* Confirmation summary */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>
                Ready to apply to {bulkTarget === 'all' ? `all ${products.length} perfumes` : `${selectedProductIds.size} selected perfumes`}
              </span>
            </p>
            <p className="text-[11px] text-emerald-700 pl-5">
              Every unit sold will be accounted in Profit & Loss with this exact packaging charge!
            </p>
          </div>
        </div>
      </Modal>

      {/* Category Modal */}
      <Modal isOpen={isCategoryModalOpen} onClose={() => { setIsCategoryModalOpen(false); setEditingCategory(null); }} title={editingCategory ? 'Edit Category' : 'Add Category'} size="sm"
        footer={<div className="flex gap-2 justify-end"><button onClick={() => setIsCategoryModalOpen(false)} className="btn-secondary">Cancel</button><button form="cat-form" type="submit" className="btn-primary">{editingCategory ? 'Update' : 'Create'}</button></div>}>
        <form id="cat-form" onSubmit={cForm.handleSubmit(onCategorySubmit)} className="space-y-4">
          <div><label className="label">Name *</label><input {...cForm.register('name')} className="input" placeholder="e.g., Godfather" />{cForm.formState.errors.name && <p className="text-xs text-red-500 mt-1">{cForm.formState.errors.name.message}</p>}</div>
          <div><label className="label">Description</label><textarea {...cForm.register('description')} className="input resize-none" rows={2} /></div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteProductId} title="Delete Product" message="Remove this product? This may affect existing orders/returns if referenced." onConfirm={() => deleteProductId && deleteProductMut.mutate(deleteProductId)} onCancel={() => setDeleteProductId(null)} confirmText="Delete" isDangerous />
      <ConfirmDialog isOpen={!!deleteCategoryId} title="Delete Category" message="Remove this category? Products in this category will become uncategorized." onConfirm={() => deleteCategoryId && deleteCatMut.mutate(deleteCategoryId)} onCancel={() => setDeleteCategoryId(null)} confirmText="Delete" isDangerous />
      <ConfirmDialog isOpen={showBulkDelete} title="Delete Selected Products" message={`Delete ${selectedProductIds.size} selected product(s)? This action cannot be undone.`} onConfirm={() => bulkDeleteMut.mutate(Array.from(selectedProductIds))} onCancel={() => setShowBulkDelete(false)} confirmText="Delete All" isDangerous />
    </div>
  );
};

export default ProductsPage;
