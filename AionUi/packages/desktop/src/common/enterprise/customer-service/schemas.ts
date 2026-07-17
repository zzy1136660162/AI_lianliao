import { z } from 'zod';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_IMAGE_HOSTS = new Set(['sjbang.lslnii.com', 'www.lslnii.com']);

/** Matches the backend SignedIdCodec without converting through number or BigInt. */
export const signedBusinessIdSchema = z.string().regex(/^-?[1-9][0-9]{0,18}$/);

/** Exact payload accepted from the trusted notification navigation channel. */
export const customerServiceNavigationDetailSchema = z.object({ conversationId: signedBusinessIdSchema }).strict();

const nullableBusinessIdSchema = signedBusinessIdSchema.nullable();
const nonNegativeIntegerSchema = z.number().int().nonnegative().safe();
const nullableTimestampSchema = z.number().int().nonnegative().safe().nullable();
const nullableTextSchema = (maxLength: number) => z.string().max(maxLength).nullable();
const uuidSchema = z.string().regex(UUID_PATTERN);
const keywordSchema = z.string().trim().min(1).max(100).optional();
const reasonSchema = z.string().trim().min(1).max(500).optional();
const limitSchema = z.number().int().min(1).max(50).optional();

export const customerServicePrincipalSchema = z
  .object({
    type: z.enum(['CUSTOMER', 'STAFF']),
    userId: nullableBusinessIdSchema,
    displayName: nullableTextSchema(200),
    companyId: nullableBusinessIdSchema,
    companyName: nullableTextSchema(500),
  })
  .strict();

export const customerServiceAuthSessionSchema = z
  .object({
    accessToken: z.string().min(16).max(512),
    expiresInSeconds: z.number().int().min(1).max(86_400),
    principal: customerServicePrincipalSchema,
  })
  .strict();

export const customerServiceConversationSchema = z
  .object({
    conversationId: signedBusinessIdSchema,
    status: z.enum(['WAITING', 'ACTIVE', 'CLOSED']),
    customerUserId: nullableBusinessIdSchema,
    customerName: nullableTextSchema(200),
    customerTel: nullableTextSchema(50),
    customerCompanyId: nullableBusinessIdSchema,
    customerCompanyName: nullableTextSchema(500),
    staffUserId: nullableBusinessIdSchema,
    staffName: nullableTextSchema(200),
    allocationSource: nullableTextSchema(200),
    staffFirstReplyAt: nullableTimestampSchema,
    lastMessageId: nullableBusinessIdSchema,
    lastMessageAt: nullableTimestampSchema,
    staffUnreadCount: nonNegativeIntegerSchema,
    lastMessageType: z.enum(['TEXT', 'IMAGE', 'SYSTEM']).nullable(),
    lastMessagePreview: nullableTextSchema(2_000),
    customerLastReadId: nullableBusinessIdSchema,
    staffLastReadId: nullableBusinessIdSchema,
    assignmentVersion: nonNegativeIntegerSchema,
    version: nonNegativeIntegerSchema,
    closedByType: z.enum(['CUSTOMER', 'STAFF', 'SYSTEM']).nullable(),
    closedById: nullableBusinessIdSchema,
    closedReason: nullableTextSchema(500),
    closedAt: nullableTimestampSchema,
    assignedAt: nullableTimestampSchema,
    createdAt: nullableTimestampSchema,
    updatedAt: nullableTimestampSchema,
  })
  .strict();

const trustedImageUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' && url.username === '' && url.password === '' && ALLOWED_IMAGE_HOSTS.has(url.hostname)
      );
    } catch {
      return false;
    }
  });

export const customerServiceImageSchema = z
  .object({
    url: trustedImageUrlSchema,
    width: z.number().int().min(1).max(20_000),
    height: z.number().int().min(1).max(20_000),
    sizeBytes: z.string().regex(/^[1-9][0-9]{0,18}$/),
    mimeType: z.enum(['image/gif', 'image/jpeg', 'image/png', 'image/webp']),
  })
  .strict();

const customerServiceMessageObjectSchema = z
  .object({
    messageId: signedBusinessIdSchema,
    conversationId: signedBusinessIdSchema,
    clientMessageId: uuidSchema,
    senderType: z.enum(['CUSTOMER', 'STAFF', 'SYSTEM']),
    senderUserId: nullableBusinessIdSchema,
    senderName: nullableTextSchema(200),
    messageType: z.enum(['TEXT', 'IMAGE', 'SYSTEM']),
    textContent: nullableTextSchema(2_000),
    image: customerServiceImageSchema.nullish(),
    assignmentVersion: nonNegativeIntegerSchema,
    createdAt: nullableTimestampSchema,
  })
  .strict();

