export const DEMAND_CONTACT_STATES = [
  'OWNER',
  'UNLOCKED',
  'MEMBER_AVAILABLE',
  'PAYMENT_REQUIRED',
  'QUOTA_EXHAUSTED',
  'REGISTRATION_REQUIRED',
  'DEMAND_CLOSED',
  'UNAVAILABLE',
] as const;

export type DemandContactState = (typeof DEMAND_CONTACT_STATES)[number];

export type DemandContactInfo = {
  companyName?: string;
  contactPerson?: string;
  contactPhone?: string;
  address?: string;
};

export type DemandContactAccess = {
  state: DemandContactState;
  memberLevel?: number;
  memberLevelLabel?: string;
  remainingQuota?: number;
  canAcquire: boolean;
  canUpgrade: boolean;
  contact: DemandContactInfo | null;
};
