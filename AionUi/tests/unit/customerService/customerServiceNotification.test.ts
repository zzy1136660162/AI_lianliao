import { describe, expect, it, vi } from 'vitest';

import type {
  CustomerServiceAuthSession,
  CustomerServiceConversation,
  CustomerServiceMessage,
  CustomerServicePage,
  CustomerServiceServerEnvelope,
} from '@/common/enterprise/customer-service/contracts';
import { customerServiceNavigationDetailSchema } from '@/common/enterprise/customer-service/schemas';
import { createEnterpriseSessionEvents } from '@process/services/enterprise/enterpriseSessionEvents';
import {
  CustomerServiceGateway,
  type CustomerServiceGatewayApiClient,
  type CustomerServiceGatewayDesktopIntegration,
  type CustomerServiceGatewaySocketClient,
} from '@process/services/enterprise/customer-service/customerServiceGateway';

const authSession: CustomerServiceAuthSession = {
  accessToken: 'customer-service-access-token',
  expiresInSeconds: 7_200,
  principal: {
    type: 'STAFF',
    userId: '-19',
    displayName: '客服人员',
    companyId: '-18',
    companyName: '沈阳航燃科技有限公司',
  },
};

const makeConversation = (conversationId: string, staffUnreadCount: number): CustomerServiceConversation => ({
  conversationId,
  status: 'ACTIVE',
  customerUserId: '-91',
  customerName: '测试客户',
  customerTel: null,
  customerCompanyId: '-18',
  customerCompanyName: '沈阳航燃科技有限公司',
  staffUserId: '-19',
  staffName: '客服人员',
  allocationSource: '推广登记',
  staffFirstReplyAt: null,
  lastMessageId: '-21',
  lastMessageAt: 1_700_000_000_000,
  staffUnreadCount,
  lastMessageType: 'TEXT',
  lastMessagePreview: '您好',
  customerLastReadId: null,
  staffLastReadId: null,
  assignmentVersion: 1,
  version: 1,
  closedByType: null,
  closedById: null,
  closedReason: null,
  closedAt: null,
  assignedAt: 1_700_000_000_000,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
});

const makeCustomerMessage = (messageId: string, conversationId = '-8'): CustomerServiceMessage => ({
  messageId,
  conversationId,
  clientMessageId: 'b3ef0b28-43f7-4bb3-92c4-73442e641855',
  senderType: 'CUSTOMER',
  senderUserId: '-91',
  senderName: '测试客户',
  messageType: 'TEXT',
  textContent: '请问产品什么时候可以交付？',
  image: null,
  assignmentVersion: 1,
  createdAt: 1_700_000_000_000,
});

const makeEnvelope = (message: CustomerServiceMessage): CustomerServiceServerEnvelope => ({
  event: 'message.created',
  eventId: `event-${message.messageId}`,
  conversationId: message.conversationId,
  serverTime: 1_700_000_000_000,
  payload: message,
});

const makeApiClient = (
  pages: CustomerServicePage<CustomerServiceConversation>[] = []
): CustomerServiceGatewayApiClient => ({
  authenticateStaff: vi.fn(async () => authSession),
  listConversations: vi.fn(async () => pages.shift() ?? { items: [], nextCursor: null, hasMore: false }),
  getConversation: vi.fn(async () => makeConversation('-8', 0)),
  getHistory: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
  markRead: vi.fn(async (_token, request) => ({ advanced: true, lastReadMessageId: request.messageId })),
  uploadImage: vi.fn(async () => {
    throw new Error('not used');
  }),
  listCandidates: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
  transferConversation: vi.fn(async () => makeConversation('-8', 0)),
  closeConversation: vi.fn(async () => makeConversation('-8', 0)),
  issueWebSocketTicket: vi.fn(async () => ({ ticket: 'customer-service-ticket', expiresInSeconds: 60 })),
});

const makeSocketClient = () => {
  let listener: ((event: CustomerServiceServerEnvelope) => void) | undefined;
  const socketClient: CustomerServiceGatewaySocketClient = {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    sendMessage: vi.fn(() => 'request-id'),
    subscribe: vi.fn((nextListener) => {
      listener = nextListener;
      return () => {
        listener = undefined;
      };
    }),
  };
  return {
    emit: (event: CustomerServiceServerEnvelope) => listener?.(event),
    socketClient,
  };
};

