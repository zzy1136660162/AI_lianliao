import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  CustomerServiceConversation,
  CustomerServiceMessage,
  CustomerServiceServerEnvelope,
} from '@/common/enterprise/customer-service/contracts';
import CustomerConsultationPage from '@/renderer/pages/enterprise/customerConsultation/CustomerConsultationPage';
import type { CustomerConsultationClient } from '@/renderer/services/enterprise/customer-consultation';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: vi.fn(() => true) });
});

afterEach(cleanup);

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
  staffFirstReplyAt: 1_700_000_000_000,
  lastMessageId: '-20',
  lastMessageAt: 1_700_000_000_000,
  staffUnreadCount: 0,
  lastMessageType: 'TEXT',
  lastMessagePreview: '已有问题',
  customerLastReadId: null,
  staffLastReadId: null,
  assignmentVersion: 0,
  version: 0,
  closedByType: null,
  closedById: null,
  closedReason: null,
  closedAt: null,
  assignedAt: 1_700_000_000_000,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

const historyMessage: CustomerServiceMessage = {
  messageId: '-20',
  conversationId: '-8',
  clientMessageId: '11111111-1111-4111-8111-111111111111',
  senderType: 'CUSTOMER',
  senderUserId: '-7',
  senderName: '企业用户',
  messageType: 'TEXT',
  textContent: '已有问题',
  image: null,
  assignmentVersion: 0,
  createdAt: 1_700_000_000_000,
};

