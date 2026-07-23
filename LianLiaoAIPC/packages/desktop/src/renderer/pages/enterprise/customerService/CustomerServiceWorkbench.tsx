import { Alert, Button, Tag } from '@arco-design/web-react';
import { Headset, Refresh } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useEnterpriseAuth } from '@/renderer/hooks/context/EnterpriseAuthContext';
import { customerServiceClient, type CustomerServiceClient } from '@/renderer/services/enterprise/customer-service';

import ConversationQueue from './ConversationQueue';
import CustomerProfile from './CustomerProfile';
import MessageComposer from './MessageComposer';
import MessageTimeline from './MessageTimeline';
import styles from './customer-service-workbench.module.css';
import { useCustomerServiceWorkbench } from './useCustomerServiceWorkbench';

type CustomerServiceWorkbenchProps = {
  client?: CustomerServiceClient;
  currentStaffUserId?: string;
};

/** Desktop staff reception workspace with isolated queue, timeline, and profile scrolling. */
const CustomerServiceWorkbench: React.FC<CustomerServiceWorkbenchProps> = ({ client, currentStaffUserId }) => {
  const { t } = useTranslation();
  const { user } = useEnterpriseAuth();
  const staffUserId = currentStaffUserId ?? user?.userId ?? '1';
  const controller = useCustomerServiceWorkbench(staffUserId, client ?? customerServiceClient);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const selectedConversationId = controller.selectedConversation?.conversationId ?? null;
  const draft = selectedConversationId ? (drafts[selectedConversationId] ?? '') : '';

  const updateDraft = (value: string) => {
    if (!selectedConversationId) return;
    setDrafts((current) => ({ ...current, [selectedConversationId]: value }));
  };

  const connectionKey = controller.state.connectionState.toLocaleLowerCase();

  return (
    <section
      data-testid='customer-service-workbench'
      className={styles.workbench}
      aria-label={t('enterprise.customerService.accessibility.workspace')}
    >
      <ConversationQueue
        queue={controller.queue}
        onQueueChange={controller.setQueue}
        counts={controller.queueCounts}
        keyword={controller.keyword}
        onKeywordChange={controller.setKeyword}
        conversations={controller.visibleConversations}
        selectedConversationId={selectedConversationId}
        onSelect={(conversationId) => void controller.selectConversation(conversationId)}
        loading={controller.initialLoading}
        onRefresh={() => void controller.refresh()}
      />

      <main className={styles.chatPanel} aria-label={t('enterprise.customerService.accessibility.timeline')}>
        <header className={styles.chatHeader}>
          <div className={styles.chatIdentity}>
            <span className={styles.chatIcon} aria-hidden='true'>
              <Headset size={20} />
            </span>
            <div>
              <h2>
                {controller.selectedConversation?.customerName || t('enterprise.customerService.timeline.noSelection')}
              </h2>
              <p>
                {controller.selectedConversation?.customerCompanyName ||
                  t('enterprise.customerService.profile.companyUnavailable')}
              </p>
            </div>
          </div>
          <div className={styles.connectionStatus}>
            <Tag color={controller.state.connectionState === 'CONNECTED' ? 'green' : 'orange'}>
              {t(`enterprise.customerService.connection.${connectionKey}`)}
            </Tag>
            {controller.state.connectionState === 'DISCONNECTED' ? (
              <Button size='small' type='text' icon={<Refresh size={15} />} onClick={() => void controller.refresh()}>
                {t('enterprise.customerService.actions.reconnect')}
              </Button>
            ) : null}
          </div>
        </header>

        {controller.errorKey ? (
          <Alert
            className={styles.workbenchAlert}
            type='warning'
            showIcon
            content={t(controller.errorKey)}
            action={
              <Button size='small' type='text' onClick={() => void controller.refresh()}>
                {t('enterprise.customerService.actions.retry')}
              </Button>
            }
          />
        ) : null}

        <MessageTimeline
          conversation={controller.selectedConversation}
          messages={controller.messages}
          loading={controller.historyLoading}
          loadingOlder={controller.olderLoading}
          hasOlderMessages={controller.hasOlderMessages}
          hasNewerMessages={controller.hasNewerMessages}
          onLoadOlder={controller.loadOlder}
          onViewingLatestChange={controller.setViewingLatest}
          onAcknowledgeLatest={controller.acknowledgeLatestView}
          onRetry={controller.retryMessage}
        />

        <MessageComposer
          conversation={controller.selectedConversation}
          currentStaffUserId={staffUserId}
          value={draft}
          onChange={updateDraft}
          onSendText={controller.sendText}
          onSendImage={controller.sendImage}
          imageUploading={controller.imageUploading}
        />
      </main>

      <CustomerProfile
        conversation={controller.selectedConversation}
        currentStaffUserId={staffUserId}
        operationPending={controller.operationPending}
        onLoadCandidates={controller.loadCandidates}
        onTransfer={controller.transferConversation}
        onClose={controller.closeConversation}
      />
    </section>
  );
};

export default CustomerServiceWorkbench;
