import type { EnterpriseUserContext } from '../contracts';

/**
 * Uses only the Cloud-issued aggregate permission. Missing or invalid values
 * deliberately fall back to the enterprise customer experience.
 */
export const isCustomerServiceStaff = (user: EnterpriseUserContext | null | undefined): boolean =>
  user?.customerServiceStaff === true;
