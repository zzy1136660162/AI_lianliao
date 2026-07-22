import { describe, expect, it, vi } from 'vitest';

import type {
  CustomerServiceAuthSession,
  CustomerServiceConnectionSnapshot,
  CustomerServiceConversation,
  CustomerServiceMessage,
  CustomerServiceServerEnvelope,
} from '@/common/enterprise/customer-service/contracts';
import { createEnterpriseSessionEvents } from '@process/services/enterprise/enterpriseSessionEvents';
import { CustomerServiceApiError } from '@process/services/enterprise/customer-service/customerServiceApiClient';
import {
  CustomerConsultationGateway,
  type CustomerConsultationGatewayApiClient,
  type CustomerConsultationGatewaySocketClient,
} from '@process/services/enterprise/customer-service/customerConsultationGateway';

const conversation: CustomerServiceConversation = {
  conversationId: '-8',
  status: 'ACTIVE',
  customerUserId: '-7',
  customerName: '企业用户',
  customerTel: null,
  customerCompanyId: '-18',
  customerCompanyName: '沈阳航燃科技有限公司',
  staffUserId: '-19',
  staffName: '链辽客服',
  allocationSource: '推广登记',
  staffFirstReplyAt: null,
  lastMessageId: null,
  lastMessageAt: null,
  staffUnreadCount: 0,
  lastMessageType: null,
  lastMessagePreview: null,
  customerLastReadId: null,
  staffLastReadId: null,
  assignmentVersion: 0,
  version: 0,
  closedByType: null,
  closedById: null,
  closedReason: null,
  closedAt: null,
  assignedAt: null,
  createdAt: null,
  updatedAt: null,
};

const customerSession: CustomerServiceAuthSession = {
  accessToken: 'customer-memory-token',
  expiresInSeconds: 7_200,
  principal: {
    type: 'CUSTOMER',
    userId: '-7',
    displayName: '企业用户',
    companyId: '-18',
    companyName: '沈阳航燃科技有限公司',
  },
};

const makeApi = (session = customerSession): CustomerConsultationGatewayApiClient => ({
  authenticateCustomer: vi.fn(async () => session),
  openConversation: vi.fn(async () => conversation),
  getConversation: vi.fn(async () => conversation),
  getHistory: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
  markRead: vi.fn(async (_token, request) => ({ advanced: true, lastReadMessageId: request.messageId })),
  uploadImage: vi.fn(async () => ({
    url: 'https://www.lslnii.com/upload/customer-service/test.png',
    width: 1,
    height: 1,
    sizeBytes: '1',
    mimeType: 'image/png',
  })),
  closeConversation: vi.fn(async () => ({ ...conversation, status: 'CLOSED', version: 1 })),
  issueWebSocketTicket: vi.fn(async () => ({ ticket: 'single-use-ticket', expiresInSeconds: 60 })),
});

