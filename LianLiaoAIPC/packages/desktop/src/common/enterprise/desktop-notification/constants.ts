import type { DesktopNotificationIpcErrorCode } from './contracts';

export const DESKTOP_NOTIFICATION_TYPES = [
  'VERSION_UPDATE',
  'SUPPLY_DEMAND_MATCH',
  'PROJECT_OPPORTUNITY',
  'ENTERPRISE_CODE_REVIEW',
  'MEMBERSHIP_POINTS',
  'CUSTOMER_SERVICE',
  'SYSTEM_ANNOUNCEMENT',
] as const;

export const DESKTOP_NOTIFICATION_ACTIONS = [
  'OPEN_SUPPLY_DEMAND',
  'OPEN_PROJECT',
  'OPEN_COMPANY',
  'OPEN_PRODUCT',
  'OPEN_MEMBERSHIP',
  'OPEN_CUSTOMER_SERVICE',
  'OPEN_VERSION_UPDATE',
  'OPEN_NOTIFICATION_DETAIL',
] as const;

export const DESKTOP_NOTIFICATION_CONTENT_TYPES = ['TEXT', 'RICH_TEXT', 'IMAGE_TEXT'] as const;
export const DESKTOP_NOTIFICATION_DELIVERY_STATUSES = ['PENDING', 'DELIVERED', 'FAILED', 'CANCELLED'] as const;
export const DESKTOP_NOTIFICATION_FAILURE_CODES = [
  'UNSUPPORTED_CONTENT',
  'INVALID_CONTENT',
  'DETAIL_RENDER_FAILED',
] as const;

/** Fixed API origins keep the renderer from selecting arbitrary network destinations. */
export const DESKTOP_NOTIFICATION_API_BASE_URLS = Object.freeze({
  development: 'http://127.0.0.1:12580/',
  production: 'https://cloud.lslnii.com/',
} as const);

export const DESKTOP_NOTIFICATION_CONTROLLER_PATH = 'cloud-api/DesktopNotificationController/';
export const DESKTOP_NOTIFICATION_WEBSOCKET_PATH = 'cloud-api/desktop-notification/ws';

/** Native notification clicks are validated in preload before the renderer receives them. */
export const DESKTOP_NOTIFICATION_NAVIGATE_CHANNEL = 'enterprise:desktop-notification:navigate';

/** Fixed IPC commands form the complete Electron notification-center surface. */
export const DESKTOP_NOTIFICATION_IPC_CHANNELS = Object.freeze({
  CONNECT: 'enterprise:desktop-notification:connect',
  DISCONNECT: 'enterprise:desktop-notification:disconnect',
  LIST: 'enterprise:desktop-notification:list',
  GET_UNREAD_COUNT: 'enterprise:desktop-notification:get-unread-count',
  MARK_READ: 'enterprise:desktop-notification:mark-read',
  MARK_ALL_READ: 'enterprise:desktop-notification:mark-all-read',
  EVENT: 'enterprise:desktop-notification:event',
} as const);

export const DESKTOP_NOTIFICATION_RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

/** Stable, presentation-safe failure descriptions exposed through preload. */
export const DESKTOP_NOTIFICATION_IPC_ERROR_MESSAGES: Readonly<Record<DesktopNotificationIpcErrorCode, string>> =
  Object.freeze({
    INVALID_REQUEST: 'Desktop notification request is invalid.',
    MISSING_ENTERPRISE_SESSION: 'Enterprise login is required for desktop notifications.',
    TIMEOUT: 'Desktop notification request timed out.',
    NETWORK: 'Desktop notification network request failed.',
    HTTP: 'Desktop notification API returned an unsuccessful HTTP status.',
    API_FAILURE: 'Desktop notification API rejected the request.',
    INVALID_RESPONSE: 'Desktop notification API response is invalid.',
    WEBSOCKET_ERROR: 'Desktop notification realtime connection failed.',
    NOT_CONNECTED: 'Desktop notification realtime connection is not ready.',
    UNTRUSTED_SENDER: 'Desktop notification IPC sender is not trusted.',
    IPC_UNAVAILABLE: 'Desktop notification IPC is unavailable.',
    INVALID_IPC_RESPONSE: 'Desktop notification IPC response is invalid.',
    REQUEST_FAILED: 'Desktop notification request failed.',
  });
