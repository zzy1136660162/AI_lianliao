import { describe, expect, it, vi } from 'vitest';

import { CUSTOMER_SERVICE_IPC_CHANNELS } from '@/common/enterprise/customer-service/constants';
import type {
  CustomerServiceAuthSession,
  CustomerServiceConnectionSnapshot,
  CustomerServiceConversation,
  CustomerServicePage,
} from '@/common/enterprise/customer-service/contracts';
import {
  initCustomerServiceBridge,
  type CustomerServiceBridgeGateway,
  type CustomerServiceIpcMain,
} from '@/process/bridge/enterpriseBridge';
import { CustomerServiceApiError } from '@process/services/enterprise/customer-service/customerServiceApiClient';
import {
  CustomerServiceGateway,
  type CustomerServiceGatewayApiClient,
  type CustomerServiceGatewaySocketClient,
} from '@process/services/enterprise/customer-service/customerServiceGateway';
import { createEnterpriseSessionEvents } from '@process/services/enterprise/enterpriseSessionEvents';

const emptyPage = <T>(): CustomerServicePage<T> => ({ items: [], nextCursor: null, hasMore: false });

const makeIpcMain = () => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
  const ipcMain: CustomerServiceIpcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
  };
  return { handlers, ipcMain };
};

const makeBridgeGateway = (): CustomerServiceBridgeGateway => ({
  connect: vi.fn(
    async (): Promise<CustomerServiceConnectionSnapshot> => ({
      state: 'CONNECTED',
      reconnectAttempt: 0,
      unreadCount: 0,
    })
  ),
  disconnect: vi.fn(async () => undefined),
  listConversations: vi.fn(async () => emptyPage<CustomerServiceConversation>()),
  getConversation: vi.fn(async () => {
    throw new Error('not used');
  }),
  getHistory: vi.fn(async () => emptyPage()),
  sendMessage: vi.fn(() => 'request-id'),
  markRead: vi.fn(async () => ({ advanced: true, lastReadMessageId: '-9' })),
  uploadImage: vi.fn(async () => ({
    url: 'https://www.lslnii.com/upload/customer-service/test.png',
    width: 1,
    height: 1,
    sizeBytes: '1',
    mimeType: 'image/png',
  })),
  listCandidates: vi.fn(async () => emptyPage()),
  transferConversation: vi.fn(async () => {
    throw new Error('not used');
  }),
  closeConversation: vi.fn(async () => {
    throw new Error('not used');
  }),
  subscribe: vi.fn(() => () => undefined),
});

describe('customer-service IPC bridge', () => {
  it('rejects an untrusted renderer before invoking the gateway', async () => {
    const { handlers, ipcMain } = makeIpcMain();
    const gateway = makeBridgeGateway();
    initCustomerServiceBridge({ gateway, ipcMain, senderGuard: () => false });

    const result = await handlers.get(CUSTOMER_SERVICE_IPC_CHANNELS.CONNECT)?.({});

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'UNTRUSTED_SENDER',
        message: 'Customer-service IPC sender is not trusted.',
      },
    });
    expect(gateway.connect).not.toHaveBeenCalled();
  });

  it('rejects extra renderer properties instead of forwarding secrets', async () => {
    const { handlers, ipcMain } = makeIpcMain();
    const gateway = makeBridgeGateway();
    initCustomerServiceBridge({ gateway, ipcMain, senderGuard: () => true });

    const result = await handlers.get(CUSTOMER_SERVICE_IPC_CHANNELS.GET_CONVERSATION)?.(
      {},
      {
        conversationId: '-8',
        accessToken: 'renderer-secret',
      }
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(gateway.getConversation).not.toHaveBeenCalled();
  });
});

