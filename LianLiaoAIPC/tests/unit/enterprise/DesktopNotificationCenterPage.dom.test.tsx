import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { DesktopNotificationClient } from '@/renderer/services/enterprise/desktop-notification/desktopNotificationClient';
import DesktopNotificationCenterPage from '@/renderer/pages/enterprise/notifications/DesktopNotificationCenterPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-CN' } }),
}));

const client: DesktopNotificationClient = {
  connect: vi.fn(async () => ({ state: 'CONNECTED', reconnectAttempt: 0, unreadCount: 1 })),
  disconnect: vi.fn(async () => undefined),
  getUnreadCount: vi.fn(async () => ({ unreadCount: 1 })),
  list: vi.fn(async () => ({
    items: [
      {
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
        deliveryStatus: 'DELIVERED',
      },
    ],
    nextBeforeRecipientId: null,
  })),
  markAllRead: vi.fn(async () => ({ changedCount: 1 })),
  markRead: vi.fn(async () => ({ changed: true })),
  onEvent: vi.fn(() => () => undefined),
  onUnreadCount: vi.fn((listener) => {
    listener(1);
    return () => undefined;
  }),
};

const LocationProbe = () => {
  const location = useLocation();
  return <output aria-label='location'>{location.pathname}</output>;
};

const renderPage = (initialEntry = '/enterprise/notifications') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path='/enterprise/notifications' element={<DesktopNotificationCenterPage client={client} />} />
        <Route path='/enterprise/projects/:hpInfoId' element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );

describe('DesktopNotificationCenterPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads the persisted inbox and marks a notification read before following its fixed action route', async () => {
    renderPage();

    expect(await screen.findByText('有新的在建项目潜在商机')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.notifications.actions.open' }));

    await waitFor(() => expect(client.markRead).toHaveBeenCalledWith({ notificationId: '101' }));
    expect(client.getUnreadCount).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('location')).toHaveTextContent('/enterprise/projects/-9');
  });

  it('marks every notification as read without requesting a raw account identity', async () => {
    renderPage();
    await screen.findByText('有新的在建项目潜在商机');

    await userEvent.click(screen.getByRole('button', { name: 'enterprise.notifications.actions.markAllRead' }));

    await waitFor(() => expect(client.markAllRead).toHaveBeenCalledTimes(1));
    expect(client.getUnreadCount).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(client.markAllRead.mock.calls)).not.toContain('openId');
  });

  it('marks a plain-text system announcement read before opening its line-preserving detail', async () => {
    vi.mocked(client.list).mockResolvedValueOnce({
      items: [
        {
          recipientId: '202',
          notificationId: '-102',
          type: 'SYSTEM_ANNOUNCEMENT',
          priority: 'HIGH',
          title: 'Service notice',
          content: 'First line\nSecond line',
          contentType: 'TEXT',
          extensionJson: null,
          action: 'OPEN_NOTIFICATION_DETAIL',
          businessId: null,
          createTime: 1_700_000_000_000,
          readAt: null,
          deliveryStatus: 'DELIVERED',
        },
      ],
      nextBeforeRecipientId: null,
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'enterprise.notifications.actions.open' }));

    await waitFor(() => expect(client.markRead).toHaveBeenCalledWith({ notificationId: '-102' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeVisible();
    expect(screen.getByTestId('notification-detail-body')).toHaveStyle({ whiteSpace: 'pre-wrap' });
    expect(within(dialog).getByText(/First line\s+Second line/)).toBeVisible();
  });

  it('loads additional pages to open a notification selected by the signed query parameter', async () => {
    vi.mocked(client.list)
      .mockResolvedValueOnce({ items: [], nextBeforeRecipientId: '-300' })
      .mockResolvedValueOnce({
        items: [
          {
            recipientId: '-300',
            notificationId: '-103',
            type: 'SYSTEM_ANNOUNCEMENT',
            priority: 'NORMAL',
            title: 'Selected notice',
            content: 'Selected content',
            contentType: 'TEXT',
            extensionJson: null,
            action: 'OPEN_NOTIFICATION_DETAIL',
            businessId: null,
            createTime: 1_700_000_000_000,
            readAt: 1_700_000_000_100,
            deliveryStatus: 'DELIVERED',
          },
        ],
        nextBeforeRecipientId: null,
      });

    renderPage('/enterprise/notifications?notificationId=-103');

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText('Selected content')).toBeVisible();
    expect(client.list).toHaveBeenNthCalledWith(1, { limit: 20 });
    expect(client.list).toHaveBeenNthCalledWith(2, { beforeRecipientId: '-300', limit: 20 });
  });

  it('shows a localized unavailable state when the selected notification cannot be found', async () => {
    vi.mocked(client.list).mockResolvedValueOnce({ items: [], nextBeforeRecipientId: null });

    renderPage('/enterprise/notifications?notificationId=-999');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('enterprise.notifications.detail.unavailable')).toBeVisible();
  });
});
