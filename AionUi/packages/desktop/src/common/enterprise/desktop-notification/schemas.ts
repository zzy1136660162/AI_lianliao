import { z } from 'zod';

import {
  DESKTOP_NOTIFICATION_ACTIONS,
  DESKTOP_NOTIFICATION_CONTENT_TYPES,
  DESKTOP_NOTIFICATION_DELIVERY_STATUSES,
  DESKTOP_NOTIFICATION_TYPES,
} from './constants';

/** Matches the backend SignedIdCodec without passing through number or BigInt. */
export const desktopNotificationBusinessIdSchema = z.string().regex(/^-?[1-9][0-9]{0,18}$/);

const nullableBusinessIdSchema = desktopNotificationBusinessIdSchema.nullable();
const nonNegativeIntegerSchema = z.number().int().nonnegative().safe();
const nullableTimestampSchema = nonNegativeIntegerSchema.nullable();
const nullableTextSchema = (maxLength: number) => z.string().max(maxLength).nullable();

export const desktopNotificationInboxItemSchema = z
  .object({
    recipientId: desktopNotificationBusinessIdSchema,
    notificationId: desktopNotificationBusinessIdSchema,
    type: z.enum(DESKTOP_NOTIFICATION_TYPES),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
    title: z.string().min(1).max(500),
    content: nullableTextSchema(4_000),
    contentType: z.enum(DESKTOP_NOTIFICATION_CONTENT_TYPES),
    extensionJson: nullableTextSchema(20_000),
    action: z.enum(DESKTOP_NOTIFICATION_ACTIONS).nullable(),
    businessId: nullableBusinessIdSchema,
    createTime: nullableTimestampSchema,
    readAt: nullableTimestampSchema,
    deliveryStatus: z.enum(DESKTOP_NOTIFICATION_DELIVERY_STATUSES),
  })
  .strict();

export const desktopNotificationPageSchema = z
  .object({
    items: z.array(desktopNotificationInboxItemSchema).max(50),
    nextBeforeRecipientId: nullableBusinessIdSchema,
  })
  .strict();

export const desktopNotificationChangedResultSchema = z.object({ changed: z.boolean() }).strict();
export const desktopNotificationMarkAllReadResultSchema = z.object({ changedCount: nonNegativeIntegerSchema }).strict();
export const desktopNotificationUnreadCountSchema = z.object({ unreadCount: nonNegativeIntegerSchema }).strict();

export const desktopNotificationWebSocketTicketSchema = z
  .object({
    ticket: z.string().min(16).max(512),
    expiresInSeconds: z.number().int().min(1).max(300),
  })
  .strict();

export const desktopNotificationConnectionSnapshotSchema = z
  .object({
    state: z.enum(['IDLE', 'CONNECTING', 'CONNECTED', 'RECONNECTING', 'DISCONNECTED']),
    reconnectAttempt: nonNegativeIntegerSchema,
    unreadCount: nonNegativeIntegerSchema,
  })
  .strict();

const emptyRequestSchema = z.object({}).strict();
const listRequestSchema = z
  .object({
    beforeRecipientId: desktopNotificationBusinessIdSchema.optional(),
    unreadOnly: z.boolean().optional(),
    type: z.enum(DESKTOP_NOTIFICATION_TYPES).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();
const markReadRequestSchema = z.object({ notificationId: desktopNotificationBusinessIdSchema }).strict();

export const DESKTOP_NOTIFICATION_COMMAND_SCHEMAS = Object.freeze({
  connect: emptyRequestSchema,
  list: listRequestSchema,
  markRead: markReadRequestSchema,
  markAllRead: emptyRequestSchema,
});

/** Native notification targets are generated only by the trusted main process. */
export const desktopNotificationNativeTargetSchema = z
  .object({
    action: z.enum(DESKTOP_NOTIFICATION_ACTIONS),
    businessId: nullableBusinessIdSchema,
  })
  .strict();

const desktopNotificationRouteSchema = z
  .string()
  .max(300)
  .refine(
    (value) =>
      value === '/enterprise/supply-demand' ||
      value === '/enterprise/dashboard' ||
      value === '/enterprise/version-update' ||
      value === '/settings/system' ||
      /^\/enterprise\/(projects|companies|products)\/-?[1-9][0-9]{0,18}$/.test(value) ||
      /^\/enterprise\/customer-service\?conversationId=-?[1-9][0-9]{0,18}$/.test(value),
    'Desktop notification route is invalid.'
  );

/** Exact main-to-preload navigation data; arbitrary renderer-selected routes are never accepted. */
export const desktopNotificationNavigationDetailSchema = z.object({ route: desktopNotificationRouteSchema }).strict();

const serverEnvelopeFields = {
  eventId: z.string().min(1).max(128),
  serverTime: nonNegativeIntegerSchema,
} as const;

const serverEnvelope = <TEvent extends string, TPayload extends z.ZodTypeAny>(event: TEvent, payload: TPayload) =>
  z
    .object({
      event: z.literal(event),
      ...serverEnvelopeFields,
      payload,
    })
    .strict();

export const desktopNotificationServerEnvelopeSchema = z.discriminatedUnion('event', [
  serverEnvelope(
    'connection.ready',
    z
      .object({
        connectionId: z.string().min(1).max(128),
        heartbeatIntervalSeconds: z.number().int().min(1).max(300),
      })
      .strict()
  ),
  serverEnvelope('notification.created', desktopNotificationInboxItemSchema),
  serverEnvelope('notification.badge', desktopNotificationUnreadCountSchema),
  serverEnvelope('notification.read', z.object({ notificationId: desktopNotificationBusinessIdSchema }).strict()),
  serverEnvelope('pong', z.object({}).strict()),
  serverEnvelope('error', z.object({ code: z.string().min(1).max(100) }).strict()),
]);

export const desktopNotificationCommonResultSchema = z
  .object({
    code: z.number(),
    message: z.string(),
    data: z.unknown(),
    success: z.boolean(),
    status: z.number().nullable().optional(),
  })
  .strict();

export const desktopNotificationIpcErrorSchema = z
  .object({
    code: z.enum([
      'INVALID_REQUEST',
      'MISSING_ENTERPRISE_SESSION',
      'TIMEOUT',
      'NETWORK',
      'HTTP',
      'API_FAILURE',
      'INVALID_RESPONSE',
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

export const desktopNotificationIpcResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data: dataSchema }).strict(),
    z.object({ ok: z.literal(false), error: desktopNotificationIpcErrorSchema }).strict(),
  ]);
