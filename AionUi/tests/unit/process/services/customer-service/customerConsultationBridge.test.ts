import { describe, expect, it, vi } from 'vitest';

import { CUSTOMER_CONSULTATION_IPC_CHANNELS } from '@/common/enterprise/customer-service/constants';
import type {
  CustomerServiceConnectionSnapshot,
  CustomerServiceConversation,
} from '@/common/enterprise/customer-service/contracts';
import {
  initCustomerConsultationBridge,
  type CustomerConsultationBridgeGateway,
  type CustomerServiceIpcMain,
} from '@/process/bridge/enterpriseBridge';

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

const makeIpcMain = () => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
  const ipcMain: CustomerServiceIpcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
  };
  return { handlers, ipcMain };
};

const makeGateway = (): CustomerConsultationBridgeGateway => ({
  connect: vi.fn(
    async (): Promise<CustomerServiceConnectionSnapshot> => ({
      state: 'CONNECTED',
      reconnectAttempt: 0,
      unreadCount: 0,
    })
  ),
  disconnect: vi.fn(async () => undefined),
  openConversation: vi.fn(async () => conversation),
  startConversation: vi.fn(async () => conversation),
  getConversation: vi.fn(async () => conversation),
  getHistory: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
  sendMessage: vi.fn(() => '11111111-1111-4111-8111-111111111111'),
  markRead: vi.fn(async () => ({ advanced: true, lastReadMessageId: '-9' })),
  uploadImage: vi.fn(async () => ({
    url: 'https://www.lslnii.com/upload/customer-service/test.png',
    width: 1,
    height: 1,
    sizeBytes: '1',
    mimeType: 'image/png',
  })),
  closeConversation: vi.fn(async () => ({ ...conversation, status: 'CLOSED' })),
  subscribe: vi.fn(() => () => undefined),
});

describe('customer-consultation IPC bridge', () => {
  it('registers only customer consultation channels', () => {
    const { handlers, ipcMain } = makeIpcMain();
    initCustomerConsultationBridge({ gateway: makeGateway(), ipcMain, senderGuard: () => true });

    expect([...handlers.keys()].toSorted()).toEqual(
      Object.values(CUSTOMER_CONSULTATION_IPC_CHANNELS)
        .filter((channel) => channel !== CUSTOMER_CONSULTATION_IPC_CHANNELS.EVENT)
        .toSorted()
    );
    expect([...handlers.keys()].some((channel) => channel.includes('candidate') || channel.includes('transfer'))).toBe(
      false
    );
  });

  it('rejects untrusted senders and extra properties before invoking the gateway', async () => {
    const untrusted = makeIpcMain();
    const gateway = makeGateway();
    initCustomerConsultationBridge({ gateway, ipcMain: untrusted.ipcMain, senderGuard: () => false });
    const connectResult = await untrusted.handlers.get(CUSTOMER_CONSULTATION_IPC_CHANNELS.CONNECT)?.({});
    expect(connectResult).toMatchObject({ ok: false, error: { code: 'UNTRUSTED_SENDER' } });

    const trusted = makeIpcMain();
    initCustomerConsultationBridge({ gateway, ipcMain: trusted.ipcMain, senderGuard: () => true });
    const detailResult = await trusted.handlers.get(CUSTOMER_CONSULTATION_IPC_CHANNELS.GET_CONVERSATION)?.(
      {},
      { conversationId: '-8', accessToken: 'renderer-secret' }
    );
    expect(detailResult).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(gateway.getConversation).not.toHaveBeenCalled();
  });
});
