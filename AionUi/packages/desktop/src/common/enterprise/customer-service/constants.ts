import type { CustomerServiceIpcErrorCode } from './contracts';

export const CUSTOMER_SERVICE_API_BASE_URLS = Object.freeze({
  development: 'http://127.0.0.1:12580/',
  production: 'https://cloud.lslnii.com/',
} as const);

export const CUSTOMER_SERVICE_CONTROLLER_PATH = 'cloud-api/CustomerServiceController/';
export const CUSTOMER_SERVICE_WEBSOCKET_PATH = 'cloud-api/customer-service/ws';

export const CUSTOMER_SERVICE_ENDPOINTS = Object.freeze({
  staffAuth: 'staff/auth',
  conversationList: 'conversation/list',
  conversationDetail: 'conversation/detail',
  messageHistory: 'message/history',
  messageRead: 'message/read',
  imageUpload: 'image/upload',
  conversationTransfer: 'conversation/transfer',
  conversationClose: 'conversation/close',
  staffCandidates: 'staff/candidates',
  websocketTicket: 'websocket/ticket',
} as const);

/** Explicit channels prevent arbitrary renderer-selected operations. */
export const CUSTOMER_SERVICE_IPC_CHANNELS = Object.freeze({
  CONNECT: 'enterprise:customer-service:connect',
  DISCONNECT: 'enterprise:customer-service:disconnect',
  LIST_CONVERSATIONS: 'enterprise:customer-service:list-conversations',
  GET_CONVERSATION: 'enterprise:customer-service:get-conversation',
  GET_HISTORY: 'enterprise:customer-service:get-history',
  SEND_MESSAGE: 'enterprise:customer-service:send-message',
  MARK_READ: 'enterprise:customer-service:mark-read',
  UPLOAD_IMAGE: 'enterprise:customer-service:upload-image',
  LIST_CANDIDATES: 'enterprise:customer-service:list-candidates',
  TRANSFER_CONVERSATION: 'enterprise:customer-service:transfer-conversation',
  CLOSE_CONVERSATION: 'enterprise:customer-service:close-conversation',
  EVENT: 'enterprise:customer-service:event',
} as const);

export const CUSTOMER_SERVICE_RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

export const CUSTOMER_SERVICE_IPC_ERROR_MESSAGES: Readonly<Record<CustomerServiceIpcErrorCode, string>> = Object.freeze(
  {
    INVALID_REQUEST: 'Customer-service request is invalid.',
    MISSING_ENTERPRISE_SESSION: 'Enterprise login is required for customer service.',
    AUTHENTICATION_FAILED: 'Customer-service authentication failed.',
    FORBIDDEN_STAFF: 'The current user is not an authorized customer-service agent.',
    TIMEOUT: 'Customer-service request timed out.',
    NETWORK: 'Customer-service network request failed.',
    HTTP: 'Customer-service API returned an unsuccessful HTTP status.',
    API_FAILURE: 'Customer-service API rejected the request.',
    INVALID_RESPONSE: 'Customer-service API response is invalid.',
    UNAUTHORIZED: 'Customer-service credentials are invalid or expired.',
    WEBSOCKET_ERROR: 'Customer-service realtime connection failed.',
    NOT_CONNECTED: 'Customer-service realtime connection is not ready.',
    UNTRUSTED_SENDER: 'Customer-service IPC sender is not trusted.',
    IPC_UNAVAILABLE: 'Customer-service IPC is unavailable.',
    INVALID_IPC_RESPONSE: 'Customer-service IPC response is invalid.',
    REQUEST_FAILED: 'Customer-service request failed.',
  }
);
