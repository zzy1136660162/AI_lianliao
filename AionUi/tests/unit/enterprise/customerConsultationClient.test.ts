import { describe, expect, it, vi } from 'vitest';

import type { ElectronBridgeAPI } from '@/common/types/platform/electron';
import { createCustomerConsultationClient } from '@/renderer/services/enterprise/customer-consultation/customerConsultationClient';
import type { CustomerConsultationRendererError } from '@/renderer/services/enterprise/customer-consultation/customerConsultationClient';

type RawBridge = NonNullable<ElectronBridgeAPI['customerConsultation']>;

const makeBridge = (): RawBridge => ({
  connect: vi.fn(async () => ({ ok: true, data: { state: 'CONNECTED', reconnectAttempt: 0, unreadCount: 0 } })),
  disconnect: vi.fn(async () => ({ ok: true, data: undefined })),
  openConversation: vi.fn(async () => ({
    ok: false,
    error: { code: 'REQUEST_FAILED', message: 'Customer-service request failed.' },
  })),
  startConversation: vi.fn(),
  getConversation: vi.fn(),
  getHistory: vi.fn(),
  sendMessage: vi.fn(),
  markRead: vi.fn(),
  uploadImage: vi.fn(),
  closeConversation: vi.fn(),
  onEvent: vi.fn(() => () => undefined),
});

describe('customerConsultationClient', () => {
  it('exposes no staff-only operations and maps fixed bridge failures', async () => {
    const bridge = makeBridge();
    const client = createCustomerConsultationClient(() => bridge);

    expect('listConversations' in client).toBe(false);
    expect('transferConversation' in client).toBe(false);
    await expect(client.openConversation()).rejects.toEqual(
      expect.objectContaining<CustomerConsultationRendererError>({ code: 'REQUEST_FAILED' })
    );
  });

  it('rejects malformed IPC successes instead of trusting preload output', async () => {
    const bridge = makeBridge();
    vi.mocked(bridge.connect).mockResolvedValue({ ok: true, data: { state: 'CONNECTED' } } as never);
    const client = createCustomerConsultationClient(() => bridge);

    await expect(client.connect()).rejects.toMatchObject({ code: 'INVALID_IPC_RESPONSE' });
  });
});
