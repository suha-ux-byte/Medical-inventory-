import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarClock,
  Download,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { exportRowsToCsv, exportRowsToPdf } from '../lib/exportUtils.ts';
import { formatCurrency, formatDate } from '../lib/utils.ts';
import {
  EXPIRY_CLASSIFICATIONS,
  type ActivityLog,
  type InventoryBatch,
} from '../types/medistock.ts';
import {
  Button,
  Card,
  EmptyState,
  Input,
  StatusText,
  TableSkeleton,
} from '../components/ui/Primitives.tsx';

interface ExpiryResponse {
  summary: {
    expiredCount: number;
    expiredUnits: number;
    expiredValue: number;
    within7Count: number;
    within7Units: number;
    within30Count: number;
    within30Units: number;
    within60Count: number;
    within90Count: number;
    safeCount: number;
    atRiskValue: number;
  };
  batches: InventoryBatch[];
  wastageLogs: ActivityLog[];
}

export function ExpiryTrackingPage() {
  const { user, navigate, globalScope } = useAuth();
  const [data, setData] = useState<ExpiryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [classification, setClassification] = useState('All');
  const [search, setSearch] = useState('');
  const [hideEmpty, setHideEmpty] = useState(true);

  const canManage = user?.role !== 'Staff Member';

  const loadExpiry = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (classification !== 'All') qs.set('classification', classification);
      if (search) qs.set('search', search);
      if (hideEmpty) qs.set('hideEmpty', 'true');
      if (globalScope && user?.role === 'System Administrator') qs.set('orgId', 'all');
      const res = await apiRequest<ExpiryResponse>(`/expiry?${qs.toString()}`);
      setData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load expiry data.');
    } finally {
      setLoading(false);
    }
  }, [classification, search, hideEmpty, globalScope, user?.role]);

  useEffect(() => {
    loadExpiry();
  }, [loadExpiry]);

  async function handleWriteOff(batch: InventoryBatch) {
    try {
      await apiRequest(`/batches/${batch.id}/write-off`, { method: 'POST' });
      toast.success(`Batch ${batch.batchNumber} removed and quarantined.`);
      loadExpiry();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Write-off failed.');
    }
  }

  function handleExport(format: 'csv' | 'pdf') {
    if (!data) return;
    const columns = ['Item ID', 'Medicine', 'Batch', 'Qty', 'Expiry Date', 'Days Left', 'Classification', 'Value'];
    const rows = data.batches.map((b) => ({
      itemId: b.itemCode || '',
      medicine: b.medicineName || '',
      batch: b.batchNumber,
      qty: `${b.quantityAvailable} ${b.unitOfMeasure || ''}`,
      expiry: b.expiryDate,
      daysLeft: b.daysUntilExpiry,
      classification: b.expiryClassification,
      value: formatCurrency(b.quantityAvailable * b.unitPrice),
    }));
    if (format === 'csv') {
      exportRowsToCsv('medistock_expiry_tracking_report.csv', columns, rows);
    } else {
      exportRowsToPdf(
        'medistock_expiry_tracking_report.pdf',
        'Expiry Tracking Report',
        `Filter: ${classification}`,
        columns,
        rows
      );
    }
  }

  const summary = data?.summary;
  const chartData = summary
    ? [
        { name: 'Expired', count: summary.expiredCount, color: '#DC2626' },
        { name: '<= 7 Days', count: summary.within7Count, color: '#EF4444' },
        { name: '<= 30 Days', count: summary.within30Count, color: '#D97706' },
        { name: '<= 60 Days', count: summary.within60Count, color: '#0891B2' },
        { name: '<= 90 Days', count: summary.within90Count, color: '#0F2942' },
        { name: 'Safe > 90d', count: summary.safeCount, color: '#16A34A' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Intelligent Expiry Monitoring
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Automatically calculated daily against current date. Expired batches are locked out of stock exchanges.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
            <Download className="w-3.5 h-3.5" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Expired (Urgent Removal)</span>
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <p className="font-mono text-2xl font-semibold text-red-700 dark:text-red-400 mt-2 tabular-nums">
              {summary.expiredCount} batches
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {summary.expiredUnits} units · {formatCurrency(summary.expiredValue)} loss exposure
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Expiring Within 7 Days</span>
              <ShieldAlert className="w-4 h-4 text-red-500" />
            </div>
            <p className="font-mono text-2xl font-semibold text-slate-900 dark:text-white mt-2 tabular-nums">
              {summary.within7Count} batches
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {summary.within7Units} units needing immediate ward use
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Expiring Within 30 Days</span>
              <CalendarClock className="w-4 h-4 text-amber-600" />
            </div>
            <p className="font-mono text-2xl font-semibold text-amber-700 dark:text-amber-400 mt-2 tabular-nums">
              {summary.within30Count} batches
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {summary.within30Units} units · {formatCurrency(summary.atRiskValue)} at-risk value (&le;30d)
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Safe / 60–90d Watchlist</span>
              <CalendarClock className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="font-mono text-2xl font-semibold text-emerald-700 dark:text-emerald-400 mt-2 tabular-nums">
              {summary.safeCount} safe
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {summary.within60Count + summary.within90Count} batches in 31–90 day horizon
            </p>
          </Card>
        </div>
      )}

      {/* Expiry Distribution Chart + Recent Wastage Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7 p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
            Batch Expiry Horizon Breakdown
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Number of active batches across automated expiry classifications
          </p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F2942',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" name="Batches" radius={[4, 4, 0, 0]}>
                  {chartData.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-5 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Recent Expiry Write-Offs &amp; Waste Log
            </h3>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-64 overflow-y-auto">
            {!data?.wastageLogs?.length ? (
              <p className="p-5 text-xs text-slate-500">No write-off actions logged.</p>
            ) : (
              data.wastageLogs.map((w) => (
                <div key={w.id} className="px-5 py-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 dark:text-white">{w.action}</span>
                    <span className="font-mono text-red-600 dark:text-red-400 tabular-nums">
                      {w.quantityDelta} units
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{w.details}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Classification Segmented Filters & Search */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {['All', ...EXPIRY_CLASSIFICATIONS].map((cls) => (
            <button
              key={cls}
              type="button"
              onClick={() => setClassification(cls)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                classification === cls
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cls}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by medicine name, item ID, or batch number..."
              className="pl-9"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
              className="rounded border-slate-300"
            />
            Hide zero-quantity / written-off batches
          </label>
        </div>
      </Card>

      {/* Expiry Batches Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : !data?.batches.length ? (
          <EmptyState
            icon={CalendarClock}
            title="No batches match this expiry filter"
            description="Try switching to All classifications or clearing your search query."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Medicine &amp; Batch</th>
                  <th className="py-3 px-4 font-medium">Category / Location</th>
                  <th className="py-3 px-4 font-medium text-right">Qty</th>
                  <th className="py-3 px-4 font-medium">Expiry Date</th>
                  <th className="py-3 px-4 font-medium text-right">Days Left</th>
                  <th className="py-3 px-4 font-medium">Expiry Status</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.batches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => navigate('batch-details', b.medicineId)}
                        className="text-left font-medium text-slate-900 dark:text-white hover:text-teal-600 cursor-pointer"
                      >
                        {b.medicineName}
                      </button>
                      <p className="font-mono text-[11px] text-slate-500">
                        {b.batchNumber} · {b.itemCode}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-slate-800 dark:text-slate-200">{b.category}</p>
                      <p className="text-[11px] text-slate-500">{b.storageLocation}</p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      {b.quantityAvailable}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">{formatDate(b.expiryDate)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {b.daysUntilExpiry < 0 ? (
                        <span className="text-red-600 dark:text-red-400 font-semibold">
                          -{Math.abs(b.daysUntilExpiry)}d
                        </span>
                      ) : (
                        <span>{b.daysUntilExpiry}d</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <StatusText status={b.expiryClassification} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canManage && b.expiryClassification === 'Expired' && b.quantityAvailable > 0 && (
                          <Button size="sm" variant="danger" onClick={() => handleWriteOff(b)}>
                            <Trash2 className="w-3 h-3" />
                            Remove / Write Off
                          </Button>
                        )}
                        {canManage && b.eligibleForExchange && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate('marketplace-new', b.id)}
                          >
                            <ArrowLeftRight className="w-3 h-3" />
                            Offer Surplus
                          </Button>
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
    </div>
  );
}
