/** Enterprise resources whose contact telephone is protected by the H5 membership policy. */
export const ENTERPRISE_CONTACT_RESOURCE_TYPES = ['COMPANY', 'PRODUCT', 'PROJECT'] as const;

export type EnterpriseContactResourceType = (typeof ENTERPRISE_CONTACT_RESOURCE_TYPES)[number];

/** Stable renderer model derived from CompanyController/getCanCallPhone. */
export type EnterpriseContactAccess = {
  allowed: boolean;
  errType: number;
  message: string;
  actionUrl: string;
  /** Present only after the main process has received an affirmative backend decision. */
  phone?: string;
};

/** Stable result of the project contact unlock endpoint. */
export type EnterpriseProjectContactUnlock = {
  purchased: boolean;
  inserted: boolean;
};
