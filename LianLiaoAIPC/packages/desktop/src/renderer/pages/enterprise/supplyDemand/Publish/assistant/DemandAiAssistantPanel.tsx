import { Magic, Send } from '@icon-park/react';
import { Alert, Button, Card, Input, Progress, Space, Tag } from 'antd';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DemandAiConversationSnapshot, DemandAiLineCandidate } from '@/common/enterprise/contracts';

import type { DemandAiConversationMessage } from './useDemandAiConversation';
import styles from './demand-ai-assistant.module.css';

export type DemandAiAssistantPanelProps = {
  snapshot?: DemandAiConversationSnapshot;
  messages: DemandAiConversationMessage[];
  loading: boolean;
  error?: Error;
  onStart: (message: string) => Promise<void>;
  onSend: (message: string) => Promise<void>;
  onConfirmLine: (candidate: DemandAiLineCandidate, confirmSwitch?: boolean) => Promise<void>;
  onRejectSwitch: () => Promise<void>;
  onRetry: () => Promise<void>;
  onCancel: () => Promise<void>;
};

const candidateKey = (candidate: DemandAiLineCandidate): string =>
  `${candidate.typeId}-${candidate.variantCode ?? 'DEFAULT'}`;

const DemandAiAssistantPanel: React.FC<DemandAiAssistantPanelProps> = ({
  snapshot,
  messages,
  loading,
  error,
  onStart,
  onSend,
  onConfirmLine,
  onRejectSwitch,
  onRetry,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [confirmingCandidateKey, setConfirmingCandidateKey] = useState<string>();
  const candidateRequestInFlightRef = useRef(false);
  const terminal = snapshot?.state === 'SUBMITTED' || snapshot?.state === 'CANCELLED';

  const confirmCandidate = async (candidate: DemandAiLineCandidate) => {
    // Model-backed confirmation can take tens of seconds. Guard synchronously so
    // rapid clicks cannot submit the same optimistic-lock version more than once.
    if (candidateRequestInFlightRef.current || loading) return;
    candidateRequestInFlightRef.current = true;
    setConfirmingCandidateKey(candidateKey(candidate));
    try {
      await onConfirmLine(candidate, snapshot?.state === 'CONFIRMING_SWITCH');
    } finally {
      candidateRequestInFlightRef.current = false;
      setConfirmingCandidateKey(undefined);
    }
  };

  const submit = async () => {
    const normalized = input.trim();
    if (normalized.length < 2) return;
    setInput('');
    if (snapshot) await onSend(normalized);
    else await onStart(normalized);
  };

  return (
    <Card className={styles.card} title={t('enterprise.supplyDemand.publish.aiConversation.title')}>
      <div className={styles.statusRow}>
        <span>
          {snapshot?.lineDecision.typeName
            ? t('enterprise.supplyDemand.publish.aiConversation.currentLine', {
                name: snapshot.lineDecision.typeName,
              })
            : t('enterprise.supplyDemand.publish.aiConversation.discoveringLine')}
        </span>
        <Tag color='blue'>
          {t('enterprise.supplyDemand.publish.aiConversation.completion', {
            value: Math.round((snapshot?.completion ?? 0) * 100),
          })}
        </Tag>
      </div>

      <Progress percent={Math.round((snapshot?.completion ?? 0) * 100)} showInfo={false} size='small' />

      {error ? (
        <Alert
          type='error'
          showIcon
          message={t('enterprise.supplyDemand.publish.aiConversation.unavailable')}
          action={
            <Button size='small' onClick={() => void onRetry()}>
              {t('enterprise.supplyDemand.publish.aiConversation.retry')}
            </Button>
          }
        />
      ) : null}

      <div className={styles.messages} aria-live='polite'>
        {messages.length === 0 ? (
          <div className={styles.welcome}>
            <Magic theme='outline' size={24} />
            <strong>{t('enterprise.supplyDemand.publish.aiConversation.startTitle')}</strong>
            <span>{t('enterprise.supplyDemand.publish.aiConversation.startHint')}</span>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={message.role === 'USER' ? styles.userMessage : styles.assistantMessage}>
              {message.content}
            </div>
          ))
        )}
      </div>

      {snapshot?.lineDecision.candidates.length ? (
        <div className={styles.candidates}>
          <strong>
            {snapshot.state === 'CONFIRMING_SWITCH'
              ? t('enterprise.supplyDemand.publish.aiConversation.switchTitle')
              : t('enterprise.supplyDemand.publish.aiConversation.candidateTitle')}
          </strong>
          <Space wrap>
            {snapshot.lineDecision.candidates.map((candidate) => (
              <Button
                key={candidateKey(candidate)}
                type='primary'
                ghost
                loading={confirmingCandidateKey === candidateKey(candidate)}
                disabled={loading || confirmingCandidateKey !== undefined}
                onClick={() => void confirmCandidate(candidate)}
              >
                {candidate.typeName}
                {candidate.variantName ? ` · ${candidate.variantName}` : ''}
              </Button>
            ))}
            {snapshot.state === 'CONFIRMING_SWITCH' ? (
              <Button onClick={() => void onRejectSwitch()}>
                {t('enterprise.supplyDemand.publish.aiConversation.rejectSwitch')}
              </Button>
            ) : null}
          </Space>
        </div>
      ) : null}

      {snapshot?.warnings.length ? (
        <Alert
          type='warning'
          showIcon
          message={t('enterprise.supplyDemand.publish.aiConversation.warningTitle')}
          description={snapshot.warnings.join('；')}
        />
      ) : null}

      <Input.TextArea
        rows={5}
        maxLength={5000}
        showCount
        value={input}
        disabled={terminal}
        placeholder={t('enterprise.supplyDemand.publish.aiConversation.startPlaceholder')}
        onChange={(event) => setInput(event.target.value)}
        onPressEnter={(event) => {
          if (event.shiftKey) return;
          event.preventDefault();
          void submit();
        }}
      />
      <div className={styles.actions}>
        {snapshot && !terminal ? (
          <Button danger type='text' onClick={() => void onCancel()}>
            {t('enterprise.supplyDemand.publish.aiConversation.cancel')}
          </Button>
        ) : (
          <span />
        )}
        <Button
          type='primary'
          icon={snapshot ? <Send /> : <Magic />}
          loading={loading}
          disabled={terminal || input.trim().length < 2}
          onClick={() => void submit()}
        >
          {snapshot
            ? t('enterprise.supplyDemand.publish.aiConversation.continueAction')
            : t('enterprise.supplyDemand.publish.aiConversation.startAction')}
        </Button>
      </div>

      {snapshot?.state === 'REVIEW_READY' ? (
        <Alert
          type='success'
          showIcon
          message={t('enterprise.supplyDemand.publish.aiConversation.reviewTitle')}
          description={t('enterprise.supplyDemand.publish.aiConversation.reviewHint')}
        />
      ) : null}
    </Card>
  );
};

export default DemandAiAssistantPanel;