/** WebSocket text/system messages omit image; normalize that omission to null. */
export const customerServiceMessageSchema = customerServiceMessageObjectSchema.transform((message) => ({
  ...message,
  image: message.image ?? null,
}));

export const customerServiceStaffCandidateSchema = z
  .object({
    userId: signedBusinessIdSchema,
    userName: nullableTextSchema(200),
    companyId: nullableBusinessIdSchema,
    companyName: nullableTextSchema(500),
    activeConversationCount: nonNegativeIntegerSchema,
    online: z.boolean(),
  })
  .strict();

export const customerServiceReadResultSchema = z
  .object({
    advanced: z.boolean(),
    lastReadMessageId: signedBusinessIdSchema,
  })
  .strict();

export const customerServiceWebSocketTicketSchema = z
  .object({
    ticket: z.string().min(16).max(512),
    expiresInSeconds: z.number().int().min(1).max(300),
  })
  .strict();

export const customerServiceConnectionSnapshotSchema = z
  .object({
    state: z.enum(['IDLE', 'CONNECTING', 'CONNECTED', 'RECONNECTING', 'DISCONNECTED']),
    reconnectAttempt: nonNegativeIntegerSchema,
    unreadCount: nonNegativeIntegerSchema,
  })
  .strict();

export const customerServicePageSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z
    .object({
      items: z.array(itemSchema).max(50),
      nextCursor: nullableBusinessIdSchema,
      hasMore: z.boolean(),
    })
    .strict();

const conversationIdRequestSchema = z.object({ conversationId: signedBusinessIdSchema }).strict();

const conversationListRequestSchema = z
  .object({
    status: z.enum(['WAITING', 'ACTIVE', 'CLOSED']).optional(),
    keyword: keywordSchema,
    beforeConversationId: signedBusinessIdSchema.optional(),
    limit: limitSchema,
  })
  .strict();

const messageHistoryRequestSchema = z
  .object({
    conversationId: signedBusinessIdSchema,
    beforeMessageId: signedBusinessIdSchema.optional(),
    afterMessageId: signedBusinessIdSchema.optional(),
    limit: limitSchema,
  })
  .strict()
  .refine((value) => !(value.beforeMessageId && value.afterMessageId), {
    message: 'Only one history cursor is allowed.',
  });

const sendTextRequestSchema = z
  .object({
    conversationId: signedBusinessIdSchema,
    clientMessageId: uuidSchema,
    messageType: z.literal('TEXT'),
    textContent: z.string().trim().min(1).max(2_000),
  })
  .strict();

const sendImageRequestSchema = z
  .object({
    conversationId: signedBusinessIdSchema,
    clientMessageId: uuidSchema,
    messageType: z.literal('IMAGE'),
    image: customerServiceImageSchema,
  })
  .strict();

const markReadRequestSchema = z
  .object({
    conversationId: signedBusinessIdSchema,
    messageId: signedBusinessIdSchema,
  })
  .strict();

/**
 * Checks binary data without relying on `instanceof`.
 *
 * Electron's isolated preload and renderer have different JavaScript realms, so
 * a genuine renderer `Uint8Array` is not necessarily an instance of preload's
 * constructor. `ArrayBuffer.isView` plus the intrinsic tag works across realms
 * while still rejecting DataView and other typed-array variants.
 */
const isUploadBytes = (value: unknown): value is Uint8Array => {
  try {
    return (
      ArrayBuffer.isView(value) &&
      Object.prototype.toString.call(value) === '[object Uint8Array]' &&
      value.byteLength > 0 &&
      value.byteLength <= MAX_IMAGE_BYTES
    );
  } catch {
    return false;
  }
};

const uploadBytesSchema = z.custom<Uint8Array>(isUploadBytes, 'Image bytes are invalid.');

const uploadImageRequestSchema = z
  .object({
    conversationId: signedBusinessIdSchema,
    fileName: z
      .string()
      .min(1)
      .max(255)
      .refine((value) => !/[\\/\p{C}]/u.test(value)),
    mimeType: z.enum(['image/gif', 'image/jpeg', 'image/png', 'image/webp']),
    bytes: uploadBytesSchema,
  })
  .strict();

const staffCandidatesRequestSchema = z
  .object({
    conversationId: signedBusinessIdSchema,
    keyword: keywordSchema,
    beforeStaffUserId: signedBusinessIdSchema.optional(),
    limit: limitSchema,
  })
  .strict();

const transferRequestSchema = z
  .object({
    conversationId: signedBusinessIdSchema,
    targetStaffUserId: signedBusinessIdSchema,
    expectedAssignmentVersion: nonNegativeIntegerSchema,
    expectedVersion: nonNegativeIntegerSchema,
    reason: reasonSchema,
  })
  .strict();

const closeRequestSchema = z
  .object({
    conversationId: signedBusinessIdSchema,
    expectedVersion: nonNegativeIntegerSchema,
    reason: reasonSchema,
  })
  .strict();

