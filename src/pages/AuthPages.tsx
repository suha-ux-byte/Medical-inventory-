import React, { useState } from 'react';
import { Activity, Eye, EyeOff, KeyRound, Moon, ShieldCheck, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { ORGANIZATION_TYPES, type OrganizationType } from '../types/medistock.ts';
import { Button, Card, FieldLabel, Input, Modal, Select } from '../components/ui/Primitives.tsx';

const FACILITY_IMAGE_SRC = '/src/assets/images/medical_supply_facility_1795488615207.jpg';

const DEMO_ACCOUNTS = [
  {
    label: 'System Administrator',
    email: 'admin@medistock.demo',
    facility: 'Mercy General Hospital [Demo]',
  },
  {
    label: 'Organization Administrator',
    email: 'orgadmin@medistock.demo',
    facility: 'Mercy General Hospital [Demo]',
  },
  {
    label: 'Inventory Manager',
    email: 'manager@medistock.demo',
    facility: 'Mercy General Hospital [Demo]',
  },
  {
    label: 'Staff Member',
    email: 'staff@medistock.demo',
    facility: 'Mercy General Hospital [Demo]',
  },
  {
    label: 'Partner Pharmacy Admin',
    email: 'cascade@medistock.demo',
    facility: 'Cascade Regional Pharmacy [Demo]',
  },
];

export function AuthPages() {
  const { routeState, navigate, login, register, isDark, toggleTheme } = useAuth();
  const isRegister = routeState.route === 'register';

  const [email, setEmail] = useState('admin@medistock.demo');
  const [password, setPassword] = useState('DemoPass@2026');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Register fields
  const [regForm, setRegForm] = useState({
    fullName: '',
    email: '',
    password: '',
    organizationName: '',
    organizationType: 'Hospital' as OrganizationType,
    registrationNumber: '',
    address: '',
    city: '',
    state: '',
    phone: '',
  });

  // Forgot & Reset password modal
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success('Signed in to MediStock');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuickDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword('DemoPass@2026');
    setSubmitting(true);
    try {
      await login(demoEmail, 'DemoPass@2026');
      toast.success(`Signed in as ${demoEmail}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Demo sign in failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await register(regForm);
      toast.success('Organization registered and signed in');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await apiRequest<{ message: string; previewResetCode?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail }),
      });
      toast.success(res.message);
      if (res.previewResetCode) {
        setPreviewCode(res.previewResetCode);
        setResetCode(res.previewResetCode);
      }
      setResetStep('confirm');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to request reset code');
    }
  }

  async function handleConfirmReset(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await apiRequest<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail, resetCode, newPassword }),
      });
      toast.success(res.message);
      setResetOpen(false);
      setResetStep('request');
      setPreviewCode(null);
      setNewPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Password reset failed');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row">
      {/* Left Architectural Clinical Panel */}
      <div className="relative lg:w-[46%] bg-[#0F2942] text-white flex flex-col justify-between overflow-hidden min-h-[260px] lg:min-h-screen">
        {!imgError ? (
          <img
            src={FACILITY_IMAGE_SRC}
            alt="Modern hospital pharmacy and medical supply center"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover opacity-35"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0F2942] via-[#133B5C] to-teal-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F33] via-[#0F2942]/75 to-[#0F2942]/60" />

        <div className="relative z-10 p-6 sm:p-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-500/20 border border-teal-400/40 flex items-center justify-center text-teal-300">
              <Activity className="w-5 h-5" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-white">MediStock</span>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <div className="relative z-10 p-6 sm:p-10 space-y-5 max-w-xl">
          <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white text-balance">
            Zero-waste medical inventory and safe inter-facility stock exchange.
          </h1>
          <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
            Track batch-level expiry dates in real time, automate 7-to-90 day alerts, and redistribute surplus
            medicines across verified clinics, pharmacies, and hospital networks.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-3 border-t border-white/15">
            <div>
              <p className="font-mono text-lg font-semibold text-teal-300 tabular-nums">Batch-Level</p>
              <p className="text-xs text-slate-300 mt-0.5">FEFO &amp; Expiry Tracking</p>
            </div>
            <div>
              <p className="font-mono text-lg font-semibold text-cyan-300 tabular-nums">Atomic Lock</p>
              <p className="text-xs text-slate-300 mt-0.5">No Double Allocation</p>
            </div>
            <div>
              <p className="font-mono text-lg font-semibold text-emerald-300 tabular-nums">CSV &amp; PDF</p>
              <p className="text-xs text-slate-300 mt-0.5">Audit-Ready Reports</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Auth Form Column */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
        <div className="w-full max-w-lg space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                {isRegister ? 'Register Healthcare Organization' : 'Sign in to MediStock'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {isRegister
                  ? 'Create an organization workspace and administrator account.'
                  : 'Access your facility inventory, expiry alerts, and exchange requests.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => navigate('login')}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                !isRegister
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => navigate('register')}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                isRegister
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Register Organization
            </button>
          </div>

          {!isRegister ? (
            <>
              <Card className="p-6">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <FieldLabel required>Work Email</FieldLabel>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@hospital.org"
                      required
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Password <span className="text-red-600">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setResetEmail(email);
                          setResetOpen(true);
                        }}
                        className="text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label="Toggle password visibility"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                      Demo Sandbox Accounts (Sample Data Only)
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Select a role to test permissions, inventory workflows, and inter-facility exchanges.
                    </p>
                  </div>
                  <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <div key={acc.email} className="py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                          {acc.label}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                          {acc.email} · {acc.facility}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={submitting}
                        onClick={() => handleQuickDemo(acc.email)}
                      >
                        Sign In
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <Card className="p-6">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required>Administrator Full Name</FieldLabel>
                    <Input
                      value={regForm.fullName}
                      onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                      placeholder="Dr. Jordan Ellis"
                      required
                    />
                  </div>
                  <div>
                    <FieldLabel required>Work Email</FieldLabel>
                    <Input
                      type="email"
                      value={regForm.email}
                      onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                      placeholder="admin@clinic.org"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required>Organization Name</FieldLabel>
                    <Input
                      value={regForm.organizationName}
                      onChange={(e) => setRegForm({ ...regForm, organizationName: e.target.value })}
                      placeholder="St. Jude Community Clinic"
                      required
                    />
                  </div>
                  <div>
                    <FieldLabel required>Organization Type</FieldLabel>
                    <Select
                      value={regForm.organizationType}
                      onChange={(e) =>
                        setRegForm({ ...regForm, organizationType: e.target.value as OrganizationType })
                      }
                    >
                      {ORGANIZATION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required>License / Registration Number</FieldLabel>
                    <Input
                      value={regForm.registrationNumber}
                      onChange={(e) => setRegForm({ ...regForm, registrationNumber: e.target.value })}
                      placeholder="MED-REG-94820"
                      required
                    />
                  </div>
                  <div>
                    <FieldLabel required>Phone Number</FieldLabel>
                    <Input
                      value={regForm.phone}
                      onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                      placeholder="(206) 555-0190"
                      required
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel required>Street Address</FieldLabel>
                  <Input
                    value={regForm.address}
                    onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                    placeholder="1200 Medical Center Way"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required>City</FieldLabel>
                    <Input
                      value={regForm.city}
                      onChange={(e) => setRegForm({ ...regForm, city: e.target.value })}
                      placeholder="Seattle"
                      required
                    />
                  </div>
                  <div>
                    <FieldLabel required>State / Region</FieldLabel>
                    <Input
                      value={regForm.state}
                      onChange={(e) => setRegForm({ ...regForm, state: e.target.value })}
                      placeholder="WA"
                      required
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel required>Password (min. 8 characters)</FieldLabel>
                  <Input
                    type="password"
                    minLength={8}
                    value={regForm.password}
                    onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                    placeholder="Create a strong password"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Creating Organization...' : 'Create Organization Account'}
                </Button>
              </form>
            </Card>
          )}
        </div>
      </div>

      {/* Password Reset Modal */}
      <Modal
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setResetStep('request');
          setPreviewCode(null);
        }}
        title="Reset Account Password"
        subtitle="Generate a single-use reset code to update your password."
      >
        {resetStep === 'request' ? (
          <form onSubmit={handleRequestReset} className="space-y-4">
            <div>
              <FieldLabel required>Registered Email</FieldLabel>
              <Input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="name@hospital.org"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResetOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Generate Reset Code</Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleConfirmReset} className="space-y-4">
            {previewCode && (
              <div className="p-3 rounded-lg bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800 text-xs text-cyan-900 dark:text-cyan-200 flex items-center gap-2">
                <KeyRound className="w-4 h-4 shrink-0" />
                <span>
                  Preview reset code: <strong className="font-mono">{previewCode}</strong>
                </span>
              </div>
            )}
            <div>
              <FieldLabel required>Reset Code</FieldLabel>
              <Input
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                placeholder="Enter 8-character code"
                className="font-mono"
                required
              />
            </div>
            <div>
              <FieldLabel required>New Password (8+ characters)</FieldLabel>
              <Input
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResetStep('request')}>
                Back
              </Button>
              <Button type="submit">Reset Password</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
