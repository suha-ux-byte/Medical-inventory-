import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'medistock.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      org_type TEXT NOT NULL CHECK (org_type IN ('Hospital', 'Clinic', 'Pharmacy', 'Medical Store', 'Laboratory', 'Healthcare NGO')),
      registration_number TEXT NOT NULL UNIQUE,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      contact_person TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'Pending Verification' CHECK (verification_status IN ('Verified', 'Pending Verification', 'Suspended', 'Demo Sandbox')),
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('System Administrator', 'Organization Administrator', 'Inventory Manager', 'Staff Member')),
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      contact_email TEXT,
      phone TEXT,
      address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT NOT NULL,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      generic_name TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL CHECK (category IN ('Tablets', 'Capsules', 'Syrups', 'Injections', 'Surgical Equipment', 'PPE', 'Medical Devices', 'First Aid', 'IV Supplies', 'Laboratory Supplies')),
      brand TEXT NOT NULL,
      unit_of_measure TEXT NOT NULL,
      reorder_level INTEGER NOT NULL DEFAULT 50 CHECK (reorder_level >= 0),
      unit_price REAL NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
      storage_location TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (organization_id, item_code)
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL UNIQUE REFERENCES medicines(id) ON DELETE CASCADE,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      total_quantity INTEGER NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
      reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      supplier_name TEXT NOT NULL,
      batch_number TEXT NOT NULL,
      quantity_available INTEGER NOT NULL CHECK (quantity_available >= 0),
      reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
      purchase_date TEXT NOT NULL,
      manufacturing_date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      storage_location TEXT NOT NULL,
      unit_price REAL NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
      condition_status TEXT NOT NULL DEFAULT 'Sealed / Optimal' CHECK (condition_status IN ('Sealed / Optimal', 'Cold Chain Verified', 'Opened Outer Box', 'Damaged', 'Quarantined')),
      quarantined INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (organization_id, medicine_id, batch_number)
    );

    CREATE TABLE IF NOT EXISTS exchange_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      batch_id INTEGER NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
      medicine_name TEXT NOT NULL,
      category TEXT NOT NULL,
      batch_number TEXT NOT NULL,
      available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
      unit_of_measure TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      stock_condition TEXT NOT NULL,
      exchange_type TEXT NOT NULL CHECK (exchange_type IN ('Transfer', 'Swap', 'Donation')),
      contact_info TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Paused', 'Fulfilled', 'Expired Blocked')),
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS exchange_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_code TEXT NOT NULL UNIQUE,
      listing_id INTEGER NOT NULL REFERENCES exchange_listings(id) ON DELETE CASCADE,
      owner_org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      requester_org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      requester_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      requested_quantity INTEGER NOT NULL CHECK (requested_quantity > 0),
      exchange_type TEXT NOT NULL CHECK (exchange_type IN ('Transfer', 'Swap', 'Donation')),
      status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Processing', 'Completed', 'Cancelled')),
      notes TEXT NOT NULL DEFAULT '',
      owner_confirmed INTEGER NOT NULL DEFAULT 0,
      requester_confirmed INTEGER NOT NULL DEFAULT 0,
      rejection_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS exchange_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_code TEXT NOT NULL UNIQUE,
      request_id INTEGER NOT NULL UNIQUE REFERENCES exchange_requests(id) ON DELETE CASCADE,
      listing_id INTEGER NOT NULL REFERENCES exchange_listings(id) ON DELETE CASCADE,
      source_org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      destination_org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      medicine_name TEXT NOT NULL,
      category TEXT NOT NULL,
      batch_number TEXT NOT NULL,
      quantity_transferred INTEGER NOT NULL CHECK (quantity_transferred > 0),
      unit_of_measure TEXT NOT NULL,
      total_value REAL NOT NULL DEFAULT 0,
      exchange_type TEXT NOT NULL,
      completed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      completed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical', 'success')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      related_entity TEXT,
      related_id INTEGER,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT NOT NULL,
      quantity_delta INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_batches_org_expiry ON inventory_batches(organization_id, expiry_date);
    CREATE INDEX IF NOT EXISTS idx_listings_status ON exchange_listings(status, organization_id);
    CREATE INDEX IF NOT EXISTS idx_requests_orgs ON exchange_requests(owner_org_id, requester_org_id, status);
    CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(organization_id, is_read, created_at);
    CREATE INDEX IF NOT EXISTS idx_activity_org ON activity_logs(organization_id, created_at);
  `);
}

export function syncMedicineInventoryAggregate(medicineId: number): void {
  const med = db.prepare('SELECT id, organization_id FROM medicines WHERE id = ?').get(medicineId) as
    | { id: number; organization_id: number }
    | undefined;
  if (!med) return;

  const totals = db
    .prepare(
      `SELECT
        COALESCE(SUM(quantity_available), 0) AS total_qty,
        COALESCE(SUM(reserved_quantity), 0) AS reserved_qty
       FROM inventory_batches
       WHERE medicine_id = ?`
    )
    .get(medicineId) as { total_qty: number; reserved_qty: number };

  db.prepare(
    `INSERT INTO inventory (medicine_id, organization_id, total_quantity, reserved_quantity, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(medicine_id) DO UPDATE SET
       total_quantity = excluded.total_quantity,
       reserved_quantity = excluded.reserved_quantity,
       updated_at = datetime('now')`
  ).run(medicineId, med.organization_id, totals.total_qty, totals.reserved_qty);
}

export function runInTransaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