export const CUSTOMER_SERVICE_COMMAND_SCHEMAS = Object.freeze({
  listConversations: conversationListRequestSchema,
  getConversation: conversationIdRequestSchema,
  getHistory: messageHistoryRequestSchema,
  sendMessage: z.discriminatedUnion('messageType', [sendTextRequestSchema, sendImageRequestSchema]),
  markRead: markReadRequestSchema,
  uploadImage: uploadImageRequestSchema,
  listCandidates: staffCandidatesRequestSchema,
  transferConversation: transferRequestSchema,
  closeConversation: closeRequestSchema,
});

const lifecyclePayloadSchema = z
  .object({
    conversationId: signedBusinessIdSchema,
    status: z.enum(['WAITING', 'ACTIVE', 'CLOSED']).nullable(),
    staffUserId: nullableBusinessIdSchema,
    staffName: nullableTextSchema(200),
    assignmentVersion: nonNegativeIntegerSchema,
    version: nonNegativeIntegerSchema,
    lastMessageId: nullableBusinessIdSchema,
    lastMessageAt: nullableTimestampSchema,
    closedReason: nullableTextSchema(500),
    closedAt: nullableTimestampSchema,
    assignedAt: nullableTimestampSchema,
    systemMessage: customerServiceMessageSchema.optional(),
  })
  .strict();

const serverEnvelopeFields = {
  eventId: z.string().min(1).max(128),
  requestId: z.string().min(1).max(128).nullable().optional(),
  conversationId: nullableBusinessIdSchema.optional(),
  serverTime: z.number().int().nonnegative().safe(),
} as const;

const serverEnvelope = <TEvent extends string, TPayload extends z.ZodTypeAny>(event: TEvent, payload: TPayload) =>
  z
    .object({
      event: z.literal(event),
      ...serverEnvelopeFields,
      payload,
    })
    .strict();

export const customerServiceServerEnvelopeSchema = z.discriminatedUnion('event', [
  serverEnvelope(
    'connection.ready',
    z
      .object({
        connectionId: z.string().min(1).max(128),
        identity: customerServicePrincipalSchema,
        heartbeatIntervalSeconds: z.number().int().min(1).max(300),
        presenceTimeoutSeconds: z.number().int().min(1).max(600),
      })
      .strict()
  ),
  serverEnvelope('conversation.snapshot', customerServiceConversationSchema),
  serverEnvelope(
    'message.ack',
    z
      .object({
        messageId: signedBusinessIdSchema,
        clientMessageId: uuidSchema,
        createdAt: nullableTimestampSchema,
      })
      .strict()
  ),
  serverEnvelope('message.created', customerServiceMessageSchema),
  serverEnvelope(
    'read.updated',
    z
      .object({
        advanced: z.boolean(),
        lastReadMessageId: signedBusinessIdSchema,
        readerType: z.enum(['CUSTOMER', 'STAFF']),
      })
      .strict()
  ),
  serverEnvelope('conversation.assigned', lifecyclePayloadSchema),
  serverEnvelope('conversation.transferred', lifecyclePayloadSchema),
  serverEnvelope('conversation.closed', lifecyclePayloadSchema),
  serverEnvelope(
    'presence.updated',
    z
      .object({
        principalType: z.enum(['CUSTOMER', 'STAFF']),
        userId: nullableBusinessIdSchema,
        displayName: nullableTextSchema(200),
        online: z.boolean(),
      })
      .strict()
  ),
  serverEnvelope('pong', z.object({}).strict()),
  serverEnvelope(
    'error',
    z
      .object({
        code: z.string().min(1).max(100),
        message: z.string().min(1).max(500),
      })
      .strict()
  ),
]);

export const customerServiceCommonResultSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown(),
  success: z.boolean(),
  status: z.number().nullable().optional(),
});

export const customerServiceIpcErrorSchema = z
  .object({
    code: z.enum([
      'INVALID_REQUEST',
      'MISSING_ENTERPRISE_SESSION',
      'AUTHENTICATION_FAILED',
      'FORBIDDEN_STAFF',
      'TIMEOUT',
      'NETWORK',
      'HTTP',
      'API_FAILURE',
      'INVALID_RESPONSE',
      'UNAUTHORIZED',
      'WEBSOCKET_ERROR',
      'NOT_CONNECTED',
      'UNTRUSTED_SENDER',
      'IPC_UNAVAILABLE',
      'INVALID_IPC_RESPONSE',
      'REQUEST_FAILED',
    ]),
    message: z.string(),
  })
  .strict();

export const customerServiceIpcResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data: dataSchema }).strict(),
    z.object({ ok: z.literal(false), error: customerServiceIpcErrorSchema }).strict(),
  ]);
