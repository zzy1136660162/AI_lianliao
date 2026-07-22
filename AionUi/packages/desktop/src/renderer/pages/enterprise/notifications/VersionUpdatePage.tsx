import { Alert, Button, Card, Descriptions, Modal, Spin, Tag } from 'antd';
import { Download, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  DesktopVersionCheckResult,
  DesktopVersionDownloadResult,
} from '@/common/enterprise/desktop-version/contracts';
import {
  desktopVersionClient,
  type DesktopVersionClient,
} from '@/renderer/services/enterprise/desktop-version/desktopVersionClient';

import styles from './version-update-page.module.css';

export type VersionUpdatePageProps = { client?: DesktopVersionClient };

const formatPackageSize = (sizeBytes: number): number =>
  Math.max(0.01, Math.round((sizeBytes / 1_048_576) * 100) / 100);

/** User-confirmed, verified installer flow for releases supplied by the Chain Liaoning service. */
const VersionUpdatePage: React.FC<VersionUpdatePageProps> = ({ client = desktopVersionClient }) => {
  const { t } = useTranslation();
  const [checkResult, setCheckResult] = useState<DesktopVersionCheckResult | null>(null);
  const [checking, setChecking] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [downloaded, setDownloaded] = useState<DesktopVersionDownloadResult | null>(null);
  const [opening, setOpening] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    setFailed(false);
    try {
      setCheckResult(await client.check());
    } catch {
      setFailed(true);
    } finally {
      setChecking(false);
    }
  }, [client]);

  useEffect(() => {
    void check();
  }, [check]);

  const download = async (): Promise<void> => {
    setDownloading(true);
    setFailed(false);
    try {
      setDownloaded(await client.download());
    } catch {
      setFailed(true);
    } finally {
      setDownloading(false);
    }
  };

  const openDownloadedInstaller = async (): Promise<void> => {
    setOpening(true);
    try {
      const result = await client.openDownloaded();
      if (!result.opened) throw new Error('installer was not opened');
      setDownloaded(null);
    } catch {
      setFailed(true);
    } finally {
      setOpening(false);
    }
  };

  const release = checkResult?.release;

  return (
    <section className={styles.page} aria-labelledby='desktop-version-update-title'>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{t('enterprise.versionUpdate.eyebrow')}</span>
          <h1 id='desktop-version-update-title'>{t('enterprise.versionUpdate.title')}</h1>
          <p>{t('enterprise.versionUpdate.description')}</p>
        </div>
        <Button icon={<Refresh size={16} />} loading={checking} onClick={() => void check()}>
          {t('enterprise.versionUpdate.actions.check')}
        </Button>
      </header>

      <Card className={styles.card} variant='borderless'>
        {checking && !checkResult ? (
          <div className={styles.state}>
            <Spin />
            <span>{t('enterprise.versionUpdate.checking')}</span>
          </div>
        ) : failed ? (
          <Alert type='error' showIcon message={t('enterprise.versionUpdate.checkFailed')} />
        ) : release && checkResult?.updateAvailable ? (
          <div className={styles.release}>
            <div className={styles.releaseHeading}>
              <div>
                <span className={styles.latest}>
                  {t('enterprise.versionUpdate.latestVersion', { version: release.versionName })}
                </span>
                <p>{t('enterprise.versionUpdate.currentVersion', { version: checkResult.currentVersion })}</p>
              </div>
              {release.forceUpdate ? <Tag color='error'>{t('enterprise.versionUpdate.force')}</Tag> : null}
            </div>
            {release.forceUpdate ? (
              <Alert type='warning' showIcon message={t('enterprise.versionUpdate.forceDescription')} />
            ) : null}
            <Descriptions column={1} size='small' className={styles.meta}>
              <Descriptions.Item label={t('enterprise.versionUpdate.releaseNotes')}>
                <span className={styles.notes}>{release.releaseNotes || '-'}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('enterprise.versionUpdate.title')}>
                {t('enterprise.versionUpdate.packageInfo', {
                  platform: release.platform,
                  architecture: release.architecture,
                  size: t('enterprise.versionUpdate.packageSize', {
                    size: formatPackageSize(release.packageSizeBytes),
                  }),
                })}
              </Descriptions.Item>
            </Descriptions>
            <Button type='primary' icon={<Download size={16} />} loading={downloading} onClick={() => void download()}>
              {t('enterprise.versionUpdate.actions.download')}
            </Button>
          </div>
        ) : (
          <div className={styles.state}>
            <strong>
              {checkResult ? t('enterprise.versionUpdate.upToDate') : t('enterprise.versionUpdate.noRelease')}
            </strong>
          </div>
        )}
      </Card>

      <Modal
        open={downloaded !== null}
        title={t('enterprise.versionUpdate.openPromptTitle')}
        okText={t('enterprise.versionUpdate.actions.open')}
        cancelText={t('enterprise.versionUpdate.actions.later')}
        confirmLoading={opening}
        onCancel={() => setDownloaded(null)}
        onOk={() => void openDownloadedInstaller()}
      >
        <p>{t('enterprise.versionUpdate.downloadComplete', { path: downloaded?.filePath ?? '' })}</p>
        <p>{t('enterprise.versionUpdate.openPromptDescription')}</p>
      </Modal>
    </section>
  );
};

export default VersionUpdatePage;
