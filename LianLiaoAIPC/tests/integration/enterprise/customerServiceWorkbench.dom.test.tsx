import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';

import { CUSTOMER_SERVICE_NAVIGATE_CHANNEL } from '@/common/enterprise/customer-service/constants';
import type {
  CustomerServiceConversation,
  CustomerServiceMessage,
  CustomerServiceServerEnvelope,
} from '@/common/enterprise/customer-service/contracts';
import EnterpriseShell from '@/renderer/pages/enterprise/layout/EnterpriseShell';
import CustomerServiceWorkbench from '@/renderer/pages/enterprise/customerService/CustomerServiceWorkbench';
import type { CustomerServiceClient } from '@/renderer/services/enterprise/customer-service';

const authMocks = vi.hoisted(() => ({ roleId: '19' as string | undefined }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/hooks/context/EnterpriseAuthContext', () => ({
  useEnterpriseAuth: () => ({
    status: 'authenticated',
    user: {
      registered: true,
      openId: 'must-not-render',
      userId: '-19',
      userName: '测试客服',
      companyId: '-18',
      companyName: '沈阳航燃科技有限公司',
      roleId: authMocks.roleId,
      customerServiceStaff: true,
    },
    logout: vi.fn(async () => true),
  }),
}));

vi.mock('@/renderer/pages/enterprise/layout/EnterpriseWindowChrome', () => ({
  default: () => <div data-testid='enterprise-window-chrome' />,
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
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  authMocks.roleId = '19';
});

const conversation = (
  conversationId: string,
  overrides: Partial<CustomerServiceConversation> = {}
): CustomerServiceConversation => ({
  conversationId,
  status: 'ACTIVE',
  customerUserId: '-7',
  customerName: conversationId === '-8' ? '张先生' : '李女士',
  customerTel: '138****2587',
  customerCompanyId: '-18',
  customerCompanyName: '沈阳航燃科技有限公司',
  staffUserId: '-19',
  staffName: '测试客服',
  allocationSource: '推广登记',
  staffFirstReplyAt: null,
  lastMessageId: '-2',
  lastMessageAt: 1_700_000_000_000,
  staffUnreadCount: 2,
  lastMessageType: 'TEXT',
  lastMessagePreview: '您好，我想了解企业服务',
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
  ...overrides,
});

const historyMessage: CustomerServiceMessage = {
  messageId: '-2',
  conversationId: '-8',
  clientMessageId: '11111111-1111-4111-8111-111111111111',
  senderType: 'CUSTOMER',
  senderUserId: '-7',
  senderName: '张先生',
  messageType: 'TEXT',
  textContent: '您好，我想了解企业服务',
  image: null,
  assignmentVersion: 1,
  createdAt: 1_700_000_000_000,
};

const createClient = (): CustomerServiceClient & { emit: (event: CustomerServiceServerEnvelope) => void } => {
  let listener: ((event: CustomerServiceServerEnvelope) => void) | null = null;
  return {
    connect: vi.fn(async () => ({ state: 'CONNECTED' as const, reconnectAttempt: 0, unreadCount: 2 })),
    disconnect: vi.fn(async () => undefined),
    listConversations: vi.fn(async (request) => ({
      items:
        request.status === 'CLOSED'
          ? [conversation('-10', { status: 'CLOSED', staffFirstReplyAt: 1_700_000_000_100 })]
          : [conversation('-8'), conversation('-9', { staffFirstReplyAt: 1_700_000_000_100, staffUnreadCount: 0 })],
      nextCursor: null,
      hasMore: false,
    })),
    getConversation: vi.fn(async ({ conversationId }) =>
      conversationId === '-10'
        ? conversation('-10', { status: 'CLOSED', staffFirstReplyAt: 1_700_000_000_100 })
        : conversation(conversationId)
    ),
    getHistory: vi.fn(async ({ conversationId }) => ({
      items: conversationId === '-8' ? [historyMessage] : [],
      nextCursor: null,
      hasMore: false,
    })),
    sendMessage: vi.fn(async () => '33333333-3333-4333-8333-333333333333'),
    markRead: vi.fn(async ({ messageId }) => ({ advanced: true, lastReadMessageId: messageId })),
    uploadImage: vi.fn(async () => ({
      url: 'https://www.lslnii.com/customer-service/evidence.png',
      width: 100,
      height: 100,
      sizeBytes: '1000',
      mimeType: 'image/png',
    })),
    listCandidates: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    transferConversation: vi.fn(async (request) =>
      conversation(request.conversationId, { staffUserId: request.targetStaffUserId })
    ),
    closeConversation: vi.fn(async (request) => conversation(request.conversationId, { status: 'CLOSED' })),
    onEvent: vi.fn((nextListener) => {
      listener = nextListener;
      return () => {
        listener = null;
      };
    }),
    emit: (event) => listener?.(event),
  };
};

const LocationProbe: React.FC = () => {
  const location = useLocation();
  return <div data-testid='location-probe'>{`${location.pathname}${location.search}`}</div>;
};

describe('desktop customer-service workbench', () => {
  it('selects a signed deep-link conversation and keeps all three work areas independently scrollable', async () => {
    const client = createClient();
    const { container } = render(
      <MemoryRouter initialEntries={['/enterprise/customer-service?conversationId=-8']}>
        <CustomerServiceWorkbench client={client} currentStaffUserId='-19' />
      </MemoryRouter>
    );

    expect((await screen.findAllByText('您好，我想了解企业服务'))[0]).toBeVisible();
    expect(client.getConversation).toHaveBeenCalledWith({ conversationId: '-8' });
    expect(screen.getByTestId('customer-service-queue-scroll')).toHaveStyle({ overflowY: 'auto' });
    expect(screen.getByTestId('customer-service-timeline-scroll')).toHaveStyle({ overflowY: 'auto' });
    expect(screen.getByTestId('customer-service-profile-scroll')).toHaveStyle({ overflowY: 'auto' });
    expect(screen.getByPlaceholderText('enterprise.customerService.composer.placeholder')).toHaveStyle({
      paddingBlockEnd: '26px',
      paddingInlineEnd: '72px',
      userSelect: 'text',
    });
    expect(container.querySelector('.arco-textarea-word-limit')).toHaveTextContent('0/2000');
    expect(screen.getByTestId('customer-service-workbench')).not.toHaveTextContent('must-not-render');
  });

  it('disables replies after selecting a closed conversation', async () => {
    const client = createClient();
    render(
      <MemoryRouter initialEntries={['/enterprise/customer-service']}>
        <CustomerServiceWorkbench client={client} currentStaffUserId='-19' />
      </MemoryRouter>
    );

    await screen.findAllByText('张先生');
    await userEvent.click(screen.getByRole('tab', { name: 'enterprise.customerService.queues.closed' }));
    await userEvent.click(await screen.findByRole('button', { name: /李女士/ }));

    expect(await screen.findByPlaceholderText('enterprise.customerService.composer.placeholder')).toBeDisabled();
    expect(screen.getByText('enterprise.customerService.composer.closed')).toBeVisible();
  });

  it('marks only the send request named by a server error as failed', async () => {
    const client = createClient();
    vi.mocked(client.sendMessage)
      .mockResolvedValueOnce('33333333-3333-4333-8333-333333333333')
      .mockResolvedValueOnce('44444444-4444-4444-8444-444444444444');
    render(
      <MemoryRouter initialEntries={['/enterprise/customer-service']}>
        <CustomerServiceWorkbench client={client} currentStaffUserId='-19' />
      </MemoryRouter>
    );
    await screen.findByTestId('customer-service-timeline-scroll');

    const input = screen.getByPlaceholderText('enterprise.customerService.composer.placeholder');
    await userEvent.type(input, 'first-pending-message');
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.customerService.composer.send' }));
    await userEvent.type(input, 'second-pending-message');
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.customerService.composer.send' }));
    await waitFor(() => expect(client.sendMessage).toHaveBeenCalledTimes(2));

    act(() => {
      client.emit({
        event: 'error',
        eventId: 'staff-send-error-1',
        requestId: '33333333-3333-4333-8333-333333333333',
        conversationId: '-8',
        serverTime: 1_700_000_000_300,
        payload: { code: 'INTERNAL_ERROR', message: 'service unavailable' },
      });
    });

    expect(await screen.findAllByText('enterprise.customerService.delivery.failed')).toHaveLength(1);
    expect(screen.getAllByText('enterprise.customerService.delivery.sending')).toHaveLength(1);
  });

  it('uses a full-width enterprise work area and shows the role-gated navigation entry', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/enterprise/customer-service']}>
        <Routes>
          <Route path='/enterprise' element={<EnterpriseShell />}>
            <Route path='customer-service' element={<Outlet />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(container.querySelector('.enterprise-shell')).toBeInTheDocument());
    expect(container.querySelector('.enterprise-shell')).toHaveClass('enterprise-shell--customer-service');
    expect(container.querySelector('.enterprise-shell__main')).toHaveClass('enterprise-shell__main--customer-service');
    expect(screen.getByRole('link', { name: 'enterprise.navigation.customerService' })).toBeVisible();
    expect(screen.getByLabelText('enterprise.accessibility.assistant')).toHaveAttribute('aria-hidden', 'true');
  });

  it('navigates to a signed conversation when preload dispatches a native-notification click', async () => {
    render(
      <MemoryRouter initialEntries={['/enterprise/dashboard']}>
        <Routes>
          <Route path='/enterprise' element={<EnterpriseShell />}>
            <Route path='dashboard' element={<LocationProbe />} />
            <Route path='customer-service' element={<LocationProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    window.dispatchEvent(
      new CustomEvent(CUSTOMER_SERVICE_NAVIGATE_CHANNEL, {
        detail: { conversationId: '0', route: '/guid' },
      })
    );
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/enterprise/dashboard');

    window.dispatchEvent(
      new CustomEvent(CUSTOMER_SERVICE_NAVIGATE_CHANNEL, {
        detail: { conversationId: '-8' },
      })
    );

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/enterprise/customer-service?conversationId=-8')
    );
  });
});
