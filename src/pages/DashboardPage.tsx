import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  Package,
  RefreshCw,
  Repeat,
  TrendingDown,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { formatCurrency, formatDate } from '../lib/utils.ts';
import type { DashboardSummary } from '../types/medistock.ts';
import { Button, Card, StatusText } from '../components/ui/Primitives.tsx';

const CATEGORY_COLORS = ['#0D9488', '#0891B2', '#0F2942', '#10B981', '#6366F1', '#F59E0B', '#EC4899', '#8B5CF6'];

export function DashboardPage() {
  const { user, navigate, globalScope } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const scopeQuery = globalScope && user?.role === 'System Administrator' ? '?scope=global' : '';
      const res = await apiRequest<DashboardSummary>(`/dashboard${scopeQuery}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  }, [globalScope, user?.role]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="p-5 h-28 animate-pulse">
              <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-7 w-16 bg-slate-200 dark:bg-slate-800 rounded mt-3" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error || 'Unable to load dashboard.'}</p>
        <Button onClick={loadDashboard} variant="outline">
          Retry
        </Button>
      </Card>
    );
  }

  const { stats } = data;

  const kpis = [
    {
      label: 'Total Medical Items',
      value: stats.totalMedicines.toLocaleString(),
      sub: `${formatCurrency(stats.totalInventoryValue)} total valuation`,
      icon: Package,
      tone: 'text-[#0F2942] dark:text-cyan-400',
      onClick: () => navigate('inventory'),
    },
    {
      label: 'Total Stock Units',
      value: stats.totalStockUnits.toLocaleString(),
      sub: 'Across tracked active batches',
      icon: CheckCircle2,
      tone: 'text-teal-600 dark:text-teal-400',
      onClick: () => navigate('inventory'),
    },
    {
      label: 'Expired Items',
      value: stats.expiredItems.toLocaleString(),
      sub: 'Batches needing urgent removal',
      icon: AlertTriangle,
      tone: stats.expiredItems > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600',
      onClick: () => navigate('expiry'),
    },
    {
      label: 'Expiring Within 30 Days',
      value: stats.expiringWithin30Days.toLocaleString(),
      sub: 'Eligible for priority transfer',
      icon: CalendarClock,
      tone: stats.expiringWithin30Days > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600',
      onClick: () => navigate('expiry'),
    },
    {
      label: 'Low Stock Items',
      value: stats.lowStockItems.toLocaleString(),
      sub: 'At or below reorder level',
      icon: TrendingDown,
      tone: stats.lowStockItems > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600',
      onClick: () => navigate('inventory'),
    },
    {
      label: 'Pending Exchange Requests',
      value: stats.pendingExchangeRequests.toLocaleString(),
      sub: 'Active & awaiting handover',
      icon: Repeat,
      tone: 'text-cyan-600 dark:text-cyan-400',
      onClick: () => navigate('exchange-requests'),
    },
    {
      label: 'Successful Exchanges',
      value: stats.successfulExchanges.toLocaleString(),
      sub: `${stats.wastagePreventedUnits.toLocaleString()} units redistributed`,
      icon: ArrowUpRight,
      tone: 'text-emerald-600 dark:text-emerald-400',
      onClick: () => navigate('exchange-history'),
    },
    {
      label: 'Connected Organizations',
      value: stats.connectedOrganizations.toLocaleString(),
      sub: 'Hospitals, clinics, pharmacies & NGOs',
      icon: Building2,
      tone: 'text-[#0F2942] dark:text-slate-200',
      onClick: () => navigate('organizations'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Operational Overview
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {globalScope && user?.role === 'System Administrator'
              ? 'Aggregated across all connected healthcare facilities'
              : `Live batch inventory and exchange activity for ${user?.organizationName}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={loadDashboard}>
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate('marketplace')}>
            Browse Marketplace
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* 8 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <button
              key={k.label}
              type="button"
              onClick={k.onClick}
              className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-teal-500/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{k.label}</span>
                <Icon className={`w-4 h-4 ${k.tone}`} />
              </div>
              <p className="font-mono text-2xl font-semibold text-slate-900 dark:text-white mt-2 tabular-nums">
                {k.value}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">{k.sub}</p>
            </button>
          );
        })}
      </div>

      {/* Charts Row: Monthly Stock Movement + Expiry Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Monthly Stock Movement</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inbound receipts, ward dispenses, inter-facility exchanges, and expiry write-offs
              </p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthlyMovement} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="inboundGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0D9488" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outboundGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0891B2" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0891B2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F2942',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Area type="monotone" dataKey="inbound" name="Inbound" stroke="#0D9488" strokeWidth={2} fill="url(#inboundGrad)" />
                <Area type="monotone" dataKey="outbound" name="Dispensed" stroke="#0891B2" strokeWidth={2} fill="url(#outboundGrad)" />
                <Area type="monotone" dataKey="exchanged" name="Exchanged" stroke="#10B981" strokeWidth={2} fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-5 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Expiry Timeline Distribution</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Active stock units grouped by remaining shelf life
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('expiry')}
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
            >
              Inspect
            </button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.expiryTimeline} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F2942',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="units" name="Units" radius={[4, 4, 0, 0]}>
                  {data.expiryTimeline.map((entry) => {
                    const color =
                      entry.severity === 'critical'
                        ? '#DC2626'
                        : entry.severity === 'warning'
                          ? '#D97706'
                          : entry.severity === 'caution'
                            ? '#0891B2'
                            : entry.severity === 'info'
                              ? '#0F2942'
                              : '#16A34A';
                    return <Cell key={entry.bucket} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Category Distribution + Low Stock & Expiry Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-5 p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
            Stock Category Distribution
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Units on hand across medical supply categories
          </p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={data.categoryDistribution}
                margin={{ top: 0, right: 16, left: 20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis dataKey="category" type="category" width={110} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F2942',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="units" name="Stock Units" radius={[0, 4, 4, 0]}>
                  {data.categoryDistribution.map((entry, idx) => (
                    <Cell key={entry.category} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Expiry Alerts */}
        <Card className="lg:col-span-7 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Urgent Expiry Alerts</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Expired and &le; 30 day batches requiring removal or exchange
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('expiry')}>
              View All
            </Button>
          </div>
          {data.expiryAlerts.length === 0 ? (
            <p className="p-6 text-xs text-slate-500 dark:text-slate-400">
              No expired or near-expiry batches detected.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Medicine / Batch</th>
                    <th className="py-2.5 px-4 font-medium text-right">Qty</th>
                    <th className="py-2.5 px-4 font-medium">Expiry Date</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {data.expiryAlerts.map((b) => (
                    <tr
                      key={b.id}
                      onClick={() => navigate('batch-details', b.medicineId)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    >
                      <td className="py-2.5 px-4">
                        <p className="font-medium text-slate-900 dark:text-white">{b.medicineName}</p>
                        <p className="font-mono text-[11px] text-slate-500">{b.batchNumber}</p>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {b.quantityAvailable}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums">{formatDate(b.expiryDate)}</td>
                      <td className="py-2.5 px-4">
                        <StatusText status={b.expiryClassification} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Bottom Row: Low Stock Alerts + Recent Exchange Requests + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Low-Stock Alerts</h3>
            <button
              type="button"
              onClick={() => navigate('inventory')}
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
            >
              Manage
            </button>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.lowStockAlerts.length === 0 ? (
              <p className="p-5 text-xs text-slate-500">All items are above reorder thresholds.</p>
            ) : (
              data.lowStockAlerts.map((item) => (
                <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{item.name}</p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {item.itemCode} · Reorder at {item.reorderLevel}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-white">
                      {item.totalQuantity}
                    </p>
                    <StatusText status={item.stockStatus} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Exchange Requests</h3>
            <button
              type="button"
              onClick={() => navigate('exchange-requests')}
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
            >
              Workflow
            </button>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.recentExchangeRequests.length === 0 ? (
              <p className="p-5 text-xs text-slate-500">No recent exchange requests.</p>
            ) : (
              data.recentExchangeRequests.map((req) => (
                <div key={req.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                      {req.medicineName}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {req.requestCode} · {req.requestedQuantity} {req.unitOfMeasure}
                    </p>
                  </div>
                  <StatusText status={req.status} />
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Stock Activity</h3>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.recentActivity.length === 0 ? (
              <p className="p-5 text-xs text-slate-500">No activity recorded yet.</p>
            ) : (
              data.recentActivity.slice(0, 6).map((act) => (
                <div key={act.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-900 dark:text-white">{act.action}</span>
                    {act.quantityDelta !== 0 && (
                      <span
                        className={`font-mono text-xs font-semibold tabular-nums ${
                          act.quantityDelta > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {act.quantityDelta > 0 ? `+${act.quantityDelta}` : act.quantityDelta}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                    {act.details}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {act.userName} · {formatDate(act.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
