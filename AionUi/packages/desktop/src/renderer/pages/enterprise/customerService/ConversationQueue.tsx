import { Badge, Button, Empty, Input, Spin } from '@arco-design/web-react';
import { MessageOne, Refresh, Search } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { CustomerServiceConversation } from '@/common/enterprise/customer-service/contracts';

import type { CustomerServiceQueue } from './customerServiceReducer';
import styles from './customer-service-workbench.module.css';

type ConversationQueueProps = {
  queue: CustomerServiceQueue;
  onQueueChange: (queue: CustomerServiceQueue) => void;
  counts: Record<CustomerServiceQueue, number>;
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  conversations: CustomerServiceConversation[];
  selectedConversationId: string | null;
  onSelect: (conversationId: string) => void;
  loading: boolean;
  onRefresh: () => void;
};

const QUEUES: CustomerServiceQueue[] = ['PENDING', 'ACTIVE', 'CLOSED'];

const queueTranslationKey = (queue: CustomerServiceQueue): string =>
  `enterprise.customerService.queues.${queue.toLocaleLowerCase()}`;

const formatActivityTime = (timestamp: number | null): string => {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
};

/** Renders locally derived staff queues without exposing internal conversation identifiers. */
const ConversationQueue: React.FC<ConversationQueueProps> = ({
  queue,
  onQueueChange,
  counts,
  keyword,
  onKeywordChange,
  conversations,
  selectedConversationId,
  onSelect,
  loading,
  onRefresh,
}) => {
  const { t } = useTranslation();

  return (
    <section className={styles.queuePanel} aria-label={t('enterprise.customerService.accessibility.queue')}>
      <div className={styles.panelHeading}>
        <div>
          <span className={styles.eyebrow}>{t('enterprise.customerService.queue.eyebrow')}</span>
          <h1>{t('enterprise.customerService.title')}</h1>
        </div>
        <Button
          type='text'
          size='small'
          icon={<Refresh size={16} />}
          aria-label={t('enterprise.customerService.actions.refresh')}
          onClick={onRefresh}
        />
      </div>

      <div
        className={styles.queueTabs}
        role='tablist'
        aria-label={t('enterprise.customerService.accessibility.queues')}
      >
        {QUEUES.map((item) => (
          <Button
            key={item}
            type={queue === item ? 'primary' : 'text'}
            className={styles.queueTab}
            aria-label={t(queueTranslationKey(item))}
            aria-selected={queue === item}
            role='tab'
            onClick={() => onQueueChange(item)}
          >
            <span>{t(queueTranslationKey(item))}</span>
            <span className={styles.queueCount}>{counts[item]}</span>
          </Button>
        ))}
      </div>

      <Input
        className={styles.queueSearch}
        value={keyword}
        prefix={<Search size={15} />}
        allowClear
        placeholder={t('enterprise.customerService.search.placeholder')}
        aria-label={t('enterprise.customerService.search.ariaLabel')}
        onChange={onKeywordChange}
      />

      <div data-testid='customer-service-queue-scroll' className={styles.queueScroll} style={{ overflowY: 'auto' }}>
        {loading ? (
          <div className={styles.centeredState} role='status'>
            <Spin />
            <span>{t('enterprise.customerService.list.loading')}</span>
          </div>
        ) : conversations.length === 0 ? (
          <Empty description={t('enterprise.customerService.list.empty')} />
        ) : (
          <div className={styles.conversationList}>
            {conversations.map((conversation) => {
              const selected = selectedConversationId === conversation.conversationId;
              const customerName = conversation.customerName || t('enterprise.customerService.profile.unknownCustomer');
              return (
                <Button
                  key={conversation.conversationId}
                  type='text'
                  long
                  className={`${styles.conversationItem}${selected ? ` ${styles.conversationItemSelected}` : ''}`}
                  aria-label={`${customerName} ${conversation.customerCompanyName ?? ''}`.trim()}
                  aria-pressed={selected}
                  onClick={() => onSelect(conversation.conversationId)}
                >
                  <span className={styles.conversationAvatar} aria-hidden='true'>
                    <MessageOne size={18} />
                  </span>
                  <span className={styles.conversationCopy}>
                    <span className={styles.conversationTitleRow}>
                      <strong>{customerName}</strong>
                      <time>{formatActivityTime(conversation.lastMessageAt)}</time>
                    </span>
                    <span className={styles.conversationCompany}>
                      {conversation.customerCompanyName || t('enterprise.customerService.profile.companyUnavailable')}
                    </span>
                    <span className={styles.conversationPreview}>
                      {conversation.lastMessagePreview || t('enterprise.customerService.list.noPreview')}
                    </span>
                  </span>
                  {conversation.staffUnreadCount > 0 ? (
                    <Badge className={styles.unreadBadge} count={conversation.staffUnreadCount} maxCount={99} />
                  ) : null}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default ConversationQueue;
