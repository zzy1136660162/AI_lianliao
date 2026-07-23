import { z } from 'zod';

import { DESKTOP_NOTIFICATION_IPC_ERROR_MESSAGES } from '@/common/enterprise/desktop-notification/constants';
import type {
  DesktopNotificationChangedResult,
  DesktopNotificationConnectionSnapshot,
  DesktopNotificationInboxItem,
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
  /** Subscribes to the renderer-wide unread source of truth and immediately emits its current value. */
  onUnreadCount: (listener: (unreadCount: number) => void) => () => void;
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

const MAX_TRACKED_RENDERER_NOTIFICATION_IDS = 2_000;

/** Renderer-side facade. It has no access to persisted OpenID, API base URLs, or one-time tickets. */
export const createDesktopNotificationClient = (
  getBridge: DesktopNotificationRawBridgeProvider
): DesktopNotificationClient => {
  const eventListeners = new Set<(event: DesktopNotificationServerEnvelope) => void>();
  const unreadListeners = new Set<(unreadCount: number) => void>();
  const trackedNotificationIds = new Set<string>();
  const trackedNotificationIdOrder: string[] = [];
  let unreadCount = 0;
  let unreadStateRevision = 0;
  let unreadQuerySequence = 0;
  let latestUnreadQuerySequence = 0;
  let unsubscribeBridgeEvent: (() => void) | undefined;

  /** Publishes one normalized unread value to the shell and every mounted notification view. */
  const publishUnreadCount = (value: number): void => {
    const normalized = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
    // Every authoritative event invalidates unread requests that started against older state.
    unreadStateRevision += 1;
    unreadCount = normalized;
    for (const listener of unreadListeners) listener(normalized);
  };

  /** Invalidates in-flight count reads immediately after a read-state mutation succeeds. */
  const invalidateUnreadQueries = (): void => {
    unreadStateRevision += 1;
  };

  const beginUnreadQuery = (): { revision: number; sequence: number } => {
    const sequence = ++unreadQuerySequence;
    latestUnreadQuerySequence = sequence;
    return { revision: unreadStateRevision, sequence };
  };

  /** Applies only the newest query that did not cross a realtime event or read mutation. */
  const applyUnreadQueryResult = (query: { revision: number; sequence: number }, value: number): number => {
    if (query.revision !== unreadStateRevision || query.sequence !== latestUnreadQuerySequence) return unreadCount;
    publishUnreadCount(value);
    return unreadCount;
  };

  /** Keeps reconnect/replay events from duplicating badges, list rows, or in-app reminders. */
  const trackCreatedNotification = (notificationId: string): boolean => {
    if (trackedNotificationIds.has(notificationId)) return false;
    trackedNotificationIds.add(notificationId);
    trackedNotificationIdOrder.push(notificationId);
    if (trackedNotificationIdOrder.length > MAX_TRACKED_RENDERER_NOTIFICATION_IDS) {
      const expiredId = trackedNotificationIdOrder.shift();
      if (expiredId) trackedNotificationIds.delete(expiredId);
    }
    return true;
  };

  const getUnreadCount = async (): Promise<DesktopNotificationUnreadCount> => {
    const query = beginUnreadQuery();
    const result = await invoke(getBridge, desktopNotificationUnreadCountSchema, (bridge) => bridge.getUnreadCount());
    return { unreadCount: applyUnreadQueryResult(query, result.unreadCount) };
  };

  /** One validated preload subscription fans out to all renderer consumers. */
  const ensureBridgeEventSubscription = (): void => {
    if (unsubscribeBridgeEvent) return;
    const bridge = getBridge();
    if (!bridge) return;
    unsubscribeBridgeEvent = bridge.onEvent((untrustedEvent) => {
      const parsed = desktopNotificationServerEnvelopeSchema.safeParse(untrustedEvent);
      if (!parsed.success) return;
      const event = parsed.data as DesktopNotificationServerEnvelope;
      if (event.event === 'notification.created') {
        const notification = event.payload as DesktopNotificationInboxItem;
        if (!trackCreatedNotification(notification.notificationId)) return;
        publishUnreadCount(unreadCount + 1);
      } else if (event.event === 'notification.badge') {
        publishUnreadCount((event.payload as DesktopNotificationUnreadCount).unreadCount);
      } else if (event.event === 'notification.read') {
        // The server remains authoritative when another client changes read state.
        void getUnreadCount().catch((): undefined => undefined);
      }
      for (const listener of eventListeners) listener(event);
    });
  };

  return {
    connect: async () => {
      ensureBridgeEventSubscription();
      const query = beginUnreadQuery();
      const snapshot = await invoke(getBridge, desktopNotificationConnectionSnapshotSchema, (bridge) =>
        bridge.connect()
      );
      return { ...snapshot, unreadCount: applyUnreadQueryResult(query, snapshot.unreadCount) };
    },
    disconnect: async () => {
      await invoke(getBridge, z.void(), (bridge) => bridge.disconnect());
      publishUnreadCount(0);
    },
    list: (request) => {
      const parsed = parseCommand(DESKTOP_NOTIFICATION_COMMAND_SCHEMAS.list, request) as DesktopNotificationListRequest;
      return invoke(getBridge, desktopNotificationPageSchema, (bridge) => bridge.list(parsed));
    },
    getUnreadCount,
    markRead: async (request) => {
      const parsed = parseCommand(DESKTOP_NOTIFICATION_COMMAND_SCHEMAS.markRead, request) as {
        notificationId: string;
      };
      const result = await invoke(getBridge, desktopNotificationChangedResultSchema, (bridge) =>
        bridge.markRead(parsed)
      );
      if (result.changed) invalidateUnreadQueries();
      return result;
    },
    markAllRead: async () => {
      const result = await invoke(getBridge, desktopNotificationMarkAllReadResultSchema, (bridge) =>
        bridge.markAllRead()
      );
      if (result.changedCount > 0) invalidateUnreadQueries();
      return result;
    },
    onEvent: (listener) => {
      eventListeners.add(listener);
      ensureBridgeEventSubscription();
      return () => eventListeners.delete(listener);
    },
    onUnreadCount: (listener) => {
      unreadListeners.add(listener);
      listener(unreadCount);
      return () => unreadListeners.delete(listener);
    },
  };
};

const getWindowDesktopNotificationBridge = (): DesktopNotificationRawBridge | undefined =>
  typeof window === 'undefined' ? undefined : window.electronAPI?.desktopNotifications;

export const desktopNotificationClient = createDesktopNotificationClient(getWindowDesktopNotificationBridge);