describe('CustomerServiceGateway session boundary', () => {
  it('keeps openId and access token out of renderer-visible connection data', async () => {
    const sessionEvents = createEnterpriseSessionEvents();
    const authSession: CustomerServiceAuthSession = {
      accessToken: 'main-process-secret',
      expiresInSeconds: 7_200,
      principal: {
        type: 'STAFF',
        userId: '-19',
        displayName: '客服人员',
        companyId: '-18',
        companyName: '沈阳航燃科技有限公司',
      },
    };
    const apiClient = makeGatewayApiClient(authSession);
    const socketClient = makeGatewaySocketClient();
    const gateway = new CustomerServiceGateway({
      apiClient,
      sessionEvents,
      sessionStore: { loadOpenId: async () => 'staff-open-id' },
      socketClient,
    });

    const snapshot = await gateway.connect();

    expect(JSON.stringify(snapshot)).not.toContain('staff-open-id');
    expect(JSON.stringify(snapshot)).not.toContain('main-process-secret');
    expect(apiClient.authenticateStaff).toHaveBeenCalledWith('staff-open-id');
  });

  it('reauthenticates once after an expired access token', async () => {
    const authSession: CustomerServiceAuthSession = {
      accessToken: 'refreshed-secret',
      expiresInSeconds: 7_200,
      principal: {
        type: 'STAFF',
        userId: '-19',
        displayName: '客服人员',
        companyId: null,
        companyName: null,
      },
    };
    const apiClient = makeGatewayApiClient(authSession);
    vi.mocked(apiClient.listConversations)
      .mockRejectedValueOnce(new CustomerServiceApiError('UNAUTHORIZED', 401))
      .mockResolvedValueOnce(emptyPage());
    const gateway = new CustomerServiceGateway({
      apiClient,
      sessionEvents: createEnterpriseSessionEvents(),
      sessionStore: { loadOpenId: async () => 'staff-open-id' },
      socketClient: makeGatewaySocketClient(),
    });

    await gateway.listConversations({});

    expect(apiClient.authenticateStaff).toHaveBeenCalledTimes(2);
    expect(apiClient.listConversations).toHaveBeenNthCalledWith(2, 'refreshed-secret', {});
  });

  it('disconnects and forgets credentials after enterprise logout', async () => {
    const sessionEvents = createEnterpriseSessionEvents();
    const apiClient = makeGatewayApiClient({
      accessToken: 'main-process-secret',
      expiresInSeconds: 7_200,
      principal: {
        type: 'STAFF',
        userId: '-19',
        displayName: '客服人员',
        companyId: null,
        companyName: null,
      },
    });
    const socketClient = makeGatewaySocketClient();
    const gateway = new CustomerServiceGateway({
      apiClient,
      sessionEvents,
      sessionStore: { loadOpenId: async () => 'staff-open-id' },
      socketClient,
    });
    await gateway.connect();

    sessionEvents.emitCleared();
    await Promise.resolve();
    await gateway.listConversations({});

    expect(socketClient.disconnect).toHaveBeenCalled();
    expect(apiClient.authenticateStaff).toHaveBeenCalledTimes(2);
  });
});

const makeGatewayApiClient = (authSession: CustomerServiceAuthSession): CustomerServiceGatewayApiClient => ({
  authenticateStaff: vi.fn(async () => authSession),
  listConversations: vi.fn(async () => emptyPage()),
  getConversation: vi.fn(async () => {
    throw new Error('not used');
  }),
  getHistory: vi.fn(async () => emptyPage()),
  markRead: vi.fn(async () => ({ advanced: true, lastReadMessageId: '-9' })),
  uploadImage: vi.fn(async () => ({
    url: 'https://www.lslnii.com/upload/customer-service/test.png',
    width: 1,
    height: 1,
    sizeBytes: '1',
    mimeType: 'image/png',
  })),
  listCandidates: vi.fn(async () => emptyPage()),
  transferConversation: vi.fn(async () => {
    throw new Error('not used');
  }),
  closeConversation: vi.fn(async () => {
    throw new Error('not used');
  }),
  issueWebSocketTicket: vi.fn(async () => ({ ticket: 'ticket', expiresInSeconds: 60 })),
});

const makeGatewaySocketClient = (): CustomerServiceGatewaySocketClient => ({
  connect: vi.fn(async () => undefined),
  disconnect: vi.fn(),
  sendMessage: vi.fn(() => 'request-id'),
  subscribe: vi.fn(() => () => undefined),
});
