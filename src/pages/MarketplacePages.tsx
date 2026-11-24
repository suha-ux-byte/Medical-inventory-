import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Building2,
  CalendarClock,
  MapPin,
  Plus,
  Search,
  ShieldAlert,
  Store,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { formatCurrency, formatDate } from '../lib/utils.ts';
import {
  EXCHANGE_TYPES,
  MEDICINE_CATEGORIES,
  type ExchangeListing,
  type ExchangeType,
  type InventoryBatch,
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
// PAGE 8: STOCK EXCHANGE MARKETPLACE
// ==================================================
export function MarketplacePage() {
  const { user, navigate } = useAuth();
  const [listings, setListings] = useState<ExchangeListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [location, setLocation] = useState('All');
  const [exchangeType, setExchangeType] = useState('All');
  const [includeOwn, setIncludeOwn] = useState(false);

  // Request modal
  const [selectedListing, setSelectedListing] = useState<ExchangeListing | null>(null);
  const [reqQuantity, setReqQuantity] = useState('10');
  const [reqNotes, setReqNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canExchange = user?.role !== 'Staff Member';

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set('search', search);
      if (category !== 'All') qs.set('category', category);
      if (location !== 'All') qs.set('location', location);
      if (exchangeType !== 'All') qs.set('exchangeType', exchangeType);
      if (includeOwn) qs.set('includeOwn', 'true');
      const res = await apiRequest<{ listings: ExchangeListing[] }>(`/marketplace?${qs.toString()}`);
      setListings(res.listings);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load marketplace listings.');
    } finally {
      setLoading(false);
    }
  }, [search, category, location, exchangeType, includeOwn]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const uniqueLocations = Array.from(
    new Set(listings.map((l) => `${l.organizationCity}, ${l.organizationState}`))
  ).sort();

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedListing) return;
    setSubmitting(true);
    try {
      const res = await apiRequest<{ requestCode: string; message: string }>('/exchanges/requests', {
        method: 'POST',
        body: JSON.stringify({
          listingId: selectedListing.id,
          requestedQuantity: Number(reqQuantity),
          notes: reqNotes,
        }),
      });
      toast.success(`${res.message} (${res.requestCode})`);
      setSelectedListing(null);
      setReqNotes('');
      navigate('exchange-requests');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit exchange request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Medical Stock Exchange Marketplace
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Discover verified surplus medical supplies from partner facilities. Expired or unsafe stock is automatically excluded.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => navigate('exchange-requests')}>
            My Requests
          </Button>
          {canExchange && (
            <Button size="sm" onClick={() => navigate('marketplace-new')}>
              <Plus className="w-3.5 h-3.5" />
              Offer Surplus Stock
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search medicine, batch, brand, or organization..."
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
          <Select value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="All">All Locations</option>
            {uniqueLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </Select>
          <Select value={exchangeType} onChange={(e) => setExchangeType(e.target.value)}>
            <option value="All">All Exchange Types</option>
            {EXCHANGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeOwn}
              onChange={(e) => setIncludeOwn(e.target.checked)}
              className="rounded border-slate-300"
            />
            Include listings published by my organization
          </label>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {listings.length} eligible listings
          </span>
        </div>
      </Card>

      {/* Listings Grid */}
      {loading ? (
        <Card className="p-6">
          <TableSkeleton rows={6} />
        </Card>
      ) : listings.length === 0 ? (
        <Card>
          <EmptyState
            icon={Store}
            title="No surplus stock listings match your filters"
            description="Adjust your location or category filters, or offer your facility's non-expired surplus batches."
            action={
              canExchange ? (
                <Button size="sm" onClick={() => navigate('marketplace-new')}>
                  <Plus className="w-3.5 h-3.5" />
                  Create Exchange Listing
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {listings.map((l) => {
            const isOwn = l.organizationId === user?.organizationId;
            return (
              <Card key={l.id} className="p-5 flex flex-col justify-between gap-4 hover:border-teal-500/60 transition-colors">
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{l.category} · {l.exchangeType}</span>
                      <span className="font-mono">{l.batchNumber}</span>
                    </div>
                    <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white mt-1">
                      {l.medicineName}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{l.brand}</p>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                    {l.description || 'Surplus verified batch available for healthcare facility transfer.'}
                  </p>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <p className="text-[11px] text-slate-500">Available Surplus</p>
                      <p className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                        {l.availableQuantity} {l.unitOfMeasure}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Batch Expiry</p>
                      <p className="font-mono font-medium text-slate-900 dark:text-white tabular-nums">
                        {formatDate(l.expiryDate)} ({l.daysUntilExpiry}d)
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-medium">
                      <Building2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span className="truncate">{l.organizationName}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {l.organizationCity}, {l.organizationState}
                      </span>
                      <StatusText status={l.organizationVerified} />
                    </div>
                    <p className="text-[11px] text-slate-500">Condition: {l.stockCondition}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    Ref. {formatCurrency(l.unitPrice)}/unit
                  </span>
                  {isOwn ? (
                    <span className="text-xs font-medium text-cyan-700 dark:text-cyan-400">
                      Your Facility Listing
                    </span>
                  ) : canExchange ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedListing(l);
                        setReqQuantity(String(Math.min(20, l.availableQuantity)));
                      }}
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      Request Stock
                    </Button>
                  ) : (
                    <span className="text-[11px] text-slate-400">Manager role required</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Request Exchange Modal */}
      <Modal
        open={Boolean(selectedListing)}
        onClose={() => setSelectedListing(null)}
        title={`Request Stock — ${selectedListing?.medicineName ?? ''}`}
        subtitle={
          selectedListing
            ? `From ${selectedListing.organizationName} · Batch ${selectedListing.batchNumber} (${selectedListing.availableQuantity} available)`
            : undefined
        }
      >
        {selectedListing && (
          <form onSubmit={handleSubmitRequest} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs">
              <div>
                <span className="text-slate-500">Expiry Date</span>
                <p className="font-mono font-medium mt-0.5">{formatDate(selectedListing.expiryDate)}</p>
              </div>
              <div>
                <span className="text-slate-500">Exchange Type</span>
                <p className="font-medium mt-0.5">{selectedListing.exchangeType}</p>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500">Contact Person</span>
                <p className="mt-0.5">{selectedListing.contactInfo}</p>
              </div>
            </div>
            <div>
              <FieldLabel required>
                Requested Quantity (max {selectedListing.availableQuantity} {selectedListing.unitOfMeasure})
              </FieldLabel>
              <Input
                type="number"
                min={1}
                max={selectedListing.availableQuantity}
                value={reqQuantity}
                onChange={(e) => setReqQuantity(e.target.value)}
                required
              />
            </div>
            <div>
              <FieldLabel>Clinical Justification &amp; Pickup Notes</FieldLabel>
              <Textarea
                rows={3}
                value={reqNotes}
                onChange={(e) => setReqNotes(e.target.value)}
                placeholder="Specify courier pickup window, cold-chain transport readiness, or clinical urgency..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSelectedListing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Exchange Request'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// ==================================================
// PAGE 9: CREATE EXCHANGE LISTING
// ==================================================
export function CreateListingPage() {
  const { user, routeState, navigate } = useAuth();
  const [eligibleBatches, setEligibleBatches] = useState<InventoryBatch[]>([]);
  const [blockedCount, setBlockedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [batchId, setBatchId] = useState<number>(routeState.paramId || 0);
  const [availableQuantity, setAvailableQuantity] = useState('25');
  const [exchangeType, setExchangeType] = useState<ExchangeType>('Transfer');
  const [stockCondition, setStockCondition] = useState('Sealed / Optimal');
  const [contactInfo, setContactInfo] = useState(`${user?.fullName ?? ''} · ${user?.email ?? ''}`);
  const [description, setDescription] = useState('');

  useEffect(() => {
    setLoading(true);
    apiRequest<{ items: MedicineItem[] }>('/inventory')
      .then((res) => {
        const allBatches: InventoryBatch[] = [];
        for (const item of res.items) {
          if (item.batches) {
            allBatches.push(...item.batches);
          }
        }
        const eligible = allBatches.filter((b) => b.eligibleForExchange);
        setBlockedCount(allBatches.length - eligible.length);
        setEligibleBatches(eligible);

        if (routeState.paramId && eligible.some((b) => b.id === routeState.paramId)) {
          setBatchId(routeState.paramId);
          const found = eligible.find((b) => b.id === routeState.paramId)!;
          setAvailableQuantity(String(Math.min(50, found.freeQuantity)));
        } else if (eligible.length > 0) {
          setBatchId(eligible[0].id);
          setAvailableQuantity(String(Math.min(50, eligible[0].freeQuantity)));
        }
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load eligible batches.'))
      .finally(() => setLoading(false));
  }, [routeState.paramId]);

  const selectedBatch = eligibleBatches.find((b) => b.id === batchId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBatch) return;
    setSaving(true);
    try {
      await apiRequest('/marketplace', {
        method: 'POST',
        body: JSON.stringify({
          batchId,
          availableQuantity: Number(availableQuantity),
          exchangeType,
          stockCondition,
          contactInfo,
          description,
        }),
      });
      toast.success('Surplus stock published to the Stock Exchange Marketplace.');
      navigate('marketplace');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not publish listing.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('marketplace')}>
          <ArrowLeft className="w-3.5 h-3.5" />
          Marketplace
        </Button>
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Offer Surplus Stock for Exchange
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Select an eligible non-expired batch from your organization&apos;s inventory.
          </p>
        </div>
      </div>

      {blockedCount > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-center gap-3 text-xs text-amber-900 dark:text-amber-200">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
          <span>
            <strong>{blockedCount}</strong> batches in your inventory are automatically excluded (expired, zero free
            stock, damaged, or quarantined) to preserve clinical safety.
          </span>
        </div>
      )}

      {loading ? (
        <Card className="p-6">
          <TableSkeleton rows={4} />
        </Card>
      ) : eligibleBatches.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="No eligible surplus batches available"
            description="Only non-expired, unquarantined batches with unreserved stock can be offered for exchange."
            action={
              <Button size="sm" onClick={() => navigate('inventory')}>
                Review Inventory
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <FieldLabel required>Select Eligible Batch</FieldLabel>
              <Select
                value={batchId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setBatchId(id);
                  const found = eligibleBatches.find((b) => b.id === id);
                  if (found) setAvailableQuantity(String(Math.min(50, found.freeQuantity)));
                }}
              >
                {eligibleBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.medicineName} — Batch {b.batchNumber} ({b.freeQuantity} unreserved · Exp {formatDate(b.expiryDate)})
                  </option>
                ))}
              </Select>
            </div>

            {selectedBatch && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs">
                <div>
                  <span className="text-slate-500">Unreserved Stock</span>
                  <p className="font-mono font-semibold mt-0.5 tabular-nums">
                    {selectedBatch.freeQuantity} {selectedBatch.unitOfMeasure}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Expiry Date</span>
                  <p className="font-mono font-medium mt-0.5">{formatDate(selectedBatch.expiryDate)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Shelf Life</span>
                  <p className="font-mono mt-0.5">{selectedBatch.daysUntilExpiry} days left</p>
                </div>
                <div>
                  <span className="text-slate-500">Condition</span>
                  <p className="mt-0.5">{selectedBatch.conditionStatus}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <FieldLabel required>Quantity to Offer (max {selectedBatch?.freeQuantity ?? 0})</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  max={selectedBatch?.freeQuantity ?? 1}
                  value={availableQuantity}
                  onChange={(e) => setAvailableQuantity(e.target.value)}
                  required
                />
              </div>
              <div>
                <FieldLabel required>Exchange Type</FieldLabel>
                <Select
                  value={exchangeType}
                  onChange={(e) => setExchangeType(e.target.value as ExchangeType)}
                >
                  {EXCHANGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <FieldLabel required>Stock Condition</FieldLabel>
                <Select value={stockCondition} onChange={(e) => setStockCondition(e.target.value)}>
                  <option value="Sealed / Optimal">Sealed / Optimal</option>
                  <option value="Cold Chain Verified">Cold Chain Verified</option>
                  <option value="Opened Outer Box">Opened Outer Box</option>
                </Select>
              </div>
            </div>

            <div>
              <FieldLabel required>Dispatch Contact Information</FieldLabel>
              <Input
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="Pharmacist name, phone, pickup dock hours"
                required
              />
            </div>

            <div>
              <FieldLabel>Listing Description</FieldLabel>
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe reason for surplus, cold-chain packaging, or preferred swap items..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => navigate('marketplace')}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Publishing...' : 'Publish Exchange Listing'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
