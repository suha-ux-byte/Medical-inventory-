import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Download,
  History,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { exportRowsToCsv, exportRowsToPdf } from '../lib/exportUtils.ts';
import { formatCurrency, formatDate } from '../lib/utils.ts';
import type { ExchangeRequest, ExchangeTransaction } from '../types/medistock.ts';
import {
  Button,
  Card,
  EmptyState,
  StatusText,
  TableSkeleton,
} from '../components/ui/Primitives.tsx';

// ==================================================
// PAGE 10: EXCHANGE REQUESTS WORKFLOW
// ==================================================
export function ExchangeRequestsPage() {
  const { user, navigate, globalScope, refreshUnreadCount } = useAuth();
  const [requests, setRequests] = useState<ExchangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [actingId, setActingId] = useState<number | null>(null);

  const canAct = user?.role !== 'Staff Member';

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const qs = globalScope && user?.role === 'System Administrator' ? '?scope=global' : '';
      const res = await apiRequest<{ requests: ExchangeRequest[] }>(`/exchanges/requests${qs}`);
      setRequests(res.requests);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load exchange requests.');
    } finally {
      setLoading(false);
    }
  }, [globalScope, user?.role]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function handleAction(
    reqItem: ExchangeRequest,
    action: 'approve' | 'reject' | 'process' | 'cancel' | 'confirm-handover'
  ) {
    setActingId(reqItem.id);
    try {
      const res = await apiRequest<{ message: string }>(`/exchanges/requests/${reqItem.id}/action`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      toast.success(res.message);
      await loadRequests();
      refreshUnreadCount();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Workflow action failed.');
    } finally {
      setActingId(null);
    }
  }

  const filtered = requests.filter((r) => {
    if (tab === 'incoming') return r.ownerOrgId === user?.organizationId;
    if (tab === 'outgoing') return r.requesterOrgId === user?.organizationId;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Stock Exchange Requests &amp; Handover Workflow
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Approved requests reserve batch units atomically. Both organizations confirm handover to transfer inventory.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => navigate('exchange-history')}>
            Transaction History
          </Button>
          <Button size="sm" onClick={() => navigate('marketplace')}>
            Browse Marketplace
          </Button>
        </div>
      </div>

      {/* Segmented Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
          {(
            [
              { id: 'all', label: 'All Requests' },
              { id: 'incoming', label: 'Incoming (Stock Owner)' },
              { id: 'outgoing', label: 'Outgoing (Requested)' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                tab === t.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 font-mono tabular-nums">
          {filtered.length} requests
        </span>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No exchange requests in this view"
            description="Request surplus stock from the Marketplace or list your organization's surplus batches."
            action={
              <Button size="sm" onClick={() => navigate('marketplace')}>
                Explore Marketplace
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filtered.map((r) => {
              const isOwner = r.ownerOrgId === user?.organizationId;
              const isRequester = r.requesterOrgId === user?.organizationId;
              const isSysAdmin = user?.role === 'System Administrator';
              const busy = actingId === r.id;

              const userHasConfirmed =
                (isOwner && r.ownerConfirmed) || (isRequester && r.requesterConfirmed);

              return (
                <div key={r.id} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">
                        {r.requestCode}
                      </span>
                      <span className="text-slate-400">·</span>
                      <StatusText status={r.status} />
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">{r.exchangeType}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono text-slate-500">{formatDate(r.createdAt)}</span>
                    </div>

                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {r.medicineName} —{' '}
                      <span className="font-mono tabular-nums">
                        {r.requestedQuantity} {r.unitOfMeasure}
                      </span>
                    </h3>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <span>{r.ownerOrgName}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span>{r.requesterOrgName}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono text-[11px] text-slate-500">
                        Batch {r.batchNumber} (Exp {formatDate(r.expiryDate)})
                      </span>
                    </div>

                    {r.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{r.notes}</p>
                    )}

                    {(r.status === 'Approved' || r.status === 'Processing') && (
                      <p className="text-[11px] text-cyan-700 dark:text-cyan-400 pt-1">
                        Handover sign-off: Owner ({r.ownerConfirmed ? 'Confirmed' : 'Pending'}) · Requester (
                        {r.requesterConfirmed ? 'Confirmed' : 'Pending'})
                      </p>
                    )}
                  </div>

                  {/* Workflow Actions */}
                  {canAct && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {r.status === 'Pending' && (isOwner || isSysAdmin) && (
                        <>
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => handleAction(r, 'approve')}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Approve &amp; Reserve
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busy}
                            onClick={() => handleAction(r, 'reject')}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </Button>
                        </>
                      )}

                      {r.status === 'Pending' && isRequester && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => handleAction(r, 'cancel')}
                        >
                          Cancel Request
                        </Button>
                      )}

                      {(r.status === 'Approved' || r.status === 'Processing') && (
                        <>
                          {r.status === 'Approved' && (isOwner || isSysAdmin) && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => handleAction(r, 'process')}
                            >
                              Mark Dispatching
                            </Button>
                          )}
                          {(isOwner || isRequester || isSysAdmin) && (!userHasConfirmed || isSysAdmin) && (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => handleAction(r, 'confirm-handover')}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Confirm Handover
                            </Button>
                          )}
                          {isRequester && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => handleAction(r, 'cancel')}
                            >
                              Cancel
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ==================================================
// PAGE 11: EXCHANGE TRANSACTION HISTORY
// ==================================================
export function ExchangeHistoryPage() {
  const { user, globalScope } = useAuth();
  const [transactions, setTransactions] = useState<ExchangeTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = globalScope && user?.role === 'System Administrator' ? '?scope=global' : '';
    apiRequest<{ transactions: ExchangeTransaction[] }>(`/exchanges/transactions${qs}`)
      .then((res) => setTransactions(res.transactions))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load transaction history.'))
      .finally(() => setLoading(false));
  }, [globalScope, user?.role]);

  function handleExport(format: 'csv' | 'pdf') {
    const columns = ['Transaction ID', 'Medicine', 'Batch', 'From Organization', 'To Organization', 'Type', 'Qty', 'Value', 'Completed Date'];
    const rows = transactions.map((t) => ({
      id: t.transactionCode,
      medicine: t.medicineName,
      batch: t.batchNumber,
      from: t.sourceOrgName,
      to: t.destinationOrgName,
      type: t.exchangeType,
      qty: `${t.quantityTransferred} ${t.unitOfMeasure}`,
      value: formatCurrency(t.totalValue),
      date: formatDate(t.completedAt),
    }));
    if (format === 'csv') {
      exportRowsToCsv('medistock_exchange_transactions.csv', columns, rows);
    } else {
      exportRowsToPdf(
        'medistock_exchange_transactions.pdf',
        'Stock Exchange Transaction History',
        user?.organizationName || 'MediStock',
        columns,
        rows
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Exchange Transaction Ledger
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Immutable audit trail of completed inter-facility medicine transfers and dual-confirmed handovers.
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

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={History}
            title="No completed exchange transactions yet"
            description="Completed transfers appear here once both organizations confirm handover."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Transaction ID</th>
                  <th className="py-3 px-4 font-medium">Medicine &amp; Batch</th>
                  <th className="py-3 px-4 font-medium">Source Facility</th>
                  <th className="py-3 px-4 font-medium">Destination Facility</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium text-right">Quantity</th>
                  <th className="py-3 px-4 font-medium text-right">Valuation</th>
                  <th className="py-3 px-4 font-medium">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-white">
                      {t.transactionCode}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900 dark:text-white">{t.medicineName}</p>
                      <p className="font-mono text-[11px] text-slate-500">{t.batchNumber}</p>
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{t.sourceOrgName}</td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{t.destinationOrgName}</td>
                    <td className="py-3 px-4">{t.exchangeType}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      {t.quantityTransferred} {t.unitOfMeasure}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatCurrency(t.totalValue)}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                      {formatDate(t.completedAt)}
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