const makeSocket = () => {
  let listener: ((event: CustomerServiceServerEnvelope) => void) | null = null;
  let stateListener: ((snapshot: CustomerServiceConnectionSnapshot) => void) | null = null;
  const socket: CustomerConsultationGatewaySocketClient & {
    emit: (event: CustomerServiceServerEnvelope) => void;
    emitState: (snapshot: CustomerServiceConnectionSnapshot) => void;
  } = {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    sendMessage: vi.fn(() => 'request-id'),
    subscribe: vi.fn((nextListener) => {
      listener = nextListener;
      return () => {
        listener = null;
      };
    }),
    subscribeState: vi.fn((nextListener) => {
      stateListener = nextListener;
      return () => {
        stateListener = null;
      };
    }),
    getSnapshot: vi.fn((unreadCount = 0) => ({ state: 'CONNECTED', reconnectAttempt: 0, unreadCount })),
    emit: (event) => listener?.(event),
    emitState: (snapshot) => stateListener?.(snapshot),
  };
  return socket;
};

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('CustomerConsultationGateway', () => {
  it('coalesces concurrent customer authentication and keeps secrets out of the snapshot', async () => {
    const api = makeApi();
    const socket = makeSocket();
    const gateway = new CustomerConsultationGateway({
      apiClient: api,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'customer-open-id' },
      socketClient: socket,
    });

    const [first, second] = await Promise.all([gateway.connect(), gateway.connect()]);

    expect(api.authenticateCustomer).toHaveBeenCalledTimes(1);
    expect(api.authenticateCustomer).toHaveBeenCalledWith('customer-open-id');
    expect(socket.connect).toHaveBeenCalledTimes(2);
    expect(JSON.stringify([first, second])).not.toContain('customer-open-id');
    expect(JSON.stringify([first, second])).not.toContain('customer-memory-token');
  });

  it('rejects a staff principal before opening the socket', async () => {
    const api = makeApi({ ...customerSession, principal: { ...customerSession.principal, type: 'STAFF' } });
    const socket = makeSocket();
    const gateway = new CustomerConsultationGateway({
      apiClient: api,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'staff-open-id' },
      socketClient: socket,
    });

    await expect(gateway.connect()).rejects.toMatchObject({ code: 'FORBIDDEN_CUSTOMER', status: 403 });
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('opens one conversation for concurrent callers and rejects access to any other conversation', async () => {
    const api = makeApi();
    const gateway = new CustomerConsultationGateway({
      apiClient: api,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'customer-open-id' },
      socketClient: makeSocket(),
    });

    const [first, second] = await Promise.all([gateway.openConversation(), gateway.openConversation()]);

    expect(first.conversationId).toBe('-8');
    expect(second.conversationId).toBe('-8');
    expect(api.openConversation).toHaveBeenCalledTimes(1);
    await expect(gateway.getConversation({ conversationId: '-9' })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(api.getConversation).not.toHaveBeenCalled();
  });

  it('counts each staff reply once and clears unread after the customer reads it', async () => {
    const unreadCounts: number[] = [];
    const socket = makeSocket();
    const gateway = new CustomerConsultationGateway({
      apiClient: makeApi(),
      desktopIntegration: {
        shouldNotify: () => false,
        showMessageNotification: vi.fn(),
        setUnreadCount: (count) => unreadCounts.push(count),
      },
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'customer-open-id' },
      socketClient: socket,
    });
    await gateway.startConversation();
    const message: CustomerServiceMessage = {
      messageId: '-20',
      conversationId: '-8',
      clientMessageId: '11111111-1111-4111-8111-111111111111',
      senderType: 'STAFF',
      senderUserId: '-19',
      senderName: '链辽客服',
      messageType: 'TEXT',
      textContent: '您好，请问需要什么帮助？',
      image: null,
      assignmentVersion: 0,
      createdAt: 1_700_000_000_000,
    };
    const event: CustomerServiceServerEnvelope = {
      event: 'message.created',
      eventId: 'event-1',
      conversationId: '-8',
      serverTime: 1_700_000_000_000,
      payload: message,
    };

    socket.emit(event);
    socket.emit(event);
    expect(unreadCounts.at(-1)).toBe(1);

    await gateway.markRead({ conversationId: '-8', messageId: '-20' });
    expect(unreadCounts.at(-1)).toBe(0);
  });

  it('clears customer unread when either side closes the conversation', async () => {
    const unreadCounts: number[] = [];
    const api = makeApi();
    const socket = makeSocket();
    const gateway = new CustomerConsultationGateway({
      apiClient: api,
      desktopIntegration: {
        shouldNotify: () => false,
        showMessageNotification: vi.fn(),
        setUnreadCount: (count) => unreadCounts.push(count),
      },
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'customer-open-id' },
      socketClient: socket,
    });
    await gateway.openConversation();
    const staffMessage = (messageId: string, eventId: string): CustomerServiceServerEnvelope => ({
      event: 'message.created',
      eventId,
      conversationId: '-8',
      serverTime: 1_700_000_000_000,
      payload: {
        messageId,
        conversationId: '-8',
        clientMessageId:
          messageId === '-20' ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
        senderType: 'STAFF',
        senderUserId: '-19',
        senderName: '链辽客服',
        messageType: 'TEXT',
        textContent: '客服回复',
        image: null,
        assignmentVersion: 0,
        createdAt: 1_700_000_000_000,
      } satisfies CustomerServiceMessage,
    });

    socket.emit(staffMessage('-20', 'message-before-customer-close'));
    expect(unreadCounts.at(-1)).toBe(1);
    await gateway.closeConversation({ conversationId: '-8', expectedVersion: 0 });
    expect(unreadCounts.at(-1)).toBe(0);

    vi.mocked(api.openConversation).mockResolvedValueOnce(conversation);
    await gateway.openConversation();
    socket.emit(staffMessage('-21', 'message-before-staff-close'));
    expect(unreadCounts.at(-1)).toBe(1);
    socket.emit({
      event: 'conversation.closed',
      eventId: 'staff-close-event',
      conversationId: '-8',
      serverTime: 1_700_000_000_200,
      payload: {
        conversationId: '-8',
        status: 'CLOSED',
        staffUserId: '-19',
        staffName: '链辽客服',
        assignmentVersion: 0,
        version: 1,
        lastMessageId: '-21',
        lastMessageAt: 1_700_000_000_100,
        closedReason: 'STAFF_CLOSED',
        closedAt: 1_700_000_000_200,
        assignedAt: 1_700_000_000_000,
      },
    });
    expect(unreadCounts.at(-1)).toBe(0);
  });

  it('preserves a newer unread reply while an older mark-read request is pending', async () => {
    const unreadCounts: number[] = [];
    const readResponse = deferred<{ advanced: boolean; lastReadMessageId: string }>();
    const api = makeApi();
    vi.mocked(api.markRead).mockImplementationOnce(() => readResponse.promise);
    const socket = makeSocket();
    const gateway = new CustomerConsultationGateway({
      apiClient: api,
      desktopIntegration: {
        shouldNotify: () => false,
        showMessageNotification: vi.fn(),
        setUnreadCount: (count) => unreadCounts.push(count),
      },
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'customer-open-id' },
      socketClient: socket,
    });
    await gateway.openConversation();
    // This helper intentionally stays beside the unread-sequence assertions it describes.
    // eslint-disable-next-line unicorn/consistent-function-scoping
    const staffEvent = (messageId: string, eventId: string): CustomerServiceServerEnvelope => ({
      event: 'message.created',
      eventId,
      conversationId: '-8',
      serverTime: Date.now(),
      payload: {
        messageId,
        conversationId: '-8',
        clientMessageId:
          messageId === '-20' ? '55555555-5555-4555-8555-555555555555' : '66666666-6666-4666-8666-666666666666',
        senderType: 'STAFF',
        senderUserId: '-19',
        senderName: '链辽客服',
        messageType: 'TEXT',
        textContent: '客服回复',
        image: null,
        assignmentVersion: 0,
        createdAt: Date.now(),
      },
    });
    socket.emit(staffEvent('-20', 'unread-1'));
    const marking = gateway.markRead({ conversationId: '-8', messageId: '-20' });
    await vi.waitFor(() => expect(api.markRead).toHaveBeenCalledTimes(1));
    socket.emit(staffEvent('-21', 'unread-2'));
    readResponse.resolve({ advanced: true, lastReadMessageId: '-20' });

    await marking;
    expect(unreadCounts.at(-1)).toBe(1);
  });

  it('ignores an older read response after a newer read response has already applied', async () => {
    const unreadCounts: number[] = [];
    const firstRead = deferred<{ advanced: boolean; lastReadMessageId: string }>();
    const secondRead = deferred<{ advanced: boolean; lastReadMessageId: string }>();
    const api = makeApi();
    vi.mocked(api.markRead)
      .mockImplementationOnce(() => firstRead.promise)
      .mockImplementationOnce(() => secondRead.promise);
    const socket = makeSocket();
    const gateway = new CustomerConsultationGateway({
      apiClient: api,
      desktopIntegration: {
        shouldNotify: () => false,
        showMessageNotification: vi.fn(),
        setUnreadCount: (count) => unreadCounts.push(count),
      },
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'customer-open-id' },
      socketClient: socket,
    });
    await gateway.openConversation();
    const emitStaffMessage = (messageId: string, eventId: string, clientMessageId: string): void => {
      socket.emit({
        event: 'message.created',
        eventId,
        conversationId: '-8',
        serverTime: Date.now(),
        payload: {
          messageId,
          conversationId: '-8',
          clientMessageId,
          senderType: 'STAFF',
          senderUserId: '-19',
          senderName: '链辽客服',
          messageType: 'TEXT',
          textContent: '客服回复',
          image: null,
          assignmentVersion: 0,
          createdAt: Date.now(),
        },
      });
    };

    emitStaffMessage('-20', 'read-order-1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const olderRequest = gateway.markRead({ conversationId: '-8', messageId: '-20' });
    emitStaffMessage('-21', 'read-order-2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    const newerRequest = gateway.markRead({ conversationId: '-8', messageId: '-21' });
    secondRead.resolve({ advanced: true, lastReadMessageId: '-21' });
    await newerRequest;
    emitStaffMessage('-22', 'read-order-3', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    firstRead.resolve({ advanced: true, lastReadMessageId: '-20' });

    await olderRequest;
    expect(unreadCounts.at(-1)).toBe(1);
  });

  it('does not forward events from a conversation outside the current customer boundary', async () => {
    const socket = makeSocket();
    const listener = vi.fn();
    const gateway = new CustomerConsultationGateway({
      apiClient: makeApi(),
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'customer-open-id' },
      socketClient: socket,
    });
    await gateway.openConversation();
    gateway.subscribe(listener);

    socket.emit({
      event: 'message.created',
      eventId: 'wrong-conversation-event',
      conversationId: '-999',
      serverTime: Date.now(),
      payload: {
        messageId: '-30',
        conversationId: '-999',
        clientMessageId: '77777777-7777-4777-8777-777777777777',
        senderType: 'STAFF',
        senderUserId: '-19',
        senderName: '链辽客服',
        messageType: 'TEXT',
        textContent: 'wrong conversation',
        image: null,
        assignmentVersion: 0,
        createdAt: Date.now(),
      },
    });

    socket.emit({
      event: 'conversation.snapshot',
      eventId: 'null-envelope-conversation',
      conversationId: null,
      serverTime: Date.now(),
      payload: { ...conversation, conversationId: '-999' },
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('forwards validated socket state so the customer sees reconnect progress', () => {
    const socket = makeSocket();
    const listener = vi.fn();
    const gateway = new CustomerConsultationGateway({
      apiClient: makeApi(),
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'customer-open-id' },
      socketClient: socket,
    });
    gateway.subscribe(listener);

    socket.emitState({ state: 'RECONNECTING', reconnectAttempt: 2, unreadCount: 0 });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connection.state',
        conversationId: null,
        payload: { state: 'RECONNECTING', reconnectAttempt: 2, unreadCount: 0 },
      })
    );
  });

  it('disconnects and forgets authentication and conversation state after enterprise logout', async () => {
    const events = createEnterpriseSessionEvents();
    const api = makeApi();
    const socket = makeSocket();
    const gateway = new CustomerConsultationGateway({
      apiClient: api,
      sessionEvents: events,
      sessionStore: { loadOpenId: async () => 'customer-open-id' },
      socketClient: socket,
    });
    await gateway.openConversation();

    events.emitCleared();
    await gateway.openConversation();

    expect(socket.disconnect).toHaveBeenCalled();
    expect(api.authenticateCustomer).toHaveBeenCalledTimes(2);
    expect(api.openConversation).toHaveBeenCalledTimes(2);
  });

  it('keeps a closed conversation read-only until the customer explicitly starts a new one', async () => {
    const api = makeApi();
    const gateway = new CustomerConsultationGateway({
      apiClient: api,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'customer-open-id' },
      socketClient: makeSocket(),
    });
    await gateway.openConversation();
    const closed = await gateway.closeConversation({ conversationId: '-8', expectedVersion: 0 });
    vi.mocked(api.openConversation).mockResolvedValueOnce({ ...conversation, conversationId: '-88' });

    await expect(gateway.openConversation()).resolves.toEqual(closed);
    expect(api.openConversation).toHaveBeenCalledTimes(1);
    await expect(gateway.startConversation()).resolves.toMatchObject({ conversationId: '-88' });
    expect(api.openConversation).toHaveBeenCalledTimes(2);
  });

  it('rejects an old-account conversation response that finishes after enterprise logout', async () => {
    const events = createEnterpriseSessionEvents();
    const oldResponse = deferred<CustomerServiceConversation>();
    const api = makeApi();
    vi.mocked(api.openConversation)
      .mockImplementationOnce(() => oldResponse.promise)
      .mockResolvedValueOnce({ ...conversation, conversationId: '-88' });
    let openId = 'old-account-open-id';
    const gateway = new CustomerConsultationGateway({
      apiClient: api,
      sessionEvents: events,
      sessionStore: { loadOpenId: async () => openId },
      socketClient: makeSocket(),
    });

    const oldOpen = gateway.openConversation();
    await vi.waitFor(() => expect(api.openConversation).toHaveBeenCalledTimes(1));
    events.emitCleared();
    openId = 'new-account-open-id';
    oldResponse.resolve(conversation);

    await expect(oldOpen).rejects.toMatchObject({ code: 'AUTHENTICATION_CANCELLED', status: 401 });
    await expect(gateway.openConversation()).resolves.toMatchObject({ conversationId: '-88' });
    expect(api.authenticateCustomer).toHaveBeenLastCalledWith('new-account-open-id');
    expect(api.openConversation).toHaveBeenCalledTimes(2);
  });

  it('cannot finish connecting a socket that belongs to a logged-out account', async () => {
    const events = createEnterpriseSessionEvents();
    const pendingConnect = deferred<void>();
    const socket = makeSocket();
    vi.mocked(socket.connect).mockImplementationOnce(() => pendingConnect.promise);
    const gateway = new CustomerConsultationGateway({
      apiClient: makeApi(),
      sessionEvents: events,
      sessionStore: { loadOpenId: async () => 'customer-open-id' },
      socketClient: socket,
    });

    const connecting = gateway.connect();
    await vi.waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(1));
    events.emitCleared();
    pendingConnect.resolve();

    await expect(connecting).rejects.toMatchObject({ code: 'AUTHENTICATION_CANCELLED', status: 401 });
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('reauthenticates at most once after an unauthorized customer request', async () => {
    const api = makeApi();
    vi.mocked(api.openConversation)
      .mockRejectedValueOnce(new CustomerServiceApiError('UNAUTHORIZED', 401))
      .mockResolvedValueOnce(conversation);
    const gateway = new CustomerConsultationGateway({
      apiClient: api,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'customer-open-id' },
      socketClient: makeSocket(),
    });

    await gateway.openConversation();

    expect(api.authenticateCustomer).toHaveBeenCalledTimes(2);
    expect(api.openConversation).toHaveBeenCalledTimes(2);
  });
});
