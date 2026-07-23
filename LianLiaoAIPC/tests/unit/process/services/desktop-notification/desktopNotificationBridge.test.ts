import { describe, expect, it, vi } from 'vitest';

import { DESKTOP_NOTIFICATION_IPC_CHANNELS } from '@/common/enterprise/desktop-notification/constants';
import type {
  DesktopNotificationConnectionSnapshot,
  DesktopNotificationInboxItem,
  DesktopNotificationPage,
  DesktopNotificationServerEnvelope,
} from '@/common/enterprise/desktop-notification/contracts';
import { desktopNotificationNativeTargetSchema } from '@/common/enterprise/desktop-notification/schemas';
import {
  initDesktopNotificationBridge,
  type DesktopNotificationBridgeGateway,
  type DesktopNotificationIpcMain,
} from '@process/bridge/enterpriseBridge';

const notification: DesktopNotificationInboxItem = {
  recipientId: '201',
  notificationId: '101',
  type: 'PROJECT_OPPORTUNITY',
  priority: 'NORMAL',
  title: '有新的在建项目潜在商机',
  content: '请查看新增的项目信息。',
  contentType: 'TEXT',
  extensionJson: null,
  action: 'OPEN_PROJECT',
  businessId: '-9',
  createTime: 1_700_000_000_000,
  readAt: null,
  deliveryStatus: 'DELIVERED',
};

const makeIpcMain = () => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
  const ipcMain: DesktopNotificationIpcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
  };
  return { handlers, ipcMain };
};

const makeGateway = () => {
  let listener: ((event: DesktopNotificationServerEnvelope) => void) | undefined;
  const gateway: DesktopNotificationBridgeGateway = {
    connect: vi.fn(
      async (): Promise<DesktopNotificationConnectionSnapshot> => ({
        state: 'CONNECTED',
        reconnectAttempt: 0,
        unreadCount: 1,
      })
    ),
    disconnect: vi.fn(async () => undefined),
    getUnreadCount: vi.fn(async () => ({ unreadCount: 1 })),
    list: vi.fn(async (): Promise<DesktopNotificationPage> => ({ items: [notification], nextBeforeRecipientId: null })),
    markAllRead: vi.fn(async () => ({ changedCount: 1 })),
    markRead: vi.fn(async () => ({ changed: true })),
    subscribe: vi.fn((nextListener) => {
      listener = nextListener;
      return () => {
        listener = undefined;
      };
    }),
  };
  return { emit: (event: DesktopNotificationServerEnvelope) => listener?.(event), gateway };
};

describe('desktop-notification IPC bridge', () => {
  it('accepts only an exact signed notification detail target', () => {
    expect(
      desktopNotificationNativeTargetSchema.safeParse({
        action: 'OPEN_NOTIFICATION_DETAIL',
        businessId: null,
        notificationId: '-101',
      }).success
    ).toBe(true);
    expect(
      desktopNotificationNativeTargetSchema.safeParse({
        action: 'OPEN_NOTIFICATION_DETAIL',
        businessId: null,
        notificationId: '0',
      }).success
    ).toBe(false);
    expect(
      desktopNotificationNativeTargetSchema.safeParse({
        action: 'OPEN_NOTIFICATION_DETAIL',
        businessId: null,
        notificationId: '-101',
        route: '/guid',
      }).success
    ).toBe(false);
  });

  it('rejects an untrusted renderer before invoking the gateway', async () => {
    const { handlers, ipcMain } = makeIpcMain();
    const { gateway } = makeGateway();
    initDesktopNotificationBridge({ gateway, ipcMain, senderGuard: () => false });

    const result = await handlers.get(DESKTOP_NOTIFICATION_IPC_CHANNELS.CONNECT)?.({});

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'UNTRUSTED_SENDER',
        message: 'Desktop notification IPC sender is not trusted.',
      },
    });
    expect(gateway.connect).not.toHaveBeenCalled();
  });

  it('rejects extra renderer fields instead of accepting a forged openId', async () => {
    const { handlers, ipcMain } = makeIpcMain();
    const { gateway } = makeGateway();
    initDesktopNotificationBridge({ gateway, ipcMain, senderGuard: () => true });

    const result = await handlers.get(DESKTOP_NOTIFICATION_IPC_CHANNELS.MARK_READ)?.(
      {},
      { notificationId: '-101', openId: 'renderer-forged-open-id' }
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(gateway.markRead).not.toHaveBeenCalled();
  });

  it('broadcasts only a validated realtime event to the renderer event sink', () => {
    const { ipcMain } = makeIpcMain();
    const { emit, gateway } = makeGateway();
    const eventSink = vi.fn();
    initDesktopNotificationBridge({ eventSink, gateway, ipcMain, senderGuard: () => true });

    emit({
      event: 'notification.created',
      eventId: 'desktop-event-101',
      serverTime: 1_700_000_000_000,
      payload: notification,
    });

    expect(eventSink).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'notification.created', payload: notification })
    );
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain('open-id');
  });
});
