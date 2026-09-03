import { HeadsetOne, Refresh, Shield } from '@icon-park/react';
import { Alert, Button, Card, Spin } from 'antd';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { CustomerConsultationClient } from '@/renderer/services/enterprise/customer-consultation';

import ConsultationComposer from './ConsultationComposer';
import ConsultationTimeline from './ConsultationTimeline';
import ServiceProfileCard from './ServiceProfileCard';
import styles from './customer-consultation.module.css';
import { useCustomerConsultation } from './useCustomerConsultation';

type CustomerConsultationPageProps = {
  client?: CustomerConsultationClient;
};

/** Ordinary-user realtime consultation page backed by the isolated customer IPC client. */
const CustomerConsultationPage: React.FC<CustomerConsultationPageProps> = ({ client }) => {
  const { t } = useTranslation();
  const consultation = useCustomerConsultation(client);
  const { state } = consultation;

  return (
    <section
      className={`${styles.page}${consultation.errorKey ? ` ${styles.pageWithError}` : ''}`}
      data-testid='customer-consultation-page'
    >
      <header className={styles.pageHeader}>
        <div className={styles.titleMark} aria-hidden='true'>
          <HeadsetOne size={22} />
        </div>
        <div>
          <h1>{t('enterprise.consultation.title')}</h1>
          <p>{t('enterprise.consultation.description')}</p>
        </div>
        <div className={styles.trustNote}>
          <Shield size={15} />
          <span>{t('enterprise.consultation.trustNote')}</span>
        </div>
      </header>

      {consultation.errorKey ? (
        <Alert
          className={styles.errorAlert}
          type='error'
          showIcon
          closable
          onClose={consultation.clearError}
          title={t(consultation.errorKey)}
          action={
            consultation.errorKey === 'enterprise.consultation.errors.initialize' ? (
              <Button size='small' icon={<Refresh size={14} />} onClick={() => void consultation.retry()}>
                {t('enterprise.consultation.actions.retry')}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <div className={styles.workspace}>
        <Card className={styles.chatCard} variant='borderless' styles={{ body: { padding: 0 } }}>
          <div className={styles.chatHeader}>
            <div>
              <h2>{t('enterprise.consultation.chat.title')}</h2>
              <p>{t('enterprise.consultation.chat.description')}</p>
            </div>
            <span className={styles.connectionPill} data-state={state.connectionState.toLowerCase()}>
              <i aria-hidden='true' />
              {t(`enterprise.consultation.connection.${state.connectionState.toLowerCase()}`)}
            </span>
          </div>

          {consultation.initialLoading ? (
            <div className={styles.loadingState} role='status'>
              <Spin size='large' />
              <span>{t('enterprise.consultation.timeline.loading')}</span>
            </div>
          ) : (
            <>
              <ConsultationTimeline
                conversation={state.conversation}
                messages={state.messages}
                loading={false}
                loadingOlder={consultation.olderLoading}
                hasOlderMessages={state.hasOlderMessages}
                hasNewerMessages={state.hasNewerMessages}
                onLoadOlder={consultation.loadOlder}
                onViewingLatestChange={consultation.setViewingLatest}
                onAcknowledgeLatest={consultation.acknowledgeLatest}
                onRetry={consultation.retryMessage}
              />
              <ConsultationComposer
                conversation={state.conversation}
                imageUploading={consultation.imageUploading}
                onSendText={consultation.sendText}
                onSendImage={consultation.sendImage}
              />
            </>
          )}
        </Card>

        <ServiceProfileCard
          conversation={state.conversation}
          connectionState={state.connectionState}
          operationPending={consultation.operationPending}
          onClose={consultation.closeConversation}
          onStartNew={consultation.startNewConversation}
        />
      </div>
    </section>
  );
};

export default CustomerConsultationPage;
