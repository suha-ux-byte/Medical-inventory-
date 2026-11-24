import React, { useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  Bell,
  Building2,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  FileBarChart2,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  PlusCircle,
  Settings,
  ShieldCheck,
  Store,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useAuth, type AppRoute } from '../../context/AuthContext.tsx';
import { cn } from '../../lib/utils.ts';

interface NavGroup {
  label: string;
  items: Array<{
    route: AppRoute;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    roles?: string[];
    badge?: number;
  }>;
}

const ROUTE_TITLES: Record<AppRoute, { group: string; title: string }> = {
  login: { group: 'Auth', title: 'Sign In' },
  register: { group: 'Auth', title: 'Organization Registration' },
  dashboard: { group: 'Overview', title: 'Dashboard' },
  inventory: { group: 'Inventory', title: 'Inventory Management' },
  'inventory-new': { group: 'Inventory', title: 'Add Medical Item' },
  'inventory-edit': { group: 'Inventory', title: 'Edit Medical Item' },
  'batch-details': { group: 'Inventory', title: 'Batch Details & Audit' },
  expiry: { group: 'Monitoring', title: 'Expiry Tracking' },
  marketplace: { group: 'Stock Exchange', title: 'Exchange Marketplace' },
  'marketplace-new': { group: 'Stock Exchange', title: 'Create Exchange Listing' },
  'exchange-requests': { group: 'Stock Exchange', title: 'Exchange Requests' },
  'exchange-history': { group: 'Stock Exchange', title: 'Transaction History' },
  organizations: { group: 'Network', title: 'Organization Directory' },
  'organization-profile': { group: 'Network', title: 'Organization Profile' },
  notifications: { group: 'Alerts', title: 'Notifications Center' },
  reports: { group: 'Analytics', title: 'Reports & Analytics' },
  users: { group: 'Administration', title: 'User Management' },
  settings: { group: 'Administration', title: 'Settings' },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    user,
    organization,
    routeState,
    navigate,
    logout,
    isDark,
    toggleTheme,
    unreadNotifications,
    globalScope,
    setGlobalScope,
  } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return <>{children}</>;

  const canManageInventory = user.role !== 'Staff Member';
  const canManageUsers = user.role === 'System Administrator' || user.role === 'Organization Administrator';

  const navGroups: NavGroup[] = [
    {
      label: 'Operations',
      items: [
        { route: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { route: 'inventory', label: 'Inventory', icon: Package },
        ...(canManageInventory
          ? [{ route: 'inventory-new' as AppRoute, label: 'Add Medicine', icon: PlusCircle }]
          : []),
        { route: 'expiry', label: 'Expiry Tracking', icon: CalendarClock },
      ],
    },
    {
      label: 'Stock Exchange',
      items: [
        { route: 'marketplace', label: 'Marketplace', icon: Store },
        ...(canManageInventory
          ? [{ route: 'marketplace-new' as AppRoute, label: 'Offer Surplus Stock', icon: ArrowLeftRight }]
          : []),
        { route: 'exchange-requests', label: 'Exchange Requests', icon: ClipboardList },
        { route: 'exchange-history', label: 'Transaction History', icon: History },
      ],
    },
    {
      label: 'Network & Reports',
      items: [
        { route: 'organizations', label: 'Organizations', icon: Building2 },
        { route: 'organization-profile', label: 'Organization Profile', icon: ShieldCheck },
        { route: 'reports', label: 'Reports & Analytics', icon: FileBarChart2 },
        {
          route: 'notifications',
          label: 'Notifications',
          icon: Bell,
          badge: unreadNotifications,
        },
      ],
    },
    {
      label: 'System',
      items: [
        ...(canManageUsers ? [{ route: 'users' as AppRoute, label: 'User Management', icon: Users }] : []),
        { route: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  const meta = ROUTE_TITLES[routeState.route] ?? { group: 'MediStock', title: 'Workspace' };

  const SidebarContent = (
    <div className="flex flex-col h-full bg-[#0F2942] dark:bg-slate-900 text-slate-200 border-r border-slate-800/60">
      <div className="flex items-center justify-between px-5 h-16 border-b border-white/10 shrink-0">
        <button
          type="button"
          onClick={() => {
            navigate('dashboard');
            setMobileOpen(false);
          }}
          className="flex items-center gap-2.5 text-left cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
            <Activity className="w-4 h-4" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap">
            MediStock
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-300 hover:bg-white/10 cursor-pointer"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-white/10">
        <p className="text-xs font-medium text-white truncate">{user.organizationName}</p>
        <p className="text-[11px] text-slate-300/80 mt-0.5 truncate">
          {user.organizationType} · {user.role}
        </p>
        {organization?.isDemo && (
          <p className="text-[11px] text-cyan-300 mt-1">Demo Sandbox Environment</p>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[11px] font-medium text-slate-400 tracking-wide">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  routeState.route === item.route ||
                  (item.route === 'inventory' &&
                    (routeState.route === 'inventory-edit' || routeState.route === 'batch-details'));
                return (
                  <button
                    key={item.route}
                    type="button"
                    onClick={() => {
                      navigate(item.route);
                      setMobileOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap',
                      active
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded bg-red-500 text-white">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10 shrink-0">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-white truncate">{user.fullName}</p>
            <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">{SidebarContent}</aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] h-full z-10">{SidebarContent}</aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1.5 text-sm min-w-0">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline whitespace-nowrap">
                {meta.group}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 hidden sm:inline shrink-0" />
              <h1 className="font-display font-semibold text-slate-900 dark:text-white truncate">
                {meta.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {user.role === 'System Administrator' && (
              <div className="hidden sm:flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setGlobalScope(false)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap',
                    !globalScope
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  )}
                >
                  My Facility
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalScope(true)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap',
                    globalScope
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  )}
                >
                  All Facilities
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => navigate('notifications')}
              aria-label="Open notifications"
              className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white font-mono text-[10px] font-semibold flex items-center justify-center tabular-nums">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
