export const ENTERPRISE_LOGIN_STATUSES = ['WAITING', 'AUTHENTICATED', 'REGISTER_REQUIRED', 'EXPIRED'] as const;

export const ENTERPRISE_PROJECT_DRILL_LEVELS = ['l1', 'l2', 'shortName', 'materialName'] as const;

export const ENTERPRISE_REGISTRATION_URL =
  'https://sjbang.lslnii.com/jjgc/foreground/vip_store/index.html#/qiyema/register';

/** Fixed renderer-to-main channels for the enterprise desktop boundary. */
export const ENTERPRISE_IPC_CHANNELS = Object.freeze({
  AUTH_CREATE: 'enterprise:auth:create',
  AUTH_POLL: 'enterprise:auth:poll',
  AUTH_COMPLETE_REGISTRATION: 'enterprise:auth:complete-registration',
  AUTH_RESTORE: 'enterprise:auth:restore',
  AUTH_CLEAR: 'enterprise:auth:clear',
  REQUEST: 'enterprise:request',
} as const);
