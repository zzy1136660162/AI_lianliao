import { Down, Refresh } from '@icon-park/react';
import { Button, Empty, Image, Spin } from 'antd';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { CustomerServiceConversation } from '@/common/enterprise/customer-service/contracts';

import type { CustomerConsultationTimelineMessage } from './customerConsultationReducer';
import styles from './customer-consultation.module.css';

type ConsultationTimelineProps = {
  conversation: CustomerServiceConversation | null;
  messages: CustomerConsultationTimelineMessage[];
  loading: boolean;
  loadingOlder: boolean;
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
  onLoadOlder: () => Promise<void>;
  onViewingLatestChange: (value: boolean) => void;
  onAcknowledgeLatest: () => Promise<void>;
  onRetry: (message: CustomerConsultationTimelineMessage) => Promise<boolean>;
};

const BOTTOM_THRESHOLD = 88;

const formatMessageTime = (timestamp: number): string =>
  timestamp > 0
    ? new Intl.DateTimeFormat(undefined, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(timestamp)
    : '';

/** Keeps message scrolling inside the chat card and preserves the viewport when prepending history. */
const ConsultationTimeline: React.FC<ConsultationTimelineProps> = ({
  conversation,
  messages,
  loading,
  loadingOlder,
  hasOlderMessages,
  hasNewerMessages,
  onLoadOlder,
  onViewingLatestChange,
  onAcknowledgeLatest,
  onRetry,
}) => {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousConversationIdRef = useRef<string | null>(null);
  const previousMessageCountRef = useRef(0);
  const atBottomRef = useRef(true);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const conversationChanged = previousConversationIdRef.current !== conversation?.conversationId;
    const receivedMessage = messages.length > previousMessageCountRef.current;
    if (conversationChanged || (receivedMessage && atBottomRef.current)) {
      requestAnimationFrame(() => {
        node.scrollTop = node.scrollHeight;
        atBottomRef.current = true;
        onViewingLatestChange(true);
      });
    }
    previousConversationIdRef.current = conversation?.conversationId ?? null;
    previousMessageCountRef.current = messages.length;
  }, [conversation?.conversationId, messages.length, onViewingLatestChange]);

  const handleScroll = (): void => {
    const node = scrollRef.current;
    if (!node) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight <= BOTTOM_THRESHOLD;
    atBottomRef.current = atBottom;
    onViewingLatestChange(atBottom);
    if (atBottom && hasNewerMessages) void onAcknowledgeLatest();
  };

  const handleLoadOlder = async (): Promise<void> => {
    const node = scrollRef.current;
    if (!node) return;
    atBottomRef.current = false;
    onViewingLatestChange(false);
    const previousHeight = node.scrollHeight;
    const previousTop = node.scrollTop;
    await onLoadOlder();
    requestAnimationFrame(() => {
      node.scrollTop = previousTop + node.scrollHeight - previousHeight;
    });
  };

  const jumpToLatest = (): void => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
    atBottomRef.current = true;
    onViewingLatestChange(true);
    void onAcknowledgeLatest();
  };

  return (
    <div className={styles.timelineRegion}>
      <div
        ref={scrollRef}
        data-testid='customer-consultation-timeline'
        className={styles.timelineScroll}
        style={{ overflowY: 'auto' }}
        aria-label={t('enterprise.consultation.accessibility.timeline')}
        onScroll={handleScroll}
      >
        {loading ? (
          <div className={styles.centeredState} role='status'>
            <Spin size='large' />
            <span>{t('enterprise.consultation.timeline.loading')}</span>
          </div>
        ) : !conversation ? (
          <Empty description={t('enterprise.consultation.timeline.unavailable')} />
        ) : messages.length === 0 ? (
          <Empty description={t('enterprise.consultation.timeline.empty')} />
        ) : (
          <div className={styles.messageList}>
            {hasOlderMessages ? (
              <Button type='link' loading={loadingOlder} onClick={() => void handleLoadOlder()}>
                {t('enterprise.consultation.timeline.loadOlder')}
              </Button>
            ) : null}
            {messages.map((message) => {
              const isCustomer = message.senderType === 'CUSTOMER';
              const isSystem = message.senderType === 'SYSTEM' || message.messageType === 'SYSTEM';
              return (
                <article
                  key={message.messageId ?? message.clientMessageId}
                  className={`${styles.messageRow}${isCustomer ? ` ${styles.messageRowCustomer}` : ''}${
                    isSystem ? ` ${styles.messageRowSystem}` : ''
                  }`}
                >
                  {isSystem ? (
                    <p className={styles.systemMessage}>{message.textContent}</p>
                  ) : (
                    <div className={styles.messageContent}>
                      <div className={styles.messageMeta}>
                        <strong>
                          {message.senderName ||
                            t(
                              isCustomer
                                ? 'enterprise.consultation.timeline.customer'
                                : 'enterprise.consultation.timeline.staff'
                            )}
                        </strong>
                        <time>{formatMessageTime(message.createdAt)}</time>
                      </div>
                      <div className={`${styles.messageBubble}${isCustomer ? ` ${styles.messageBubbleCustomer}` : ''}`}>
                        {message.messageType === 'IMAGE' && message.image ? (
                          <Image src={message.image.url} alt={t('enterprise.consultation.timeline.imageAlt')} />
                        ) : (
                          <p>{message.textContent}</p>
                        )}
                      </div>
                      {isCustomer ? (
                        <div className={styles.deliveryState}>
                          <span>{t(`enterprise.consultation.delivery.${message.deliveryStatus.toLowerCase()}`)}</span>
                          {message.deliveryStatus === 'FAILED' ? (
                            <Button
                              type='link'
                              size='small'
                              icon={<Refresh size={14} />}
                              onClick={() => void onRetry(message)}
                            >
                              {t('enterprise.consultation.actions.retryMessage')}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
      {hasNewerMessages ? (
        <Button className={styles.newMessageButton} type='primary' icon={<Down size={15} />} onClick={jumpToLatest}>
          {t('enterprise.consultation.timeline.newMessages')}
        </Button>
      ) : null}
    </div>
  );
};

export default ConsultationTimeline;