const createClient = () => {
  let listener: ((event: CustomerServiceServerEnvelope) => void) | null = null;
  const client: CustomerConsultationClient & { emit: (event: CustomerServiceServerEnvelope) => void } = {
    connect: vi.fn(async () => ({ state: 'CONNECTED' as const, reconnectAttempt: 0, unreadCount: 0 })),
    disconnect: vi.fn(async () => undefined),
    openConversation: vi.fn(async () => conversation),
    startConversation: vi.fn(async () => conversation),
    getConversation: vi.fn(async () => conversation),
    getHistory: vi.fn(async () => ({ items: [historyMessage], nextCursor: null, hasMore: false })),
    sendMessage: vi.fn(async () => '33333333-3333-4333-8333-333333333333'),
    markRead: vi.fn(async ({ messageId }) => ({ advanced: true, lastReadMessageId: messageId })),
    uploadImage: vi.fn(async () => ({
      url: 'https://www.lslnii.com/upload/customer-service/test.png',
      width: 1,
      height: 1,
      sizeBytes: '1',
      mimeType: 'image/png',
    })),
    closeConversation: vi.fn(async () => ({ ...conversation, status: 'CLOSED' as const, version: 1 })),
    onEvent: vi.fn((nextListener) => {
      listener = nextListener;
      return () => {
        listener = null;
      };
    }),
    emit: (event) => listener?.(event),
  };
  return client;
};

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('CustomerConsultationPage', () => {
  it('initializes the customer conversation and keeps the timeline independently scrollable', async () => {
    const client = createClient();
    render(<CustomerConsultationPage client={client} />);

    expect(await screen.findByText('已有问题')).toBeVisible();
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.openConversation).toHaveBeenCalledTimes(1);
    expect(client.getHistory).toHaveBeenCalledWith({ conversationId: '-8', limit: 50 });
    expect(screen.getByTestId('customer-consultation-timeline')).toHaveStyle({ overflowY: 'auto' });
  });

  it('sends customer text and renders a realtime staff reply', async () => {
    const client = createClient();
    render(<CustomerConsultationPage client={client} />);
    await screen.findByText('已有问题');

    const input = screen.getByPlaceholderText('enterprise.consultation.composer.placeholder');
    await userEvent.type(input, '请介绍会员服务');
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.consultation.composer.send' }));
    expect(client.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: '-8', messageType: 'TEXT', textContent: '请介绍会员服务' })
    );

    client.emit({
      event: 'message.created',
      eventId: 'event-staff-1',
      conversationId: '-8',
      serverTime: 1_700_000_000_100,
      payload: {
        ...historyMessage,
        messageId: '-21',
        clientMessageId: '22222222-2222-4222-8222-222222222222',
        senderType: 'STAFF',
        senderUserId: '-19',
        senderName: '链辽客服',
        textContent: '您好，我来为您介绍。',
      },
    });

    expect(await screen.findByText('您好，我来为您介绍。')).toBeVisible();
    await waitFor(() => expect(client.markRead).toHaveBeenCalledWith({ conversationId: '-8', messageId: '-21' }));
  });

  it('marks an optimistic message failed when the server rejects its send request', async () => {
    const client = createClient();
    render(<CustomerConsultationPage client={client} />);
    await screen.findByTestId('customer-consultation-timeline');

    const input = screen.getByPlaceholderText('enterprise.consultation.composer.placeholder');
    await userEvent.type(input, 'send-failure-regression');
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.consultation.composer.send' }));
    await screen.findByText('send-failure-regression');

    client.emit({
      event: 'error',
      eventId: 'send-failure-event',
      requestId: '33333333-3333-4333-8333-333333333333',
      conversationId: '-8',
      serverTime: 1_700_000_000_050,
      payload: { code: 'INTERNAL_ERROR', message: 'service unavailable' },
    });

    expect(await screen.findByText('enterprise.consultation.delivery.failed')).toBeVisible();
    expect(screen.getByText('enterprise.consultation.actions.retryMessage')).toBeVisible();
  });

  it('keeps the main-process connection alive after leaving the consultation route', async () => {
    const client = createClient();
    const { unmount } = render(<CustomerConsultationPage client={client} />);
    await screen.findByText('已有问题');

    unmount();

    // The gateway must keep receiving replies for desktop notifications while
    // the user works on another enterprise route. Enterprise logout owns the
    // actual token, unread and socket cleanup in the main process.
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('backfills messages after the socket becomes ready and after reconnecting', async () => {
    const client = createClient();
    const recoveredMessage: CustomerServiceMessage = {
      ...historyMessage,
      messageId: '-22',
      clientMessageId: '44444444-4444-4444-8444-444444444444',
      senderType: 'STAFF',
      senderUserId: '-19',
      textContent: 'recovered-after-reconnect',
      createdAt: 1_700_000_000_200,
    };
    vi.mocked(client.getHistory)
      .mockResolvedValueOnce({ items: [historyMessage], nextCursor: null, hasMore: false })
      .mockResolvedValueOnce({ items: [historyMessage], nextCursor: null, hasMore: false })
      .mockResolvedValueOnce({ items: [historyMessage, recoveredMessage], nextCursor: null, hasMore: false });
    render(<CustomerConsultationPage client={client} />);
    await screen.findByTestId('customer-consultation-timeline');
    await waitFor(() => expect(client.getHistory).toHaveBeenCalledTimes(2));

    client.emit({
      event: 'connection.ready',
      eventId: 'ready-after-reconnect',
      conversationId: null,
      serverTime: 1_700_000_000_300,
      payload: {
        connectionId: 'connection-2',
        identity: {
          type: 'CUSTOMER',
          userId: '-7',
          displayName: '企业用户',
          companyId: '-18',
          companyName: '沈阳航燃科技有限公司',
        },
        heartbeatIntervalSeconds: 30,
        presenceTimeoutSeconds: 90,
      },
    });

    expect(await screen.findByText('recovered-after-reconnect')).toBeVisible();
    expect(client.getHistory).toHaveBeenCalledTimes(3);
  });

  it('runs a trailing history sync when ready arrives during an in-flight sync', async () => {
    const client = createClient();
    const pendingSync = deferred<{ items: CustomerServiceMessage[]; nextCursor: null; hasMore: false }>();
    const trailingMessage: CustomerServiceMessage = {
      ...historyMessage,
      messageId: '-24',
      clientMessageId: '99999999-9999-4999-8999-999999999999',
      senderType: 'STAFF',
      senderUserId: '-19',
      textContent: 'trailing-ready-reply',
      createdAt: 1_700_000_000_600,
    };
    vi.mocked(client.getHistory)
      .mockResolvedValueOnce({ items: [historyMessage], nextCursor: null, hasMore: false })
      .mockImplementationOnce(() => pendingSync.promise)
      .mockResolvedValueOnce({ items: [historyMessage, trailingMessage], nextCursor: null, hasMore: false });
    render(<CustomerConsultationPage client={client} />);
    await waitFor(() => expect(client.getHistory).toHaveBeenCalledTimes(2));

    client.emit({
      event: 'connection.ready',
      eventId: 'ready-during-sync',
      conversationId: null,
      serverTime: 1_700_000_000_700,
      payload: {
        connectionId: 'connection-3',
        identity: {
          type: 'CUSTOMER',
          userId: '-7',
          displayName: '企业用户',
          companyId: '-18',
          companyName: '沈阳航燃科技有限公司',
        },
        heartbeatIntervalSeconds: 30,
        presenceTimeoutSeconds: 90,
      },
    });
    expect(client.getHistory).toHaveBeenCalledTimes(2);
    pendingSync.resolve({ items: [historyMessage], nextCursor: null, hasMore: false });

    expect(await screen.findByText('trailing-ready-reply')).toBeVisible();
    expect(client.getHistory).toHaveBeenCalledTimes(3);
  });

  it('requires confirmation before ending a consultation', async () => {
    const client = createClient();
    render(<CustomerConsultationPage client={client} />);
    await screen.findByTestId('customer-consultation-timeline');

    await userEvent.click(screen.getByRole('button', { name: 'enterprise.consultation.actions.close' }));
    expect(client.closeConversation).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.consultation.closeConfirm.confirm' }));

    await waitFor(() =>
      expect(client.closeConversation).toHaveBeenCalledWith({ conversationId: '-8', expectedVersion: 0 })
    );
  });

  it('accepts a server-closed snapshot after a close version conflict without showing an error', async () => {
    const client = createClient();
    vi.mocked(client.closeConversation).mockRejectedValueOnce(new Error('version conflict'));
    vi.mocked(client.getConversation).mockResolvedValueOnce({
      ...conversation,
      status: 'CLOSED',
      version: 1,
      closedReason: 'STAFF_CLOSED',
      closedAt: 1_700_000_000_500,
    });
    render(<CustomerConsultationPage client={client} />);
    await screen.findByTestId('customer-consultation-timeline');

    await userEvent.click(screen.getByRole('button', { name: 'enterprise.consultation.actions.close' }));
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.consultation.closeConfirm.confirm' }));

    expect(await screen.findByText('enterprise.consultation.actions.startNew')).toBeVisible();
    expect(screen.queryByText('enterprise.consultation.errors.close')).not.toBeInTheDocument();
  });

  it('does not mark a background reply read until the window becomes visible and focused', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    const client = createClient();
    render(<CustomerConsultationPage client={client} />);
    await screen.findByTestId('customer-consultation-timeline');
    vi.mocked(client.markRead).mockClear();
    client.emit({
      event: 'message.created',
      eventId: 'background-staff-reply',
      conversationId: '-8',
      serverTime: 1_700_000_000_400,
      payload: {
        ...historyMessage,
        messageId: '-23',
        clientMessageId: '88888888-8888-4888-8888-888888888888',
        senderType: 'STAFF',
        senderUserId: '-19',
        textContent: 'background-reply',
      },
    });

    await screen.findByText('background-reply');
    expect(client.markRead).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    fireEvent(document, new Event('visibilitychange'));

    await waitFor(() => expect(client.markRead).toHaveBeenCalledWith({ conversationId: '-8', messageId: '-23' }));
  });
});
