import { Button, Empty, Image, Spin } from '@arco-design/web-react';
import { Down, Refresh } from '@icon-park/react';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { CustomerServiceConversation } from '@/common/enterprise/customer-service/contracts';

import type { CustomerServiceTimelineMessage } from './customerServiceReducer';
import styles from './customer-service-workbench.module.css';

type MessageTimelineProps = {
  conversation: CustomerServiceConversation | null;
  messages: CustomerServiceTimelineMessage[];
  loading: boolean;
  loadingOlder: boolean;
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
  onLoadOlder: () => Promise<void>;
  onViewingLatestChange: (viewingLatest: boolean) => void;
  onAcknowledgeLatest: () => Promise<void>;
  onRetry: (message: CustomerServiceTimelineMessage) => Promise<boolean>;
};

const BOTTOM_THRESHOLD = 88;

const formatMessageTime = (timestamp: number): string =>
  new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);

/** Maintains bottom-following chat behavior while preserving the viewport during history prepends. */
const MessageTimeline: React.FC<MessageTimelineProps> = ({
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

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight <= BOTTOM_THRESHOLD;
    atBottomRef.current = atBottom;
    onViewingLatestChange(atBottom);
    if (atBottom && hasNewerMessages) void onAcknowledgeLatest();
  };

  const handleLoadOlder = async () => {
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

  const jumpToLatest = () => {
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
        data-testid='customer-service-timeline-scroll'
        className={styles.timelineScroll}
        style={{ overflowY: 'auto' }}
        onScroll={handleScroll}
      >
        {loading ? (
          <div className={styles.centeredState} role='status'>
            <Spin />
            <span>{t('enterprise.customerService.timeline.loading')}</span>
          </div>
        ) : !conversation ? (
          <Empty description={t('enterprise.customerService.timeline.selectConversation')} />
        ) : messages.length === 0 ? (
          <Empty description={t('enterprise.customerService.timeline.empty')} />
        ) : (
          <div className={styles.messageList}>
            {hasOlderMessages ? (
              <Button
                className={styles.loadOlderButton}
                type='text'
                size='small'
                loading={loadingOlder}
                onClick={() => void handleLoadOlder()}
              >
                {t('enterprise.customerService.timeline.loadOlder')}
              </Button>
            ) : null}
            {messages.map((message) => {
              const systemMessage = message.senderType === 'SYSTEM' || message.messageType === 'SYSTEM';
              const staffMessage = message.senderType === 'STAFF';
              return (
                <article
                  key={message.messageId ?? message.clientMessageId}
                  className={`${styles.messageRow}${staffMessage ? ` ${styles.messageRowStaff}` : ''}${
                    systemMessage ? ` ${styles.messageRowSystem}` : ''
                  }`}
                >
                  {systemMessage ? (
                    <p className={styles.systemMessage}>{message.textContent}</p>
                  ) : (
                    <div className={styles.messageContent}>
                      <div className={styles.messageMeta}>
                        <strong>
                          {message.senderName ||
                            (staffMessage
                              ? t('enterprise.customerService.timeline.staffFallback')
                              : t('enterprise.customerService.profile.unknownCustomer'))}
                        </strong>
                        <time>{formatMessageTime(message.createdAt)}</time>
                      </div>
                      <div className={`${styles.messageBubble}${staffMessage ? ` ${styles.messageBubbleStaff}` : ''}`}>
                        {message.messageType === 'IMAGE' && message.image ? (
                          <Image
                            className={styles.messageImage}
                            src={message.image.url}
                            alt={t('enterprise.customerService.timeline.imageAlt')}
                            preview
                          />
                        ) : (
                          <p>{message.textContent}</p>
                        )}
                      </div>
                      {staffMessage ? (
                        <div className={styles.deliveryState}>
                          <span>
                            {t(`enterprise.customerService.delivery.${message.deliveryStatus.toLocaleLowerCase()}`)}
                          </span>
                          {message.deliveryStatus === 'FAILED' ? (
                            <Button
                              type='text'
                              size='mini'
                              icon={<Refresh size={13} />}
                              onClick={() => void onRetry(message)}
                            >
                              {t('enterprise.customerService.actions.retry')}
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
        <Button className={styles.newMessagesButton} type='primary' icon={<Down size={15} />} onClick={jumpToLatest}>
          {t('enterprise.customerService.timeline.newMessages')}
        </Button>
      ) : null}
    </div>
  );
};

export default MessageTimeline;
