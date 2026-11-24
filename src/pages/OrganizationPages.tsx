import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Mail,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { ORGANIZATION_TYPES, type Organization, type OrganizationType } from '../types/medistock.ts';
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
// PAGE 12: ORGANIZATION DIRECTORY
// ==================================================
export function OrganizationDirectoryPage() {
  const { user, navigate } = useAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [orgType, setOrgType] = useState('All');
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ organizations: Organization[] }>('/organizations');
      setOrgs(res.organizations);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load organizations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  async function handleUpdateVerification(orgId: number, verificationStatus: string) {
    try {
      await apiRequest(`/organizations/${orgId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ verificationStatus }),
      });
      toast.success(`Organization status updated to ${verificationStatus}`);
      setSelectedOrg(null);
      loadOrganizations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status.');
    }
  }

  const filtered = orgs.filter((o) => {
    if (orgType !== 'All' && o.orgType !== orgType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.name.toLowerCase().includes(q) ||
        o.city.toLowerCase().includes(q) ||
        o.orgCode.toLowerCase().includes(q) ||
        o.registrationNumber.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Healthcare Organization Directory
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Connected hospitals, clinics, pharmacies, laboratories, and NGOs participating in medical stock exchange.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('organization-profile')}>
          My Organization Profile
        </Button>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by facility name, city, ID, or registration number..."
              className="pl-9"
            />
          </div>
          <Select value={orgType} onChange={(e) => setOrgType(e.target.value)}>
            <option value="All">All Facility Types</option>
            {ORGANIZATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {loading ? (
        <Card className="p-6">
          <TableSkeleton rows={5} />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="No healthcare organizations matched"
            description="Try adjusting your facility type filter or search term."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((o) => (
            <Card key={o.id} className="p-5 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-mono">{o.orgCode} · {o.orgType}</span>
                  <StatusText status={o.verificationStatus} />
                </div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  {o.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>{o.address}, {o.city}, {o.state}</span>
                </p>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  <p>Contact: {o.contactPerson}</p>
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <Phone className="w-3 h-3" /> {o.phone}
                  </p>
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
                    <Mail className="w-3 h-3 shrink-0" /> {o.email}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {o.activeListingsCount ?? 0} listings · {o.completedExchangesCount ?? 0} exchanges
                </div>
                <Button size="sm" variant="outline" onClick={() => setSelectedOrg(o)}>
                  Details
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(selectedOrg)}
        onClose={() => setSelectedOrg(null)}
        title={selectedOrg?.name ?? ''}
        subtitle={selectedOrg ? `${selectedOrg.orgCode} · Reg. ${selectedOrg.registrationNumber}` : undefined}
      >
        {selectedOrg && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
              <div>
                <span className="text-slate-500">Facility Type</span>
                <p className="font-medium mt-0.5">{selectedOrg.orgType}</p>
              </div>
              <div>
                <span className="text-slate-500">Verification</span>
                <div className="mt-0.5">
                  <StatusText status={selectedOrg.verificationStatus} />
                </div>
              </div>
              <div>
                <span className="text-slate-500">Primary Contact</span>
                <p className="font-medium mt-0.5">{selectedOrg.contactPerson}</p>
              </div>
              <div>
                <span className="text-slate-500">Phone</span>
                <p className="font-mono mt-0.5">{selectedOrg.phone}</p>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500">Address</span>
                <p className="mt-0.5">
                  {selectedOrg.address}, {selectedOrg.city}, {selectedOrg.state}
                </p>
              </div>
            </div>

            {selectedOrg.isDemo && (
              <p className="text-[11px] text-cyan-700 dark:text-cyan-400">
                Note: This is a labeled Demo Sandbox facility populated for testing stock exchange workflows.
              </p>
            )}

            {user?.role === 'System Administrator' && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                  System Administrator Verification Controls
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleUpdateVerification(selectedOrg.id, 'Verified')}
                  >
                    Mark Verified
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateVerification(selectedOrg.id, 'Pending Verification')}
                  >
                    Set Pending
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleUpdateVerification(selectedOrg.id, 'Suspended')}
                  >
                    Suspend
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSelectedOrg(null)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setSelectedOrg(null);
                  navigate('marketplace');
                }}
              >
                Browse Marketplace
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ==================================================
// PAGE 17: ORGANIZATION PROFILE
// ==================================================
export function OrganizationProfilePage() {
  const { user, organization, refreshProfile } = useAuth();
  const canEdit =
    user?.role === 'System Administrator' || user?.role === 'Organization Administrator';

  const [form, setForm] = useState({
    name: organization?.name ?? '',
    orgType: (organization?.orgType ?? 'Hospital') as OrganizationType,
    address: organization?.address ?? '',
    city: organization?.city ?? '',
    state: organization?.state ?? '',
    contactPerson: organization?.contactPerson ?? '',
    phone: organization?.phone ?? '',
    email: organization?.email ?? '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (organization) {
      setForm({
        name: organization.name,
        orgType: organization.orgType,
        address: organization.address,
        city: organization.city,
        state: organization.state,
        contactPerson: organization.contactPerson,
        phone: organization.phone,
        email: organization.email,
      });
    }
  }, [organization]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!organization) return;
    setSaving(true);
    try {
      await apiRequest(`/organizations/${organization.id}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      await refreshProfile();
      toast.success('Organization profile updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update organization profile.');
    } finally {
      setSaving(false);
    }
  }

  if (!organization) {
    return (
      <Card className="p-6">
        <TableSkeleton rows={4} />
      </Card>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Organization Profile
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {organization.orgCode} · Registration #{organization.registrationNumber}
          </p>
        </div>
        <StatusText status={organization.verificationStatus} />
      </div>

      <Card className="p-6">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Organization Name</FieldLabel>
              <Input
                disabled={!canEdit}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <FieldLabel required>Organization Type</FieldLabel>
              <Select
                disabled={!canEdit}
                value={form.orgType}
                onChange={(e) => setForm({ ...form, orgType: e.target.value as OrganizationType })}
              >
                {ORGANIZATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <FieldLabel required>Contact Person</FieldLabel>
              <Input
                disabled={!canEdit}
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                required
              />
            </div>
            <div>
              <FieldLabel required>Phone</FieldLabel>
              <Input
                disabled={!canEdit}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
              />
            </div>
            <div>
              <FieldLabel required>Facility Email</FieldLabel>
              <Input
                disabled={!canEdit}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <FieldLabel required>Address</FieldLabel>
            <Input
              disabled={!canEdit}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>City</FieldLabel>
              <Input
                disabled={!canEdit}
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                required
              />
            </div>
            <div>
              <FieldLabel required>State</FieldLabel>
              <Input
                disabled={!canEdit}
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                required
              />
            </div>
          </div>

          {canEdit ? (
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Organization Profile'}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Only Organization Administrators or System Administrators can edit facility profile details.
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}
