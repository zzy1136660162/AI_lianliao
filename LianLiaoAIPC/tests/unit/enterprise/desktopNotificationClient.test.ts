import { describe, expect, it, vi } from 'vitest';

import { desktopNotificationInboxItemSchema } from '@/common/enterprise/desktop-notification/schemas';
import type { ElectronBridgeAPI } from '@/common/types/platform/electron';
import {
  createDesktopNotificationClient,
  type DesktopNotificationRendererError,
} from '@/renderer/services/enterprise/desktop-notification/desktopNotificationClient';
import {
  DesktopNotificationApiClient,
  type DesktopNotificationApiTransport,
} from '@process/services/enterprise/desktop-notification/desktopNotificationApiClient';

type RawBridge = NonNullable<ElectronBridgeAPI['desktopNotifications']>;

const makeBridge = (): RawBridge => ({
  connect: vi.fn(async () => ({ ok: true, data: { state: 'CONNECTED', reconnectAttempt: 0, unreadCount: 2 } })),
  disconnect: vi.fn(async () => ({ ok: true, data: undefined })),
  getUnreadCount: vi.fn(async () => ({ ok: true, data: { unreadCount: 2 } })),
  list: vi.fn(async () => ({ ok: true, data: { items: [], nextBeforeRecipientId: null } })),
  markAllRead: vi.fn(async () => ({ ok: true, data: { changedCount: 2 } })),
  markRead: vi.fn(async () => ({
    ok: false,
    error: { code: 'REQUEST_FAILED', message: 'Desktop notification request failed.' },
  })),
  onEvent: vi.fn(() => () => undefined),
});

const changedResponse = () =>
  new Response(
    JSON.stringify({
      code: 2_000,
      message: 'ok',
      data: { changed: true },
      success: true,
      status: null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

describe('desktopNotificationClient', () => {
  it('validates a signed negative notification ID without exposing account credentials', async () => {
    const bridge = makeBridge();
    const client = createDesktopNotificationClient(() => bridge);

    await expect(client.markRead({ notificationId: '-101' })).rejects.toEqual(
      expect.objectContaining<DesktopNotificationRendererError>({ code: 'REQUEST_FAILED' })
    );
    expect(bridge.markRead).toHaveBeenCalledWith({ notificationId: '-101' });
    expect(JSON.stringify(bridge.markRead.mock.calls)).not.toContain('openId');
  });

  it('rejects malformed preload output instead of trusting it', async () => {
    const bridge = makeBridge();
    vi.mocked(bridge.getUnreadCount).mockResolvedValue({ ok: true, data: { unreadCount: 'two' } } as never);
    const client = createDesktopNotificationClient(() => bridge);

    await expect(client.getUnreadCount()).rejects.toMatchObject({ code: 'INVALID_IPC_RESPONSE' });
  });

  it('shares one unread count and de-duplicates replayed created events by notification ID', () => {
    const bridge = makeBridge();
    let emitBridgeEvent: ((event: unknown) => void) | undefined;
    vi.mocked(bridge.onEvent).mockImplementation((listener) => {
      emitBridgeEvent = listener;
      return () => undefined;
    });
    const client = createDesktopNotificationClient(() => bridge);
    const unreadCounts: number[] = [];
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    client.onUnreadCount((count) => unreadCounts.push(count));
    client.onEvent(firstListener);
    client.onEvent(secondListener);
    const createdEvent = {
      event: 'notification.created',
      eventId: 'desktop-event-101',
      serverTime: 1_700_000_000_000,
      payload: {
        recipientId: '201',
        notificationId: '101',
        type: 'SYSTEM_ANNOUNCEMENT',
        priority: 'NORMAL',
        title: '系统公告',
        content: '正文',
        contentType: 'TEXT',
        extensionJson: null,
        action: 'OPEN_NOTIFICATION_DETAIL',
        businessId: null,
        createTime: 1_700_000_000_000,
        readAt: null,
        deliveryStatus: 'DELIVERED',
      },
    };

    emitBridgeEvent?.(createdEvent);
    emitBridgeEvent?.(createdEvent);

    expect(bridge.onEvent).toHaveBeenCalledTimes(1);
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);
    expect(unreadCounts).toEqual([0, 1]);
  });

  it('discards an unread query that returns after mark-all-read and a newer authoritative query', async () => {
    const bridge = makeBridge();
    let resolveStaleQuery: ((value: Awaited<ReturnType<RawBridge['getUnreadCount']>>) => void) | undefined;
    vi.mocked(bridge.getUnreadCount)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStaleQuery = resolve;
          })
      )
      .mockResolvedValueOnce({ ok: true, data: { unreadCount: 0 } });
    const client = createDesktopNotificationClient(() => bridge);
    const observed: number[] = [];
    client.onUnreadCount((count) => observed.push(count));

    const staleQuery = client.getUnreadCount();
    await client.markAllRead();
    await expect(client.getUnreadCount()).resolves.toEqual({ unreadCount: 0 });
    resolveStaleQuery?.({ ok: true, data: { unreadCount: 2 } });

    await expect(staleQuery).resolves.toEqual({ unreadCount: 0 });
    expect(observed).not.toContain(2);
  });
});

