import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  Package,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import {
  downloadSampleInventoryTemplate,
  exportRowsToCsv,
  exportRowsToPdf,
  parseSpreadsheetFile,
} from '../lib/exportUtils.ts';
import { formatCurrency, formatDate } from '../lib/utils.ts';
import {
  EXPIRY_CLASSIFICATIONS,
  MEDICINE_CATEGORIES,
  type ActivityLog,
  type InventoryBatch,
  type MedicineCategory,
  type MedicineItem,
} from '../types/medistock.ts';
import {
  Button,
  Card,
  EmptyState,
  FieldLabel,
  Input,
  Modal,
  Select,
  StatusText,
  TableSkeleton,
  Textarea,
} from '../components/ui/Primitives.tsx';

// ==================================================
// PAGE 4: INVENTORY MANAGEMENT
// ==================================================
export function InventoryListPage() {
  const { user, navigate, globalScope } = useAuth();
  const [items, setItems] = useState<MedicineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [expiryStatus, setExpiryStatus] = useState('All');
  const [stockStatus, setStockStatus] = useState('All');
  const [sortBy, setSortBy] = useState('name');

  // Quick stock update modal
  const [adjustItem, setAdjustItem] = useState<MedicineItem | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<number>(0);
  const [adjustQty, setAdjustQty] = useState<string>('');
  const [adjustLocation, setAdjustLocation] = useState<string>('');
  const [savingAdjust, setSavingAdjust] = useState(false);

  // CSV / Excel import modal
  const [importOpen, setImportOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<Array<Record<string, string>>>([]);
  const [importing, setImporting] = useState(false);

  const canManage = user?.role !== 'Staff Member';

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set('search', search);
      if (category !== 'All') qs.set('category', category);
      if (expiryStatus !== 'All') qs.set('expiryStatus', expiryStatus);
      if (stockStatus !== 'All') qs.set('stockStatus', stockStatus);
      if (sortBy) qs.set('sortBy', sortBy);
      if (globalScope && user?.role === 'System Administrator') qs.set('orgId', 'all');
      const res = await apiRequest<{ items: MedicineItem[] }>(`/inventory?${qs.toString()}`);
      setItems(res.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }, [search, category, expiryStatus, stockStatus, sortBy, globalScope, user?.role]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  function openQuickUpdate(item: MedicineItem) {
    const firstBatch = item.batches?.[0];
    if (!firstBatch) {
      navigate('batch-details', item.id);
      return;
    }
    setAdjustItem(item);
    setSelectedBatchId(firstBatch.id);
    setAdjustQty(String(firstBatch.quantityAvailable));
    setAdjustLocation(firstBatch.storageLocation);
  }

  async function handleSaveQuickUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBatchId) return;
    setSavingAdjust(true);
    try {
      await apiRequest(`/batches/${selectedBatchId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          quantityAvailable: Number(adjustQty),
          storageLocation: adjustLocation,
        }),
      });
      toast.success('Batch stock quantity updated.');
      setAdjustItem(null);
      loadInventory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setSavingAdjust(false);
    }
  }

  async function handleDeleteItem(item: MedicineItem) {
    try {
      await apiRequest(`/inventory/${item.id}`, { method: 'DELETE' });
      toast.success(`Deleted ${item.name}`);
      loadInventory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete item.');
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseSpreadsheetFile(file);
      setParsedRows(rows);
      toast.success(`Parsed ${rows.length} rows from ${file.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not parse spreadsheet.');
    }
  }

  async function handleConfirmImport() {
    if (!parsedRows.length) return;
    setImporting(true);
    try {
      const res = await apiRequest<{ importedCount: number; skipped: string[] }>('/inventory/import', {
        method: 'POST',
        body: JSON.stringify({ rows: parsedRows }),
      });
      toast.success(`Imported ${res.importedCount} inventory batches.`);
      if (res.skipped.length > 0) {
        toast.warning(`${res.skipped.length} rows skipped due to missing fields.`);
      }
      setImportOpen(false);
      setParsedRows([]);
      loadInventory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  function handleExport(format: 'csv' | 'pdf') {
    const columns = ['Item ID', 'Medicine Name', 'Category', 'Brand', 'Available Qty', 'Unit', 'Nearest Expiry', 'Expiry Status', 'Stock Status', 'Unit Price'];
    const rows = items.map((i) => ({
      itemId: i.itemCode,
      name: i.name,
      category: i.category,
      brand: i.brand,
      qty: i.totalQuantity,
      unit: i.unitOfMeasure,
      expiry: i.nearestExpiryDate ? formatDate(i.nearestExpiryDate) : 'No batches',
      expiryStatus: i.expiryStatus,
      stockStatus: i.stockStatus,
      price: formatCurrency(i.unitPrice),
    }));
    if (format === 'csv') {
      exportRowsToCsv('medistock_inventory_report.csv', columns, rows);
    } else {
      exportRowsToPdf('medistock_inventory_report.pdf', 'Inventory Report', user?.organizationName || 'MediStock', columns, rows);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Medical Inventory Catalog
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track medicines, supplies, and equipment by batch number, storage bay, and real-time expiry status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="w-3.5 h-3.5" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
            <Download className="w-3.5 h-3.5" />
            PDF
          </Button>
          {canManage && (
            <>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="w-3.5 h-3.5" />
                Import CSV / Excel
              </Button>
              <Button size="sm" onClick={() => navigate('inventory-new')}>
                <Plus className="w-3.5 h-3.5" />
                Add Medical Item
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters Toolbar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by medicine name, ID, brand, or batch..."
              className="pl-9"
            />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="All">All Categories</option>
            {MEDICINE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select value={expiryStatus} onChange={(e) => setExpiryStatus(e.target.value)}>
            <option value="All">All Expiry Statuses</option>
            {EXPIRY_CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select value={stockStatus} onChange={(e) => setStockStatus(e.target.value)}>
            <option value="All">All Stock Levels</option>
            <option value="Out of Stock">Out of Stock</option>
            <option value="Low Stock">Low Stock</option>
            <option value="Adequate">Adequate</option>
            <option value="Surplus">Surplus</option>
          </Select>
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="name">Sort: Name (A–Z)</option>
            <option value="expiry">Sort: Nearest Expiry</option>
            <option value="quantity-asc">Sort: Quantity (Low–High)</option>
            <option value="quantity-desc">Sort: Quantity (High–Low)</option>
          </Select>
        </div>
      </Card>

      {/* Inventory Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={7} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No inventory items matched"
            description="Adjust your search filters or add a new medical item to start tracking stock and expiry batches."
            action={
              canManage ? (
                <Button size="sm" onClick={() => navigate('inventory-new')}>
                  <Plus className="w-3.5 h-3.5" />
                  Add First Item
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Item ID &amp; Name</th>
                  <th className="py-3 px-4 font-medium">Category / Brand</th>
                  <th className="py-3 px-4 font-medium text-right">Available</th>
                  <th className="py-3 px-4 font-medium">Nearest Expiry</th>
                  <th className="py-3 px-4 font-medium">Expiry Status</th>
                  <th className="py-3 px-4 font-medium">Stock Status</th>
                  <th className="py-3 px-4 font-medium text-right">Unit Price</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => navigate('batch-details', item.id)}
                        className="text-left group cursor-pointer"
                      >
                        <p className="font-medium text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          {item.itemCode} · {item.batchCount} {item.batchCount === 1 ? 'batch' : 'batches'} · {item.storageLocation}
                        </p>
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-slate-800 dark:text-slate-200">{item.category}</p>
                      <p className="text-[11px] text-slate-500">{item.brand}</p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {item.totalQuantity.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {item.unitOfMeasure}
                        {item.reservedQuantity > 0 ? ` (${item.reservedQuantity} res.)` : ''}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {item.nearestExpiryDate ? formatDate(item.nearestExpiryDate) : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <StatusText status={item.expiryStatus} />
                    </td>
                    <td className="py-3 px-4">
                      <StatusText status={item.stockStatus} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => navigate('batch-details', item.id)}
                          title="View batches"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openQuickUpdate(item)}
                          title="Adjust batch quantity"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Package className="w-3.5 h-3.5" />
                        </button>
                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => navigate('inventory-edit', item.id)}
                              title="Edit item"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item)}
                              title="Delete item"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Quick Batch Stock Adjust Modal */}
      <Modal
        open={Boolean(adjustItem)}
        onClose={() => setAdjustItem(null)}
        title={`Update Stock — ${adjustItem?.name ?? ''}`}
        subtitle="Adjust available batch quantity or storage location."
      >
        <form onSubmit={handleSaveQuickUpdate} className="space-y-4">
          <div>
            <FieldLabel required>Select Batch</FieldLabel>
            <Select
              value={selectedBatchId}
              onChange={(e) => {
                const bid = Number(e.target.value);
                setSelectedBatchId(bid);
                const found = adjustItem?.batches?.find((b) => b.id === bid);
                if (found) {
                  setAdjustQty(String(found.quantityAvailable));
                  setAdjustLocation(found.storageLocation);
                }
              }}
            >
              {adjustItem?.batches?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchNumber} — {b.quantityAvailable} units (Exp {formatDate(b.expiryDate)})
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Quantity Available</FieldLabel>
              <Input
                type="number"
                min={0}
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                required
              />
            </div>
            <div>
              <FieldLabel required>Storage Location</FieldLabel>
              <Input
                value={adjustLocation}
                onChange={(e) => setAdjustLocation(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAdjustItem(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={savingAdjust}>
              {savingAdjust ? 'Saving...' : 'Save Stock Update'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* CSV / Excel Bulk Import Modal */}
      <Modal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setParsedRows([]);
        }}
        title="Import Inventory from CSV or Excel"
        subtitle="Upload a .csv or .xlsx file with medicine and batch columns."
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-teal-600 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  Need a formatted spreadsheet template?
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Columns: itemCode, name, category, brand, batchNumber, quantityAvailable, expiryDate, unitPrice.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => downloadSampleInventoryTemplate()}>
              Download .xlsx Template
            </Button>
          </div>

          <div>
            <FieldLabel required>Select CSV or Excel File (.csv, .xlsx)</FieldLabel>
            <Input type="file" accept=".csv,.xlsx,.txt" onChange={handleFileSelect} />
          </div>

          {parsedRows.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200">
                Preview ({parsedRows.length} rows ready for import)
              </div>
              <div className="max-h-48 overflow-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <tr>
                      <th className="py-1.5 px-3">Name</th>
                      <th className="py-1.5 px-3">Category</th>
                      <th className="py-1.5 px-3">Batch</th>
                      <th className="py-1.5 px-3 text-right">Qty</th>
                      <th className="py-1.5 px-3">Expiry</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {parsedRows.slice(0, 8).map((r, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 px-3 font-medium">{r.name || r.medicineName}</td>
                        <td className="py-1.5 px-3">{r.category || 'Tablets'}</td>
                        <td className="py-1.5 px-3 font-mono">{r.batchNumber}</td>
                        <td className="py-1.5 px-3 text-right font-mono">{r.quantityAvailable || r.quantity}</td>
                        <td className="py-1.5 px-3 font-mono">{r.expiryDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!parsedRows.length || importing} onClick={handleConfirmImport}>
              {importing ? 'Importing...' : `Import ${parsedRows.length || 0} Rows`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ==================================================
// PAGE 5: ADD / EDIT MEDICINE PAGE
// ==================================================
export function MedicineFormPage() {
  const { routeState, navigate } = useAuth();
  const isEdit = routeState.route === 'inventory-edit' && Boolean(routeState.paramId);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    itemCode: '',
    name: '',
    genericName: '',
    category: 'Tablets' as MedicineCategory,
    brand: '',
    unitOfMeasure: 'Boxes (100 tabs)',
    reorderLevel: '30',
    unitPrice: '18.50',
    storageLocation: 'Pharmacy Vault A-01',
    description: '',
    // Initial batch fields (when creating)
    batchNumber: '',
    quantityAvailable: '100',
    purchaseDate: new Date().toISOString().slice(0, 10),
    manufacturingDate: new Date().toISOString().slice(0, 10),
    expiryDate: '',
    supplierName: '',
  });

  useEffect(() => {
    if (!isEdit || !routeState.paramId) return;
    setLoading(true);
    apiRequest<{ item: MedicineItem }>(`/inventory/${routeState.paramId}`)
      .then((res) => {
        const i = res.item;
        setForm((prev) => ({
          ...prev,
          itemCode: i.itemCode,
          name: i.name,
          genericName: i.genericName,
          category: i.category,
          brand: i.brand,
          unitOfMeasure: i.unitOfMeasure,
          reorderLevel: String(i.reorderLevel),
          unitPrice: String(i.unitPrice),
          storageLocation: i.storageLocation,
          description: i.description,
        }));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load item.'))
      .finally(() => setLoading(false));
  }, [isEdit, routeState.paramId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit && routeState.paramId) {
        await apiRequest(`/inventory/${routeState.paramId}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: form.name,
            genericName: form.genericName,
            category: form.category,
            brand: form.brand,
            unitOfMeasure: form.unitOfMeasure,
            reorderLevel: Number(form.reorderLevel),
            unitPrice: Number(form.unitPrice),
            storageLocation: form.storageLocation,
            description: form.description,
          }),
        });
        toast.success('Medical item updated.');
        navigate('batch-details', routeState.paramId);
      } else {
        const res = await apiRequest<{ id: number }>('/inventory', {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            reorderLevel: Number(form.reorderLevel),
            unitPrice: Number(form.unitPrice),
            quantityAvailable: Number(form.quantityAvailable),
          }),
        });
        toast.success('Medical item added to inventory.');
        navigate('batch-details', res.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('inventory')}>
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Inventory
        </Button>
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            {isEdit ? 'Edit Medical Item' : 'Add New Medical Item'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isEdit
              ? 'Update catalog metadata, pricing, and reorder thresholds.'
              : 'Register a medicine or supply item and optionally log its initial stock batch.'}
          </p>
        </div>
      </div>

      {loading ? (
        <Card className="p-6">
          <TableSkeleton rows={5} />
        </Card>
      ) : (
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Medicine / Item Name</FieldLabel>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Amoxicillin 500mg Tablets"
                  required
                />
              </div>
              <div>
                <FieldLabel>Item ID (auto-generated if blank)</FieldLabel>
                <Input
                  value={form.itemCode}
                  disabled={isEdit}
                  onChange={(e) => setForm({ ...form, itemCode: e.target.value })}
                  placeholder="MED-1045"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <FieldLabel required>Category</FieldLabel>
                <Select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as MedicineCategory })}
                >
                  {MEDICINE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <FieldLabel required>Brand / Manufacturer</FieldLabel>
                <Input
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  placeholder="PfizerCore"
                  required
                />
              </div>
              <div>
                <FieldLabel>Generic Name</FieldLabel>
                <Input
                  value={form.genericName}
                  onChange={(e) => setForm({ ...form, genericName: e.target.value })}
                  placeholder="Amoxicillin Trihydrate"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <FieldLabel required>Unit of Measurement</FieldLabel>
                <Input
                  value={form.unitOfMeasure}
                  onChange={(e) => setForm({ ...form, unitOfMeasure: e.target.value })}
                  placeholder="Boxes (100 tabs)"
                  required
                />
              </div>
              <div>
                <FieldLabel required>Reorder Level</FieldLabel>
                <Input
                  type="number"
                  min={0}
                  value={form.reorderLevel}
                  onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
                  required
                />
              </div>
              <div>
                <FieldLabel required>Unit Price ($)</FieldLabel>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.unitPrice}
                  onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <FieldLabel required>Default Storage Location</FieldLabel>
              <Input
                value={form.storageLocation}
                onChange={(e) => setForm({ ...form, storageLocation: e.target.value })}
                placeholder="Cold Chain Unit C-02 (2-8°C)"
                required
              />
            </div>

            <div>
              <FieldLabel>Clinical / Storage Description</FieldLabel>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Handling requirements, formulation notes..."
              />
            </div>

            {!isEdit && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Initial Stock Batch (Optional)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Provide a batch number and expiry date to immediately track quantities.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <FieldLabel>Batch Number</FieldLabel>
                    <Input
                      value={form.batchNumber}
                      onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
                      placeholder="BCH-2026-01"
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <FieldLabel>Quantity Available</FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      value={form.quantityAvailable}
                      onChange={(e) => setForm({ ...form, quantityAvailable: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel>Supplier Name</FieldLabel>
                    <Input
                      value={form.supplierName}
                      onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
                      placeholder="McKesson Medical"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <FieldLabel>Purchase Date</FieldLabel>
                    <Input
                      type="date"
                      value={form.purchaseDate}
                      onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel>Manufacturing Date</FieldLabel>
                    <Input
                      type="date"
                      value={form.manufacturingDate}
                      onChange={(e) => setForm({ ...form, manufacturingDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel required={Boolean(form.batchNumber)}>Expiry Date</FieldLabel>
                    <Input
                      type="date"
                      value={form.expiryDate}
                      required={Boolean(form.batchNumber)}
                      onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => navigate('inventory')}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Medical Item'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

// ==================================================
// PAGE 6: BATCH DETAILS PAGE
// ==================================================
export function BatchDetailsPage() {
  const { user, routeState, navigate } = useAuth();
  const [item, setItem] = useState<MedicineItem | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [addBatchOpen, setAddBatchOpen] = useState(false);
  const [editBatch, setEditBatch] = useState<InventoryBatch | null>(null);

  const [newBatch, setNewBatch] = useState({
    batchNumber: '',
    quantityAvailable: '50',
    supplierName: 'McKesson Medical-Surgical',
    purchaseDate: new Date().toISOString().slice(0, 10),
    manufacturingDate: new Date().toISOString().slice(0, 10),
    expiryDate: '',
    storageLocation: '',
    unitPrice: '',
    conditionStatus: 'Sealed / Optimal',
  });

  const canManage = user?.role !== 'Staff Member';

  const loadDetails = useCallback(async () => {
    if (!routeState.paramId) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ item: MedicineItem; logs: ActivityLog[] }>(
        `/inventory/${routeState.paramId}`
      );
      setItem(res.item);
      setLogs(res.logs);
      setNewBatch((prev) => ({
        ...prev,
        storageLocation: res.item.storageLocation,
        unitPrice: String(res.item.unitPrice),
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load batch details.');
    } finally {
      setLoading(false);
    }
  }, [routeState.paramId]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  async function handleAddBatch(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    try {
      await apiRequest(`/inventory/${item.id}/batches`, {
        method: 'POST',
        body: JSON.stringify({
          ...newBatch,
          quantityAvailable: Number(newBatch.quantityAvailable),
          unitPrice: Number(newBatch.unitPrice),
        }),
      });
      toast.success('New batch recorded.');
      setAddBatchOpen(false);
      loadDetails();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add batch.');
    }
  }

  async function handleUpdateBatch(e: React.FormEvent) {
    e.preventDefault();
    if (!editBatch) return;
    try {
      await apiRequest(`/batches/${editBatch.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          quantityAvailable: editBatch.quantityAvailable,
          storageLocation: editBatch.storageLocation,
          conditionStatus: editBatch.conditionStatus,
          quarantined: editBatch.quarantined,
        }),
      });
      toast.success('Batch updated.');
      setEditBatch(null);
      loadDetails();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update batch.');
    }
  }

  async function handleWriteOff(batch: InventoryBatch) {
    try {
      await apiRequest(`/batches/${batch.id}/write-off`, { method: 'POST' });
      toast.success(`Quarantined and wrote off expired batch ${batch.batchNumber}.`);
      loadDetails();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Write-off failed.');
    }
  }

  if (loading || !item) {
    return (
      <Card className="p-6">
        <TableSkeleton rows={5} />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('inventory')}>
            <ArrowLeft className="w-3.5 h-3.5" />
            Inventory
          </Button>
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">{item.name}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {item.itemCode} · {item.category} · {item.brand} · {item.storageLocation}
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => navigate('inventory-edit', item.id)}>
              <Edit3 className="w-3.5 h-3.5" />
              Edit Metadata
            </Button>
            <Button size="sm" onClick={() => setAddBatchOpen(true)}>
              <Plus className="w-3.5 h-3.5" />
              Receive New Batch
            </Button>
          </div>
        )}
      </div>

      {/* Item Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total On Hand</p>
          <p className="font-mono text-xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
            {item.totalQuantity.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{item.unitOfMeasure}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Unreserved Free Stock</p>
          <p className="font-mono text-xl font-semibold text-teal-600 dark:text-teal-400 mt-1 tabular-nums">
            {item.freeQuantity.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{item.reservedQuantity} reserved for exchange</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Reorder Threshold</p>
          <p className="font-mono text-xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
            {item.reorderLevel}
          </p>
          <StatusText status={item.stockStatus} className="mt-1" />
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Unit Valuation</p>
          <p className="font-mono text-xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
            {formatCurrency(item.unitPrice)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Total {formatCurrency(item.totalQuantity * item.unitPrice)}
          </p>
        </Card>
      </div>

      {/* Batch Table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Tracked Inventory Batches ({item.batches?.length ?? 0})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            FEFO-ordered by expiry date. Expired or quarantined batches are automatically blocked from stock exchange.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-medium">Batch Number</th>
                <th className="py-3 px-4 font-medium">Supplier</th>
                <th className="py-3 px-4 font-medium text-right">Available</th>
                <th className="py-3 px-4 font-medium text-right">Reserved</th>
                <th className="py-3 px-4 font-medium">Mfg / Expiry</th>
                <th className="py-3 px-4 font-medium">Classification</th>
                <th className="py-3 px-4 font-medium">Condition</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {item.batches?.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono font-medium text-slate-900 dark:text-white">
                    {b.batchNumber}
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-slate-800 dark:text-slate-200">{b.supplierName}</p>
                    <p className="text-[11px] text-slate-500">{b.storageLocation}</p>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                    {b.quantityAvailable}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                    {b.reservedQuantity}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums">
                    <p>{formatDate(b.expiryDate)}</p>
                    <p className="text-[11px] text-slate-500">
                      {b.daysUntilExpiry < 0
                        ? `${Math.abs(b.daysUntilExpiry)}d overdue`
                        : `${b.daysUntilExpiry}d left`}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <StatusText status={b.expiryClassification} />
                  </td>
                  <td className="py-3 px-4">
                    <StatusText status={b.quarantined ? 'Quarantined' : b.conditionStatus} />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setEditBatch(b)}>
                        Adjust
                      </Button>
                      {canManage && b.eligibleForExchange && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate('marketplace-new', b.id)}
                        >
                          <ArrowLeftRight className="w-3 h-3" />
                          Offer
                        </Button>
                      )}
                      {canManage && b.expiryClassification === 'Expired' && b.quantityAvailable > 0 && (
                        <Button size="sm" variant="danger" onClick={() => handleWriteOff(b)}>
                          Write Off
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Audit History */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Item &amp; Batch Audit Log</h3>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {logs.length === 0 ? (
            <p className="p-5 text-xs text-slate-500">No audit entries recorded for this item yet.</p>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="px-5 py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{l.action}</p>
                  <p className="text-slate-500 dark:text-slate-400">{l.details}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-slate-700 dark:text-slate-300">{l.userName}</p>
                  <p className="font-mono text-[11px] text-slate-400">{formatDate(l.createdAt)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Add Batch Modal */}
      <Modal
        open={addBatchOpen}
        onClose={() => setAddBatchOpen(false)}
        title={`Receive New Batch — ${item.name}`}
      >
        <form onSubmit={handleAddBatch} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Batch Number</FieldLabel>
              <Input
                value={newBatch.batchNumber}
                onChange={(e) => setNewBatch({ ...newBatch, batchNumber: e.target.value })}
                placeholder="BCH-2026-99"
                className="font-mono"
                required
              />
            </div>
            <div>
              <FieldLabel required>Quantity Received</FieldLabel>
              <Input
                type="number"
                min={1}
                value={newBatch.quantityAvailable}
                onChange={(e) => setNewBatch({ ...newBatch, quantityAvailable: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Supplier Name</FieldLabel>
              <Input
                value={newBatch.supplierName}
                onChange={(e) => setNewBatch({ ...newBatch, supplierName: e.target.value })}
                required
              />
            </div>
            <div>
              <FieldLabel required>Storage Location</FieldLabel>
              <Input
                value={newBatch.storageLocation}
                onChange={(e) => setNewBatch({ ...newBatch, storageLocation: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <FieldLabel required>Purchase Date</FieldLabel>
              <Input
                type="date"
                value={newBatch.purchaseDate}
                onChange={(e) => setNewBatch({ ...newBatch, purchaseDate: e.target.value })}
                required
              />
            </div>
            <div>
              <FieldLabel required>Mfg Date</FieldLabel>
              <Input
                type="date"
                value={newBatch.manufacturingDate}
                onChange={(e) => setNewBatch({ ...newBatch, manufacturingDate: e.target.value })}
                required
              />
            </div>
            <div>
              <FieldLabel required>Expiry Date</FieldLabel>
              <Input
                type="date"
                value={newBatch.expiryDate}
                onChange={(e) => setNewBatch({ ...newBatch, expiryDate: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddBatchOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Batch</Button>
          </div>
        </form>
      </Modal>

      {/* Adjust Batch Modal */}
      <Modal
        open={Boolean(editBatch)}
        onClose={() => setEditBatch(null)}
        title={`Adjust Batch ${editBatch?.batchNumber ?? ''}`}
      >
        {editBatch && (
          <form onSubmit={handleUpdateBatch} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Quantity Available (min {editBatch.reservedQuantity} reserved)</FieldLabel>
                <Input
                  type="number"
                  min={editBatch.reservedQuantity}
                  value={editBatch.quantityAvailable}
                  onChange={(e) =>
                    setEditBatch({ ...editBatch, quantityAvailable: Number(e.target.value) })
                  }
                  required
                />
              </div>
              <div>
                <FieldLabel required>Condition Status</FieldLabel>
                <Select
                  value={editBatch.conditionStatus}
                  onChange={(e) =>
                    setEditBatch({
                      ...editBatch,
                      conditionStatus: e.target.value as InventoryBatch['conditionStatus'],
                    })
                  }
                >
                  <option value="Sealed / Optimal">Sealed / Optimal</option>
                  <option value="Cold Chain Verified">Cold Chain Verified</option>
                  <option value="Opened Outer Box">Opened Outer Box</option>
                  <option value="Damaged">Damaged</option>
                  <option value="Quarantined">Quarantined</option>
                </Select>
              </div>
            </div>
            <div>
              <FieldLabel required>Storage Location</FieldLabel>
              <Input
                value={editBatch.storageLocation}
                onChange={(e) => setEditBatch({ ...editBatch, storageLocation: e.target.value })}
                required
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={editBatch.quarantined}
                onChange={(e) => setEditBatch({ ...editBatch, quarantined: e.target.checked })}
                className="rounded border-slate-300"
              />
              Quarantine batch (blocks exchange &amp; clinical dispensing)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditBatch(null)}>
                Cancel
              </Button>
              <Button type="submit">Update Batch</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
