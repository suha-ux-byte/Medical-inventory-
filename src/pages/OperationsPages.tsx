import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CheckCheck,
  Download,
  FileBarChart2,
  Moon,
  Plus,
  Sun,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { exportRowsToCsv, exportRowsToPdf } from '../lib/exportUtils.ts';
import { formatDate } from '../lib/utils.ts';
import {
  USER_ROLES,
  type NotificationItem,
  type UserProfile,
  type UserRole,
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
} from '../components/ui/Primitives.tsx';

// ==================================================
// PAGE 13: NOTIFICATIONS CENTER
// ==================================================
export function NotificationsPage() {
  const { navigate, refreshUnreadCount } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'expiry' | 'low_stock' | 'exchange'>('all');

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ notifications: NotificationItem[] }>('/notifications');
      setNotifications(res.notifications);
      refreshUnreadCount();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [refreshUnreadCount]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  async function toggleRead(n: NotificationItem) {
    try {
      await apiRequest(`/notifications/${n.id}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ isRead: !n.isRead }),
      });
      loadNotifications();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update notification.');
    }
  }

  async function markAllRead() {
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' });
      toast.success('All notifications marked as read.');
      loadNotifications();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.isRead;
    if (filter === 'expiry') return n.type.includes('expir');
    if (filter === 'low_stock') return n.type === 'low_stock';
    if (filter === 'exchange') return n.type.includes('exchange');
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Alerts &amp; Notification Center
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Automated expiry warnings, low-stock alerts, and inter-facility exchange updates.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={markAllRead}>
          <CheckCheck className="w-3.5 h-3.5" />
          Mark All Read
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg w-fit">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'unread', label: 'Unread' },
            { id: 'expiry', label: 'Expiry Alerts' },
            { id: 'low_stock', label: 'Low Stock' },
            { id: 'exchange', label: 'Exchanges' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              filter === t.id
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications in this filter"
            description="Automated alerts appear here whenever stock approaches expiry, drops below reorder level, or receives an exchange update."
          />
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filtered.map((n) => (
              <div
                key={n.id}
                className={`p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  !n.isRead ? 'bg-teal-50/40 dark:bg-teal-950/20' : ''
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <StatusText
                      status={
                        n.severity === 'critical'
                          ? 'Critical'
                          : n.severity === 'warning'
                            ? 'Warning'
                            : n.severity === 'success'
                              ? 'Completed'
                              : 'Info'
                      }
                    />
                    <span className="text-slate-400">·</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {formatDate(n.createdAt)}
                    </span>
                    {!n.isRead && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400">
                          Unread
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{n.title}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{n.message}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {n.relatedEntity === 'exchange_request' && (
                    <Button size="sm" variant="outline" onClick={() => navigate('exchange-requests')}>
                      Open Request
                    </Button>
                  )}
                  {n.relatedEntity === 'batch' && (
                    <Button size="sm" variant="outline" onClick={() => navigate('expiry')}>
                      Review Expiry
                    </Button>
                  )}
                  {n.relatedEntity === 'medicine' && (
                    <Button size="sm" variant="outline" onClick={() => navigate('inventory')}>
                      View Stock
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => toggleRead(n)}>
                    {n.isRead ? 'Mark Unread' : 'Mark Read'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ==================================================
// PAGE 14: REPORTS & ANALYTICS
// ==================================================
const REPORT_TYPES = [
  { id: 'total-inventory', label: 'Total Inventory Report' },
  { id: 'expired-medicines', label: 'Expired Medicines Report' },
  { id: 'near-expiry', label: 'Near Expiry Report' },
  { id: 'low-stock', label: 'Low Stock Report' },
  { id: 'stock-exchange', label: 'Stock Exchange Report' },
  { id: 'monthly-movement', label: 'Monthly Stock Movement' },
  { id: 'stock-wastage', label: 'Stock Wastage Report' },
  { id: 'category-inventory', label: 'Category-wise Inventory Report' },
  { id: 'organization-exchange', label: 'Organization Exchange Report' },
] as const;

export function ReportsPage() {
  const { user, globalScope } = useAuth();
  const [activeReport, setActiveReport] = useState<string>('total-inventory');
  const [reportData, setReportData] = useState<{
    title: string;
    columns: string[];
    rows: Array<Record<string, unknown>>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const qs = globalScope && user?.role === 'System Administrator' ? '?scope=global' : '';
      const res = await apiRequest<{
        title: string;
        columns: string[];
        rows: Array<Record<string, unknown>>;
      }>(`/reports/${activeReport}${qs}`);
      setReportData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate report.');
    } finally {
      setLoading(false);
    }
  }, [activeReport, globalScope, user?.role]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Reports &amp; Compliance Analytics
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Generate live database reports and export audit-ready CSV or PDF documents.
          </p>
        </div>
        {reportData && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              disabled={reportData.rows.length === 0}
              onClick={() =>
                exportRowsToCsv(`medistock_${activeReport}.csv`, reportData.columns, reportData.rows)
              }
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
            <Button
              size="sm"
              disabled={reportData.rows.length === 0}
              onClick={() =>
                exportRowsToPdf(
                  `medistock_${activeReport}.pdf`,
                  reportData.title,
                  user?.organizationName || 'MediStock',
                  reportData.columns,
                  reportData.rows
                )
              }
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF
            </Button>
          </div>
        )}
      </div>

      {/* Report Selector Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {REPORT_TYPES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setActiveReport(r.id)}
            className={`text-left px-4 py-3 rounded-xl border text-xs font-medium transition-colors cursor-pointer flex items-center justify-between ${
              activeReport === r.id
                ? 'bg-[#0F2942] text-white border-[#0F2942] dark:bg-teal-600 dark:border-teal-600'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-teal-500/60'
            }`}
          >
            <span>{r.label}</span>
            <FileBarChart2 className="w-4 h-4 opacity-70 shrink-0" />
          </button>
        ))}
      </div>

      {/* Report Output Table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {reportData?.title ?? 'Report Preview'}
          </h3>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {reportData?.rows.length ?? 0} records
          </span>
        </div>

        {loading ? (
          <TableSkeleton rows={6} />
        ) : !reportData?.rows.length ? (
          <EmptyState
            icon={FileBarChart2}
            title="No records for this report"
            description="No matching inventory, expiry, or exchange records exist for the current facility scope."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  {reportData.columns.map((col) => (
                    <th key={col} className="py-3 px-4 font-medium whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {reportData.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    {Object.values(row).map((val, cIdx) => (
                      <td key={cIdx} className="py-2.5 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {String(val ?? '—')}
                      </td>
                    ))}
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

// ==================================================
// PAGE 15: USER MANAGEMENT (RBAC)
// ==================================================
export function UserManagementPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'Staff Member' as UserRole,
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ users: UserProfile[] }>('/users');
      setUsers(res.users);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      toast.success('User account created.');
      setAddOpen(false);
      setNewUser({ fullName: '', email: '', password: '', role: 'Staff Member' });
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create user.');
    }
  }

  async function handleUpdateUser(target: UserProfile, updates: { role?: UserRole; status?: string }) {
    try {
      await apiRequest(`/users/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      toast.success('User permissions updated.');
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            User &amp; Role-Based Access Management
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Assign facility staff roles and govern inventory and exchange approval permissions.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="w-3.5 h-3.5" />
          Add Staff Member
        </Button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : users.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No team members found"
            description="Add staff members or inventory managers to collaborate in your facility."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Name &amp; Email</th>
                  <th className="py-3 px-4 font-medium">Organization</th>
                  <th className="py-3 px-4 font-medium">Role</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900 dark:text-white">{u.fullName}</p>
                      <p className="font-mono text-[11px] text-slate-500">{u.email}</p>
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{u.organizationName}</td>
                    <td className="py-3 px-4">
                      <Select
                        className="py-1 text-xs max-w-[200px]"
                        value={u.role}
                        disabled={u.id === user?.id}
                        onChange={(e) => handleUpdateUser(u, { role: e.target.value as UserRole })}
                      >
                        {USER_ROLES.filter(
                          (r) => user?.role === 'System Administrator' || r !== 'System Administrator'
                        ).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-3 px-4">
                      <StatusText status={u.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      {u.id !== user?.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleUpdateUser(u, {
                              status: u.status === 'Active' ? 'Inactive' : 'Active',
                            })
                          }
                        >
                          {u.status === 'Active' ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Team Member">
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <FieldLabel required>Full Name</FieldLabel>
            <Input
              value={newUser.fullName}
              onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
              required
            />
          </div>
          <div>
            <FieldLabel required>Work Email</FieldLabel>
            <Input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              required
            />
          </div>
          <div>
            <FieldLabel required>Role</FieldLabel>
            <Select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
            >
              {USER_ROLES.filter(
                (r) => user?.role === 'System Administrator' || r !== 'System Administrator'
              ).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel required>Temporary Password (min. 8 chars)</FieldLabel>
            <Input
              type="password"
              minLength={8}
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create User</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ==================================================
// PAGE 16: SETTINGS
// ==================================================
export function SettingsPage() {
  const { user, isDark, toggleTheme } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiRequest<{ message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast.success(res.message);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Workspace &amp; Security Settings
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your display theme, account security, and role permissions.
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Appearance Theme</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Switch between crisp clinical Light Mode and high-contrast Dark Mode.
            </p>
          </div>
          <Button variant="outline" onClick={toggleTheme}>
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          </Button>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-slate-500">Signed-in Account</span>
            <p className="font-medium mt-0.5">{user?.fullName}</p>
          </div>
          <div>
            <span className="text-slate-500">Role</span>
            <p className="font-medium mt-0.5">{user?.role}</p>
          </div>
          <div>
            <span className="text-slate-500">Facility</span>
            <p className="font-medium mt-0.5">{user?.organizationName}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Change Password</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Passwords are salted and hashed with scrypt on the server.
        </p>
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <FieldLabel required>Current Password</FieldLabel>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <FieldLabel required>New Password (min. 8 characters)</FieldLabel>
            <Input
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? 'Updating...' : 'Update Password'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
