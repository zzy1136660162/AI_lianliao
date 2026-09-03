import { Close, Delete, Robot, Search } from '@icon-park/react';
import { Alert, Button, Empty, Input, Progress, Space, Spin } from 'antd';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { CatalogAssistantResultCard } from './CatalogAssistantResultCard';
import { useCatalogAssistant } from './CatalogAssistantProvider';
import { getCatalogTrustedResultId } from '@/common/enterprise/catalog-assistant/runtime';
import styles from './catalog-ai-assistant.module.css';

const runningStages = new Set(['PLANNING', 'SEARCHING', 'LINKING', 'RANKING']);

const progressPercent = (stage: string, page?: number): number => {
  if (stage === 'PLANNING') return 12;
  if (stage === 'SEARCHING') return Math.min(72, 20 + (page ?? 1) * 10);
  if (stage === 'LINKING') return 78;
  if (stage === 'RANKING') return 86;
  if (stage === 'COMPLETED') return 100;
  return 0;
};

export const CatalogAiAssistant: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const assistant = useCatalogAssistant();
  const [draft, setDraft] = useState('');
  const isRunning = runningStages.has(assistant.progress.stage);
  const previousTurns =
    assistant.history.at(-1)?.userMessage === assistant.message ? assistant.history.slice(0, -1) : assistant.history;
  const hasSession = Boolean(
    assistant.history.length ||
    assistant.message ||
    assistant.summary ||
    assistant.clarification ||
    assistant.results.length
  );
  const examples = useMemo(
    () => [
      t('enterprise.catalogAssistant.examples.company'),
      t('enterprise.catalogAssistant.examples.product'),
      t('enterprise.catalogAssistant.examples.project'),
      t('enterprise.catalogAssistant.examples.demand'),
      t('enterprise.catalogAssistant.examples.service'),
    ],
    [t]
  );

  const submit = async (message = draft): Promise<void> => {
    const normalized = message.trim();
    if (normalized.length < 2 || isRunning) return;
    setDraft('');
    await assistant.submit(normalized);
  };

  const progressMessage = t(assistant.progress.messageKey, {
    page: assistant.progress.page,
    maxPages: assistant.progress.maxPages,
    count: assistant.progress.candidateCount,
  });
  const summary = assistant.summary?.startsWith('enterprise.catalogAssistant.')
    ? t(assistant.summary)
    : assistant.summary;
  const handoffError = assistant.handoffError ? t(assistant.handoffError) : undefined;

  const enterDemandPublish = async (): Promise<void> => {
    const sessionId = await assistant.startDemandHandoff();
    if (!sessionId) return;
    const search = new URLSearchParams({ aiSession: sessionId });
    void navigate(`/enterprise/supply-demand/publish?${search.toString()}`);
  };

  return (
    <section className={styles.assistant} aria-label={t('enterprise.catalogAssistant.title')}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.icon}>
            <Robot size={20} aria-hidden='true' />
          </span>
          <div>
            <h2>{t('enterprise.catalogAssistant.title')}</h2>
            <p>{t('enterprise.catalogAssistant.capability')}</p>
          </div>
        </div>
        {hasSession ? (
          <Button
            type='text'
            size='small'
            icon={<Delete size={16} />}
            aria-label={t('enterprise.catalogAssistant.clear')}
            onClick={assistant.clear}
          />
        ) : null}
      </header>

      <div className={styles.content} aria-busy={isRunning}>
        {!hasSession ? (
          <div className={styles.welcome}>
            <p>{t('enterprise.catalogAssistant.exampleHint')}</p>
            <Space orientation='vertical' size={8} className={styles.exampleList}>
              {examples.map((example) => (
                <Button key={example} block className={styles.exampleButton} onClick={() => void submit(example)}>
                  {example}
                </Button>
              ))}
            </Space>
          </div>
        ) : null}

        {previousTurns.length ? (
          <div className={styles.history}>
            {previousTurns.map((turn) => (
              <div className={styles.historyTurn} key={turn.id}>
                <div className={styles.userMessage}>
                  <span>{t('enterprise.catalogAssistant.currentRequest')}</span>
                  <p>{turn.userMessage}</p>
                </div>
                <p className={styles.historyReply}>
                  {turn.assistantMessage.startsWith('enterprise.catalogAssistant.')
                    ? t(turn.assistantMessage)
                    : turn.assistantMessage}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {assistant.message ? (
          <div className={styles.userMessage}>
            <span>{t('enterprise.catalogAssistant.currentRequest')}</span>
            <p>{assistant.message}</p>
          </div>
        ) : null}

        {assistant.progress.stage !== 'IDLE' ? (
          <div className={styles.progressCard} role='status' aria-live='polite'>
            <div className={styles.progressLabel}>
              <span className={styles.progressMessage}>
                {isRunning ? <Spin size='small' /> : null}
                {progressMessage}
              </span>
              {assistant.progress.candidateCount !== undefined ? (
                <span>
                  {t('enterprise.catalogAssistant.candidateCount', {
                    count: assistant.progress.candidateCount,
                  })}
                </span>
              ) : null}
            </div>
            <Progress
              percent={progressPercent(assistant.progress.stage, assistant.progress.page)}
              showInfo={false}
              status={assistant.progress.stage === 'FAILED' ? 'exception' : 'active'}
              size='small'
            />
          </div>
        ) : null}

        {assistant.clarification ? (
          <Alert
            type='info'
            showIcon
            title={t('enterprise.catalogAssistant.clarificationTitle')}
            description={assistant.clarification}
          />
        ) : null}

        {assistant.navigationProposal?.intent === 'DEMAND_PUBLISH' ? (
          <div className={styles.navigationCard}>
            <span>{t('enterprise.catalogAssistant.navigation.eyebrow')}</span>
            <h3>{t('enterprise.catalogAssistant.navigation.demandTitle')}</h3>
            <p>{t('enterprise.catalogAssistant.navigation.demandDescription')}</p>
            {handoffError ? <Alert type='error' showIcon title={handoffError} /> : null}
            <div className={styles.navigationActions}>
              <Button onClick={assistant.dismissNavigation}>{t('enterprise.catalogAssistant.navigation.stay')}</Button>
              <Button type='primary' loading={assistant.handoffLoading} onClick={() => void enterDemandPublish()}>
                {t('enterprise.catalogAssistant.navigation.enterDemand')}
              </Button>
            </div>
          </div>
        ) : null}

        {summary && !assistant.navigationProposal ? <p className={styles.summary}>{summary}</p> : null}

        {assistant.results.length ? (
          <div className={styles.results}>
            {assistant.results.map((result) => {
              const id = getCatalogTrustedResultId(result);
              return <CatalogAssistantResultCard key={`${result.entityType}-${id}`} result={result} />;
            })}
          </div>
        ) : assistant.progress.stage === 'COMPLETED' && !assistant.clarification ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                {t('enterprise.catalogAssistant.noResults')}
                <small>{t('enterprise.catalogAssistant.broadenHint')}</small>
              </span>
            }
          />
        ) : null}
      </div>

      <footer className={styles.footer}>
        <Input.TextArea
          value={draft}
          autoSize={{ minRows: 2, maxRows: 4 }}
          maxLength={1000}
          placeholder={t('enterprise.catalogAssistant.placeholder')}
          disabled={isRunning}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className={styles.actions}>
          {isRunning ? (
            <Button icon={<Close size={15} />} onClick={assistant.stop}>
              {t('enterprise.catalogAssistant.stop')}
            </Button>
          ) : assistant.progress.stage === 'FAILED' ? (
            <Button onClick={() => void assistant.retry()}>{t('enterprise.catalogAssistant.retry')}</Button>
          ) : (
            <span />
          )}
          <Button
            type='primary'
            icon={<Search size={15} />}
            disabled={draft.trim().length < 2 || isRunning}
            onClick={() => void submit()}
          >
            {t('enterprise.catalogAssistant.submit')}
          </Button>
        </div>
      </footer>
    </section>
  );
};
