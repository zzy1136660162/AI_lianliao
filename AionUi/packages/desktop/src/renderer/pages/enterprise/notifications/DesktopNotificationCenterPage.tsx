import { Button, Modal, Spin, Tag } from '@arco-design/web-react';
import { CheckOne, DoubleRight, Refresh, Right } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import type {
  DesktopNotificationAction,
  DesktopNotificationInboxItem,
} from '@/common/enterprise/desktop-notification/contracts';
import { desktopNotificationBusinessIdSchema } from '@/common/enterprise/desktop-notification/schemas';
import {
  desktopNotificationClient,
  type DesktopNotificationClient,
} from '@/renderer/services/enterprise/desktop-notification/desktopNotificationClient';

import styles from './desktop-notification-center.module.css';

export type DesktopNotificationCenterPageProps = {
  client?: DesktopNotificationClient;
};

const typeLabelKey = (type: DesktopNotificationInboxItem['type']): string =>
  `enterprise.notifications.types.${type.toLowerCase()}`;

const actionRoute = (action: DesktopNotificationAction | null, businessId: string | null): string | undefined => {
  const hasBusinessId = desktopNotificationBusinessIdSchema.safeParse(businessId).success;
  switch (action) {
    case 'OPEN_SUPPLY_DEMAND':
      return '/enterprise/supply-demand';
    case 'OPEN_PROJECT':
      return hasBusinessId ? `/enterprise/projects/${businessId}` : undefined;
    case 'OPEN_COMPANY':
      return hasBusinessId ? `/enterprise/companies/${businessId}` : undefined;
    case 'OPEN_PRODUCT':
      return hasBusinessId ? `/enterprise/products/${businessId}` : undefined;
    case 'OPEN_MEMBERSHIP':
      return '/enterprise/dashboard';
    case 'OPEN_CUSTOMER_SERVICE':
      return hasBusinessId ? `/enterprise/customer-service?conversationId=${businessId}` : undefined;
    case 'OPEN_VERSION_UPDATE':
      return '/enterprise/version-update';
    default:
      return undefined;
  }
};

const displayTime = (value: number | null, locale: string): string => {
  if (value === null) return '';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return '';
  }
};