describe('desktop notification protocol', () => {
  it('accepts a text system announcement and keeps its signed ID as a string', () => {
    const parsed = desktopNotificationInboxItemSchema.parse({
      recipientId: '201',
      notificationId: '-101',
      type: 'SYSTEM_ANNOUNCEMENT',
      priority: 'NORMAL',
      title: '系统维护',
      content: '今晚维护\n请提前保存。',
      contentType: 'TEXT',
      extensionJson: null,
      action: 'OPEN_NOTIFICATION_DETAIL',
      businessId: '41',
      createTime: 1_700_000_000_000,
      readAt: null,
      deliveryStatus: 'PENDING',
    });

    expect(parsed.notificationId).toBe('-101');
  });

  it('rejects extension metadata that exceeds the bounded transport contract', () => {
    const result = desktopNotificationInboxItemSchema.safeParse({
      recipientId: '201',
      notificationId: '101',
      type: 'SYSTEM_ANNOUNCEMENT',
      priority: 'NORMAL',
      title: '系统维护',
      content: '维护通知',
      contentType: 'TEXT',
      extensionJson: 'x'.repeat(20_001),
      action: 'OPEN_NOTIFICATION_DETAIL',
      businessId: null,
      createTime: 1_700_000_000_000,
      readAt: null,
      deliveryStatus: 'PENDING',
    });

    expect(result.success).toBe(false);
  });
});

describe('DesktopNotificationApiClient delivery outcomes', () => {
  it('accepts the cloud-api CommonResult compatibility fields', async () => {
    const transport: DesktopNotificationApiTransport = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 2_000,
            message: '操作成功',
            data: { unreadCount: 1 },
            status: null,
            ex: null,
            success: true,
            super_application_name: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    const client = new DesktopNotificationApiClient({ environment: 'development', transport });

    await expect(client.getUnreadCount('persisted-open-id')).resolves.toEqual({ unreadCount: 1 });
  });

  it('posts a desktop-reminder result with the persisted OpenID', async () => {
    const transport: DesktopNotificationApiTransport = vi.fn(async () => changedResponse());
    const client = new DesktopNotificationApiClient({ environment: 'development', transport });

    await client.markDesktopNotified('persisted-open-id', '101');

    expect(transport).toHaveBeenCalledWith(expect.stringContaining('/desktopNotified'), expect.anything());
    expect(JSON.parse(String(vi.mocked(transport).mock.calls[0]?.[1].body))).toEqual({
      openId: 'persisted-open-id',
      notificationId: '101',
    });
  });

  it('posts only a controlled delivery-failure code with the persisted OpenID', async () => {
    const transport: DesktopNotificationApiTransport = vi.fn(async () => changedResponse());
    const client = new DesktopNotificationApiClient({ environment: 'development', transport });

    await client.reportDeliveryFailure('persisted-open-id', '-101', 'UNSUPPORTED_CONTENT');

    expect(transport).toHaveBeenCalledWith(expect.stringContaining('/deliveryFailed'), expect.anything());
    expect(JSON.parse(String(vi.mocked(transport).mock.calls[0]?.[1].body))).toEqual({
      openId: 'persisted-open-id',
      notificationId: '-101',
      failureCode: 'UNSUPPORTED_CONTENT',
    });
  });
});
