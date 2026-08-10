import { Button, Spin, Typography } from '@arco-design/web-react';
import type { PropsWithChildren } from 'react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DesktopVersionRelease } from '@/common/enterprise/desktop-version/contracts';
import { desktopVersionClient } from '@/renderer/services/enterprise/desktop-version/desktopVersionClient';

const POLICY_RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;

type MandatoryUpdatePhase = 'checking' | 'allowed' | 'downloading' | 'installing' | 'failed';

/** Globally blocks every renderer route while a server-selected mandatory update is installed. */
const MandatoryUpdateGate: React.FC<PropsWithChildren> = ({ children }) => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<MandatoryUpdatePhase>('checking');
  const [release, setRelease] = useState<DesktopVersionRelease | null>(null);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  const enforcePolicy = useCallback(async (blockDuringCheck: boolean): Promise<void> => {
    if (runningRef.current) return;
    runningRef.current = true;
    if (blockDuringCheck && mountedRef.current) setPhase('checking');

    let checkResult;
    try {
      checkResult = await desktopVersionClient.check();
    } catch {
      if (mountedRef.current && blockDuringCheck) setPhase('allowed');
      runningRef.current = false;
      return;
    }

    if (!mountedRef.current) {
      runningRef.current = false;
      return;
    }
    if (!checkResult.updateAvailable || !checkResult.release?.forceUpdate) {
      setRelease(null);
      setPhase('allowed');
      runningRef.current = false;
      return;
    }

    setRelease(checkResult.release);
    try {
      setPhase('downloading');
      await desktopVersionClient.download();
      if (!mountedRef.current) return;
      setPhase('installing');
      const installed = await desktopVersionClient.installRequired();
      if (!installed.launched) throw new Error('Required installer was not launched.');
    } catch {
      if (mountedRef.current) setPhase('failed');
    } finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void enforcePolicy(true);
    const interval = window.setInterval((): void => {
      void enforcePolicy(false);
    }, POLICY_RECHECK_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
    };
  }, [enforcePolicy]);

  if (phase === 'allowed') return <>{children}</>;

  const statusText =
    phase === 'checking'
      ? t('enterprise.versionUpdate.checking')
      : phase === 'downloading'
        ? t('enterprise.versionUpdate.downloading')
        : phase === 'installing'
          ? t('enterprise.versionUpdate.installing')
          : t('enterprise.versionUpdate.mandatoryFailed');

  return (
    <main className='flex min-h-screen items-center justify-center bg-bg-1 p-24px' aria-live='polite'>
      <section className='w-full max-w-560px rounded-16px border border-b-base bg-bg-2 p-32px text-center shadow-sm'>
        {phase === 'failed' ? null : <Spin dot size={32} />}
        <Typography.Title heading={4} className='mt-20px mb-8px text-t-1'>
          {t('enterprise.versionUpdate.force')}
        </Typography.Title>
        {release ? (
          <Typography.Paragraph className='mb-8px text-t-secondary'>
            {t('enterprise.versionUpdate.latestVersion', { version: release.versionName })}
          </Typography.Paragraph>
        ) : null}
        <Typography.Paragraph className='mb-8px text-t-secondary'>{statusText}</Typography.Paragraph>
        <Typography.Paragraph className='mb-0 text-t-tertiary'>
          {t('enterprise.versionUpdate.forceDescription')}
        </Typography.Paragraph>
        {phase === 'failed' ? (
          <Button type='primary' className='mt-20px' onClick={() => void enforcePolicy(true)}>
            {t('enterprise.versionUpdate.actions.retry')}
          </Button>
        ) : null}
      </section>
    </main>
  );
};

export default MandatoryUpdateGate;
