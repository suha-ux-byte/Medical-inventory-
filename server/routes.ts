import crypto from 'node:crypto';
import express from 'express';
import { db, runInTransaction, syncMedicineInventoryAggregate } from './db.ts';
import {
  createNotification,
  createSession,
  hashPassword,
  hashToken,
  logActivity,
  requireAuth,
  requireRole,
  revokeSession,
  syncOrganizationAlerts,
  verifyPassword,
  type AuthenticatedRequest,
} from './auth.ts';
import {
  classifyExpiry,
  classifyStockStatus,
  getDaysUntilExpiry,
  isBatchEligibleForExchange,
} from '../src/lib/expiry.ts';
import {
  EXCHANGE_TYPES,
  MEDICINE_CATEGORIES,
  ORGANIZATION_TYPES,
  USER_ROLES,
  type ExchangeType,
  type MedicineCategory,
  type OrganizationType,
  type UserRole,
} from '../src/types/medistock.ts';

export const apiRouter = express.Router();

function enrichBatchRow(row: Record<string, unknown>, now = new Date()) {
  const quantityAvailable = Number(row.quantity_available ?? 0);
  const reservedQuantity = Number(row.reserved_quantity ?? 0);
  const freeQuantity = Math.max(0, quantityAvailable - reservedQuantity);
  const expiryDate = String(row.expiry_date ?? '');
  const daysUntilExpiry = getDaysUntilExpiry(expiryDate, now);
  const expiryClassification = classifyExpiry(expiryDate, now);
  const quarantined = Boolean(row.quarantined);
  const conditionStatus = String(row.condition_status ?? 'Sealed / Optimal');
  const eligibility = isBatchEligibleForExchange(
    {
      expiryDate,
      quantityAvailable,
      reservedQuantity,
      quarantined,
      conditionStatus,
    },
    now
  );

  return {
    id: Number(row.id),
    medicineId: Number(row.medicine_id),
    organizationId: Number(row.organization_id),
    supplierId: row.supplier_id ? Number(row.supplier_id) : null,
    supplierName: String(row.supplier_name ?? ''),
    batchNumber: String(row.batch_number ?? ''),
    quantityAvailable,
    reservedQuantity,
    freeQuantity,
    purchaseDate: String(row.purchase_date ?? ''),
    manufacturingDate: String(row.manufacturing_date ?? ''),
    expiryDate,
    storageLocation: String(row.storage_location ?? ''),
    unitPrice: Number(row.unit_price ?? 0),
    conditionStatus,
    quarantined,
    daysUntilExpiry,
    expiryClassification,
    eligibleForExchange: eligibility.eligible,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    medicineName: row.medicine_name ? String(row.medicine_name) : undefined,
    itemCode: row.item_code ? String(row.item_code) : undefined,
    category: row.category ? (String(row.category) as MedicineCategory) : undefined,
    brand: row.brand ? String(row.brand) : undefined,
    unitOfMeasure: row.unit_of_measure ? String(row.unit_of_measure) : undefined,
    organizationName: row.organization_name ? String(row.organization_name) : undefined,
  };
}

function getTargetOrgId(req: AuthenticatedRequest): number {
  const user = req.authUser!;
  if (user.role === 'System Administrator' && req.query.orgId && req.query.orgId !== 'all') {
    const parsed = Number(req.query.orgId);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return user.organizationId;
}

// ==========================================
// 1. AUTHENTICATION & PASSWORD RESET
// ==========================================
apiRouter.post('/auth/login', (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = db
    .prepare(
      `SELECT u.*, o.name AS organization_name, o.org_type AS organization_type
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       WHERE lower(u.email) = ?`
    )
    .get(email) as
    | {
        id: number;
        organization_id: number;
        full_name: string;
        email: string;
        password_hash: string;
        role: UserRole;
        status: string;
        last_login_at: string | null;
        created_at: string;
        organization_name: string;
        organization_type: OrganizationType;
      }
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (user.status !== 'Active') {
    res.status(403).json({ error: 'Your account has been deactivated. Contact an administrator.' });
    return;
  }

  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  syncOrganizationAlerts(user.organization_id);
  const { token, expiresAt } = createSession(user.id);

  res.json({
    token,
    expiresAt,
    user: {
      id: user.id,
      organizationId: user.organization_id,
      organizationName: user.organization_name,
      organizationType: user.organization_type,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLoginAt: new Date().toISOString(),
      createdAt: user.created_at,
    },
  });
});

apiRouter.post('/auth/register', (req, res) => {
  const fullName = String(req.body?.fullName ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const orgName = String(req.body?.organizationName ?? '').trim();
  const orgType = String(req.body?.organizationType ?? 'Hospital') as OrganizationType;
  const registrationNumber = String(req.body?.registrationNumber ?? '').trim();
  const address = String(req.body?.address ?? '').trim();
  const city = String(req.body?.city ?? '').trim();
  const state = String(req.body?.state ?? '').trim();
  const phone = String(req.body?.phone ?? '').trim();

  if (!fullName || !email || !password || !orgName || !registrationNumber || !city || !state) {
    res.status(400).json({ error: 'Please complete all required organization and account fields.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }
  if (!ORGANIZATION_TYPES.includes(orgType)) {
    res.status(400).json({ error: 'Invalid organization type.' });
    return;
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
  if (existingUser) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const existingReg = db
    .prepare('SELECT id FROM organizations WHERE lower(registration_number) = ?')
    .get(registrationNumber.toLowerCase());
  if (existingReg) {
    res.status(409).json({ error: 'An organization with this registration number is already registered.' });
    return;
  }

  const passwordHash = hashPassword(password);
  const orgCode = `ORG-${Math.floor(100000 + Math.random() * 900000)}`;

  const created = runInTransaction(() => {
    const orgRes = db
      .prepare(
        `INSERT INTO organizations (org_code, name, org_type, registration_number, address, city, state, contact_person, phone, email, verification_status, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Verification', 0)`
      )
      .run(orgCode, orgName, orgType, registrationNumber, address || 'Main Campus', city, state, fullName, phone || 'Not provided', email);

    const organizationId = Number(orgRes.lastInsertRowid);
    const userRes = db
      .prepare(
        `INSERT INTO users (organization_id, full_name, email, password_hash, role, status)
         VALUES (?, ?, ?, ?, 'Organization Administrator', 'Active')`
      )
      .run(organizationId, fullName, email, passwordHash);

    const userId = Number(userRes.lastInsertRowid);
    createNotification({
      organizationId,
      userId,
      type: 'inventory_update',
      severity: 'info',
      title: 'Welcome to MediStock',
      message: `${orgName} has been registered. Add your medical inventory or upload CSV/Excel stock sheets to begin expiry tracking.`,
    });
    logActivity({
      organizationId,
      userId,
      userName: fullName,
      action: 'Organization Registered',
      entityType: 'organization',
      entityId: organizationId,
      details: `Registered ${orgName} (${orgType})`,
    });

    return { organizationId, userId };
  });

  const { token, expiresAt } = createSession(created.userId);
  res.status(201).json({
    token,
    expiresAt,
    user: {
      id: created.userId,
      organizationId: created.organizationId,
      organizationName: orgName,
      organizationType: orgType,
      fullName,
      email,
      role: 'Organization Administrator' as UserRole,
      status: 'Active',
      lastLoginAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  });
});

apiRouter.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.authToken) {
    revokeSession(req.authToken);
  }
  res.json({ ok: true });
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(user.organizationId);
  res.json({ user, organization: org });
});

apiRouter.post('/auth/forgot-password', (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: 'Email address is required.' });
    return;
  }
  const user = db.prepare('SELECT id, email FROM users WHERE lower(email) = ?').get(email) as
    | { id: number; email: string }
    | undefined;

  if (!user) {
    // Return uniform success message to avoid email enumeration while supporting demo flow
    res.json({
      message: 'If an account matches that email, a password reset code has been generated.',
    });
    return;
  }

  const resetCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at, used) VALUES (?, ?, ?, 0)').run(
    hashToken(resetCode),
    user.id,
    expiresAt
  );

  res.json({
    message: 'Password reset code generated (valid for 15 minutes).',
    previewResetCode: resetCode,
  });
});

