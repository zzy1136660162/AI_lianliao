import { Robot } from '@icon-park/react';
import { Button, Modal } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { CUSTOMER_SERVICE_NAVIGATE_CHANNEL } from '@/common/enterprise/customer-service/constants';
import { customerServiceNavigationDetailSchema } from '@/common/enterprise/customer-service/schemas';
import { desktopNotificationClient } from '@/renderer/services/enterprise/desktop-notification/desktopNotificationClient';
import { desktopVersionClient } from '@/renderer/services/enterprise/desktop-version/desktopVersionClient';
import type {
  DesktopVersionDownloadResult,
  DesktopVersionRelease,
} from '@/common/enterprise/desktop-version/contracts';

import EnterpriseAntdProvider from './EnterpriseAntdProvider';
import EnterpriseHeader from './EnterpriseHeader';
import EnterpriseSider from './EnterpriseSider';
import EnterpriseWindowChrome from './EnterpriseWindowChrome';
import './enterprise-shell.css';

/** Three-column enterprise workspace with a separately collapsible assistant slot. */
const EnterpriseShell: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [forcedRelease, setForcedRelease] = useState<DesktopVersionRelease | null>(null);
  const [forceDownloading, setForceDownloading] = useState(false);
  const [forceDownloadFailed, setForceDownloadFailed] = useState(false);
  const [forceDownloaded, setForceDownloaded] = useState<DesktopVersionDownloadResult | null>(null);
  const [forceOpening, setForceOpening] = useState(false);
  const isCustomerServiceRoute = location.pathname.startsWith('/enterprise/customer-service');
  const isCustomerConsultationRoute = location.pathname.startsWith('/enterprise/consultation');
  const isRealtimeServiceRoute = isCustomerServiceRoute || isCustomerConsultationRoute;
  const effectiveAssistantOpen = assistantOpen && !isRealtimeServiceRoute;

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [location.pathname]);

  useEffect(() => {
    const handleCustomerServiceNavigation = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const detail = customerServiceNavigationDetailSchema.safeParse(event.detail);
      if (!detail.success) return;
      const search = new URLSearchParams({ conversationId: detail.data.conversationId });
      void navigate(`/enterprise/customer-service?${search.toString()}`);
    };
    window.addEventListener(CUSTOMER_SERVICE_NAVIGATE_CHANNEL, handleCustomerServiceNavigation);
    return () => window.removeEventListener(CUSTOMER_SERVICE_NAVIGATE_CHANNEL, handleCustomerServiceNavigation);
  }, [navigate]);

  /** Keeps the main-process notification gateway connected for the complete enterprise workbench session. */
  useEffect(() => {
    let active = true;
    void desktopNotificationClient
      .connect()
      .then((snapshot) => active && setNotificationUnreadCount(snapshot.unreadCount))
      .catch((): undefined => undefined);
    void desktopNotificationClient
      .getUnreadCount()
      .then((result) => active && setNotificationUnreadCount(result.unreadCount))
      .catch((): undefined => undefined);
    const unsubscribe = desktopNotificationClient.onEvent((event) => {
      if (!active) return;
      if (event.event === 'notification.created') {
        setNotificationUnreadCount((current) => current + 1);
      } else if (event.event === 'notification.badge') {
        const payload = event.payload as { unreadCount: number };
        setNotificationUnreadCount(payload.unreadCount);
      } else if (event.event === 'notification.read') {
        void desktopNotificationClient
          .getUnreadCount()
          .then((result) => active && setNotificationUnreadCount(result.unreadCount))
          .catch((): undefined => undefined);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  /** A forced release blocks only after the trusted main process confirms a newer compatible package. */
  useEffect(() => {
    let active = true;
    void desktopVersionClient
      .check()
      .then((result) => {
        if (active && result.updateAvailable && result.release?.forceUpdate) setForcedRelease(result.release);
      })
      .catch((): undefined => undefined);
    return () => {
      active = false;
    };
  }, []);

  const downloadForcedRelease = async (): Promise<void> => {
    setForceDownloading(true);
    setForceDownloadFailed(false);
    try {
      setForceDownloaded(await desktopVersionClient.download());
      // The requirement is satisfied after user-confirmed download completes; installation remains a user action.
      setForcedRelease(null);
    } catch {
      setForceDownloadFailed(true);
    } finally {
      setForceDownloading(false);
    }
  };

  const openForcedInstaller = async (): Promise<void> => {
    setForceOpening(true);
    try {
      const result = await desktopVersionClient.openDownloaded();
      if (!result.opened) throw new Error('installer was not opened');
      setForceDownloaded(null);
    } catch {
      setForceDownloadFailed(true);
    } finally {
      setForceOpening(false);
    }
  };

  return (
    <EnterpriseAntdProvider>
      <div
        className={`enterprise-shell${effectiveAssistantOpen ? '' : ' enterprise-shell--assistant-closed'}${
          isCustomerServiceRoute ? ' enterprise-shell--customer-service' : ''
        }${isCustomerConsultationRoute ? ' enterprise-shell--consultation' : ''}`}
      >
        <EnterpriseWindowChrome title={t('enterprise.shell.brand')} />
        <EnterpriseSider />
        <div className='enterprise-shell__workspace'>
          <EnterpriseHeader
            assistantOpen={effectiveAssistantOpen}
            assistantAvailable={!isRealtimeServiceRoute}
            notificationUnreadCount={notificationUnreadCount}
            onOpenNotifications={() => void navigate('/enterprise/notifications')}
            onToggleAssistant={() => setAssistantOpen((current) => !current)}
          />
          <div className='enterprise-shell__work-area'>
            <main
              ref={mainRef}
              className={`enterprise-shell__main${
                isCustomerServiceRoute ? ' enterprise-shell__main--customer-service' : ''
              }${isCustomerConsultationRoute ? ' enterprise-shell__main--consultation' : ''}`}
              aria-label={t('enterprise.accessibility.workspace')}
            >
              <Outlet />
            </main>
            <aside
              id='enterprise-assistant-panel'
              className='enterprise-assistant'
              aria-label={t('enterprise.accessibility.assistant')}
              aria-hidden={!effectiveAssistantOpen}
            >
              <div className='enterprise-assistant__index'>{t('enterprise.assistant.index')}</div>
              <Robot size={24} />
              <h2>{t('enterprise.assistant.title')}</h2>
              <p>{t('enterprise.assistant.description')}</p>
            </aside>
          </div>
        </div>
      </div>
      <Modal
        closable={false}
        footer={null}
        keyboard={false}
        maskClosable={false}
        open={forcedRelease !== null}
        title={t('enterprise.versionUpdate.force')}
      >
        <p>{t('enterprise.versionUpdate.forceDescription')}</p>
        {forcedRelease ? (
          <p>{t('enterprise.versionUpdate.latestVersion', { version: forcedRelease.versionName })}</p>
        ) : null}
        {forceDownloadFailed ? <p role='alert'>{t('enterprise.versionUpdate.downloadFailed')}</p> : null}
        <Button type='primary' loading={forceDownloading} onClick={() => void downloadForcedRelease()}>
          {t('enterprise.versionUpdate.actions.download')}
        </Button>
      </Modal>
      <Modal
        open={forceDownloaded !== null}
        title={t('enterprise.versionUpdate.openPromptTitle')}
        okText={t('enterprise.versionUpdate.actions.open')}
        cancelText={t('enterprise.versionUpdate.actions.later')}
        confirmLoading={forceOpening}
        onCancel={() => setForceDownloaded(null)}
        onOk={() => void openForcedInstaller()}
      >
        <p>{t('enterprise.versionUpdate.downloadComplete', { path: forceDownloaded?.filePath ?? '' })}</p>
        <p>{t('enterprise.versionUpdate.openPromptDescription')}</p>
        {forceDownloadFailed ? <p role='alert'>{t('enterprise.versionUpdate.openFailed')}</p> : null}
      </Modal>
    </EnterpriseAntdProvider>
  );
};

export default EnterpriseShell;
