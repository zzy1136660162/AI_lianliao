/** Enterprise resources whose contact telephone is protected by the H5 membership policy. */
export const ENTERPRISE_CONTACT_RESOURCE_TYPES = ['COMPANY', 'PRODUCT', 'PROJECT'] as const;

export type EnterpriseContactResourceType = (typeof ENTERPRISE_CONTACT_RESOURCE_TYPES)[number];

export const ENTERPRISE_CONTACT_ACTIONS = ['NONE', 'REGISTER', 'CERTIFY', 'UPGRADE', 'RETRY'] as const;

export type EnterpriseContactAction = (typeof ENTERPRISE_CONTACT_ACTIONS)[number];

/** Stable renderer model returned by DesktopContactController/acquire. */
export type EnterpriseContactAccess = {
  allowed: boolean;
  errType: number;
  message: string;
  action: EnterpriseContactAction;
  /** Present only after the cloud service has granted this real-time request. */
  phone?: string;
};

/** Stable result of the project contact unlock endpoint. */
export type EnterpriseProjectContactUnlock = {
  purchased: boolean;
  inserted: boolean;
};
