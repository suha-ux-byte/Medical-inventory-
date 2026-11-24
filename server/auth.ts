import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';
import type { UserRole } from '../src/types/medistock.ts';
import { classifyExpiry, getDaysUntilExpiry } from '../src/lib/expiry.ts';

export interface AuthUser {
  id: number;
  organizationId: number;
  organizationName: string;
  organizationType: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: string;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
  authToken?: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: number): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    tokenHash,
    userId,
    expiresAt
  );
  return { token, expiresAt };
}

export function revokeSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'Invalid authentication token.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT
        s.expires_at,
        u.id,
        u.organization_id,
        u.full_name,
        u.email,
        u.role,
        u.status,
        o.name AS organization_name,
        o.org_type AS organization_type
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN organizations o ON o.id = u.organization_id
       WHERE s.token_hash = ?`
    )
    .get(hashToken(token)) as
    | {
        expires_at: string;
        id: number;
        organization_id: number;
        full_name: string;
        email: string;
        role: UserRole;
        status: string;
        organization_name: string;
        organization_type: string;
      }
    | undefined;

  if (!row) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }

  if (row.status !== 'Active') {
    res.status(403).json({ error: 'Account is deactivated. Contact your organization administrator.' });
    return;
  }

  req.authToken = token;
  req.authUser = {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationType: row.organization_type,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
  };
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.authUser.role)) {
      res.status(403).json({
        error: `Insufficient permissions. Required role: ${allowedRoles.join(' or ')}.`,
      });
      return;
    }
    next();
  };
}

export function createNotification(params: {
  organizationId: number;
  userId?: number | null;
  type: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  title: string;
  message: string;
  relatedEntity?: string;
  relatedId?: number;
}): void {
  db.prepare(
    `INSERT INTO notifications (organization_id, user_id, type, severity, title, message, related_entity, related_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.organizationId,
    params.userId ?? null,
    params.type,
    params.severity,
    params.title,
    params.message,
    params.relatedEntity ?? null,
    params.relatedId ?? null
  );
}

export function logActivity(params: {
  organizationId: number;
  userId?: number | null;
  userName: string;
  action: string;
  entityType: string;
  entityId?: number | null;
  details: string;
  quantityDelta?: number;
}): void {
  db.prepare(
    `INSERT INTO activity_logs (organization_id, user_id, user_name, action, entity_type, entity_id, details, quantity_delta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.organizationId,
    params.userId ?? null,
    params.userName,
    params.action,
    params.entityType,
    params.entityId ?? null,
    params.details,
    params.quantityDelta ?? 0
  );
}

export function syncOrganizationAlerts(organizationId: number): void {
  const now = new Date();
  const batches = db
    .prepare(
      `SELECT b.id, b.batch_number, b.expiry_date, b.quantity_available, b.quarantined, m.name AS medicine_name
       FROM inventory_batches b
       JOIN medicines m ON m.id = b.medicine_id
       WHERE b.organization_id = ? AND b.quantity_available > 0`
    )
    .all(organizationId) as Array<{
    id: number;
    batch_number: string;
    expiry_date: string;
    quantity_available: number;
    quarantined: number;
    medicine_name: string;
  }>;

  // Automatically block any active listings whose batch has now expired or been quarantined
  const activeListings = db
    .prepare(
      `SELECT l.id, b.expiry_date, b.quarantined, b.quantity_available, b.reserved_quantity, b.condition_status
       FROM exchange_listings l
       JOIN inventory_batches b ON b.id = l.batch_id
       WHERE l.organization_id = ? AND l.status = 'Active'`
    )
    .all(organizationId) as Array<{
    id: number;
    expiry_date: string;
    quarantined: number;
    quantity_available: number;
    reserved_quantity: number;
    condition_status: string;
  }>;

  for (const listing of activeListings) {
    const days = getDaysUntilExpiry(listing.expiry_date, now);
    if (
      days <= 0 ||
      listing.quarantined === 1 ||
      listing.condition_status === 'Damaged' ||
      listing.condition_status === 'Quarantined'
    ) {
      db.prepare("UPDATE exchange_listings SET status = 'Expired Blocked', updated_at = datetime('now') WHERE id = ?").run(
        listing.id
      );
    }
  }

  for (const batch of batches) {
    const classification = classifyExpiry(batch.expiry_date, now);
    let alertType: string | null = null;
    let severity: 'warning' | 'critical' = 'warning';
    let title = '';
    let message = '';

    if (classification === 'Expired') {
      alertType = 'expired';
      severity = 'critical';
      title = `Expired Batch: ${batch.medicine_name}`;
      message = `Batch ${batch.batch_number} (${batch.quantity_available} units) expired on ${batch.expiry_date}. Urgent quarantine/removal required.`;
    } else if (classification === 'Expiring within 7 days') {
      alertType = 'expiry_critical';
      severity = 'critical';
      title = `Critical Expiry (<= 7 days): ${batch.medicine_name}`;
      message = `Batch ${batch.batch_number} (${batch.quantity_available} units) expires on ${batch.expiry_date}. Prioritize immediate dispensing or transfer.`;
    } else if (classification === 'Expiring within 30 days') {
      alertType = 'expiry_warning';
      severity = 'warning';
      title = `Near Expiry (<= 30 days): ${batch.medicine_name}`;
      message = `Batch ${batch.batch_number} (${batch.quantity_available} units) expires on ${batch.expiry_date}. Consider listing surplus on Stock Exchange.`;
    }

    if (alertType) {
      const existing = db
        .prepare(
          `SELECT id FROM notifications
           WHERE organization_id = ? AND type = ? AND related_entity = 'batch' AND related_id = ?`
        )
        .get(organizationId, alertType, batch.id);
      if (!existing) {
        createNotification({
          organizationId,
          type: alertType,
          severity,
          title,
          message,
          relatedEntity: 'batch',
          relatedId: batch.id,
        });
      }
    }
  }

  const lowStockMeds = db
    .prepare(
      `SELECT m.id, m.name, m.reorder_level, COALESCE(i.total_quantity, 0) AS total_quantity
       FROM medicines m
       LEFT JOIN inventory i ON i.medicine_id = m.id
       WHERE m.organization_id = ? AND COALESCE(i.total_quantity, 0) <= m.reorder_level`
    )
    .all(organizationId) as Array<{
    id: number;
    name: string;
    reorder_level: number;
    total_quantity: number;
  }>;

  for (const med of lowStockMeds) {
    const existing = db
      .prepare(
        `SELECT id FROM notifications
         WHERE organization_id = ? AND type = 'low_stock' AND related_entity = 'medicine' AND related_id = ? AND is_read = 0`
      )
      .get(organizationId, med.id);
    if (!existing) {
      createNotification({
        organizationId,
        type: 'low_stock',
        severity: med.total_quantity === 0 ? 'critical' : 'warning',
        title: med.total_quantity === 0 ? `Out of Stock: ${med.name}` : `Low Stock Alert: ${med.name}`,
        message: `${med.name} has ${med.total_quantity} units available (reorder threshold: ${med.reorder_level}).`,
        relatedEntity: 'medicine',
        relatedId: med.id,
      });
    }
  }
}
