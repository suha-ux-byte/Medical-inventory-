export const MEDICINE_CATEGORIES = [
  'Tablets',
  'Capsules',
  'Syrups',
  'Injections',
  'Surgical Equipment',
  'PPE',
  'Medical Devices',
  'First Aid',
  'IV Supplies',
  'Laboratory Supplies',
] as const;

export type MedicineCategory = (typeof MEDICINE_CATEGORIES)[number];

export const ORGANIZATION_TYPES = [
  'Hospital',
  'Clinic',
  'Pharmacy',
  'Medical Store',
  'Laboratory',
  'Healthcare NGO',
] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const USER_ROLES = [
  'System Administrator',
  'Organization Administrator',
  'Inventory Manager',
  'Staff Member',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const EXPIRY_CLASSIFICATIONS = [
  'Expired',
  'Expiring within 7 days',
  'Expiring within 30 days',
  'Expiring within 60 days',
  'Expiring within 90 days',
  'Safe / Not Near Expiry',
] as const;

export type ExpiryClassification = (typeof EXPIRY_CLASSIFICATIONS)[number];

export const EXCHANGE_REQUEST_STATUSES = [
  'Pending',
  'Approved',
  'Rejected',
  'Processing',
  'Completed',
  'Cancelled',
] as const;

export type ExchangeRequestStatus = (typeof EXCHANGE_REQUEST_STATUSES)[number];

export const EXCHANGE_TYPES = ['Transfer', 'Swap', 'Donation'] as const;
export type ExchangeType = (typeof EXCHANGE_TYPES)[number];

export interface Organization {
  id: number;
  orgCode: string;
  name: string;
  orgType: OrganizationType;
  registrationNumber: string;
  address: string;
  city: string;
  state: string;
  contactPerson: string;
  phone: string;
  email: string;
  verificationStatus: 'Verified' | 'Pending Verification' | 'Suspended' | 'Demo Sandbox';
  isDemo: boolean;
  createdAt: string;
  activeListingsCount?: number;
  completedExchangesCount?: number;
}

export interface UserProfile {
  id: number;
  organizationId: number;
  organizationName: string;
  organizationType: OrganizationType;
  fullName: string;
  email: string;
  role: UserRole;
  status: 'Active' | 'Inactive';
  lastLoginAt: string | null;
  createdAt: string;
}

export interface InventoryBatch {
  id: number;
  medicineId: number;
  organizationId: number;
  supplierId: number | null;
  supplierName: string;
  batchNumber: string;
  quantityAvailable: number;
  reservedQuantity: number;
  freeQuantity: number;
  purchaseDate: string;
  manufacturingDate: string;
  expiryDate: string;
  storageLocation: string;
  unitPrice: number;
  conditionStatus: 'Sealed / Optimal' | 'Cold Chain Verified' | 'Opened Outer Box' | 'Damaged' | 'Quarantined';
  quarantined: boolean;
  daysUntilExpiry: number;
  expiryClassification: ExpiryClassification;
  eligibleForExchange: boolean;
  createdAt: string;
  updatedAt: string;
  medicineName?: string;
  itemCode?: string;
  category?: MedicineCategory;
  brand?: string;
  unitOfMeasure?: string;
  organizationName?: string;
}

export interface MedicineItem {
  id: number;
  itemCode: string;
  organizationId: number;
  organizationName?: string;
  name: string;
  genericName: string;
  category: MedicineCategory;
  brand: string;
  unitOfMeasure: string;
  reorderLevel: number;
  unitPrice: number;
  storageLocation: string;
  description: string;
  totalQuantity: number;
  reservedQuantity: number;
  freeQuantity: number;
  batchCount: number;
  nearestExpiryDate: string | null;
  nearestExpiryDays: number | null;
  expiryStatus: ExpiryClassification | 'No Stock';
  stockStatus: 'Out of Stock' | 'Low Stock' | 'Adequate' | 'Surplus';
  batches?: InventoryBatch[];
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeListing {
  id: number;
  organizationId: number;
  organizationName: string;
  organizationType: OrganizationType;
  organizationCity: string;
  organizationState: string;
  organizationVerified: string;
  isDemoOrg: boolean;
  batchId: number;
  medicineId: number;
  medicineName: string;
  category: MedicineCategory;
  brand: string;
  batchNumber: string;
  availableQuantity: number;
  batchFreeQuantity: number;
  unitOfMeasure: string;
  unitPrice: number;
  expiryDate: string;
  daysUntilExpiry: number;
  expiryClassification: ExpiryClassification;
  stockCondition: string;
  exchangeType: ExchangeType;
  contactInfo: string;
  description: string;
  status: 'Active' | 'Paused' | 'Fulfilled' | 'Expired Blocked';
  createdBy: number;
  createdAt: string;
}

export interface ExchangeRequest {
  id: number;
  requestCode: string;
  listingId: number;
  ownerOrgId: number;
  ownerOrgName: string;
  ownerOrgCity: string;
  requesterOrgId: number;
  requesterOrgName: string;
  requesterOrgCity: string;
  requesterUserId: number;
  requesterUserName: string;
  medicineName: string;
  category: MedicineCategory;
  batchNumber: string;
  expiryDate: string;
  unitOfMeasure: string;
  unitPrice: number;
  requestedQuantity: number;
  exchangeType: ExchangeType;
  status: ExchangeRequestStatus;
  notes: string;
  ownerConfirmed: boolean;
  requesterConfirmed: boolean;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeTransaction {
  id: number;
  transactionCode: string;
  requestId: number;
  listingId: number;
  sourceOrgId: number;
  sourceOrgName: string;
  destinationOrgId: number;
  destinationOrgName: string;
  medicineName: string;
  category: string;
  batchNumber: string;
  quantityTransferred: number;
  unitOfMeasure: string;
  totalValue: number;
  exchangeType: ExchangeType;
  completedByName: string;
  completedAt: string;
}

export interface NotificationItem {
  id: number;
  organizationId: number;
  userId: number | null;
  type: 'expiry_warning' | 'expiry_critical' | 'expired' | 'low_stock' | 'exchange_request' | 'exchange_approved' | 'exchange_rejected' | 'exchange_completed' | 'inventory_update';
  severity: 'info' | 'warning' | 'critical' | 'success';
  title: string;
  message: string;
  relatedEntity: string | null;
  relatedId: number | null;
  isRead: boolean;
  createdAt: string;
}

export interface ActivityLog {
  id: number;
  organizationId: number;
  organizationName?: string;
  userId: number | null;
  userName: string;
  action: string;
  entityType: string;
  entityId: number | null;
  details: string;
  quantityDelta: number;
  createdAt: string;
}

export interface DashboardSummary {
  stats: {
    totalMedicines: number;
    totalStockUnits: number;
    expiredItems: number;
    expiringWithin30Days: number;
    lowStockItems: number;
    pendingExchangeRequests: number;
    successfulExchanges: number;
    connectedOrganizations: number;
    totalInventoryValue: number;
    wastagePreventedUnits: number;
  };
  categoryDistribution: Array<{ category: string; items: number; units: number; value: number }>;
  monthlyMovement: Array<{ month: string; inbound: number; outbound: number; exchanged: number; expired: number }>;
  expiryTimeline: Array<{ bucket: string; batches: number; units: number; severity: string }>;
  recentActivity: ActivityLog[];
  lowStockAlerts: MedicineItem[];
  expiryAlerts: InventoryBatch[];
  recentExchangeRequests: ExchangeRequest[];
}
