import type { EnterpriseIpcErrorCode } from './contracts';

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

/** Single allowlist and fixed-message source for enterprise IPC failures. */
export const ENTERPRISE_IPC_ERROR_MESSAGES: Readonly<Record<EnterpriseIpcErrorCode, string>> = Object.freeze({
  INVALID_BASE_URL: 'Enterprise API base URL is not allowed.',
  INVALID_REQUEST: 'Enterprise API request is invalid.',
  MISSING_CONTEXT: 'Enterprise API user context is incomplete.',
  TIMEOUT: 'Enterprise API request timed out.',
  NETWORK: 'Enterprise API request failed.',
  HTTP: 'Enterprise API request returned an unsuccessful HTTP status.',
  INVALID_JSON: 'Enterprise API response is not valid JSON.',
  API_FAILURE: 'Enterprise API rejected the request.',
  INVALID_RESPONSE: 'Enterprise API response is invalid.',
  AUTH_CREATE_FAILED: 'Enterprise login session creation failed.',
  AUTH_POLL_FAILED: 'Enterprise login polling failed.',
  INVALID_AUTH_RESULT: 'Enterprise login result is invalid.',
  REGISTRATION_INCOMPLETE: 'Enterprise registration is incomplete.',
  REGISTRATION_FAILED: 'Enterprise registration verification failed.',
  SESSION_RESTORE_FAILED: 'Enterprise session restoration failed.',
  SESSION_CLEAR_FAILED: 'Enterprise session clearing failed.',
  REQUEST_FAILED: 'Enterprise request failed.',
  UNTRUSTED_SENDER: 'Enterprise IPC sender is not trusted.',
  IPC_UNAVAILABLE: 'Enterprise IPC is unavailable.',
  INVALID_IPC_RESPONSE: 'Enterprise IPC response is invalid.',
});
