/**
 * Shared Electron notification-center contracts.
 * Oracle NUMBER identifiers remain decimal strings so signed and large IDs are never coerced by JavaScript.
 */
export type DesktopNotificationBusinessId = string;

export type DesktopNotificationType =
  | 'VERSION_UPDATE'
  | 'SUPPLY_DEMAND_MATCH'
  | 'PROJECT_OPPORTUNITY'
  | 'ENTERPRISE_CODE_REVIEW'
  | 'MEMBERSHIP_POINTS'
  | 'CUSTOMER_SERVICE'
  | 'SYSTEM_ANNOUNCEMENT';

export type DesktopNotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type DesktopNotificationDeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
export type DesktopNotificationContentType = 'TEXT' | 'RICH_TEXT' | 'IMAGE_TEXT';
export type DesktopNotificationFailureCode = 'UNSUPPORTED_CONTENT' | 'INVALID_CONTENT' | 'DETAIL_RENDER_FAILED';
export type DesktopNotificationAction =
  | 'OPEN_SUPPLY_DEMAND'
  | 'OPEN_PROJECT'
  | 'OPEN_COMPANY'
  | 'OPEN_PRODUCT'
  | 'OPEN_MEMBERSHIP'
  | 'OPEN_CUSTOMER_SERVICE'
  | 'OPEN_VERSION_UPDATE'
  | 'OPEN_NOTIFICATION_DETAIL';

export type DesktopNotificationInboxItem = {
  recipientId: DesktopNotificationBusinessId;
  notificationId: DesktopNotificationBusinessId;
  type: DesktopNotificationType;
  priority: DesktopNotificationPriority;
  title: string;
  content: string | null;
  contentType: DesktopNotificationContentType;
  extensionJson: string | null;
  action: DesktopNotificationAction | null;
  businessId: DesktopNotificationBusinessId | null;
  createTime: number | null;
  readAt: number | null;
  deliveryStatus: DesktopNotificationDeliveryStatus;
};

export type DesktopNotificationPage = {
  items: DesktopNotificationInboxItem[];
  nextBeforeRecipientId: DesktopNotificationBusinessId | null;
};

export type DesktopNotificationListRequest = {
  beforeRecipientId?: DesktopNotificationBusinessId;
  unreadOnly?: boolean;
  type?: DesktopNotificationType;
  limit?: number;
};

export type DesktopNotificationMarkReadRequest = {
  notificationId: DesktopNotificationBusinessId;
};

export type DesktopNotificationChangedResult = {
  changed: boolean;
};

export type DesktopNotificationMarkAllReadResult = {
  changedCount: number;
};

export type DesktopNotificationUnreadCount = {
  unreadCount: number;
};

/** Main-process-only one-time ticket. It must never cross IPC or be persisted to disk. */
export type DesktopNotificationWebSocketTicket = {
  ticket: string;
  expiresInSeconds: number;
};

export type DesktopNotificationConnectionState = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';

export type DesktopNotificationConnectionSnapshot = {
  state: DesktopNotificationConnectionState;
  reconnectAttempt: number;
  unreadCount: number;
};

export type DesktopNotificationServerEvent =
  | 'connection.ready'
  | 'notification.created'
  | 'notification.badge'
  | 'notification.read'
  | 'pong'
  | 'error';

export type DesktopNotificationConnectionReadyPayload = {
  connectionId: string;
  heartbeatIntervalSeconds: number;
};

export type DesktopNotificationBadgePayload = {
  unreadCount: number;
};

export type DesktopNotificationReadPayload = {
  notificationId: DesktopNotificationBusinessId;
};

export type DesktopNotificationErrorPayload = {
  code: string;
};

export type DesktopNotificationServerEnvelope<TPayload = unknown> = {
  event: DesktopNotificationServerEvent;
  eventId: string;
  serverTime: number;
  payload: TPayload;
};

export type DesktopNotificationIpcErrorCode =
  | 'INVALID_REQUEST'
  | 'MISSING_ENTERPRISE_SESSION'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'HTTP'
  | 'API_FAILURE'
  | 'INVALID_RESPONSE'
  | 'WEBSOCKET_ERROR'
  | 'NOT_CONNECTED'
  | 'UNTRUSTED_SENDER'
  | 'IPC_UNAVAILABLE'
  | 'INVALID_IPC_RESPONSE'
  | 'REQUEST_FAILED';

export type DesktopNotificationIpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: DesktopNotificationIpcErrorCode; message: string } };
