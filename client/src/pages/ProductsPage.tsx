import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Package, Tag, CheckSquare2, Square } from 'lucide-react';
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
  const [tab, setTab] = useState<'products' | 'categories'>('products');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);

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
    defaultValues: { isActive: true, reorderThreshold: 5 },
  });

  const getProductCost = (p: Product) => (p.defaultPurchaseCost > 0 ? p.defaultPurchaseCost : (p.weightedAvgCost || 0));

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
    const payload = { ...d, sellingPrice: rupeesToPaise(d.sellingPrice), defaultPurchaseCost: rupeesToPaise(d.defaultPurchaseCost) };
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Products & Categories</h1>
        <div className="flex gap-2">
          <button onClick={() => { setEditingCategory(null); cForm.reset(); setIsCategoryModalOpen(true); }} className="btn-secondary"><Tag className="w-4 h-4" /> Add Category</button>
          <button onClick={() => { setEditingProduct(null); pForm.reset({ isActive: true, reorderThreshold: 5 }); setIsProductModalOpen(true); }} className="btn-primary"><Plus className="w-4 h-4" /> Add Product</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {(['products', 'categories'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-all ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t}
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
                <div className="flex items-center justify-between p-3 bg-primary-50 border-b border-primary-100 mb-4">
                  <span className="text-sm font-medium text-primary-700">{selectedProductIds.size} product(s) selected</span>
                  <button onClick={() => setShowBulkDelete(true)} className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">
                    <Trash2 className="w-4 h-4" /> Delete Selected
                  </button>
                </div>
              )}
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-10">
                        <button onClick={toggleSelectAll} className="p-1 hover:bg-gray-100 rounded">
                          {selectedProductIds.size === products.length && products.length > 0 ? (
                            <CheckSquare2 className="w-4 h-4 text-primary-600" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </th>
                      <th>Name</th>
                      <th>SKU</th>
                      <th>Category</th>
                      <th>Size</th>
                      <th>Selling Price</th>
                      <th>Cost</th>
                      <th>Stock</th>
                      <th>Reorder At</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => {
                      const cat = typeof p.category === 'object' ? p.category : categories.find(c => c._id === p.category);
                      const lowStock = p.currentStock <= p.reorderThreshold;
                      const isSelected = selectedProductIds.has(p._id);
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
                          <td className="font-medium">{p.name}</td>
                          <td className="font-mono text-xs">{p.sku}</td>
                          <td>{(cat as Category)?.name || '—'}</td>
                          <td>{p.sizeml}ml</td>
                          <td>{formatCurrency(p.sellingPrice)}</td>
                          <td className={lowStock ? 'text-red-600 font-semibold' : ''}>
                            <span>{p.currentStock}</span>
                            {p.isSharedStock && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700 font-bold" title="Shared stock from other GST accounts">
                                Shared
                              </span>
                            )}
                            {lowStock && ' ⚠'}
                          </td>
                          <td><span className={`badge ${p.isActive ? 'badge-green' : 'badge-gray'}`}>{p.isActive ? 'Active' : 'Inactive'}</span></td>
                          <td>
                            <div className="flex gap-1">
                              <button onClick={() => openEditProduct(p)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Edit2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setDeleteProductId(p._id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
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
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isActive" {...pForm.register('isActive')} className="rounded" />
            <label htmlFor="isActive" className="text-sm text-gray-700">Active product</label>
          </div>
        </form>
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
