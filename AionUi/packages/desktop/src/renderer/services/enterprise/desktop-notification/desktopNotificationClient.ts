import { z } from 'zod';

import { DESKTOP_NOTIFICATION_IPC_ERROR_MESSAGES } from '@/common/enterprise/desktop-notification/constants';
import type {
  DesktopNotificationChangedResult,
  DesktopNotificationConnectionSnapshot,
  DesktopNotificationIpcErrorCode,
  DesktopNotificationIpcResult,
  DesktopNotificationListRequest,
  DesktopNotificationMarkAllReadResult,
  DesktopNotificationPage,
  DesktopNotificationServerEnvelope,
  DesktopNotificationUnreadCount,
} from '@/common/enterprise/desktop-notification/contracts';
import {
  DESKTOP_NOTIFICATION_COMMAND_SCHEMAS,
  desktopNotificationChangedResultSchema,
  desktopNotificationConnectionSnapshotSchema,
  desktopNotificationIpcResultSchema,
  desktopNotificationMarkAllReadResultSchema,
  desktopNotificationPageSchema,
  desktopNotificationServerEnvelopeSchema,
  desktopNotificationUnreadCountSchema,
} from '@/common/enterprise/desktop-notification/schemas';
import type { ElectronBridgeAPI } from '@/common/types/platform/electron';

export type DesktopNotificationRawBridge = NonNullable<ElectronBridgeAPI['desktopNotifications']>;
export type DesktopNotificationRawBridgeProvider = () => DesktopNotificationRawBridge | undefined;

export type DesktopNotificationClient = {
  connect: () => Promise<DesktopNotificationConnectionSnapshot>;
  disconnect: () => Promise<void>;
  list: (request: DesktopNotificationListRequest) => Promise<DesktopNotificationPage>;
  getUnreadCount: () => Promise<DesktopNotificationUnreadCount>;
  markRead: (request: { notificationId: string }) => Promise<DesktopNotificationChangedResult>;
  markAllRead: () => Promise<DesktopNotificationMarkAllReadResult>;
  onEvent: (listener: (event: DesktopNotificationServerEnvelope) => void) => () => void;
};

/** Renderer-safe failure rebuilt exclusively from the fixed shared error map. */
export class DesktopNotificationRendererError extends Error {
  readonly code: DesktopNotificationIpcErrorCode;

  constructor(code: DesktopNotificationIpcErrorCode) {
    super(DESKTOP_NOTIFICATION_IPC_ERROR_MESSAGES[code]);
    this.name = 'DesktopNotificationRendererError';
    this.code = code;
  }
}

const rendererError = (code: DesktopNotificationIpcErrorCode): DesktopNotificationRendererError =>
  new DesktopNotificationRendererError(code);

const invoke = async <T>(
  getBridge: DesktopNotificationRawBridgeProvider,
  responseSchema: z.ZodTypeAny,
  operation: (bridge: DesktopNotificationRawBridge) => Promise<DesktopNotificationIpcResult<T>>
): Promise<T> => {
  let untrustedResult: unknown;
  try {
    const bridge = getBridge();
    if (!bridge) throw rendererError('IPC_UNAVAILABLE');
    untrustedResult = await operation(bridge);
  } catch (error) {
    if (error instanceof DesktopNotificationRendererError) throw error;
    throw rendererError('IPC_UNAVAILABLE');
  }

  const parsed = desktopNotificationIpcResultSchema(responseSchema).safeParse(untrustedResult);
  if (!parsed.success) throw rendererError('INVALID_IPC_RESPONSE');
  const result = parsed.data as DesktopNotificationIpcResult<T>;
  if (result.ok === false) {
    if (result.error.message !== DESKTOP_NOTIFICATION_IPC_ERROR_MESSAGES[result.error.code]) {
      throw rendererError('INVALID_IPC_RESPONSE');
    }
    throw rendererError(result.error.code);
  }
  return result.data;
};

const parseCommand = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw rendererError('INVALID_REQUEST');
  return parsed.data;
};

/** Renderer-side facade. It has no access to persisted OpenID, API base URLs, or one-time tickets. */
export const createDesktopNotificationClient = (
  getBridge: DesktopNotificationRawBridgeProvider
): DesktopNotificationClient => ({
  connect: () => invoke(getBridge, desktopNotificationConnectionSnapshotSchema, (bridge) => bridge.connect()),
  disconnect: () => invoke(getBridge, z.void(), (bridge) => bridge.disconnect()),
  list: (request) => {
    const parsed = parseCommand(DESKTOP_NOTIFICATION_COMMAND_SCHEMAS.list, request) as DesktopNotificationListRequest;
    return invoke(getBridge, desktopNotificationPageSchema, (bridge) => bridge.list(parsed));
  },
  getUnreadCount: () => invoke(getBridge, desktopNotificationUnreadCountSchema, (bridge) => bridge.getUnreadCount()),
  markRead: (request) => {
    const parsed = parseCommand(DESKTOP_NOTIFICATION_COMMAND_SCHEMAS.markRead, request) as { notificationId: string };
    return invoke(getBridge, desktopNotificationChangedResultSchema, (bridge) => bridge.markRead(parsed));
  },
  markAllRead: () => invoke(getBridge, desktopNotificationMarkAllReadResultSchema, (bridge) => bridge.markAllRead()),
  onEvent: (listener) => {
    const bridge = getBridge();
    if (!bridge) return () => undefined;
    return bridge.onEvent((untrustedEvent) => {
      const parsed = desktopNotificationServerEnvelopeSchema.safeParse(untrustedEvent);
      if (parsed.success) listener(parsed.data as DesktopNotificationServerEnvelope);
    });
  },
});

const getWindowDesktopNotificationBridge = (): DesktopNotificationRawBridge | undefined =>
  typeof window === 'undefined' ? undefined : window.electronAPI?.desktopNotifications;

export const desktopNotificationClient = createDesktopNotificationClient(getWindowDesktopNotificationBridge);
