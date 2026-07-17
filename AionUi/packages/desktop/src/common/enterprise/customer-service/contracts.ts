/**
 * Shared customer-service contracts used by Electron main, preload, and renderer.
 * Oracle NUMBER(19) identifiers always stay as signed decimal strings.
 */
export type CustomerServiceBusinessId = string;

export type CustomerServicePrincipalType = 'CUSTOMER' | 'STAFF';
export type CustomerServiceConversationStatus = 'WAITING' | 'ACTIVE' | 'CLOSED';
export type CustomerServiceSenderType = 'CUSTOMER' | 'STAFF' | 'SYSTEM';
export type CustomerServiceMessageType = 'TEXT' | 'IMAGE' | 'SYSTEM';
export type CustomerServiceConnectionState = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';

export type CustomerServicePrincipal = {
  type: CustomerServicePrincipalType;
  userId: CustomerServiceBusinessId | null;
  displayName: string | null;
  companyId: CustomerServiceBusinessId | null;
  companyName: string | null;
};

/** Main-process-only authentication response. Never return this object through IPC. */
export type CustomerServiceAuthSession = {
  accessToken: string;
  expiresInSeconds: number;
  principal: CustomerServicePrincipal;
};

export type CustomerServiceConversation = {
  conversationId: CustomerServiceBusinessId;
  status: CustomerServiceConversationStatus;
  customerUserId: CustomerServiceBusinessId | null;
  customerName: string | null;
  customerTel: string | null;
  customerCompanyId: CustomerServiceBusinessId | null;
  customerCompanyName: string | null;
  staffUserId: CustomerServiceBusinessId | null;
  staffName: string | null;
  allocationSource: string | null;
  staffFirstReplyAt: number | null;
  lastMessageId: CustomerServiceBusinessId | null;
  lastMessageAt: number | null;
  staffUnreadCount: number;
  lastMessageType: CustomerServiceMessageType | null;
  lastMessagePreview: string | null;
  customerLastReadId: CustomerServiceBusinessId | null;
  staffLastReadId: CustomerServiceBusinessId | null;
  assignmentVersion: number;
  version: number;
  closedByType: CustomerServicePrincipalType | 'SYSTEM' | null;
  closedById: CustomerServiceBusinessId | null;
  closedReason: string | null;
  closedAt: number | null;
  assignedAt: number | null;
  createdAt: number | null;
  updatedAt: number | null;
};

export type CustomerServiceImage = {
  url: string;
  width: number;
  height: number;
  sizeBytes: string;
  mimeType: string;
};

export type CustomerServiceMessage = {
  messageId: CustomerServiceBusinessId;
  conversationId: CustomerServiceBusinessId;
  clientMessageId: string;
  senderType: CustomerServiceSenderType;
  senderUserId: CustomerServiceBusinessId | null;
  senderName: string | null;
  messageType: CustomerServiceMessageType;
  textContent: string | null;
  image: CustomerServiceImage | null;
  assignmentVersion: number;
  createdAt: number | null;
};

export type CustomerServicePage<T> = {
  items: T[];
  nextCursor: CustomerServiceBusinessId | null;
  hasMore: boolean;
};

export type CustomerServiceReadResult = {
  advanced: boolean;
  lastReadMessageId: CustomerServiceBusinessId;
};

export type CustomerServiceWebSocketTicket = {
  ticket: string;
  expiresInSeconds: number;
};

export type CustomerServiceStaffCandidate = {
  userId: CustomerServiceBusinessId;
  userName: string | null;
  companyId: CustomerServiceBusinessId | null;
  companyName: string | null;
  activeConversationCount: number;
  online: boolean;
};

export type CustomerServiceConversationListRequest = {
  status?: CustomerServiceConversationStatus;
  keyword?: string;
  beforeConversationId?: CustomerServiceBusinessId;
  limit?: number;
};

export type CustomerServiceConversationIdRequest = {
  conversationId: CustomerServiceBusinessId;
};

export type CustomerServiceMessageHistoryRequest = CustomerServiceConversationIdRequest & {
  beforeMessageId?: CustomerServiceBusinessId;
  afterMessageId?: CustomerServiceBusinessId;
  limit?: number;
};

