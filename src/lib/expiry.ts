import type { ExpiryClassification } from '../types/medistock.ts';

export function getDaysUntilExpiry(expiryDateStr: string, now = new Date()): number {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const parts = expiryDateStr.split('T')[0].split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return 0;
  }
  const expiryUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  return Math.floor((expiryUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

export function classifyExpiry(expiryDateStr: string, now = new Date()): ExpiryClassification {
  const days = getDaysUntilExpiry(expiryDateStr, now);
  if (days < 0) return 'Expired';
  if (days <= 7) return 'Expiring within 7 days';
  if (days <= 30) return 'Expiring within 30 days';
  if (days <= 60) return 'Expiring within 60 days';
  if (days <= 90) return 'Expiring within 90 days';
  return 'Safe / Not Near Expiry';
}

export function isBatchEligibleForExchange(batch: {
  expiryDate: string;
  quantityAvailable: number;
  reservedQuantity: number;
  quarantined: boolean | number;
  conditionStatus: string;
}, now = new Date()): { eligible: boolean; reason?: string } {
  const days = getDaysUntilExpiry(batch.expiryDate, now);
  if (days < 0) {
    return { eligible: false, reason: 'Expired stock cannot be listed or exchanged.' };
  }
  if (days === 0) {
    return { eligible: false, reason: 'Stock expiring today cannot be listed for exchange.' };
  }
  if (Boolean(batch.quarantined) || batch.conditionStatus === 'Damaged' || batch.conditionStatus === 'Quarantined') {
    return { eligible: false, reason: 'Quarantined or damaged stock is blocked from exchange.' };
  }
  const freeQty = batch.quantityAvailable - batch.reservedQuantity;
  if (freeQty <= 0) {
    return { eligible: false, reason: 'No unreserved stock available in this batch.' };
  }
  return { eligible: true };
}

export function classifyStockStatus(
  totalQuantity: number,
  reorderLevel: number
): 'Out of Stock' | 'Low Stock' | 'Adequate' | 'Surplus' {
  if (totalQuantity <= 0) return 'Out of Stock';
  if (totalQuantity <= reorderLevel) return 'Low Stock';
  if (totalQuantity >= reorderLevel * 4) return 'Surplus';
  return 'Adequate';
}

export function addDaysIso(daysOffset: number, base = new Date()): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + daysOffset));
  return d.toISOString().slice(0, 10);
}