const makeDesktopIntegration = (shouldNotify = true): CustomerServiceGatewayDesktopIntegration => ({
  shouldNotify: vi.fn(() => shouldNotify),
  showMessageNotification: vi.fn(),
  setUnreadCount: vi.fn(),
});

describe('CustomerServiceGateway desktop notifications', () => {
  it('notifies once for a new customer message and deduplicates signed negative message IDs', () => {
    const { emit, socketClient } = makeSocketClient();
    const desktopIntegration = makeDesktopIntegration();
    const gateway = new CustomerServiceGateway({
      apiClient: makeApiClient(),
      desktopIntegration,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'staff-open-id' },
      socketClient,
    });
    const event = makeEnvelope(makeCustomerMessage('-21'));

    emit(event);
    emit(event);
    emit(
      makeEnvelope({
        ...makeCustomerMessage('-23'),
        senderType: 'STAFF',
        senderUserId: '-19',
        senderName: '客服人员',
      })
    );

    expect(desktopIntegration.showMessageNotification).toHaveBeenCalledTimes(1);
    expect(desktopIntegration.showMessageNotification).toHaveBeenCalledWith({
      conversationId: '-8',
      message: event.payload,
    });
    expect(desktopIntegration.setUnreadCount).toHaveBeenLastCalledWith(1);
    gateway.dispose();
  });

  it('updates unread state without notifying while the main window has focus', () => {
    const { emit, socketClient } = makeSocketClient();
    const desktopIntegration = makeDesktopIntegration(false);
    const gateway = new CustomerServiceGateway({
      apiClient: makeApiClient(),
      desktopIntegration,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'staff-open-id' },
      socketClient,
    });

    emit(makeEnvelope(makeCustomerMessage('-22')));

    expect(desktopIntegration.showMessageNotification).not.toHaveBeenCalled();
    expect(desktopIntegration.setUnreadCount).toHaveBeenLastCalledWith(1);
    gateway.dispose();
  });

  it('clears tray unread state after a staff read event and enterprise logout', () => {
    const { emit, socketClient } = makeSocketClient();
    const desktopIntegration = makeDesktopIntegration(false);
    const sessionEvents = createEnterpriseSessionEvents();
    const gateway = new CustomerServiceGateway({
      apiClient: makeApiClient(),
      desktopIntegration,
      sessionEvents,
      sessionStore: { loadOpenId: async () => 'staff-open-id' },
      socketClient,
    });
    emit(makeEnvelope(makeCustomerMessage('-25')));
    emit({
      event: 'read.updated',
      eventId: 'read-event-1',
      conversationId: '-8',
      serverTime: 1_700_000_000_001,
      payload: {
        advanced: true,
        lastReadMessageId: '-25',
        readerType: 'STAFF',
      },
    });
    expect(desktopIntegration.setUnreadCount).toHaveBeenLastCalledWith(0);

    emit(makeEnvelope(makeCustomerMessage('-26')));
    sessionEvents.emitCleared();

    expect(desktopIntegration.setUnreadCount).toHaveBeenLastCalledWith(0);
    expect(socketClient.disconnect).toHaveBeenCalled();
    gateway.dispose();
  });

  it('synchronizes list unread counts and lowers the tray count after staff read', async () => {
    const { socketClient } = makeSocketClient();
    const desktopIntegration = makeDesktopIntegration();
    const gateway = new CustomerServiceGateway({
      apiClient: makeApiClient([
        {
          items: [makeConversation('-8', 2), makeConversation('-9', 3)],
          nextCursor: null,
          hasMore: false,
        },
      ]),
      desktopIntegration,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'staff-open-id' },
      socketClient,
    });

    await gateway.listConversations({ status: 'ACTIVE' });
    await gateway.markRead({ conversationId: '-8', messageId: '-21' });

    expect(desktopIntegration.setUnreadCount).toHaveBeenCalledWith(5);
    expect(desktopIntegration.setUnreadCount).toHaveBeenLastCalledWith(3);
  });

  it('loads every unread page and removes conversations missing from a complete refresh', async () => {
    const { socketClient } = makeSocketClient();
    const desktopIntegration = makeDesktopIntegration();
    const apiClient = makeApiClient([
      {
        items: [makeConversation('-8', 2)],
        nextCursor: '-8',
        hasMore: true,
      },
      {
        items: [makeConversation('-9', 3)],
        nextCursor: null,
        hasMore: false,
      },
      {
        items: [],
        nextCursor: null,
        hasMore: false,
      },
    ]);
    const gateway = new CustomerServiceGateway({
      apiClient,
      desktopIntegration,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'staff-open-id' },
      socketClient,
    });

    await gateway.listConversations({ status: 'ACTIVE', limit: 1 });
    expect(desktopIntegration.setUnreadCount).toHaveBeenLastCalledWith(5);
    expect(apiClient.listConversations).toHaveBeenNthCalledWith(2, 'customer-service-access-token', {
      status: 'ACTIVE',
      limit: 1,
      beforeConversationId: '-8',
    });

    await gateway.listConversations({ status: 'ACTIVE', limit: 1 });
    expect(desktopIntegration.setUnreadCount).toHaveBeenLastCalledWith(0);
  });

  it('keeps customer messages that arrive while an older read request is in flight', async () => {
    const { emit, socketClient } = makeSocketClient();
    const desktopIntegration = makeDesktopIntegration(false);
    const apiClient = makeApiClient([
      {
        items: [makeConversation('-8', 2)],
        nextCursor: null,
        hasMore: false,
      },
    ]);
    let resolveRead: ((value: { advanced: boolean; lastReadMessageId: string }) => void) | undefined;
    vi.mocked(apiClient.markRead).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    const gateway = new CustomerServiceGateway({
      apiClient,
      desktopIntegration,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'staff-open-id' },
      socketClient,
    });
    await gateway.listConversations({ status: 'ACTIVE' });

    const pendingRead = gateway.markRead({ conversationId: '-8', messageId: '-21' });
    await vi.waitFor(() => expect(apiClient.markRead).toHaveBeenCalled());
    emit(makeEnvelope(makeCustomerMessage('-24')));
    resolveRead?.({ advanced: true, lastReadMessageId: '-21' });
    await pendingRead;

    expect(desktopIntegration.setUnreadCount).toHaveBeenLastCalledWith(1);
  });

  it('does not let an older read response overwrite a newer completed read', async () => {
    const { emit, socketClient } = makeSocketClient();
    const desktopIntegration = makeDesktopIntegration(false);
    const apiClient = makeApiClient([
      {
        items: [makeConversation('-8', 2)],
        nextCursor: null,
        hasMore: false,
      },
    ]);
    const readResolvers: Array<(value: { advanced: boolean; lastReadMessageId: string }) => void> = [];
    vi.mocked(apiClient.markRead).mockImplementation(
      () =>
        new Promise((resolve) => {
          readResolvers.push(resolve);
        })
    );
    const gateway = new CustomerServiceGateway({
      apiClient,
      desktopIntegration,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'staff-open-id' },
      socketClient,
    });
    await gateway.listConversations({ status: 'ACTIVE' });

    const olderRead = gateway.markRead({ conversationId: '-8', messageId: '-21' });
    await vi.waitFor(() => expect(apiClient.markRead).toHaveBeenCalledTimes(1));
    emit(makeEnvelope(makeCustomerMessage('-27')));
    const newerRead = gateway.markRead({ conversationId: '-8', messageId: '-27' });
    await vi.waitFor(() => expect(apiClient.markRead).toHaveBeenCalledTimes(2));

    readResolvers[1]?.({ advanced: true, lastReadMessageId: '-27' });
    await newerRead;
    readResolvers[0]?.({ advanced: true, lastReadMessageId: '-21' });
    await olderRead;

    expect(desktopIntegration.setUnreadCount).toHaveBeenLastCalledWith(0);
  });

  it('removes a realtime-discovered conversation missing from a complete active refresh', async () => {
    const { emit, socketClient } = makeSocketClient();
    const desktopIntegration = makeDesktopIntegration(false);
    const gateway = new CustomerServiceGateway({
      apiClient: makeApiClient([{ items: [], nextCursor: null, hasMore: false }]),
      desktopIntegration,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'staff-open-id' },
      socketClient,
    });
    emit(makeEnvelope(makeCustomerMessage('-28', '-77')));
    expect(desktopIntegration.setUnreadCount).toHaveBeenLastCalledWith(1);

    await gateway.listConversations({ status: 'ACTIVE' });

    expect(desktopIntegration.setUnreadCount).toHaveBeenLastCalledWith(0);
  });

  it('does not overwrite realtime unread changes with an older list snapshot', async () => {
    const { emit, socketClient } = makeSocketClient();
    const desktopIntegration = makeDesktopIntegration(false);
    const apiClient = makeApiClient();
    let resolveList: ((value: CustomerServicePage<CustomerServiceConversation>) => void) | undefined;
    vi.mocked(apiClient.listConversations).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        })
    );
    const gateway = new CustomerServiceGateway({
      apiClient,
      desktopIntegration,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'staff-open-id' },
      socketClient,
    });
    emit(makeEnvelope(makeCustomerMessage('-29')));

    const pendingList = gateway.listConversations({ status: 'ACTIVE' });
    await vi.waitFor(() => expect(apiClient.listConversations).toHaveBeenCalled());
    emit(makeEnvelope(makeCustomerMessage('-30')));
    resolveList?.({
      items: [makeConversation('-8', 1)],
      nextCursor: null,
      hasMore: false,
    });
    await pendingList;

    expect(desktopIntegration.setUnreadCount).toHaveBeenLastCalledWith(2);
  });

  it('does not replay a pending old-session list with a newly established session', async () => {
    const { socketClient } = makeSocketClient();
    const desktopIntegration = makeDesktopIntegration(false);
    const sessionEvents = createEnterpriseSessionEvents();
    const apiClient = makeApiClient();
    let activeOpenId: string | null = 'staff-open-id';
    let resolveList: ((value: CustomerServicePage<CustomerServiceConversation>) => void) | undefined;
    vi.mocked(apiClient.listConversations)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveList = resolve;
          })
      )
      .mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    const gateway = new CustomerServiceGateway({
      apiClient,
      desktopIntegration,
      sessionEvents,
      sessionStore: { loadOpenId: async () => activeOpenId },
      socketClient,
    });

    const pendingList = gateway.listConversations({ status: 'ACTIVE' });
    await vi.waitFor(() => expect(apiClient.listConversations).toHaveBeenCalled());
    activeOpenId = 'new-staff-open-id';
    sessionEvents.emitCleared();
    resolveList?.({
      items: [makeConversation('-8', 5)],
      nextCursor: null,
      hasMore: false,
    });
    await pendingList.catch((): undefined => undefined);

    expect(desktopIntegration.setUnreadCount).toHaveBeenLastCalledWith(0);
    expect(apiClient.listConversations).toHaveBeenCalledTimes(1);
    expect(apiClient.authenticateStaff).toHaveBeenCalledTimes(1);
  });
});