export type CustomerServiceSendTextRequest = CustomerServiceConversationIdRequest & {
  clientMessageId: string;
  messageType: 'TEXT';
  textContent: string;
};

export type CustomerServiceSendImageRequest = CustomerServiceConversationIdRequest & {
  clientMessageId: string;
  messageType: 'IMAGE';
  image: CustomerServiceImage;
};

export type CustomerServiceSendMessageRequest = CustomerServiceSendTextRequest | CustomerServiceSendImageRequest;

export type CustomerServiceMarkReadRequest = CustomerServiceConversationIdRequest & {
  messageId: CustomerServiceBusinessId;
};

export type CustomerServiceUploadImageRequest = CustomerServiceConversationIdRequest & {
  fileName: string;
  mimeType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp';
  bytes: Uint8Array;
};

export type CustomerServiceTransferRequest = CustomerServiceConversationIdRequest & {
  targetStaffUserId: CustomerServiceBusinessId;
  expectedAssignmentVersion: number;
  expectedVersion: number;
  reason?: string;
};

export type CustomerServiceCloseRequest = CustomerServiceConversationIdRequest & {
  expectedVersion: number;
  reason?: string;
};

export type CustomerServiceStaffCandidatesRequest = CustomerServiceConversationIdRequest & {
  keyword?: string;
  beforeStaffUserId?: CustomerServiceBusinessId;
  limit?: number;
};

export type CustomerServiceConnectionSnapshot = {
  state: CustomerServiceConnectionState;
  reconnectAttempt: number;
  unreadCount: number;
};

export type CustomerServiceServerEvent =
  | 'connection.ready'
  | 'conversation.snapshot'
  | 'message.ack'
  | 'message.created'
  | 'read.updated'
  | 'conversation.assigned'
  | 'conversation.transferred'
  | 'conversation.closed'
  | 'presence.updated'
  | 'pong'
  | 'error';

export type CustomerServiceConnectionReadyPayload = {
  connectionId: string;
  identity: CustomerServicePrincipal;
  heartbeatIntervalSeconds: number;
  presenceTimeoutSeconds: number;
};

export type CustomerServiceMessageAckPayload = {
  messageId: CustomerServiceBusinessId;
  clientMessageId: string;
  createdAt: number | null;
};

export type CustomerServiceReadUpdatedPayload = {
  advanced: boolean;
  lastReadMessageId: CustomerServiceBusinessId;
  readerType: CustomerServicePrincipalType;
};

export type CustomerServicePresencePayload = {
  principalType: CustomerServicePrincipalType;
  userId: CustomerServiceBusinessId | null;
  displayName: string | null;
  online: boolean;
};

export type CustomerServiceLifecyclePayload = {
  conversationId: CustomerServiceBusinessId;
  status: CustomerServiceConversationStatus | null;
  staffUserId: CustomerServiceBusinessId | null;
  staffName: string | null;
  assignmentVersion: number;
  version: number;
  lastMessageId: CustomerServiceBusinessId | null;
  lastMessageAt: number | null;
  closedReason: string | null;
  closedAt: number | null;
  assignedAt: number | null;
  systemMessage?: CustomerServiceMessage;
};

export type CustomerServiceServerEnvelope<TPayload = unknown> = {
  event: CustomerServiceServerEvent;
  eventId: string;
  requestId?: string | null;
  conversationId?: CustomerServiceBusinessId | null;
  serverTime: number;
  payload: TPayload;
};

export type CustomerServiceIpcErrorCode =
  | 'INVALID_REQUEST'
  | 'MISSING_ENTERPRISE_SESSION'
  | 'AUTHENTICATION_FAILED'
  | 'FORBIDDEN_STAFF'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'HTTP'
  | 'API_FAILURE'
  | 'INVALID_RESPONSE'
  | 'UNAUTHORIZED'
  | 'WEBSOCKET_ERROR'
  | 'NOT_CONNECTED'
  | 'UNTRUSTED_SENDER'
  | 'IPC_UNAVAILABLE'
  | 'INVALID_IPC_RESPONSE'
  | 'REQUEST_FAILED';

export type CustomerServiceIpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: CustomerServiceIpcErrorCode; message: string } };