/** Electron-only notification center. Its data comes exclusively through the hardened preload client. */
const DesktopNotificationCenterPage: React.FC<DesktopNotificationCenterPageProps> = ({
  client = desktopNotificationClient,
}) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedNotificationId = useMemo(() => {
    const parsed = desktopNotificationBusinessIdSchema.safeParse(searchParams.get('notificationId'));
    return parsed.success ? parsed.data : undefined;
  }, [searchParams]);
  const [items, setItems] = useState<DesktopNotificationInboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [pendingNotificationId, setPendingNotificationId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<DesktopNotificationInboxItem | null>(null);
  const [detailUnavailable, setDetailUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const loadedItems: DesktopNotificationInboxItem[] = [];
      let beforeRecipientId: string | undefined;
      let selectedItem: DesktopNotificationInboxItem | undefined;
      const maximumPages = requestedNotificationId ? 5 : 1;

      for (let pageIndex = 0; pageIndex < maximumPages; pageIndex += 1) {
        // Cursor pagination is intentionally sequential because each request depends on the previous response.
        // eslint-disable-next-line no-await-in-loop
        const page = await client.list({
          ...(beforeRecipientId ? { beforeRecipientId } : {}),
          limit: 20,
        });
        loadedItems.push(...page.items);
        selectedItem = requestedNotificationId
          ? loadedItems.find((item) => item.notificationId === requestedNotificationId)
          : undefined;
        if (selectedItem || !requestedNotificationId || !page.nextBeforeRecipientId) break;
        beforeRecipientId = page.nextBeforeRecipientId;
      }

      let unread = await client.getUnreadCount();
      if (requestedNotificationId) {
        if (selectedItem?.contentType === 'TEXT') {
          if (selectedItem.readAt === null) {
            const result = await client.markRead({ notificationId: selectedItem.notificationId });
            if (result.changed) {
              selectedItem = { ...selectedItem, readAt: Date.now() };
              unread = { unreadCount: Math.max(0, unread.unreadCount - 1) };
            }
          }
          setDetailItem(selectedItem);
          setDetailUnavailable(false);
        } else {
          setDetailItem(null);
          setDetailUnavailable(true);
        }
      }
      setItems(
        selectedItem
          ? loadedItems.map((item) => (item.notificationId === selectedItem.notificationId ? selectedItem : item))
          : loadedItems
      );
      setUnreadCount(unread.unreadCount);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [client, requestedNotificationId]);

  useEffect(() => {
    let active = true;
    void client.connect().catch((): undefined => undefined);
    void load();
    const unsubscribe = client.onEvent((event) => {
      if (!active) return;
      if (event.event === 'notification.created') {
        const notification = event.payload as DesktopNotificationInboxItem;
        setItems((current) => {
          if (current.some((item) => item.notificationId === notification.notificationId)) return current;
          return [notification, ...current].slice(0, 50);
        });
        setUnreadCount((current) => current + 1);
      } else if (event.event === 'notification.badge') {
        const payload = event.payload as { unreadCount: number };
        setUnreadCount(payload.unreadCount);
      } else if (event.event === 'notification.read') {
        void client
          .getUnreadCount()
          .then((result): void => {
            if (active) setUnreadCount(result.unreadCount);
          })
          .catch((): undefined => undefined);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [client, load]);

  const unreadItems = useMemo(() => items.filter((item) => item.readAt === null), [items]);

  const markReadAndOpen = async (item: DesktopNotificationInboxItem): Promise<void> => {
    if (pendingNotificationId) return;
    setPendingNotificationId(item.notificationId);
    try {
      let openedItem = item;
      if (item.readAt === null) {
        const result = await client.markRead({ notificationId: item.notificationId });
        if (result.changed) {
          setItems((current) =>
            current.map((currentItem) =>
              currentItem.notificationId === item.notificationId ? { ...currentItem, readAt: Date.now() } : currentItem
            )
          );
          setUnreadCount((current) => Math.max(0, current - 1));
          openedItem = { ...item, readAt: Date.now() };
        }
      }
      if (item.action === 'OPEN_NOTIFICATION_DETAIL' && item.contentType === 'TEXT') {
        setDetailItem(openedItem);
        setDetailUnavailable(false);
        return;
      }
      const route = actionRoute(item.action, item.businessId);
      if (route) void navigate(route);
    } finally {
      setPendingNotificationId(null);
    }
  };

  const closeDetail = (): void => {
    setDetailItem(null);
    setDetailUnavailable(false);
    if (!requestedNotificationId) return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('notificationId');
    setSearchParams(nextSearchParams, { replace: true });
  };

  const markAllRead = async (): Promise<void> => {
    if (markingAll || unreadItems.length === 0) return;
    setMarkingAll(true);
    try {
      const result = await client.markAllRead();
      if (result.changedCount > 0) {
        const now = Date.now();
        setItems((current) => current.map((item) => (item.readAt === null ? { ...item, readAt: now } : item)));
        setUnreadCount(0);
      }
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <section className={styles.page} aria-labelledby='desktop-notification-center-title'>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{t('enterprise.notifications.eyebrow')}</span>
          <h1 id='desktop-notification-center-title'>{t('enterprise.notifications.title')}</h1>
          <p>{t('enterprise.notifications.description')}</p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.unread}>{t('enterprise.notifications.unreadCount', { count: unreadCount })}</span>
          <Button icon={<Refresh size={15} />} onClick={() => void load()} loading={loading}>
            {t('enterprise.notifications.actions.refresh')}
          </Button>
          <Button
            type='primary'
            icon={<CheckOne size={15} />}
            disabled={unreadItems.length === 0}
            loading={markingAll}
            onClick={() => void markAllRead()}
          >
            {t('enterprise.notifications.actions.markAllRead')}
          </Button>
        </div>
      </header>

      <div className={styles.panel}>
        {loading ? (
          <div className={styles.state} role='status'>
            <Spin size={32} />
            <span>{t('enterprise.notifications.loading')}</span>
          </div>
        ) : failed ? (
          <div className={styles.state} role='alert'>
            <strong>{t('enterprise.notifications.error.title')}</strong>
            <span>{t('enterprise.notifications.error.description')}</span>
            <Button type='primary' onClick={() => void load()}>
              {t('enterprise.actions.retry')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.state}>
            <strong>{t('enterprise.notifications.empty.title')}</strong>
            <span>{t('enterprise.notifications.empty.description')}</span>
          </div>
        ) : (
          <ul className={styles.list} aria-label={t('enterprise.notifications.listLabel')}>
            {items.map((item) => {
              const unread = item.readAt === null;
              const hasAction =
                (item.action === 'OPEN_NOTIFICATION_DETAIL' && item.contentType === 'TEXT') ||
                actionRoute(item.action, item.businessId) !== undefined;
              return (
                <li key={item.notificationId} className={`${styles.item}${unread ? ` ${styles.itemUnread}` : ''}`}>
                  <div className={styles.itemMain}>
                    <div className={styles.itemMeta}>
                      <Tag color={item.priority === 'URGENT' || item.priority === 'HIGH' ? 'volcano' : 'blue'}>
                        {t(typeLabelKey(item.type))}
                      </Tag>
                      {unread ? <span className={styles.unreadDot}>{t('enterprise.notifications.unread')}</span> : null}
                      <time dateTime={item.createTime === null ? undefined : new Date(item.createTime).toISOString()}>
                        {displayTime(item.createTime, i18n?.language || 'zh-CN')}
                      </time>
                    </div>
                    <strong>{item.title}</strong>
                    {item.content ? <p>{item.content}</p> : null}
                  </div>
                  <div className={styles.itemActions}>
                    {hasAction ? (
                      <Button
                        type='text'
                        icon={<Right size={15} />}
                        loading={pendingNotificationId === item.notificationId}
                        onClick={() => void markReadAndOpen(item)}
                      >
                        {t('enterprise.notifications.actions.open')}
                      </Button>
                    ) : unread ? (
                      <Button
                        type='text'
                        icon={<DoubleRight size={15} />}
                        loading={pendingNotificationId === item.notificationId}
                        onClick={() => void markReadAndOpen(item)}
                      >
                        {t('enterprise.notifications.actions.markRead')}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Modal
        visible={detailItem !== null || detailUnavailable}
        title={detailItem?.title || t('enterprise.notifications.detail.title')}
        footer={null}
        onCancel={closeDetail}
        autoFocus={false}
        focusLock={false}
        unmountOnExit
      >
        {detailItem ? (
          <div
            className={styles.plainTextBody}
            data-testid='notification-detail-body'
            style={{ whiteSpace: 'pre-wrap' }}
          >
            {detailItem.content || ''}
          </div>
        ) : (
          <div className={styles.detailUnavailable}>{t('enterprise.notifications.detail.unavailable')}</div>
        )}
      </Modal>
    </section>
  );
};

export default DesktopNotificationCenterPage;
