import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CustomerServiceConversation } from '@/common/enterprise/customer-service/contracts';
import {
  CustomerServiceApiClient,
  resolveCustomerServiceApiClientOptions,
} from '@process/services/enterprise/customer-service/customerServiceApiClient';

const conversation: CustomerServiceConversation = {
  conversationId: '-8',
  status: 'ACTIVE',
  customerUserId: '-7',
  customerName: '测试客户',
  customerTel: null,
  customerCompanyId: '-18',
  customerCompanyName: '沈阳航燃科技有限公司',
  staffUserId: '-19',
  staffName: '客服人员',
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

const commonResult = (data: unknown): Response =>
  new Response(JSON.stringify({ code: 2000, message: '操作成功', data, success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => {
  vi.useRealTimers();
});

describe('CustomerServiceApiClient', () => {
  it('uses only the fixed local development and production origins', () => {
    expect(resolveCustomerServiceApiClientOptions(false)).toEqual({
      baseUrl: 'http://127.0.0.1:12580/',
      environment: 'development',
    });
    expect(resolveCustomerServiceApiClientOptions(true)).toEqual({
      baseUrl: 'https://cloud.lslnii.com/',
      environment: 'production',
    });
  });

  it('unwraps CommonResult and sends the access token only as a Bearer header', async () => {
    const requests: Array<{ init: RequestInit; url: string }> = [];
    const client = new CustomerServiceApiClient({
      environment: 'development',
      transport: async (url, init) => {
        requests.push({ init, url });
        return commonResult({ items: [conversation], nextCursor: '-8', hasMore: false });
      },
    });

    const page = await client.listConversations('main-process-secret', { limit: 20 });

    expect(page.items[0]?.conversationId).toBe('-8');
    expect(requests[0]?.url).toBe('http://127.0.0.1:12580/cloud-api/CustomerServiceController/conversation/list');
    expect(new Headers(requests[0]?.init.headers).get('Authorization')).toBe('Bearer main-process-secret');
  });

  it('aborts a request at the configured deadline', async () => {
    vi.useFakeTimers();
    const client = new CustomerServiceApiClient({
      environment: 'development',
      timeoutMs: 25,
      transport: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    });

    const request = client.listConversations('main-process-secret', {});
    const rejection = expect(request).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
  });

  it('rejects malformed response identifiers instead of coercing numbers', async () => {
    const client = new CustomerServiceApiClient({
      environment: 'development',
      transport: async () => commonResult({ items: [{ ...conversation, conversationId: -8 }], hasMore: false }),
    });

    await expect(client.listConversations('main-process-secret', {})).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
