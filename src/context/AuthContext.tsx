import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, setAuthToken } from '../lib/api.ts';
import type { Organization, UserProfile } from '../types/medistock.ts';

export type AppRoute =
  | 'login'
  | 'register'
  | 'dashboard'
  | 'inventory'
  | 'inventory-new'
  | 'inventory-edit'
  | 'batch-details'
  | 'expiry'
  | 'marketplace'
  | 'marketplace-new'
  | 'exchange-requests'
  | 'exchange-history'
  | 'organizations'
  | 'notifications'
  | 'reports'
  | 'users'
  | 'settings'
  | 'organization-profile';

interface RouteState {
  route: AppRoute;
  paramId?: number;
}

interface AuthContextValue {
  user: UserProfile | null;
  organization: Organization | null;
  isAuthenticated: boolean;
  isDark: boolean;
  toggleTheme: () => void;
  routeState: RouteState;
  navigate: (route: AppRoute, paramId?: number) => void;
  unreadNotifications: number;
  refreshUnreadCount: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: Record<string, string>) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  globalScope: boolean;
  setGlobalScope: (val: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [globalScope, setGlobalScope] = useState(false);
  const [routeState, setRouteState] = useState<RouteState>({ route: 'login' });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [isDark]);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => !prev);
  }, []);

  const navigate = useCallback((route: AppRoute, paramId?: number) => {
    setRouteState({ route, paramId });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiRequest<{ unreadCount: number }>('/notifications');
      setUnreadNotifications(res.unreadCount);
    } catch {
      // Ignore silent polling failure
    }
  }, [user]);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await apiRequest<{ user: UserProfile; organization: Record<string, unknown> }>('/auth/me');
      setUser(res.user);
      if (res.organization) {
        const o = res.organization;
        setOrganization({
          id: Number(o.id),
          orgCode: String(o.org_code),
          name: String(o.name),
          orgType: String(o.org_type) as Organization['orgType'],
          registrationNumber: String(o.registration_number),
          address: String(o.address),
          city: String(o.city),
          state: String(o.state),
          contactPerson: String(o.contact_person),
          phone: String(o.phone),
          email: String(o.email),
          verificationStatus: String(o.verification_status) as Organization['verificationStatus'],
          isDemo: Boolean(o.is_demo),
          createdAt: String(o.created_at),
        });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setUnreadNotifications(0);
      return;
    }
    refreshUnreadCount();
    const timer = window.setInterval(refreshUnreadCount, 30000);
    return () => window.clearInterval(timer);
  }, [user, refreshUnreadCount]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest<{ token: string; user: UserProfile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(res.token);
    setUser(res.user);
    setRouteState({ route: 'dashboard' });
    const me = await apiRequest<{ user: UserProfile; organization: Record<string, unknown> }>('/auth/me');
    if (me.organization) {
      const o = me.organization;
      setOrganization({
        id: Number(o.id),
        orgCode: String(o.org_code),
        name: String(o.name),
        orgType: String(o.org_type) as Organization['orgType'],
        registrationNumber: String(o.registration_number),
        address: String(o.address),
        city: String(o.city),
        state: String(o.state),
        contactPerson: String(o.contact_person),
        phone: String(o.phone),
        email: String(o.email),
        verificationStatus: String(o.verification_status) as Organization['verificationStatus'],
        isDemo: Boolean(o.is_demo),
        createdAt: String(o.created_at),
      });
    }
  }, []);

  const register = useCallback(async (payload: Record<string, string>) => {
    const res = await apiRequest<{ token: string; user: UserProfile }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAuthToken(res.token);
    setUser(res.user);
    setRouteState({ route: 'dashboard' });
    const me = await apiRequest<{ user: UserProfile; organization: Record<string, unknown> }>('/auth/me');
    if (me.organization) {
      const o = me.organization;
      setOrganization({
        id: Number(o.id),
        orgCode: String(o.org_code),
        name: String(o.name),
        orgType: String(o.org_type) as Organization['orgType'],
        registrationNumber: String(o.registration_number),
        address: String(o.address),
        city: String(o.city),
        state: String(o.state),
        contactPerson: String(o.contact_person),
        phone: String(o.phone),
        email: String(o.email),
        verificationStatus: String(o.verification_status) as Organization['verificationStatus'],
        isDemo: Boolean(o.is_demo),
        createdAt: String(o.created_at),
      });
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
    setOrganization(null);
    setGlobalScope(false);
    setRouteState({ route: 'login' });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        isAuthenticated: Boolean(user),
        isDark,
        toggleTheme,
        routeState,
        navigate,
        unreadNotifications,
        refreshUnreadCount,
        login,
        register,
        logout,
        refreshProfile,
        globalScope,
        setGlobalScope,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
