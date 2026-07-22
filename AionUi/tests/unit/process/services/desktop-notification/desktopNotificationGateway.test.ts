import { describe, expect, it, vi } from 'vitest';

import type {
  DesktopNotificationConnectionSnapshot,
  DesktopNotificationInboxItem,
  DesktopNotificationServerEnvelope,
} from '@/common/enterprise/desktop-notification/contracts';
import { createEnterpriseSessionEvents } from '@process/services/enterprise/enterpriseSessionEvents';
import {
  DesktopNotificationGateway,
  type DesktopNotificationGatewayApiClient,
  type DesktopNotificationGatewayDesktopIntegration,
  type DesktopNotificationGatewaySocketClient,
} from '@process/services/enterprise/desktop-notification/desktopNotificationGateway';

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
  deliveryStatus: 'PENDING',
};

const makeApiClient = (): DesktopNotificationGatewayApiClient => ({
  acknowledgeDelivery: vi.fn(async () => ({ changed: true })),
  getUnreadCount: vi.fn(async () => ({ unreadCount: 3 })),
  issueWebSocketTicket: vi.fn(async () => ({ ticket: 'main-process-only-ticket', expiresInSeconds: 60 })),
  list: vi.fn(async () => ({ items: [notification], nextBeforeRecipientId: null })),
  markAllRead: vi.fn(async () => ({ changedCount: 3 })),
  markRead: vi.fn(async () => ({ changed: true })),
});

const makeSocketClient = () => {
  let listener: ((event: DesktopNotificationServerEnvelope) => void) | undefined;
  const socketClient: DesktopNotificationGatewaySocketClient = {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    getSnapshot: vi.fn(
      (unreadCount: number): DesktopNotificationConnectionSnapshot => ({
        state: 'CONNECTED',
        reconnectAttempt: 0,
        unreadCount,
      })
    ),
    subscribe: vi.fn((nextListener) => {
      listener = nextListener;
      return () => {
        listener = undefined;
      };
    }),
  };
  return {
    emit: (event: DesktopNotificationServerEnvelope) => listener?.(event),
    socketClient,
  };
};

const makeDesktopIntegration = (): DesktopNotificationGatewayDesktopIntegration => ({
  setUnreadCount: vi.fn(),
  shouldNotify: vi.fn(() => true),
  showNotification: vi.fn(),
});

describe('DesktopNotificationGateway', () => {
  it('keeps the persisted openId and websocket ticket outside renderer-visible connection data', async () => {
    const apiClient = makeApiClient();
    const { socketClient } = makeSocketClient();
    const gateway = new DesktopNotificationGateway({
      apiClient,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'persisted-open-id' },
      socketClient,
    });

    const snapshot = await gateway.connect();

    expect(snapshot).toEqual({ state: 'CONNECTED', reconnectAttempt: 0, unreadCount: 3 });
    expect(JSON.stringify(snapshot)).not.toContain('persisted-open-id');
    expect(JSON.stringify(snapshot)).not.toContain('main-process-only-ticket');
    expect(apiClient.getUnreadCount).toHaveBeenCalledWith('persisted-open-id');
    gateway.dispose();
  });

  it('updates the tray, acknowledges delivery, and emits a sanitized realtime event', async () => {
    const apiClient = makeApiClient();
    const { emit, socketClient } = makeSocketClient();
    const desktopIntegration = makeDesktopIntegration();
    const gateway = new DesktopNotificationGateway({
      apiClient,
      desktopIntegration,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'persisted-open-id' },
      socketClient,
    });
    const observed: DesktopNotificationServerEnvelope[] = [];
    gateway.subscribe((event) => observed.push(event));

    emit({
      event: 'notification.created',
      eventId: 'desktop-event-101',
      serverTime: 1_700_000_000_000,
      payload: notification,
    });
    await vi.waitFor(() => expect(apiClient.acknowledgeDelivery).toHaveBeenCalledTimes(1));

    expect(desktopIntegration.showNotification).toHaveBeenCalledWith({ notification });
    expect(desktopIntegration.setUnreadCount).toHaveBeenLastCalledWith(1);
    expect(apiClient.acknowledgeDelivery).toHaveBeenCalledWith('persisted-open-id', '101');
    expect(JSON.stringify(observed)).not.toContain('persisted-open-id');
    expect(JSON.stringify(observed)).not.toContain('main-process-only-ticket');
    expect(observed).toHaveLength(1);
    gateway.dispose();
  });

  it('clears the websocket and unread tray count immediately after enterprise logout', async () => {
    const sessionEvents = createEnterpriseSessionEvents();
    const { socketClient } = makeSocketClient();
    const desktopIntegration = makeDesktopIntegration();
    const gateway = new DesktopNotificationGateway({
      apiClient: makeApiClient(),
      desktopIntegration,
      sessionEvents,
      sessionStore: { loadOpenId: async () => 'persisted-open-id' },
      socketClient,
    });

    sessionEvents.emitCleared();

    expect(socketClient.disconnect).toHaveBeenCalledTimes(1);
    expect(desktopIntegration.setUnreadCount).toHaveBeenLastCalledWith(0);
    gateway.dispose();
  });
});