describe('customer-service navigation boundary', () => {
  it('accepts only an exact signed conversation detail object', () => {
    expect(customerServiceNavigationDetailSchema.safeParse({ conversationId: '-8' }).success).toBe(true);
    expect(customerServiceNavigationDetailSchema.safeParse({ conversationId: '0' }).success).toBe(false);
    expect(customerServiceNavigationDetailSchema.safeParse({ conversationId: '-8', route: '/guid' }).success).toBe(
      false
    );
    expect(customerServiceNavigationDetailSchema.safeParse('conversationId=-8').success).toBe(false);
  });
});

describe('customer-service native notification target', () => {
  it('opens the exact customer-service conversation when the native notification is clicked', async () => {
    vi.resetModules();
    const send = vi.fn();
    const openCustomerServiceConversation = vi.fn();
    vi.doMock('@/common/platform', () => ({
      getPlatformServices: () => ({ notification: { send } }),
    }));
    vi.doMock('@/common', () => ({
      ipcBridge: {
        notification: {
          clicked: { emit: vi.fn() },
          show: { provider: vi.fn() },
        },
      },
    }));
    vi.doMock('@process/utils/initStorage', () => ({
      ProcessConfig: { get: vi.fn(async () => true) },
    }));
    vi.doMock('@process/utils/tray', () => ({ openCustomerServiceConversation }));
    const { showNotification } = await import('@process/bridge/notificationBridge');

    await showNotification({
      title: '链辽客服',
      body: '您收到一条新的客户消息',
      customer_service_conversation_id: '-8',
    });

    expect(send).toHaveBeenCalledTimes(1);
    const notificationOptions = send.mock.calls[0]?.[0] as { onClick?: () => void };
    expect(notificationOptions.onClick).toBeTypeOf('function');
    notificationOptions.onClick?.();
    expect(openCustomerServiceConversation).toHaveBeenCalledWith('-8');
  });

  it('preserves the existing AI conversation click event', async () => {
    vi.resetModules();
    const send = vi.fn();
    const emitNotificationClick = vi.fn();
    vi.doMock('@/common/platform', () => ({
      getPlatformServices: () => ({ notification: { send } }),
    }));
    vi.doMock('@/common', () => ({
      ipcBridge: {
        notification: {
          clicked: { emit: emitNotificationClick },
          show: { provider: vi.fn() },
        },
      },
    }));
    vi.doMock('@process/utils/initStorage', () => ({
      ProcessConfig: { get: vi.fn(async () => true) },
    }));
    vi.doMock('@process/utils/tray', () => ({ openCustomerServiceConversation: vi.fn() }));
    const { showNotification } = await import('@process/bridge/notificationBridge');

    await showNotification({
      title: '链辽AI',
      body: 'AI 会话已回复',
      conversation_id: 'ai-conversation-guid',
    });
    const notificationOptions = send.mock.calls[0]?.[0] as { onClick?: () => void };
    notificationOptions.onClick?.();

    expect(emitNotificationClick).toHaveBeenCalledWith({ conversation_id: 'ai-conversation-guid' });
  });

  it('opens the authenticated customer consultation without accepting an external conversation ID', async () => {
    vi.resetModules();
    const send = vi.fn();
    const openCustomerConsultation = vi.fn();
    vi.doMock('@/common/platform', () => ({
      getPlatformServices: () => ({ notification: { send } }),
    }));
    vi.doMock('@/common', () => ({
      ipcBridge: {
        notification: { clicked: { emit: vi.fn() }, show: { provider: vi.fn() } },
      },
    }));
    vi.doMock('@process/utils/initStorage', () => ({
      ProcessConfig: { get: vi.fn(async () => true) },
    }));
    vi.doMock('@process/utils/tray', () => ({
      openCustomerServiceConversation: vi.fn(),
      openCustomerConsultation,
    }));
    const { showNotification } = await import('@process/bridge/notificationBridge');

    await showNotification({
      title: '链辽客服',
      body: '您收到一条客服回复',
      customer_consultation: true,
    });
    const notificationOptions = send.mock.calls[0]?.[0] as { onClick?: () => void };
    notificationOptions.onClick?.();

    expect(openCustomerConsultation).toHaveBeenCalledTimes(1);
  });

  it('restores, shows and focuses the main window before sending the fixed navigation event', async () => {
    vi.resetModules();
    vi.doUnmock('@process/utils/tray');
    vi.doMock('@/common/electronSafe', () => ({
      electronApp: { isPackaged: false },
      electronMenu: { buildFromTemplate: vi.fn() },
      electronNativeImage: { createFromPath: vi.fn() },
      electronTray: vi.fn(),
    }));
    vi.doMock('@/common', () => ({
      ipcBridge: {
        conversation: { activeCount: { invoke: vi.fn(async () => ({ count: 0 })) } },
        database: { getUserConversations: { invoke: vi.fn(async () => ({ items: [] })) } },
      },
    }));
    vi.doMock('@process/services/i18n', () => ({ default: { t: (key: string) => key } }));
    const { CUSTOMER_SERVICE_NAVIGATE_CHANNEL } = await import('@/common/enterprise/customer-service/constants');
    const { openCustomerServiceConversation, setTrayMainWindow, shouldNotifyCustomerServiceMessage } =
      await import('@process/utils/tray');
    const window = {
      focus: vi.fn(),
      hide: vi.fn(),
      isDestroyed: vi.fn(() => false),
      isFocused: vi.fn(() => false),
      isMinimized: vi.fn(() => true),
      isVisible: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
      webContents: { send: vi.fn() },
    };
    setTrayMainWindow(window as never);

    expect(shouldNotifyCustomerServiceMessage()).toBe(true);
    openCustomerServiceConversation('-8');

    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(window.webContents.send).toHaveBeenCalledWith(CUSTOMER_SERVICE_NAVIGATE_CHANNEL, {
      conversationId: '-8',
    });
  });

  it('updates the existing tray tooltip and menu without recreating the tray', async () => {
    vi.resetModules();
    vi.doUnmock('@process/utils/tray');
    const trayInstance = {
      destroy: vi.fn(),
      on: vi.fn(),
      setContextMenu: vi.fn(),
      setTitle: vi.fn(),
      setToolTip: vi.fn(),
    };
    const Tray = vi.fn(function TrayMock() {
      return trayInstance;
    });
    const buildFromTemplate = vi.fn((template: unknown) => template);
    vi.doMock('@/common/electronSafe', () => ({
      electronApp: { isPackaged: false },
      electronMenu: { buildFromTemplate },
      electronNativeImage: {
        createFromPath: vi.fn(() => ({ resize: vi.fn(() => ({})) })),
      },
      electronTray: Tray,
    }));
    vi.doMock('@/common', () => ({
      ipcBridge: {
        conversation: { activeCount: { invoke: vi.fn(async () => ({ count: 0 })) } },
        database: { getUserConversations: { invoke: vi.fn(async () => ({ items: [] })) } },
      },
    }));
    vi.doMock('@process/services/i18n', () => ({ default: { t: (key: string) => key } }));
    const { createOrUpdateTray, destroyTray, setCustomerServiceUnreadCount } = await import('@process/utils/tray');

    createOrUpdateTray();
    setCustomerServiceUnreadCount(4);

    await vi.waitFor(() => expect(trayInstance.setContextMenu).toHaveBeenCalled());
    expect(Tray).toHaveBeenCalledTimes(1);
    expect(trayInstance.setToolTip).toHaveBeenLastCalledWith(
      expect.stringContaining('enterprise.customerService.title: 4')
    );
    expect(buildFromTemplate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          enabled: false,
          label: 'enterprise.customerService.title: 4',
        }),
      ])
    );
    destroyTray();
  });

  it('opens customer consultation and suppresses notifications only while that route is focused', async () => {
    vi.resetModules();
    vi.doUnmock('@process/utils/tray');
    vi.doMock('@/common/electronSafe', () => ({
      electronApp: { isPackaged: false },
      electronMenu: { buildFromTemplate: vi.fn() },
      electronNativeImage: { createFromPath: vi.fn() },
      electronTray: vi.fn(),
    }));
    vi.doMock('@/common', () => ({
      ipcBridge: {
        conversation: { activeCount: { invoke: vi.fn(async () => ({ count: 0 })) } },
        database: { getUserConversations: { invoke: vi.fn(async () => ({ items: [] })) } },
      },
    }));
    vi.doMock('@process/services/i18n', () => ({ default: { t: (key: string) => key } }));
    const { CUSTOMER_CONSULTATION_NAVIGATE_CHANNEL } = await import('@/common/enterprise/customer-service/constants');
    const { openCustomerConsultation, setTrayMainWindow, shouldNotifyCustomerConsultationMessage } =
      await import('@process/utils/tray');
    let url = 'http://localhost:51031/#/enterprise/consultation';
    const window = {
      focus: vi.fn(),
      isDestroyed: vi.fn(() => false),
      isFocused: vi.fn(() => true),
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
      show: vi.fn(),
      webContents: { getURL: vi.fn(() => url), send: vi.fn() },
    };
    setTrayMainWindow(window as never);

    expect(shouldNotifyCustomerConsultationMessage()).toBe(false);
    url = 'http://localhost:51031/#/enterprise/dashboard';
    expect(shouldNotifyCustomerConsultationMessage()).toBe(true);
    openCustomerConsultation();

    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(window.webContents.send).toHaveBeenCalledWith(CUSTOMER_CONSULTATION_NAVIGATE_CHANNEL);
  });
});