apiRouter.post('/auth/reset-password', (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const resetCode = String(req.body?.resetCode ?? '').trim().toUpperCase();
  const newPassword = String(req.body?.newPassword ?? '');

  if (!email || !resetCode || newPassword.length < 8) {
    res.status(400).json({ error: 'Valid email, reset code, and password (8+ chars) are required.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT pr.token_hash, pr.user_id, pr.expires_at, pr.used
       FROM password_resets pr
       JOIN users u ON u.id = pr.user_id
       WHERE lower(u.email) = ? AND pr.token_hash = ?`
    )
    .get(email, hashToken(resetCode)) as
    | { token_hash: string; user_id: number; expires_at: string; used: number }
    | undefined;

  if (!row || row.used === 1 || new Date(row.expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: 'Invalid or expired password reset code.' });
    return;
  }

  const newHash = hashPassword(newPassword);
  runInTransaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, row.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ?').run(row.token_hash);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
  });

  res.json({ message: 'Password updated successfully. You can now sign in.' });
});

apiRouter.post('/auth/change-password', requireAuth, (req: AuthenticatedRequest, res) => {
  const currentPassword = String(req.body?.currentPassword ?? '');
  const newPassword = String(req.body?.newPassword ?? '');
  if (!currentPassword || newPassword.length < 8) {
    res.status(400).json({ error: 'Current password and new password (8+ characters) are required.' });
    return;
  }

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.authUser!.id) as {
    password_hash: string;
  };
  if (!verifyPassword(currentPassword, row.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.authUser!.id);
  res.json({ message: 'Password updated successfully.' });
});

// ==========================================
// 2. DASHBOARD ANALYTICS
// ==========================================
apiRouter.get('/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const isGlobal = user.role === 'System Administrator' && req.query.scope === 'global';
  const orgId = user.organizationId;
  const now = new Date();

  const medWhere = isGlobal ? '1=1' : 'm.organization_id = ?';
  const medParams = isGlobal ? [] : [orgId];

  const medicines = db
    .prepare(
      `SELECT m.*, COALESCE(i.total_quantity, 0) AS total_quantity, COALESCE(i.reserved_quantity, 0) AS reserved_quantity
       FROM medicines m
       LEFT JOIN inventory i ON i.medicine_id = m.id
       WHERE ${medWhere}`
    )
    .all(...medParams) as Array<Record<string, unknown>>;

  const batchWhere = isGlobal ? '1=1' : 'b.organization_id = ?';
  const rawBatches = db
    .prepare(
      `SELECT b.*, m.name AS medicine_name, m.item_code, m.category, m.brand, m.unit_of_measure, o.name AS organization_name
       FROM inventory_batches b
       JOIN medicines m ON m.id = b.medicine_id
       JOIN organizations o ON o.id = b.organization_id
       WHERE ${batchWhere}
       ORDER BY b.expiry_date ASC`
    )
    .all(...medParams) as Array<Record<string, unknown>>;

  const batches = rawBatches.map((r) => enrichBatchRow(r, now));

  const totalMedicines = medicines.length;
  let totalStockUnits = 0;
  let totalInventoryValue = 0;
  let lowStockItems = 0;
  const lowStockAlerts: Array<Record<string, unknown>> = [];
  const categoryMap = new Map<string, { category: string; items: number; units: number; value: number }>();

  for (const cat of MEDICINE_CATEGORIES) {
    categoryMap.set(cat, { category: cat, items: 0, units: 0, value: 0 });
  }

  for (const m of medicines) {
    const qty = Number(m.total_quantity ?? 0);
    const reorder = Number(m.reorder_level ?? 0);
    const price = Number(m.unit_price ?? 0);
    totalStockUnits += qty;
    totalInventoryValue += qty * price;
    const stockStatus = classifyStockStatus(qty, reorder);
    if (stockStatus === 'Low Stock' || stockStatus === 'Out of Stock') {
      lowStockItems++;
      lowStockAlerts.push({
        id: Number(m.id),
        itemCode: String(m.item_code),
        name: String(m.name),
        category: String(m.category),
        totalQuantity: qty,
        reorderLevel: reorder,
        unitOfMeasure: String(m.unit_of_measure),
        stockStatus,
        storageLocation: String(m.storage_location),
      });
    }
    const cat = String(m.category);
    const entry = categoryMap.get(cat) ?? { category: cat, items: 0, units: 0, value: 0 };
    entry.items += 1;
    entry.units += qty;
    entry.value = Number((entry.value + qty * price).toFixed(2));
    categoryMap.set(cat, entry);
  }

  let expiredItems = 0;
  let expiringWithin30Days = 0;
  const timelineBuckets = [
    { bucket: 'Expired', batches: 0, units: 0, severity: 'critical' },
    { bucket: '0–7 Days', batches: 0, units: 0, severity: 'critical' },
    { bucket: '8–30 Days', batches: 0, units: 0, severity: 'warning' },
    { bucket: '31–60 Days', batches: 0, units: 0, severity: 'caution' },
    { bucket: '61–90 Days', batches: 0, units: 0, severity: 'info' },
    { bucket: '90+ Days Safe', batches: 0, units: 0, severity: 'safe' },
  ];

  const expiryAlerts = [];
  for (const b of batches) {
    if (b.quantityAvailable <= 0) continue;
    if (b.expiryClassification === 'Expired') {
      expiredItems++;
      timelineBuckets[0].batches++;
      timelineBuckets[0].units += b.quantityAvailable;
      expiryAlerts.push(b);
    } else if (b.expiryClassification === 'Expiring within 7 days') {
      expiringWithin30Days++;
      timelineBuckets[1].batches++;
      timelineBuckets[1].units += b.quantityAvailable;
      expiryAlerts.push(b);
    } else if (b.expiryClassification === 'Expiring within 30 days') {
      expiringWithin30Days++;
      timelineBuckets[2].batches++;
      timelineBuckets[2].units += b.quantityAvailable;
      expiryAlerts.push(b);
    } else if (b.expiryClassification === 'Expiring within 60 days') {
      timelineBuckets[3].batches++;
      timelineBuckets[3].units += b.quantityAvailable;
    } else if (b.expiryClassification === 'Expiring within 90 days') {
      timelineBuckets[4].batches++;
      timelineBuckets[4].units += b.quantityAvailable;
    } else {
      timelineBuckets[5].batches++;
      timelineBuckets[5].units += b.quantityAvailable;
    }
  }

  const reqWhere = isGlobal ? '1=1' : '(r.owner_org_id = ? OR r.requester_org_id = ?)';
  const reqParams = isGlobal ? [] : [orgId, orgId];
  const pendingRow = db
    .prepare(
      `SELECT COUNT(*) AS count FROM exchange_requests r WHERE ${reqWhere} AND r.status IN ('Pending', 'Approved', 'Processing')`
    )
    .get(...reqParams) as { count: number };

  const txnWhere = isGlobal ? '1=1' : '(t.source_org_id = ? OR t.destination_org_id = ?)';
  const completedRow = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(quantity_transferred), 0) AS units FROM exchange_transactions t WHERE ${txnWhere}`
    )
    .get(...reqParams) as { count: number; units: number };

  const orgCountRow = db.prepare('SELECT COUNT(*) AS count FROM organizations').get() as { count: number };

  const recentActivity = db
    .prepare(
      `SELECT a.*, o.name AS organization_name
       FROM activity_logs a
       JOIN organizations o ON o.id = a.organization_id
       WHERE ${isGlobal ? '1=1' : 'a.organization_id = ?'}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 10`
    )
    .all(...medParams) as Array<Record<string, unknown>>;

  const recentRequests = db
    .prepare(
      `SELECT r.*,
        oo.name AS owner_org_name, oo.city AS owner_org_city,
        ro.name AS requester_org_name, ro.city AS requester_org_city,
        u.full_name AS requester_user_name,
        l.medicine_name, l.category, l.batch_number, l.expiry_date, l.unit_of_measure
       FROM exchange_requests r
       JOIN organizations oo ON oo.id = r.owner_org_id
       JOIN organizations ro ON ro.id = r.requester_org_id
       JOIN users u ON u.id = r.requester_user_id
       JOIN exchange_listings l ON l.id = r.listing_id
       WHERE ${reqWhere}
       ORDER BY r.created_at DESC
       LIMIT 6`
    )
    .all(...reqParams) as Array<Record<string, unknown>>;

  // Build 6-month movement from activity_logs
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyMap = new Map<string, { month: string; inbound: number; outbound: number; exchanged: number; expired: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(key, {
      month: `${monthNames[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
      inbound: 0,
      outbound: 0,
      exchanged: 0,
      expired: 0,
    });
  }

  const allLogs = db
    .prepare(
      `SELECT action, quantity_delta, created_at FROM activity_logs WHERE ${isGlobal ? '1=1' : 'organization_id = ?'}`
    )
    .all(...medParams) as Array<{ action: string; quantity_delta: number; created_at: string }>;

  for (const log of allLogs) {
    const key = log.created_at.slice(0, 7);
    const bucket = monthlyMap.get(key);
    if (!bucket) continue;
    const absDelta = Math.abs(log.quantity_delta);
    if (log.action.includes('Exchange')) {
      bucket.exchanged += absDelta;
    } else if (log.action.includes('Write-Off') || log.action.includes('Expired')) {
      bucket.expired += absDelta;
    } else if (log.quantity_delta > 0) {
      bucket.inbound += absDelta;
    } else if (log.quantity_delta < 0) {
      bucket.outbound += absDelta;
    }
  }

  res.json({
    stats: {
      totalMedicines,
      totalStockUnits,
      expiredItems,
      expiringWithin30Days,
      lowStockItems,
      pendingExchangeRequests: pendingRow.count,
      successfulExchanges: completedRow.count,
      connectedOrganizations: orgCountRow.count,
      totalInventoryValue: Number(totalInventoryValue.toFixed(2)),
      wastagePreventedUnits: completedRow.units,
    },
    categoryDistribution: Array.from(categoryMap.values()).filter((c) => c.items > 0),
    monthlyMovement: Array.from(monthlyMap.values()),
    expiryTimeline: timelineBuckets,
    recentActivity: recentActivity.map((a) => ({
      id: Number(a.id),
      organizationId: Number(a.organization_id),
      organizationName: String(a.organization_name),
      userId: a.user_id ? Number(a.user_id) : null,
      userName: String(a.user_name),
      action: String(a.action),
      entityType: String(a.entity_type),
      entityId: a.entity_id ? Number(a.entity_id) : null,
      details: String(a.details),
      quantityDelta: Number(a.quantity_delta),
      createdAt: String(a.created_at),
    })),
    lowStockAlerts: lowStockAlerts.slice(0, 8),
    expiryAlerts: expiryAlerts.slice(0, 8),
    recentExchangeRequests: recentRequests.map((r) => ({
      id: Number(r.id),
      requestCode: String(r.request_code),
      listingId: Number(r.listing_id),
      ownerOrgId: Number(r.owner_org_id),
      ownerOrgName: String(r.owner_org_name),
      requesterOrgId: Number(r.requester_org_id),
      requesterOrgName: String(r.requester_org_name),
      medicineName: String(r.medicine_name),
      category: String(r.category),
      batchNumber: String(r.batch_number),
      requestedQuantity: Number(r.requested_quantity),
      unitOfMeasure: String(r.unit_of_measure),
      exchangeType: String(r.exchange_type),
      status: String(r.status),
      createdAt: String(r.created_at),
    })),
  });
});

// ==========================================
// 3. INVENTORY & BATCH MANAGEMENT
// ==========================================
apiRouter.get('/inventory', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const isGlobal = user.role === 'System Administrator' && req.query.orgId === 'all';
  const targetOrgId = getTargetOrgId(req);
  const now = new Date();

  const whereClause = isGlobal ? '1=1' : 'm.organization_id = ?';
  const params = isGlobal ? [] : [targetOrgId];

  const meds = db
    .prepare(
      `SELECT m.*, o.name AS organization_name,
        COALESCE(i.total_quantity, 0) AS total_quantity,
        COALESCE(i.reserved_quantity, 0) AS reserved_quantity
       FROM medicines m
       JOIN organizations o ON o.id = m.organization_id
       LEFT JOIN inventory i ON i.medicine_id = m.id
       WHERE ${whereClause}
       ORDER BY m.name ASC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  const batches = db
    .prepare(
      `SELECT b.*, m.name AS medicine_name, m.item_code, m.category, m.brand, m.unit_of_measure, o.name AS organization_name
       FROM inventory_batches b
       JOIN medicines m ON m.id = b.medicine_id
       JOIN organizations o ON o.id = b.organization_id
       WHERE ${isGlobal ? '1=1' : 'b.organization_id = ?'}
       ORDER BY b.expiry_date ASC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  const batchesByMed = new Map<number, ReturnType<typeof enrichBatchRow>[]>();
  for (const row of batches) {
    const enriched = enrichBatchRow(row, now);
    const list = batchesByMed.get(enriched.medicineId) ?? [];
    list.push(enriched);
    batchesByMed.set(enriched.medicineId, list);
  }

  let items = meds.map((m) => {
    const medId = Number(m.id);
    const medBatches = batchesByMed.get(medId) ?? [];
    const activeBatches = medBatches.filter((b) => b.quantityAvailable > 0);
    const nearest = activeBatches[0] ?? medBatches[0] ?? null;
    const totalQuantity = Number(m.total_quantity ?? 0);
    const reservedQuantity = Number(m.reserved_quantity ?? 0);
    const reorderLevel = Number(m.reorder_level ?? 0);

    return {
      id: medId,
      itemCode: String(m.item_code),
      organizationId: Number(m.organization_id),
      organizationName: String(m.organization_name),
      name: String(m.name),
      genericName: String(m.generic_name ?? ''),
      category: String(m.category) as MedicineCategory,
      brand: String(m.brand),
      unitOfMeasure: String(m.unit_of_measure),
      reorderLevel,
      unitPrice: Number(m.unit_price ?? 0),
      storageLocation: String(m.storage_location),
      description: String(m.description ?? ''),
      totalQuantity,
      reservedQuantity,
      freeQuantity: Math.max(0, totalQuantity - reservedQuantity),
      batchCount: medBatches.length,
      nearestExpiryDate: nearest ? nearest.expiryDate : null,
      nearestExpiryDays: nearest ? nearest.daysUntilExpiry : null,
      expiryStatus: nearest ? nearest.expiryClassification : ('No Stock' as const),
      stockStatus: classifyStockStatus(totalQuantity, reorderLevel),
      batches: medBatches,
      createdAt: String(m.created_at),
      updatedAt: String(m.updated_at),
    };
  });

  const search = String(req.query.search ?? '').trim().toLowerCase();
  const category = String(req.query.category ?? '').trim();
  const expiryFilter = String(req.query.expiryStatus ?? '').trim();
  const stockFilter = String(req.query.stockStatus ?? '').trim();
  const sortBy = String(req.query.sortBy ?? 'name');

  if (search) {
    items = items.filter(
      (i) =>
        i.name.toLowerCase().includes(search) ||
        i.itemCode.toLowerCase().includes(search) ||
        i.brand.toLowerCase().includes(search) ||
        i.genericName.toLowerCase().includes(search) ||
        i.batches.some((b) => b.batchNumber.toLowerCase().includes(search))
    );
  }
  if (category && category !== 'All') {
    items = items.filter((i) => i.category === category);
  }
  if (expiryFilter && expiryFilter !== 'All') {
    items = items.filter((i) => i.expiryStatus === expiryFilter);
  }
  if (stockFilter && stockFilter !== 'All') {
    items = items.filter((i) => i.stockStatus === stockFilter);
  }

  items.sort((a, b) => {
    if (sortBy === 'expiry') {
      return (a.nearestExpiryDays ?? 99999) - (b.nearestExpiryDays ?? 99999);
    }
    if (sortBy === 'quantity-asc') return a.totalQuantity - b.totalQuantity;
    if (sortBy === 'quantity-desc') return b.totalQuantity - a.totalQuantity;
    return a.name.localeCompare(b.name);
  });

  res.json({ items });
});

apiRouter.get('/inventory/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const user = req.authUser!;
  const now = new Date();

  const med = db
    .prepare(
      `SELECT m.*, o.name AS organization_name,
        COALESCE(i.total_quantity, 0) AS total_quantity,
        COALESCE(i.reserved_quantity, 0) AS reserved_quantity
       FROM medicines m
       JOIN organizations o ON o.id = m.organization_id
       LEFT JOIN inventory i ON i.medicine_id = m.id
       WHERE m.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!med) {
    res.status(404).json({ error: 'Medical item not found.' });
    return;
  }
  if (user.role !== 'System Administrator' && Number(med.organization_id) !== user.organizationId) {
    res.status(403).json({ error: 'Access denied to another organization’s inventory item.' });
    return;
  }

  const rawBatches = db
    .prepare(
      `SELECT b.*, m.name AS medicine_name, m.item_code, m.category, m.brand, m.unit_of_measure, o.name AS organization_name
       FROM inventory_batches b
       JOIN medicines m ON m.id = b.medicine_id
       JOIN organizations o ON o.id = b.organization_id
       WHERE b.medicine_id = ?
       ORDER BY b.expiry_date ASC`
    )
    .all(id) as Array<Record<string, unknown>>;

  const batches = rawBatches.map((r) => enrichBatchRow(r, now));
  const totalQuantity = Number(med.total_quantity ?? 0);
  const reservedQuantity = Number(med.reserved_quantity ?? 0);
  const reorderLevel = Number(med.reorder_level ?? 0);
  const nearest = batches.find((b) => b.quantityAvailable > 0) ?? batches[0] ?? null;

  const logs = db
    .prepare(
      `SELECT * FROM activity_logs WHERE organization_id = ? AND (entity_id = ? OR details LIKE ?) ORDER BY created_at DESC LIMIT 20`
    )
    .all(Number(med.organization_id), id, `%${String(med.name)}%`);

  res.json({
    item: {
      id: Number(med.id),
      itemCode: String(med.item_code),
      organizationId: Number(med.organization_id),
      organizationName: String(med.organization_name),
      name: String(med.name),
      genericName: String(med.generic_name ?? ''),
      category: String(med.category) as MedicineCategory,
      brand: String(med.brand),
      unitOfMeasure: String(med.unit_of_measure),
      reorderLevel,
      unitPrice: Number(med.unit_price ?? 0),
      storageLocation: String(med.storage_location),
      description: String(med.description ?? ''),
      totalQuantity,
      reservedQuantity,
      freeQuantity: Math.max(0, totalQuantity - reservedQuantity),
      batchCount: batches.length,
      nearestExpiryDate: nearest ? nearest.expiryDate : null,
      nearestExpiryDays: nearest ? nearest.daysUntilExpiry : null,
      expiryStatus: nearest ? nearest.expiryClassification : 'No Stock',
      stockStatus: classifyStockStatus(totalQuantity, reorderLevel),
      batches,
      createdAt: String(med.created_at),
      updatedAt: String(med.updated_at),
    },
    logs,
  });
});

apiRouter.post(
  '/inventory',
  requireAuth,
  requireRole('System Administrator', 'Organization Administrator', 'Inventory Manager'),
  (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    const name = String(req.body?.name ?? '').trim();
    const itemCode = String(req.body?.itemCode ?? '').trim() || `MED-${Math.floor(1000 + Math.random() * 9000)}`;
    const genericName = String(req.body?.genericName ?? '').trim();
    const category = String(req.body?.category ?? '') as MedicineCategory;
    const brand = String(req.body?.brand ?? '').trim();
    const unitOfMeasure = String(req.body?.unitOfMeasure ?? '').trim();
    const reorderLevel = Number(req.body?.reorderLevel ?? 30);
    const unitPrice = Number(req.body?.unitPrice ?? 0);
    const storageLocation = String(req.body?.storageLocation ?? '').trim();
    const description = String(req.body?.description ?? '').trim();

    // Optional initial batch
    const batchNumber = String(req.body?.batchNumber ?? '').trim();
    const quantityAvailable = Number(req.body?.quantityAvailable ?? 0);
    const purchaseDate = String(req.body?.purchaseDate ?? '').trim() || new Date().toISOString().slice(0, 10);
    const manufacturingDate = String(req.body?.manufacturingDate ?? '').trim() || purchaseDate;
    const expiryDate = String(req.body?.expiryDate ?? '').trim();
    const supplierName = String(req.body?.supplierName ?? '').trim() || 'Direct Supplier';
    const conditionStatus = String(req.body?.conditionStatus ?? 'Sealed / Optimal');

    if (!name || !MEDICINE_CATEGORIES.includes(category) || !brand || !unitOfMeasure || !storageLocation) {
      res.status(400).json({ error: 'Name, valid category, brand, unit of measure, and storage location are required.' });
      return;
    }
    if (Number.isNaN(reorderLevel) || reorderLevel < 0 || Number.isNaN(unitPrice) || unitPrice < 0) {
      res.status(400).json({ error: 'Reorder level and unit price must be non-negative numbers.' });
      return;
    }
    if (batchNumber && (!expiryDate || Number.isNaN(quantityAvailable) || quantityAvailable < 0)) {
      res.status(400).json({ error: 'Initial batch requires valid expiry date and non-negative quantity.' });
      return;
    }

    const dupCode = db
      .prepare('SELECT id FROM medicines WHERE organization_id = ? AND lower(item_code) = ?')
      .get(user.organizationId, itemCode.toLowerCase());
    if (dupCode) {
      res.status(409).json({ error: `Item ID "${itemCode}" already exists in your organization.` });
      return;
    }

    const medicineId = runInTransaction(() => {
      const resMed = db
        .prepare(
          `INSERT INTO medicines (item_code, organization_id, name, generic_name, category, brand, unit_of_measure, reorder_level, unit_price, storage_location, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          itemCode,
          user.organizationId,
          name,
          genericName,
          category,
          brand,
          unitOfMeasure,
          reorderLevel,
          unitPrice,
          storageLocation,
          description
        );
      const medId = Number(resMed.lastInsertRowid);

      if (batchNumber && expiryDate) {
        db.prepare(
          `INSERT INTO inventory_batches (medicine_id, organization_id, supplier_name, batch_number, quantity_available, reserved_quantity, purchase_date, manufacturing_date, expiry_date, storage_location, unit_price, condition_status, quarantined)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 0)`
        ).run(
          medId,
          user.organizationId,
          supplierName,
          batchNumber,
          quantityAvailable,
          purchaseDate,
          manufacturingDate,
          expiryDate,
          storageLocation,
          unitPrice,
          conditionStatus
        );
      }

      syncMedicineInventoryAggregate(medId);
      logActivity({
        organizationId: user.organizationId,
        userId: user.id,
        userName: user.fullName,
        action: 'Medicine Added',
        entityType: 'medicine',
        entityId: medId,
        details: `Added ${name} (${itemCode})${batchNumber ? ` with batch ${batchNumber} (${quantityAvailable} ${unitOfMeasure})` : ''}`,
        quantityDelta: batchNumber ? quantityAvailable : 0,
      });
      syncOrganizationAlerts(user.organizationId);
      return medId;
    });

    res.status(201).json({ id: medicineId, message: 'Medical item saved successfully.' });
  }
);

apiRouter.put(
  '/inventory/:id',
  requireAuth,
  requireRole('System Administrator', 'Organization Administrator', 'Inventory Manager'),
  (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const user = req.authUser!;
    const existing = db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as
      | { id: number; organization_id: number; name: string }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Medical item not found.' });
      return;
    }
    if (user.role !== 'System Administrator' && existing.organization_id !== user.organizationId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const name = String(req.body?.name ?? '').trim();
    const genericName = String(req.body?.genericName ?? '').trim();
    const category = String(req.body?.category ?? '') as MedicineCategory;
    const brand = String(req.body?.brand ?? '').trim();
    const unitOfMeasure = String(req.body?.unitOfMeasure ?? '').trim();
    const reorderLevel = Number(req.body?.reorderLevel ?? 0);
    const unitPrice = Number(req.body?.unitPrice ?? 0);
    const storageLocation = String(req.body?.storageLocation ?? '').trim();
    const description = String(req.body?.description ?? '').trim();

    if (!name || !MEDICINE_CATEGORIES.includes(category) || !brand || !unitOfMeasure || !storageLocation) {
      res.status(400).json({ error: 'All required fields must be valid.' });
      return;
    }

    db.prepare(
      `UPDATE medicines SET
        name = ?, generic_name = ?, category = ?, brand = ?, unit_of_measure = ?,
        reorder_level = ?, unit_price = ?, storage_location = ?, description = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(name, genericName, category, brand, unitOfMeasure, reorderLevel, unitPrice, storageLocation, description, id);

    logActivity({
      organizationId: existing.organization_id,
      userId: user.id,
      userName: user.fullName,
      action: 'Medicine Updated',
      entityType: 'medicine',
      entityId: id,
      details: `Updated metadata for ${name}`,
    });
    syncOrganizationAlerts(existing.organization_id);
    res.json({ message: 'Medical item updated.' });
  }
);

apiRouter.delete(
  '/inventory/:id',
  requireAuth,
  requireRole('System Administrator', 'Organization Administrator', 'Inventory Manager'),
  (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const user = req.authUser!;
    const existing = db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as
      | { id: number; organization_id: number; name: string }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Medical item not found.' });
      return;
    }
    if (user.role !== 'System Administrator' && existing.organization_id !== user.organizationId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const reservedCheck = db
      .prepare('SELECT COALESCE(SUM(reserved_quantity), 0) AS reserved FROM inventory_batches WHERE medicine_id = ?')
      .get(id) as { reserved: number };
    if (reservedCheck.reserved > 0) {
      res.status(409).json({
        error: 'Cannot delete this item while batches have active reserved stock exchange requests.',
      });
      return;
    }

    runInTransaction(() => {
      db.prepare('DELETE FROM medicines WHERE id = ?').run(id);
      logActivity({
        organizationId: existing.organization_id,
        userId: user.id,
        userName: user.fullName,
        action: 'Medicine Deleted',
        entityType: 'medicine',
        entityId: id,
        details: `Removed medical item ${existing.name}`,
      });
    });

    res.json({ message: 'Medical item deleted.' });
  }
);

apiRouter.post(
  '/inventory/import',
  requireAuth,
  requireRole('System Administrator', 'Organization Administrator', 'Inventory Manager'),
  (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) {
      res.status(400).json({ error: 'No inventory rows provided for import.' });
      return;
    }

    let importedCount = 0;
    const skipped: string[] = [];

    runInTransaction(() => {
      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx] as Record<string, unknown>;
        const name = String(r.name ?? r.medicineName ?? '').trim();
        const itemCode = String(r.itemCode ?? r.itemId ?? '').trim() || `IMP-${Date.now().toString().slice(-4)}-${idx + 1}`;
        const rawCategory = String(r.category ?? 'Tablets').trim();
        const category = (MEDICINE_CATEGORIES.includes(rawCategory as MedicineCategory)
          ? rawCategory
          : 'Tablets') as MedicineCategory;
        const brand = String(r.brand ?? r.manufacturer ?? 'Generic').trim();
        const batchNumber = String(r.batchNumber ?? '').trim() || `BCH-${idx + 101}`;
        const quantity = Math.max(0, Number(r.quantityAvailable ?? r.quantity ?? 0));
        const unitOfMeasure = String(r.unitOfMeasure ?? r.unit ?? 'Units').trim();
        const purchaseDate = String(r.purchaseDate ?? '').trim() || new Date().toISOString().slice(0, 10);
        const manufacturingDate = String(r.manufacturingDate ?? '').trim() || purchaseDate;
        const expiryDate = String(r.expiryDate ?? '').trim();
        const supplierName = String(r.supplierName ?? 'Imported Supplier').trim();
        const storageLocation = String(r.storageLocation ?? 'Main Pharmacy').trim();
        const unitPrice = Math.max(0, Number(r.unitPrice ?? 0));
        const reorderLevel = Math.max(0, Number(r.reorderLevel ?? 30));

        if (!name || !expiryDate || Number.isNaN(quantity)) {
          skipped.push(`Row ${idx + 1}: missing name, expiry date, or valid quantity`);
          continue;
        }

        let med = db
          .prepare('SELECT id FROM medicines WHERE organization_id = ? AND (lower(item_code) = ? OR lower(name) = ?)')
          .get(user.organizationId, itemCode.toLowerCase(), name.toLowerCase()) as { id: number } | undefined;

        if (!med) {
          const resMed = db
            .prepare(
              `INSERT INTO medicines (item_code, organization_id, name, generic_name, category, brand, unit_of_measure, reorder_level, unit_price, storage_location, description)
               VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, 'Imported via spreadsheet')`
            )
            .run(itemCode, user.organizationId, name, category, brand, unitOfMeasure, reorderLevel, unitPrice, storageLocation);
          med = { id: Number(resMed.lastInsertRowid) };
        }

        const existingBatch = db
          .prepare('SELECT id FROM inventory_batches WHERE organization_id = ? AND medicine_id = ? AND batch_number = ?')
          .get(user.organizationId, med.id, batchNumber) as { id: number } | undefined;

        if (existingBatch) {
          db.prepare(
            `UPDATE inventory_batches SET quantity_available = quantity_available + ?, updated_at = datetime('now') WHERE id = ?`
          ).run(quantity, existingBatch.id);
        } else {
          db.prepare(
            `INSERT INTO inventory_batches (medicine_id, organization_id, supplier_name, batch_number, quantity_available, reserved_quantity, purchase_date, manufacturing_date, expiry_date, storage_location, unit_price, condition_status, quarantined)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'Sealed / Optimal', 0)`
          ).run(
            med.id,
            user.organizationId,
            supplierName,
            batchNumber,
            quantity,
            purchaseDate,
            manufacturingDate,
            expiryDate,
            storageLocation,
            unitPrice
          );
        }

        syncMedicineInventoryAggregate(med.id);
        importedCount++;
      }

      logActivity({
        organizationId: user.organizationId,
        userId: user.id,
        userName: user.fullName,
        action: 'Bulk Inventory Import',
        entityType: 'inventory',
        details: `Imported ${importedCount} inventory batch rows via CSV/Excel`,
      });
      syncOrganizationAlerts(user.organizationId);
    });

    res.json({ importedCount, skipped });
  }
);

apiRouter.post(
  '/inventory/:id/batches',
  requireAuth,
  requireRole('System Administrator', 'Organization Administrator', 'Inventory Manager'),
  (req: AuthenticatedRequest, res) => {
    const medicineId = Number(req.params.id);
    const user = req.authUser!;
    const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(medicineId) as
      | { id: number; organization_id: number; name: string; unit_price: number; storage_location: string }
      | undefined;

    if (!med) {
      res.status(404).json({ error: 'Medicine not found.' });
      return;
    }
    if (user.role !== 'System Administrator' && med.organization_id !== user.organizationId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const batchNumber = String(req.body?.batchNumber ?? '').trim();
    const quantityAvailable = Number(req.body?.quantityAvailable ?? 0);
    const purchaseDate = String(req.body?.purchaseDate ?? '').trim() || new Date().toISOString().slice(0, 10);
    const manufacturingDate = String(req.body?.manufacturingDate ?? '').trim() || purchaseDate;
    const expiryDate = String(req.body?.expiryDate ?? '').trim();
    const supplierName = String(req.body?.supplierName ?? '').trim() || 'Standard Supplier';
    const storageLocation = String(req.body?.storageLocation ?? '').trim() || med.storage_location;
    const unitPrice = Number(req.body?.unitPrice ?? med.unit_price);
    const conditionStatus = String(req.body?.conditionStatus ?? 'Sealed / Optimal');

    if (!batchNumber || !expiryDate || Number.isNaN(quantityAvailable) || quantityAvailable < 0) {
      res.status(400).json({ error: 'Batch number, expiry date, and valid non-negative quantity are required.' });
      return;
    }

    const dup = db
      .prepare('SELECT id FROM inventory_batches WHERE organization_id = ? AND medicine_id = ? AND batch_number = ?')
      .get(med.organization_id, medicineId, batchNumber);
    if (dup) {
      res.status(409).json({ error: `Batch "${batchNumber}" already exists for ${med.name}.` });
      return;
    }

    const batchId = runInTransaction(() => {
      const insertRes = db
        .prepare(
          `INSERT INTO inventory_batches (medicine_id, organization_id, supplier_name, batch_number, quantity_available, reserved_quantity, purchase_date, manufacturing_date, expiry_date, storage_location, unit_price, condition_status, quarantined)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 0)`
        )
        .run(
          medicineId,
          med.organization_id,
          supplierName,
          batchNumber,
          quantityAvailable,
          purchaseDate,
          manufacturingDate,
          expiryDate,
          storageLocation,
          unitPrice,
          conditionStatus
        );
      syncMedicineInventoryAggregate(medicineId);
      logActivity({
        organizationId: med.organization_id,
        userId: user.id,
        userName: user.fullName,
        action: 'Batch Received',
        entityType: 'batch',
        entityId: Number(insertRes.lastInsertRowid),
        details: `Added batch ${batchNumber} for ${med.name} (${quantityAvailable} units, exp ${expiryDate})`,
        quantityDelta: quantityAvailable,
      });
      syncOrganizationAlerts(med.organization_id);
      return Number(insertRes.lastInsertRowid);
    });

    res.status(201).json({ id: batchId, message: 'Batch recorded successfully.' });
  }
);

apiRouter.patch('/batches/:batchId', requireAuth, (req: AuthenticatedRequest, res) => {
  const batchId = Number(req.params.batchId);
  const user = req.authUser!;
  const batch = db
    .prepare(
      `SELECT b.*, m.name AS medicine_name
       FROM inventory_batches b
       JOIN medicines m ON m.id = b.medicine_id
       WHERE b.id = ?`
    )
    .get(batchId) as
    | {
        id: number;
        medicine_id: number;
        organization_id: number;
        batch_number: string;
        quantity_available: number;
        reserved_quantity: number;
        storage_location: string;
        condition_status: string;
        quarantined: number;
        expiry_date: string;
        medicine_name: string;
      }
    | undefined;

  if (!batch) {
    res.status(404).json({ error: 'Batch not found.' });
    return;
  }
  if (user.role !== 'System Administrator' && batch.organization_id !== user.organizationId) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  const newQty = req.body?.quantityAvailable !== undefined ? Number(req.body.quantityAvailable) : batch.quantity_available;
  const newLocation = req.body?.storageLocation !== undefined ? String(req.body.storageLocation).trim() : batch.storage_location;
  const newCondition = req.body?.conditionStatus !== undefined ? String(req.body.conditionStatus) : batch.condition_status;
  const newQuarantined = req.body?.quarantined !== undefined ? (req.body.quarantined ? 1 : 0) : batch.quarantined;

  if (Number.isNaN(newQty) || newQty < batch.reserved_quantity) {
    res.status(400).json({
      error: `Quantity cannot be less than reserved exchange quantity (${batch.reserved_quantity}).`,
    });
    return;
  }

  const delta = newQty - batch.quantity_available;
  runInTransaction(() => {
    db.prepare(
      `UPDATE inventory_batches SET
        quantity_available = ?, storage_location = ?, condition_status = ?, quarantined = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(newQty, newLocation, newCondition, newQuarantined, batchId);

    // Keep any active listing bounded by unreserved quantity
    const freeQty = newQty - batch.reserved_quantity;
    if (newQuarantined === 1 || newCondition === 'Damaged' || newCondition === 'Quarantined' || freeQty <= 0) {
      db.prepare("UPDATE exchange_listings SET status = 'Paused', updated_at = datetime('now') WHERE batch_id = ? AND status = 'Active'").run(
        batchId
      );
    } else {
      db.prepare(
        "UPDATE exchange_listings SET available_quantity = MIN(available_quantity, ?), updated_at = datetime('now') WHERE batch_id = ? AND status = 'Active'"
      ).run(freeQty, batchId);
    }

    syncMedicineInventoryAggregate(batch.medicine_id);
    logActivity({
      organizationId: batch.organization_id,
      userId: user.id,
      userName: user.fullName,
      action: delta >= 0 ? 'Stock Adjusted (+)' : 'Stock Dispensed (-)',
      entityType: 'batch',
      entityId: batchId,
      details: `Updated batch ${batch.batch_number} (${batch.medicine_name}) to ${newQty} units`,
      quantityDelta: delta,
    });
    syncOrganizationAlerts(batch.organization_id);
  });

  res.json({ message: 'Batch updated successfully.' });
});

apiRouter.post(
  '/batches/:batchId/write-off',
  requireAuth,
  requireRole('System Administrator', 'Organization Administrator', 'Inventory Manager'),
  (req: AuthenticatedRequest, res) => {
    const batchId = Number(req.params.batchId);
    const user = req.authUser!;
    const batch = db
      .prepare(
        `SELECT b.*, m.name AS medicine_name
         FROM inventory_batches b
         JOIN medicines m ON m.id = b.medicine_id
         WHERE b.id = ?`
      )
      .get(batchId) as
      | {
          id: number;
          medicine_id: number;
          organization_id: number;
          batch_number: string;
          quantity_available: number;
          reserved_quantity: number;
          medicine_name: string;
        }
      | undefined;

    if (!batch) {
      res.status(404).json({ error: 'Batch not found.' });
      return;
    }
    if (user.role !== 'System Administrator' && batch.organization_id !== user.organizationId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    if (batch.reserved_quantity > 0) {
      res.status(409).json({ error: 'Cannot write off batch with active reserved exchange requests.' });
      return;
    }

    const removedUnits = batch.quantity_available;
    runInTransaction(() => {
      db.prepare(
        `UPDATE inventory_batches
         SET quantity_available = 0, quarantined = 1, condition_status = 'Quarantined', updated_at = datetime('now')
         WHERE id = ?`
      ).run(batchId);
      db.prepare("UPDATE exchange_listings SET status = 'Expired Blocked', available_quantity = 0, updated_at = datetime('now') WHERE batch_id = ?").run(
        batchId
      );
      syncMedicineInventoryAggregate(batch.medicine_id);
      logActivity({
        organizationId: batch.organization_id,
        userId: user.id,
        userName: user.fullName,
        action: 'Expiry Write-Off',
        entityType: 'batch',
        entityId: batchId,
        details: `Removed & disposed ${removedUnits} units from ${batch.medicine_name} (Batch ${batch.batch_number})`,
        quantityDelta: -removedUnits,
      });
    });

    res.json({ message: `Removed ${removedUnits} units and quarantined batch ${batch.batch_number}.` });
  }
);

// ==========================================
// 4. EXPIRY TRACKING MODULE
// ==========================================
apiRouter.get('/expiry', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const isGlobal = user.role === 'System Administrator' && req.query.orgId === 'all';
  const targetOrgId = getTargetOrgId(req);
  const now = new Date();

  const rawBatches = db
    .prepare(
      `SELECT b.*, m.name AS medicine_name, m.item_code, m.category, m.brand, m.unit_of_measure, o.name AS organization_name
       FROM inventory_batches b
       JOIN medicines m ON m.id = b.medicine_id
       JOIN organizations o ON o.id = b.organization_id
       WHERE ${isGlobal ? '1=1' : 'b.organization_id = ?'}
       ORDER BY b.expiry_date ASC`
    )
    .all(...(isGlobal ? [] : [targetOrgId])) as Array<Record<string, unknown>>;

  let batches = rawBatches.map((r) => enrichBatchRow(r, now));
  const classificationFilter = String(req.query.classification ?? 'All');
  const search = String(req.query.search ?? '').trim().toLowerCase();
  const hideEmpty = req.query.hideEmpty === 'true';

  const summary = {
    expiredCount: 0,
    expiredUnits: 0,
    expiredValue: 0,
    within7Count: 0,
    within7Units: 0,
    within30Count: 0,
    within30Units: 0,
    within60Count: 0,
    within90Count: 0,
    safeCount: 0,
    atRiskValue: 0,
  };

  for (const b of batches) {
    if (b.quantityAvailable <= 0) continue;
    const val = b.quantityAvailable * b.unitPrice;
    switch (b.expiryClassification) {
      case 'Expired':
        summary.expiredCount++;
        summary.expiredUnits += b.quantityAvailable;
        summary.expiredValue += val;
        break;
      case 'Expiring within 7 days':
        summary.within7Count++;
        summary.within7Units += b.quantityAvailable;
        summary.atRiskValue += val;
        break;
      case 'Expiring within 30 days':
        summary.within30Count++;
        summary.within30Units += b.quantityAvailable;
        summary.atRiskValue += val;
        break;
      case 'Expiring within 60 days':
        summary.within60Count++;
        break;
      case 'Expiring within 90 days':
        summary.within90Count++;
        break;
      default:
        summary.safeCount++;
        break;
    }
  }

  if (hideEmpty) {
    batches = batches.filter((b) => b.quantityAvailable > 0);
  }
  if (classificationFilter !== 'All') {
    batches = batches.filter((b) => b.expiryClassification === classificationFilter);
  }
  if (search) {
    batches = batches.filter(
      (b) =>
        (b.medicineName ?? '').toLowerCase().includes(search) ||
        b.batchNumber.toLowerCase().includes(search) ||
        (b.itemCode ?? '').toLowerCase().includes(search)
    );
  }

  const wastageLogs = db
    .prepare(
      `SELECT * FROM activity_logs
       WHERE ${isGlobal ? '1=1' : 'organization_id = ?'} AND action = 'Expiry Write-Off'
       ORDER BY created_at DESC LIMIT 25`
    )
    .all(...(isGlobal ? [] : [targetOrgId]));

  res.json({
    summary: {
      ...summary,
      expiredValue: Number(summary.expiredValue.toFixed(2)),
      atRiskValue: Number(summary.atRiskValue.toFixed(2)),
    },
    batches,
    wastageLogs,
  });
});

// ==========================================
// 5. STOCK EXCHANGE MARKETPLACE & WORKFLOW
// ==========================================
apiRouter.get('/marketplace', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const now = new Date();
  const includeOwn = req.query.includeOwn === 'true';

  const rows = db
    .prepare(
      `SELECT l.*,
        o.name AS org_name, o.org_type, o.city AS org_city, o.state AS org_state, o.verification_status, o.is_demo,
        b.quantity_available AS batch_qty, b.reserved_quantity AS batch_reserved, b.expiry_date AS batch_expiry,
        b.quarantined, b.condition_status, b.unit_price,
        m.brand
       FROM exchange_listings l
       JOIN organizations o ON o.id = l.organization_id
       JOIN inventory_batches b ON b.id = l.batch_id
       JOIN medicines m ON m.id = l.medicine_id
       WHERE l.status = 'Active'
       ORDER BY b.expiry_date ASC, l.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  let listings = rows
    .map((r) => {
      const expiryDate = String(r.batch_expiry);
      const batchQty = Number(r.batch_qty ?? 0);
      const batchReserved = Number(r.batch_reserved ?? 0);
      const freeQty = Math.max(0, batchQty - batchReserved);
      const eligibility = isBatchEligibleForExchange(
        {
          expiryDate,
          quantityAvailable: batchQty,
          reservedQuantity: batchReserved,
          quarantined: Boolean(r.quarantined),
          conditionStatus: String(r.condition_status),
        },
        now
      );

      // Strictly block expired or unsafe stock from marketplace display
      if (!eligibility.eligible) {
        return null;
      }

      const effectiveAvailable = Math.min(Number(r.available_quantity), freeQty);
      if (effectiveAvailable <= 0) return null;

      return {
        id: Number(r.id),
        organizationId: Number(r.organization_id),
        organizationName: String(r.org_name),
        organizationType: String(r.org_type) as OrganizationType,
        organizationCity: String(r.org_city),
        organizationState: String(r.org_state),
        organizationVerified: String(r.verification_status),
        isDemoOrg: Boolean(r.is_demo),
        batchId: Number(r.batch_id),
        medicineId: Number(r.medicine_id),
        medicineName: String(r.medicine_name),
        category: String(r.category) as MedicineCategory,
        brand: String(r.brand),
        batchNumber: String(r.batch_number),
        availableQuantity: effectiveAvailable,
        batchFreeQuantity: freeQty,
        unitOfMeasure: String(r.unit_of_measure),
        unitPrice: Number(r.unit_price ?? 0),
        expiryDate,
        daysUntilExpiry: getDaysUntilExpiry(expiryDate, now),
        expiryClassification: classifyExpiry(expiryDate, now),
        stockCondition: String(r.stock_condition),
        exchangeType: String(r.exchange_type) as ExchangeType,
        contactInfo: String(r.contact_info),
        description: String(r.description),
        status: String(r.status),
        createdBy: Number(r.created_by),
        createdAt: String(r.created_at),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (!includeOwn) {
    listings = listings.filter((l) => l.organizationId !== user.organizationId);
  }

  const search = String(req.query.search ?? '').trim().toLowerCase();
  const category = String(req.query.category ?? 'All');
  const location = String(req.query.location ?? 'All');
  const exchangeType = String(req.query.exchangeType ?? 'All');

  if (search) {
    listings = listings.filter(
      (l) =>
        l.medicineName.toLowerCase().includes(search) ||
        l.organizationName.toLowerCase().includes(search) ||
        l.batchNumber.toLowerCase().includes(search) ||
        l.brand.toLowerCase().includes(search)
    );
  }
  if (category !== 'All') {
    listings = listings.filter((l) => l.category === category);
  }
  if (location !== 'All') {
    listings = listings.filter((l) => `${l.organizationCity}, ${l.organizationState}` === location);
  }
  if (exchangeType !== 'All') {
    listings = listings.filter((l) => l.exchangeType === exchangeType);
  }

  res.json({ listings });
});

apiRouter.post(
  '/marketplace',
  requireAuth,
  requireRole('System Administrator', 'Organization Administrator', 'Inventory Manager'),
  (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    const batchId = Number(req.body?.batchId);
    const availableQuantity = Number(req.body?.availableQuantity);
    const stockCondition = String(req.body?.stockCondition ?? 'Sealed / Optimal').trim();
    const exchangeType = String(req.body?.exchangeType ?? 'Transfer') as ExchangeType;
    const contactInfo = String(req.body?.contactInfo ?? '').trim();
    const description = String(req.body?.description ?? '').trim();

    if (!batchId || Number.isNaN(availableQuantity) || availableQuantity <= 0) {
      res.status(400).json({ error: 'Valid batch and positive exchange quantity are required.' });
      return;
    }
    if (!EXCHANGE_TYPES.includes(exchangeType)) {
      res.status(400).json({ error: 'Invalid exchange type.' });
      return;
    }

    const batch = db
      .prepare(
        `SELECT b.*, m.name AS medicine_name, m.category, m.unit_of_measure
         FROM inventory_batches b
         JOIN medicines m ON m.id = b.medicine_id
         WHERE b.id = ?`
      )
      .get(batchId) as
      | {
          id: number;
          medicine_id: number;
          organization_id: number;
          batch_number: string;
          quantity_available: number;
          reserved_quantity: number;
          expiry_date: string;
          quarantined: number;
          condition_status: string;
          medicine_name: string;
          category: string;
          unit_of_measure: string;
        }
      | undefined;

    if (!batch) {
      res.status(404).json({ error: 'Batch not found.' });
      return;
    }
    if (user.role !== 'System Administrator' && batch.organization_id !== user.organizationId) {
      res.status(403).json({ error: 'You can only list stock belonging to your organization.' });
      return;
    }

    const eligibility = isBatchEligibleForExchange({
      expiryDate: batch.expiry_date,
      quantityAvailable: batch.quantity_available,
      reservedQuantity: batch.reserved_quantity,
      quarantined: batch.quarantined,
      conditionStatus: batch.condition_status,
    });

    if (!eligibility.eligible) {
      res.status(400).json({ error: eligibility.reason });
      return;
    }

    const freeQty = batch.quantity_available - batch.reserved_quantity;
    if (availableQuantity > freeQty) {
      res.status(400).json({
        error: `Listed quantity (${availableQuantity}) exceeds unreserved available stock (${freeQty}).`,
      });
      return;
    }

    const existingActive = db
      .prepare("SELECT id FROM exchange_listings WHERE batch_id = ? AND status = 'Active'")
      .get(batchId);
    if (existingActive) {
      res.status(409).json({ error: 'An active exchange listing already exists for this batch.' });
      return;
    }

    const org = db.prepare('SELECT contact_person, phone FROM organizations WHERE id = ?').get(batch.organization_id) as {
      contact_person: string;
      phone: string;
    };

    const listingId = runInTransaction(() => {
      const insertRes = db
        .prepare(
          `INSERT INTO exchange_listings (organization_id, batch_id, medicine_id, medicine_name, category, batch_number, available_quantity, unit_of_measure, expiry_date, stock_condition, exchange_type, contact_info, description, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)`
        )
        .run(
          batch.organization_id,
          batch.id,
          batch.medicine_id,
          batch.medicine_name,
          batch.category,
          batch.batch_number,
          availableQuantity,
          batch.unit_of_measure,
          batch.expiry_date,
          stockCondition,
          exchangeType,
          contactInfo || `${org.contact_person} · ${org.phone}`,
          description,
          user.id
        );

      logActivity({
        organizationId: batch.organization_id,
        userId: user.id,
        userName: user.fullName,
        action: 'Exchange Listing Created',
        entityType: 'listing',
        entityId: Number(insertRes.lastInsertRowid),
        details: `Listed ${availableQuantity} ${batch.unit_of_measure} of ${batch.medicine_name} (Batch ${batch.batch_number}) for ${exchangeType}`,
      });

      return Number(insertRes.lastInsertRowid);
    });

    res.status(201).json({ id: listingId, message: 'Surplus stock listed on the Stock Exchange Marketplace.' });
  }
);

apiRouter.patch(
  '/marketplace/:id/status',
  requireAuth,
  requireRole('System Administrator', 'Organization Administrator', 'Inventory Manager'),
  (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const status = String(req.body?.status ?? '');
    if (!['Active', 'Paused'].includes(status)) {
      res.status(400).json({ error: 'Status must be Active or Paused.' });
      return;
    }
    const listing = db.prepare('SELECT * FROM exchange_listings WHERE id = ?').get(id) as
      | { id: number; organization_id: number; batch_id: number }
      | undefined;
    if (!listing) {
      res.status(404).json({ error: 'Listing not found.' });
      return;
    }
    if (req.authUser!.role !== 'System Administrator' && listing.organization_id !== req.authUser!.organizationId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    db.prepare("UPDATE exchange_listings SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
    res.json({ message: `Listing status updated to ${status}.` });
  }
);

apiRouter.get('/exchanges/requests', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const isGlobal = user.role === 'System Administrator' && req.query.scope === 'global';
  const rows = db
    .prepare(
      `SELECT r.*,
        oo.name AS owner_org_name, oo.city AS owner_org_city,
        ro.name AS requester_org_name, ro.city AS requester_org_city,
        u.full_name AS requester_user_name,
        l.medicine_name, l.category, l.batch_number, l.expiry_date, l.unit_of_measure,
        b.unit_price
       FROM exchange_requests r
       JOIN organizations oo ON oo.id = r.owner_org_id
       JOIN organizations ro ON ro.id = r.requester_org_id
       JOIN users u ON u.id = r.requester_user_id
       JOIN exchange_listings l ON l.id = r.listing_id
       JOIN inventory_batches b ON b.id = l.batch_id
       WHERE ${isGlobal ? '1=1' : '(r.owner_org_id = ? OR r.requester_org_id = ?)'}
       ORDER BY r.created_at DESC, r.id DESC`
    )
    .all(...(isGlobal ? [] : [user.organizationId, user.organizationId])) as Array<Record<string, unknown>>;

  const requests = rows.map((r) => ({
    id: Number(r.id),
    requestCode: String(r.request_code),
    listingId: Number(r.listing_id),
    ownerOrgId: Number(r.owner_org_id),
    ownerOrgName: String(r.owner_org_name),
    ownerOrgCity: String(r.owner_org_city),
    requesterOrgId: Number(r.requester_org_id),
    requesterOrgName: String(r.requester_org_name),
    requesterOrgCity: String(r.requester_org_city),
    requesterUserId: Number(r.requester_user_id),
    requesterUserName: String(r.requester_user_name),
    medicineName: String(r.medicine_name),
    category: String(r.category) as MedicineCategory,
    batchNumber: String(r.batch_number),
    expiryDate: String(r.expiry_date),
    unitOfMeasure: String(r.unit_of_measure),
    unitPrice: Number(r.unit_price ?? 0),
    requestedQuantity: Number(r.requested_quantity),
    exchangeType: String(r.exchange_type) as ExchangeType,
    status: String(r.status),
    notes: String(r.notes ?? ''),
    ownerConfirmed: Boolean(r.owner_confirmed),
    requesterConfirmed: Boolean(r.requester_confirmed),
    rejectionReason: r.rejection_reason ? String(r.rejection_reason) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));

  res.json({ requests });
});

apiRouter.post(
  '/exchanges/requests',
  requireAuth,
  requireRole('System Administrator', 'Organization Administrator', 'Inventory Manager'),
  (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    const listingId = Number(req.body?.listingId);
    const requestedQuantity = Number(req.body?.requestedQuantity);
    const notes = String(req.body?.notes ?? '').trim();

    if (!listingId || Number.isNaN(requestedQuantity) || requestedQuantity <= 0) {
      res.status(400).json({ error: 'Valid listing and positive requested quantity are required.' });
      return;
    }

    const listing = db
      .prepare(
        `SELECT l.*, b.quantity_available, b.reserved_quantity, b.expiry_date AS batch_expiry, b.quarantined, b.condition_status
         FROM exchange_listings l
         JOIN inventory_batches b ON b.id = l.batch_id
         WHERE l.id = ?`
      )
      .get(listingId) as
      | {
          id: number;
          organization_id: number;
          batch_id: number;
          medicine_name: string;
          batch_number: string;
          available_quantity: number;
          unit_of_measure: string;
          exchange_type: ExchangeType;
          status: string;
          quantity_available: number;
          reserved_quantity: number;
          batch_expiry: string;
          quarantined: number;
          condition_status: string;
        }
      | undefined;

    if (!listing || listing.status !== 'Active') {
      res.status(404).json({ error: 'Active exchange listing not found.' });
      return;
    }

    if (listing.organization_id === user.organizationId) {
      res.status(400).json({ error: 'You cannot request your own organization’s listing.' });
      return;
    }

    const eligibility = isBatchEligibleForExchange({
      expiryDate: listing.batch_expiry,
      quantityAvailable: listing.quantity_available,
      reservedQuantity: listing.reserved_quantity,
      quarantined: listing.quarantined,
      conditionStatus: listing.condition_status,
    });
    if (!eligibility.eligible) {
      res.status(400).json({ error: eligibility.reason });
      return;
    }

    const freeQty = listing.quantity_available - listing.reserved_quantity;
    const maxRequestable = Math.min(listing.available_quantity, freeQty);
    if (requestedQuantity > maxRequestable) {
      res.status(400).json({
        error: `Requested quantity (${requestedQuantity}) exceeds available unreserved stock (${maxRequestable}).`,
      });
      return;
    }

    // Prevent duplicate pending request from same requester on same listing
    const duplicatePending = db
      .prepare(
        `SELECT id FROM exchange_requests
         WHERE listing_id = ? AND requester_org_id = ? AND status IN ('Pending', 'Approved', 'Processing')`
      )
      .get(listingId, user.organizationId);
    if (duplicatePending) {
      res.status(409).json({
        error: 'Your organization already has an active exchange request for this listing.',
      });
      return;
    }

    const requestCode = `EXR-${new Date().getUTCFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    const requestId = runInTransaction(() => {
      const insertRes = db
        .prepare(
          `INSERT INTO exchange_requests (request_code, listing_id, owner_org_id, requester_org_id, requester_user_id, requested_quantity, exchange_type, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`
        )
        .run(
          requestCode,
          listingId,
          listing.organization_id,
          user.organizationId,
          user.id,
          requestedQuantity,
          listing.exchange_type,
          notes
        );

      const newId = Number(insertRes.lastInsertRowid);
      createNotification({
        organizationId: listing.organization_id,
        type: 'exchange_request',
        severity: 'info',
        title: `New Exchange Request: ${requestCode}`,
        message: `${user.organizationName} requested ${requestedQuantity} ${listing.unit_of_measure} of ${listing.medicine_name} (Batch ${listing.batch_number}).`,
        relatedEntity: 'exchange_request',
        relatedId: newId,
      });

      logActivity({
        organizationId: user.organizationId,
        userId: user.id,
        userName: user.fullName,
        action: 'Exchange Requested',
        entityType: 'exchange_request',
        entityId: newId,
        details: `Requested ${requestedQuantity} ${listing.unit_of_measure} of ${listing.medicine_name} (${requestCode})`,
      });

      return newId;
    });

    res.status(201).json({ id: requestId, requestCode, message: 'Stock exchange request submitted.' });
  }
);

apiRouter.post(
  '/exchanges/requests/:id/action',
  requireAuth,
  requireRole('System Administrator', 'Organization Administrator', 'Inventory Manager'),
  (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const action = String(req.body?.action ?? '');
    const reason = String(req.body?.reason ?? '').trim();
    const user = req.authUser!;

    if (!['approve', 'reject', 'process', 'cancel', 'confirm-handover'].includes(action)) {
      res.status(400).json({ error: 'Invalid exchange workflow action.' });
      return;
    }

    try {
      const result = runInTransaction(() => {
        const reqRow = db
          .prepare(
            `SELECT r.*,
              l.batch_id, l.medicine_id, l.medicine_name, l.category, l.batch_number, l.available_quantity AS listing_qty, l.unit_of_measure,
              b.quantity_available AS batch_qty, b.reserved_quantity AS batch_reserved, b.expiry_date AS batch_expiry,
              b.quarantined, b.condition_status, b.unit_price, b.supplier_name, b.purchase_date, b.manufacturing_date,
              m.item_code, m.generic_name, m.brand, m.reorder_level, m.description AS med_desc,
              oo.name AS owner_org_name, ro.name AS requester_org_name
             FROM exchange_requests r
             JOIN exchange_listings l ON l.id = r.listing_id
             JOIN inventory_batches b ON b.id = l.batch_id
             JOIN medicines m ON m.id = l.medicine_id
             JOIN organizations oo ON oo.id = r.owner_org_id
             JOIN organizations ro ON ro.id = r.requester_org_id
             WHERE r.id = ?`
          )
          .get(id) as
          | {
              id: number;
              request_code: string;
              listing_id: number;
              owner_org_id: number;
              requester_org_id: number;
              requested_quantity: number;
              exchange_type: ExchangeType;
              status: string;
              owner_confirmed: number;
              requester_confirmed: number;
              batch_id: number;
              medicine_id: number;
              medicine_name: string;
              category: string;
              batch_number: string;
              listing_qty: number;
              unit_of_measure: string;
              batch_qty: number;
              batch_reserved: number;
              batch_expiry: string;
              quarantined: number;
              condition_status: string;
              unit_price: number;
              supplier_name: string;
              purchase_date: string;
              manufacturing_date: string;
              item_code: string;
              generic_name: string;
              brand: string;
              reorder_level: number;
              med_desc: string;
              owner_org_name: string;
              requester_org_name: string;
            }
          | undefined;

        if (!reqRow) {
          throw Object.assign(new Error('Exchange request not found.'), { status: 404 });
        }

        const isOwner = user.organizationId === reqRow.owner_org_id || user.role === 'System Administrator';
        const isRequester = user.organizationId === reqRow.requester_org_id || user.role === 'System Administrator';

        if (action === 'approve') {
          if (!isOwner) throw Object.assign(new Error('Only the stock owner can approve requests.'), { status: 403 });
          if (reqRow.status !== 'Pending') {
            throw Object.assign(new Error('Only Pending requests can be approved.'), { status: 400 });
          }

          const eligibility = isBatchEligibleForExchange({
            expiryDate: reqRow.batch_expiry,
            quantityAvailable: reqRow.batch_qty,
            reservedQuantity: reqRow.batch_reserved,
            quarantined: reqRow.quarantined,
            conditionStatus: reqRow.condition_status,
          });
          if (!eligibility.eligible) {
            throw Object.assign(new Error(eligibility.reason || 'Batch is no longer eligible for exchange.'), { status: 400 });
          }

          const freeQty = reqRow.batch_qty - reqRow.batch_reserved;
          if (reqRow.requested_quantity > freeQty || reqRow.requested_quantity > reqRow.listing_qty) {
            throw Object.assign(
              new Error(`Insufficient unreserved stock (${freeQty} available) to approve ${reqRow.requested_quantity} units.`),
              { status: 409 }
            );
          }

          // Reserve stock atomically to prevent double allocation
          db.prepare('UPDATE inventory_batches SET reserved_quantity = reserved_quantity + ?, updated_at = datetime(\'now\') WHERE id = ?').run(
            reqRow.requested_quantity,
            reqRow.batch_id
          );
          syncMedicineInventoryAggregate(reqRow.medicine_id);

          db.prepare("UPDATE exchange_requests SET status = 'Approved', updated_at = datetime('now') WHERE id = ?").run(id);

          createNotification({
            organizationId: reqRow.requester_org_id,
            type: 'exchange_approved',
            severity: 'success',
            title: `Request Approved: ${reqRow.request_code}`,
            message: `${reqRow.owner_org_name} approved ${reqRow.requested_quantity} ${reqRow.unit_of_measure} of ${reqRow.medicine_name}. Stock is reserved pending handover confirmation.`,
            relatedEntity: 'exchange_request',
            relatedId: id,
          });
          createNotification({
            organizationId: reqRow.owner_org_id,
            type: 'exchange_approved',
            severity: 'info',
            title: `Stock Reserved: ${reqRow.request_code}`,
            message: `Reserved ${reqRow.requested_quantity} ${reqRow.unit_of_measure} of ${reqRow.medicine_name} (Batch ${reqRow.batch_number}) for ${reqRow.requester_org_name}.`,
            relatedEntity: 'exchange_request',
            relatedId: id,
          });
          return { message: 'Exchange request approved and stock reserved.' };
        }

        if (action === 'reject') {
          if (!isOwner) throw Object.assign(new Error('Only the stock owner can reject requests.'), { status: 403 });
          if (!['Pending', 'Approved', 'Processing'].includes(reqRow.status)) {
            throw Object.assign(new Error('Cannot reject a completed or cancelled request.'), { status: 400 });
          }
          if (['Approved', 'Processing'].includes(reqRow.status)) {
            db.prepare(
              'UPDATE inventory_batches SET reserved_quantity = MAX(0, reserved_quantity - ?), updated_at = datetime(\'now\') WHERE id = ?'
            ).run(reqRow.requested_quantity, reqRow.batch_id);
            syncMedicineInventoryAggregate(reqRow.medicine_id);
          }
          db.prepare(
            "UPDATE exchange_requests SET status = 'Rejected', rejection_reason = ?, updated_at = datetime('now') WHERE id = ?"
          ).run(reason || 'Rejected by stock owner', id);

          createNotification({
            organizationId: reqRow.requester_org_id,
            type: 'exchange_rejected',
            severity: 'warning',
            title: `Request Rejected: ${reqRow.request_code}`,
            message: `${reqRow.owner_org_name} rejected your request for ${reqRow.medicine_name}.${reason ? ` Reason: ${reason}` : ''}`,
            relatedEntity: 'exchange_request',
            relatedId: id,
          });
          return { message: 'Exchange request rejected.' };
        }

        if (action === 'cancel') {
          if (!isRequester) throw Object.assign(new Error('Only the requesting organization can cancel.'), { status: 403 });
          if (!['Pending', 'Approved', 'Processing'].includes(reqRow.status)) {
            throw Object.assign(new Error('This request can no longer be cancelled.'), { status: 400 });
          }
          if (['Approved', 'Processing'].includes(reqRow.status)) {
            db.prepare(
              'UPDATE inventory_batches SET reserved_quantity = MAX(0, reserved_quantity - ?), updated_at = datetime(\'now\') WHERE id = ?'
            ).run(reqRow.requested_quantity, reqRow.batch_id);
            syncMedicineInventoryAggregate(reqRow.medicine_id);
          }
          db.prepare("UPDATE exchange_requests SET status = 'Cancelled', updated_at = datetime('now') WHERE id = ?").run(id);
          return { message: 'Exchange request cancelled and any reserved units released.' };
        }

        if (action === 'process') {
          if (!isOwner) throw Object.assign(new Error('Only the stock owner can mark processing.'), { status: 403 });
          if (reqRow.status !== 'Approved') {
            throw Object.assign(new Error('Only Approved requests can transition to Processing.'), { status: 400 });
          }
          db.prepare("UPDATE exchange_requests SET status = 'Processing', updated_at = datetime('now') WHERE id = ?").run(id);
          return { message: 'Exchange marked as Processing for dispatch.' };
        }

        // confirm-handover
        if (!isOwner && !isRequester) {
          throw Object.assign(new Error('Access denied.'), { status: 403 });
        }
        if (!['Approved', 'Processing'].includes(reqRow.status)) {
          throw Object.assign(new Error('Handover confirmation requires Approved or Processing status.'), { status: 400 });
        }

        let ownerConf = reqRow.owner_confirmed;
        let requesterConf = reqRow.requester_confirmed;

        if (user.organizationId === reqRow.owner_org_id) {
          ownerConf = 1;
        } else if (user.organizationId === reqRow.requester_org_id) {
          requesterConf = 1;
        } else if (user.role === 'System Administrator') {
          if (!ownerConf) ownerConf = 1;
          else requesterConf = 1;
        }

        if (ownerConf === 1 && requesterConf === 1) {
          // Verify non-expired & sufficient stock before completing
          if (getDaysUntilExpiry(reqRow.batch_expiry) <= 0) {
            throw Object.assign(new Error('Batch has expired prior to handover; transfer blocked.'), { status: 400 });
          }
          if (reqRow.batch_qty < reqRow.requested_quantity) {
            throw Object.assign(new Error('Insufficient batch stock for handover.'), { status: 409 });
          }

          // 1. Deduct source batch & reserved quantity
          db.prepare(
            `UPDATE inventory_batches
             SET quantity_available = quantity_available - ?,
                 reserved_quantity = MAX(0, reserved_quantity - ?),
                 updated_at = datetime('now')
             WHERE id = ?`
          ).run(reqRow.requested_quantity, reqRow.requested_quantity, reqRow.batch_id);
          syncMedicineInventoryAggregate(reqRow.medicine_id);

          // 2. Update listing available_quantity
          const newListingQty = Math.max(0, reqRow.listing_qty - reqRow.requested_quantity);
          db.prepare(
            `UPDATE exchange_listings
             SET available_quantity = ?, status = CASE WHEN ? <= 0 THEN 'Fulfilled' ELSE status END, updated_at = datetime('now')
             WHERE id = ?`
          ).run(newListingQty, newListingQty, reqRow.listing_id);

          // 3. Credit requester organization inventory & batch
          let destMed = db
            .prepare('SELECT id FROM medicines WHERE organization_id = ? AND lower(name) = ?')
            .get(reqRow.requester_org_id, reqRow.medicine_name.toLowerCase()) as { id: number } | undefined;

          if (!destMed) {
            const destCode = `${reqRow.item_code}-EX${reqRow.id}`;
            const insMed = db
              .prepare(
                `INSERT INTO medicines (item_code, organization_id, name, generic_name, category, brand, unit_of_measure, reorder_level, unit_price, storage_location, description)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .run(
                destCode,
                reqRow.requester_org_id,
                reqRow.medicine_name,
                reqRow.generic_name,
                reqRow.category,
                reqRow.brand,
                reqRow.unit_of_measure,
                reqRow.reorder_level,
                reqRow.unit_price,
                'Receiving Pharmacy Bay',
                reqRow.med_desc
              );
            destMed = { id: Number(insMed.lastInsertRowid) };
          }

          const destBatch = db
            .prepare(
              'SELECT id FROM inventory_batches WHERE organization_id = ? AND medicine_id = ? AND batch_number = ?'
            )
            .get(reqRow.requester_org_id, destMed.id, reqRow.batch_number) as { id: number } | undefined;

          if (destBatch) {
            db.prepare(
              "UPDATE inventory_batches SET quantity_available = quantity_available + ?, updated_at = datetime('now') WHERE id = ?"
            ).run(reqRow.requested_quantity, destBatch.id);
          } else {
            db.prepare(
              `INSERT INTO inventory_batches (medicine_id, organization_id, supplier_name, batch_number, quantity_available, reserved_quantity, purchase_date, manufacturing_date, expiry_date, storage_location, unit_price, condition_status, quarantined)
               VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 'Receiving Pharmacy Bay', ?, ?, 0)`
            ).run(
              destMed.id,
              reqRow.requester_org_id,
              `Transfer from ${reqRow.owner_org_name}`,
              reqRow.batch_number,
              reqRow.requested_quantity,
              new Date().toISOString().slice(0, 10),
              reqRow.manufacturing_date,
              reqRow.batch_expiry,
              reqRow.unit_price,
              reqRow.condition_status
            );
          }
          syncMedicineInventoryAggregate(destMed.id);

          // 4. Mark request completed & write immutable transaction record
          db.prepare(
            "UPDATE exchange_requests SET owner_confirmed = 1, requester_confirmed = 1, status = 'Completed', updated_at = datetime('now') WHERE id = ?"
          ).run(id);

          const txnCode = `TXN-${new Date().getUTCFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
          const totalValue = Number((reqRow.requested_quantity * reqRow.unit_price).toFixed(2));
          db.prepare(
            `INSERT INTO exchange_transactions (transaction_code, request_id, listing_id, source_org_id, destination_org_id, medicine_name, category, batch_number, quantity_transferred, unit_of_measure, total_value, exchange_type, completed_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            txnCode,
            id,
            reqRow.listing_id,
            reqRow.owner_org_id,
            reqRow.requester_org_id,
            reqRow.medicine_name,
            reqRow.category,
            reqRow.batch_number,
            reqRow.requested_quantity,
            reqRow.unit_of_measure,
            totalValue,
            reqRow.exchange_type,
            user.id
          );

          // 5. Notify & audit log both organizations
          createNotification({
            organizationId: reqRow.owner_org_id,
            type: 'exchange_completed',
            severity: 'success',
            title: `Exchange Completed: ${txnCode}`,
            message: `Transferred ${reqRow.requested_quantity} ${reqRow.unit_of_measure} of ${reqRow.medicine_name} to ${reqRow.requester_org_name}.`,
            relatedEntity: 'exchange_request',
            relatedId: id,
          });
          createNotification({
            organizationId: reqRow.requester_org_id,
            type: 'exchange_completed',
            severity: 'success',
            title: `Exchange Received: ${txnCode}`,
            message: `Received ${reqRow.requested_quantity} ${reqRow.unit_of_measure} of ${reqRow.medicine_name} (Batch ${reqRow.batch_number}) into inventory.`,
            relatedEntity: 'exchange_request',
            relatedId: id,
          });

          logActivity({
            organizationId: reqRow.owner_org_id,
            userId: user.id,
            userName: user.fullName,
            action: 'Exchange Completed',
            entityType: 'exchange_transaction',
            entityId: id,
            details: `Completed ${txnCode}: transferred ${reqRow.requested_quantity} ${reqRow.unit_of_measure} of ${reqRow.medicine_name} to ${reqRow.requester_org_name}`,
            quantityDelta: -reqRow.requested_quantity,
          });
          logActivity({
            organizationId: reqRow.requester_org_id,
            userId: user.id,
            userName: user.fullName,
            action: 'Exchange Received',
            entityType: 'exchange_transaction',
            entityId: id,
            details: `Received ${txnCode}: ${reqRow.requested_quantity} ${reqRow.unit_of_measure} of ${reqRow.medicine_name} from ${reqRow.owner_org_name}`,
            quantityDelta: reqRow.requested_quantity,
          });

          return { message: `Handover confirmed by both parties. Transaction ${txnCode} completed and inventories updated.` };
        }

        // Partial confirmation (one side confirmed, waiting for partner)
        db.prepare(
          "UPDATE exchange_requests SET owner_confirmed = ?, requester_confirmed = ?, status = 'Processing', updated_at = datetime('now') WHERE id = ?"
        ).run(ownerConf, requesterConf, id);

        const partnerOrgId = user.organizationId === reqRow.owner_org_id ? reqRow.requester_org_id : reqRow.owner_org_id;
        createNotification({
          organizationId: partnerOrgId,
          type: 'exchange_approved',
          severity: 'info',
          title: `Handover Confirmation Needed: ${reqRow.request_code}`,
          message: `${user.organizationName} confirmed handover for ${reqRow.medicine_name}. Please confirm receipt/dispatch to finalize.`,
          relatedEntity: 'exchange_request',
          relatedId: id,
        });

        return { message: 'Handover confirmed by your organization. Waiting for partner confirmation to finalize inventory transfer.' };
      });

      res.json(result);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status ?? 500;
      const message = err instanceof Error ? err.message : 'Exchange workflow failed.';
      res.status(status).json({ error: message });
    }
  }
);

apiRouter.get('/exchanges/transactions', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const isGlobal = user.role === 'System Administrator' && req.query.scope === 'global';
  const rows = db
    .prepare(
      `SELECT t.*,
        so.name AS source_org_name,
        do.name AS destination_org_name,
        u.full_name AS completed_by_name
       FROM exchange_transactions t
       JOIN organizations so ON so.id = t.source_org_id
       JOIN organizations do ON do.id = t.destination_org_id
       JOIN users u ON u.id = t.completed_by
       WHERE ${isGlobal ? '1=1' : '(t.source_org_id = ? OR t.destination_org_id = ?)'}
       ORDER BY t.completed_at DESC`
    )
    .all(...(isGlobal ? [] : [user.organizationId, user.organizationId])) as Array<Record<string, unknown>>;

  res.json({
    transactions: rows.map((t) => ({
      id: Number(t.id),
      transactionCode: String(t.transaction_code),
      requestId: Number(t.request_id),
      listingId: Number(t.listing_id),
      sourceOrgId: Number(t.source_org_id),
      sourceOrgName: String(t.source_org_name),
      destinationOrgId: Number(t.destination_org_id),
      destinationOrgName: String(t.destination_org_name),
      medicineName: String(t.medicine_name),
      category: String(t.category),
      batchNumber: String(t.batch_number),
      quantityTransferred: Number(t.quantity_transferred),
      unitOfMeasure: String(t.unit_of_measure),
      totalValue: Number(t.total_value ?? 0),
      exchangeType: String(t.exchange_type) as ExchangeType,
      completedByName: String(t.completed_by_name),
      completedAt: String(t.completed_at),
    })),
  });
});

// ==========================================
// 6. ORGANIZATIONS, NOTIFICATIONS, REPORTS, USERS
// ==========================================
apiRouter.get('/organizations', requireAuth, (_req, res) => {
  const orgs = db
    .prepare(
      `SELECT o.*,
        (SELECT COUNT(*) FROM exchange_listings l WHERE l.organization_id = o.id AND l.status = 'Active') AS active_listings_count,
        (SELECT COUNT(*) FROM exchange_transactions t WHERE t.source_org_id = o.id OR t.destination_org_id = o.id) AS completed_exchanges_count
       FROM organizations o
       ORDER BY o.id ASC`
    )
    .all() as Array<Record<string, unknown>>;

  res.json({
    organizations: orgs.map((o) => ({
      id: Number(o.id),
      orgCode: String(o.org_code),
      name: String(o.name),
      orgType: String(o.org_type) as OrganizationType,
      registrationNumber: String(o.registration_number),
      address: String(o.address),
      city: String(o.city),
      state: String(o.state),
      contactPerson: String(o.contact_person),
      phone: String(o.phone),
      email: String(o.email),
      verificationStatus: String(o.verification_status),
      isDemo: Boolean(o.is_demo),
      createdAt: String(o.created_at),
      activeListingsCount: Number(o.active_listings_count ?? 0),
      completedExchangesCount: Number(o.completed_exchanges_count ?? 0),
    })),
  });
});

apiRouter.put(
  '/organizations/:id',
  requireAuth,
  requireRole('System Administrator', 'Organization Administrator'),
  (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const user = req.authUser!;
    if (user.role !== 'System Administrator' && user.organizationId !== id) {
      res.status(403).json({ error: 'You can only update your own organization profile.' });
      return;
    }

    const name = String(req.body?.name ?? '').trim();
    const orgType = String(req.body?.orgType ?? '') as OrganizationType;
    const address = String(req.body?.address ?? '').trim();
    const city = String(req.body?.city ?? '').trim();
    const state = String(req.body?.state ?? '').trim();
    const contactPerson = String(req.body?.contactPerson ?? '').trim();
    const phone = String(req.body?.phone ?? '').trim();
    const email = String(req.body?.email ?? '').trim();

    if (!name || !ORGANIZATION_TYPES.includes(orgType) || !city || !state || !contactPerson) {
      res.status(400).json({ error: 'Required organization profile fields cannot be empty.' });
      return;
    }

    db.prepare(
      `UPDATE organizations SET name = ?, org_type = ?, address = ?, city = ?, state = ?, contact_person = ?, phone = ?, email = ? WHERE id = ?`
    ).run(name, orgType, address, city, state, contactPerson, phone, email, id);

    logActivity({
      organizationId: id,
      userId: user.id,
      userName: user.fullName,
      action: 'Organization Updated',
      entityType: 'organization',
      entityId: id,
      details: `Updated organization profile for ${name}`,
    });

    res.json({ message: 'Organization profile updated.' });
  }
);

apiRouter.patch(
  '/organizations/:id/verify',
  requireAuth,
  requireRole('System Administrator'),
  (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const status = String(req.body?.verificationStatus ?? '');
    if (!['Verified', 'Pending Verification', 'Suspended', 'Demo Sandbox'].includes(status)) {
      res.status(400).json({ error: 'Invalid verification status.' });
      return;
    }
    db.prepare('UPDATE organizations SET verification_status = ? WHERE id = ?').run(status, id);
    res.json({ message: `Organization verification updated to ${status}.` });
  }
);

apiRouter.get('/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  syncOrganizationAlerts(user.organizationId);
  const rows = db
    .prepare(
      `SELECT * FROM notifications
       WHERE organization_id = ?
       ORDER BY is_read ASC, created_at DESC, id DESC
       LIMIT 60`
    )
    .all(user.organizationId) as Array<Record<string, unknown>>;

  const notifications = rows.map((n) => ({
    id: Number(n.id),
    organizationId: Number(n.organization_id),
    userId: n.user_id ? Number(n.user_id) : null,
    type: String(n.type),
    severity: String(n.severity),
    title: String(n.title),
    message: String(n.message),
    relatedEntity: n.related_entity ? String(n.related_entity) : null,
    relatedId: n.related_id ? Number(n.related_id) : null,
    isRead: Boolean(n.is_read),
    createdAt: String(n.created_at),
  }));

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  res.json({ notifications, unreadCount });
});

apiRouter.patch('/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const isRead = req.body?.isRead !== undefined ? (req.body.isRead ? 1 : 0) : 1;
  db.prepare('UPDATE notifications SET is_read = ? WHERE id = ? AND organization_id = ?').run(
    isRead,
    id,
    req.authUser!.organizationId
  );
  res.json({ ok: true });
});

apiRouter.post('/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE organization_id = ?').run(req.authUser!.organizationId);
  res.json({ ok: true });
});

apiRouter.get('/reports/:type', requireAuth, (req: AuthenticatedRequest, res) => {
  const type = String(req.params.type);
  const user = req.authUser!;
  const isGlobal = user.role === 'System Administrator' && req.query.scope === 'global';
  const orgId = user.organizationId;
  const now = new Date();

  const medWhere = isGlobal ? '1=1' : 'm.organization_id = ?';
  const medParams = isGlobal ? [] : [orgId];

  if (type === 'total-inventory') {
    const rows = db
      .prepare(
        `SELECT m.item_code, m.name, m.category, m.brand, m.unit_of_measure, m.reorder_level, m.unit_price, m.storage_location,
          COALESCE(i.total_quantity, 0) AS total_quantity, COALESCE(i.reserved_quantity, 0) AS reserved_quantity
         FROM medicines m LEFT JOIN inventory i ON i.medicine_id = m.id
         WHERE ${medWhere} ORDER BY m.name ASC`
      )
      .all(...medParams) as Array<Record<string, unknown>>;

    res.json({
      title: 'Total Inventory Report',
      columns: ['Item ID', 'Medicine Name', 'Category', 'Brand', 'Total Qty', 'Reserved', 'Unit', 'Unit Price', 'Total Value', 'Status'],
      rows: rows.map((r) => ({
        itemId: r.item_code,
        medicineName: r.name,
        category: r.category,
        brand: r.brand,
        totalQty: Number(r.total_quantity),
        reserved: Number(r.reserved_quantity),
        unit: r.unit_of_measure,
        unitPrice: `$${Number(r.unit_price).toFixed(2)}`,
        totalValue: `$${(Number(r.total_quantity) * Number(r.unit_price)).toFixed(2)}`,
        status: classifyStockStatus(Number(r.total_quantity), Number(r.reorder_level)),
      })),
    });
    return;
  }

  if (type === 'expired-medicines' || type === 'near-expiry') {
    const batches = db
      .prepare(
        `SELECT b.*, m.name AS medicine_name, m.item_code, m.category, m.unit_of_measure
         FROM inventory_batches b JOIN medicines m ON m.id = b.medicine_id
         WHERE ${isGlobal ? '1=1' : 'b.organization_id = ?'} AND b.quantity_available > 0
         ORDER BY b.expiry_date ASC`
      )
      .all(...medParams) as Array<Record<string, unknown>>;

    const enriched = batches
      .map((r) => enrichBatchRow(r, now))
      .filter((b) =>
        type === 'expired-medicines'
          ? b.expiryClassification === 'Expired'
          : ['Expiring within 7 days', 'Expiring within 30 days', 'Expiring within 60 days', 'Expiring within 90 days'].includes(
              b.expiryClassification
            )
      );

    res.json({
      title: type === 'expired-medicines' ? 'Expired Medicines Report' : 'Near Expiry Report (Next 90 Days)',
      columns: ['Item ID', 'Medicine Name', 'Category', 'Batch Number', 'Quantity', 'Expiry Date', 'Days Remaining', 'Classification', 'Value at Risk'],
      rows: enriched.map((b) => ({
        itemId: b.itemCode,
        medicineName: b.medicineName,
        category: b.category,
        batchNumber: b.batchNumber,
        quantity: `${b.quantityAvailable} ${b.unitOfMeasure}`,
        expiryDate: b.expiryDate,
        daysRemaining: b.daysUntilExpiry,
        classification: b.expiryClassification,
        valueAtRisk: `$${(b.quantityAvailable * b.unitPrice).toFixed(2)}`,
      })),
    });
    return;
  }

  if (type === 'low-stock') {
    const rows = db
      .prepare(
        `SELECT m.item_code, m.name, m.category, m.unit_of_measure, m.reorder_level, m.storage_location,
          COALESCE(i.total_quantity, 0) AS total_quantity
         FROM medicines m LEFT JOIN inventory i ON i.medicine_id = m.id
         WHERE ${medWhere} AND COALESCE(i.total_quantity, 0) <= m.reorder_level
         ORDER BY total_quantity ASC`
      )
      .all(...medParams) as Array<Record<string, unknown>>;

    res.json({
      title: 'Low Stock Report',
      columns: ['Item ID', 'Medicine Name', 'Category', 'Available Qty', 'Reorder Level', 'Deficit', 'Location', 'Status'],
      rows: rows.map((r) => ({
        itemId: r.item_code,
        medicineName: r.name,
        category: r.category,
        availableQty: `${r.total_quantity} ${r.unit_of_measure}`,
        reorderLevel: Number(r.reorder_level),
        deficit: Math.max(0, Number(r.reorder_level) - Number(r.total_quantity)),
        location: r.storage_location,
        status: classifyStockStatus(Number(r.total_quantity), Number(r.reorder_level)),
      })),
    });
    return;
  }

  if (type === 'stock-exchange' || type === 'organization-exchange') {
    const rows = db
      .prepare(
        `SELECT t.*, so.name AS source_org_name, do.name AS destination_org_name
         FROM exchange_transactions t
         JOIN organizations so ON so.id = t.source_org_id
         JOIN organizations do ON do.id = t.destination_org_id
         WHERE ${isGlobal ? '1=1' : '(t.source_org_id = ? OR t.destination_org_id = ?)'}
         ORDER BY t.completed_at DESC`
      )
      .all(...(isGlobal ? [] : [orgId, orgId])) as Array<Record<string, unknown>>;

    res.json({
      title: type === 'stock-exchange' ? 'Stock Exchange Report' : 'Organization Exchange Report',
      columns: ['Transaction ID', 'Medicine Name', 'Batch', 'From Organization', 'To Organization', 'Type', 'Quantity', 'Value', 'Date'],
      rows: rows.map((r) => ({
        transactionId: r.transaction_code,
        medicineName: r.medicine_name,
        batch: r.batch_number,
        fromOrganization: r.source_org_name,
        toOrganization: r.destination_org_name,
        type: r.exchange_type,
        quantity: `${r.quantity_transferred} ${r.unit_of_measure}`,
        value: `$${Number(r.total_value).toFixed(2)}`,
        date: String(r.completed_at).slice(0, 10),
      })),
    });
    return;
  }

  if (type === 'monthly-movement') {
    const rows = db
      .prepare(
        `SELECT action, details, quantity_delta, user_name, created_at
         FROM activity_logs
         WHERE ${isGlobal ? '1=1' : 'organization_id = ?'}
         ORDER BY created_at DESC LIMIT 100`
      )
      .all(...medParams) as Array<Record<string, unknown>>;

    res.json({
      title: 'Monthly Stock Movement Report',
      columns: ['Date', 'Action', 'Details', 'Qty Delta', 'Recorded By'],
      rows: rows.map((r) => ({
        date: String(r.created_at).slice(0, 16),
        action: r.action,
        details: r.details,
        qtyDelta: Number(r.quantity_delta) > 0 ? `+${r.quantity_delta}` : String(r.quantity_delta),
        recordedBy: r.user_name,
      })),
    });
    return;
  }

  if (type === 'stock-wastage') {
    const rows = db
      .prepare(
        `SELECT b.batch_number, b.expiry_date, b.quantity_available, b.unit_price, b.quarantined, m.name AS medicine_name, m.category, m.unit_of_measure
         FROM inventory_batches b JOIN medicines m ON m.id = b.medicine_id
         WHERE ${isGlobal ? '1=1' : 'b.organization_id = ?'} AND (b.quarantined = 1 OR b.expiry_date < date('now'))
         ORDER BY b.expiry_date DESC`
      )
      .all(...medParams) as Array<Record<string, unknown>>;

    res.json({
      title: 'Stock Wastage Report',
      columns: ['Medicine Name', 'Category', 'Batch Number', 'Expiry Date', 'Unremoved Qty', 'Status', 'Estimated Loss'],
      rows: rows.map((r) => ({
        medicineName: r.medicine_name,
        category: r.category,
        batchNumber: r.batch_number,
        expiryDate: r.expiry_date,
        unremovedQty: `${r.quantity_available} ${r.unit_of_measure}`,
        status: r.quarantined ? 'Quarantined / Written Off' : 'Expired in Stock',
        estimatedLoss: `$${(Number(r.quantity_available) * Number(r.unit_price)).toFixed(2)}`,
      })),
    });
    return;
  }

  if (type === 'category-inventory') {
    const rows = db
      .prepare(
        `SELECT m.category,
          COUNT(m.id) AS item_count,
          COALESCE(SUM(i.total_quantity), 0) AS total_units,
          COALESCE(SUM(i.total_quantity * m.unit_price), 0) AS total_value
         FROM medicines m LEFT JOIN inventory i ON i.medicine_id = m.id
         WHERE ${medWhere}
         GROUP BY m.category ORDER BY total_units DESC`
      )
      .all(...medParams) as Array<Record<string, unknown>>;

    res.json({
      title: 'Category-wise Inventory Report',
      columns: ['Category', 'Total Items', 'Total Stock Units', 'Total Valuation'],
      rows: rows.map((r) => ({
        category: r.category,
        totalItems: Number(r.item_count),
        totalStockUnits: Number(r.total_units),
        totalValuation: `$${Number(r.total_value).toFixed(2)}`,
      })),
    });
    return;
  }

  res.status(404).json({ error: 'Unknown report type.' });
});

apiRouter.get(
  '/users',
  requireAuth,
  requireRole('System Administrator', 'Organization Administrator'),
  (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    const isSysAdmin = user.role === 'System Administrator';
    const rows = db
      .prepare(
        `SELECT u.id, u.organization_id, u.full_name, u.email, u.role, u.status, u.last_login_at, u.created_at,
          o.name AS organization_name, o.org_type AS organization_type
         FROM users u
         JOIN organizations o ON o.id = u.organization_id
         WHERE ${isSysAdmin ? '1=1' : 'u.organization_id = ?'}
         ORDER BY u.created_at DESC`
      )
      .all(...(isSysAdmin ? [] : [user.organizationId])) as Array<Record<string, unknown>>;

    res.json({
      users: rows.map((u) => ({
        id: Number(u.id),
        organizationId: Number(u.organization_id),
        organizationName: String(u.organization_name),
        organizationType: String(u.organization_type),
        fullName: String(u.full_name),
        email: String(u.email),
        role: String(u.role) as UserRole,
        status: String(u.status),
        lastLoginAt: u.last_login_at ? String(u.last_login_at) : null,
        createdAt: String(u.created_at),
      })),
    });
  }
);

apiRouter.post(
  '/users',
  requireAuth,
  requireRole('System Administrator', 'Organization Administrator'),
  (req: AuthenticatedRequest, res) => {
    const caller = req.authUser!;
    const fullName = String(req.body?.fullName ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const role = String(req.body?.role ?? 'Staff Member') as UserRole;
    const organizationId =
      caller.role === 'System Administrator' && req.body?.organizationId
        ? Number(req.body.organizationId)
        : caller.organizationId;

    if (!fullName || !email || password.length < 8 || !USER_ROLES.includes(role)) {
      res.status(400).json({ error: 'Valid name, email, role, and password (8+ chars) are required.' });
      return;
    }
    if (caller.role !== 'System Administrator' && role === 'System Administrator') {
      res.status(403).json({ error: 'Only System Administrators can assign System Administrator role.' });
      return;
    }

    const exists = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
    if (exists) {
      res.status(409).json({ error: 'Email is already registered.' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO users (organization_id, full_name, email, password_hash, role, status)
         VALUES (?, ?, ?, ?, ?, 'Active')`
      )
      .run(organizationId, fullName, email, hashPassword(password), role);

    logActivity({
      organizationId,
      userId: caller.id,
      userName: caller.fullName,
      action: 'User Created',
      entityType: 'user',
      entityId: Number(result.lastInsertRowid),
      details: `Added ${fullName} (${role})`,
    });

    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'User created successfully.' });
  }
);

apiRouter.patch(
  '/users/:id',
  requireAuth,
  requireRole('System Administrator', 'Organization Administrator'),
  (req: AuthenticatedRequest, res) => {
    const caller = req.authUser!;
    const targetId = Number(req.params.id);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as
      | { id: number; organization_id: number; role: UserRole; status: string }
      | undefined;

    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (caller.role !== 'System Administrator' && target.organization_id !== caller.organizationId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const newRole = req.body?.role ? (String(req.body.role) as UserRole) : target.role;
    const newStatus = req.body?.status ? String(req.body.status) : target.status;

    if (!USER_ROLES.includes(newRole) || !['Active', 'Inactive'].includes(newStatus)) {
      res.status(400).json({ error: 'Invalid role or status.' });
      return;
    }
    if (caller.role !== 'System Administrator' && newRole === 'System Administrator') {
      res.status(403).json({ error: 'Insufficient permission to assign System Administrator role.' });
      return;
    }

    db.prepare('UPDATE users SET role = ?, status = ? WHERE id = ?').run(newRole, newStatus, targetId);
    res.json({ message: 'User permissions updated.' });
  }
);
