import { Left, Lock } from '@icon-park/react';
import { Alert, Button, Card, Tag } from 'antd';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
import EnterpriseContactAccessPanel from '@/renderer/pages/enterprise/contact/EnterpriseContactAccessPanel';
import MembershipUpgradeModal from '@/renderer/pages/enterprise/contact/MembershipUpgradeModal';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import {
  displayProjectName,
  ProjectContactPermissionError,
  unlockProjectContact,
  useProjectDetail,
} from './projectData';
import styles from './project-workspace.module.css';

export type ProjectDetailPageProps = { client?: EnterpriseClient };

const ProjectDetailPage: React.FC<ProjectDetailPageProps> = ({ client = enterpriseClient }) => {
  const { hpInfoId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const detail = useProjectDetail(client, hpInfoId);
  const missing = t('enterprise.projects.missing');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [membershipOpen, setMembershipOpen] = useState(false);

  const unlock = async () => {
    if (!hpInfoId || unlocking) return;
    setUnlocking(true);
    setUnlockError('');
    try {
      await unlockProjectContact(client, hpInfoId);
      detail.retry();
    } catch (error) {
      if (error instanceof ProjectContactPermissionError && error.membershipRequired) {
        setUnlockError(error.detail || t('enterprise.projectDetail.unlock.membershipRequired'));
        setMembershipOpen(true);
      } else {
        setUnlockError(t('enterprise.projectDetail.unlock.failed'));
      }
    } finally {
      setUnlocking(false);
    }
  };

  const renderContent = () => {
    if (detail.isInvalidId) {
      return (
        <EnterprisePageState
          state='error'
          title={t('enterprise.projectDetail.invalid.title')}
          description={t('enterprise.projectDetail.invalid.description')}
        />
      );
    }
    if (detail.errorCode) {
      return (
        <EnterprisePageState
          state='error'
          title={t('enterprise.projectDetail.error.title')}
          description={t('enterprise.projectDetail.error.description')}
          onRetry={detail.retry}
        />
      );
    }
    if (detail.isLoading || !detail.data) {
      return <EnterprisePageState state='loading' title={t('enterprise.projectDetail.loading')} />;
    }

    const project = detail.data;
    const purchased = project.purchased === true;
    const nature = project.constructionNature || project.projectNature || project.investmentType || missing;
    const region = [project.province, project.city].filter(Boolean).join(' / ') || missing;
    const protectedProjectName = displayProjectName(project, purchased, t);
    const commonFacts = [
      ['region', region],
      ['nature', nature],
      [
        'investment',
        project.totalInvestment === undefined
          ? missing
          : t('enterprise.projects.investmentWan', { value: project.totalInvestment }),
      ],
      ['period', project.constructionPeriod || missing],
    ] as const;

    return (
      <div className={styles.detailBody}>
        <section className={styles.detailHero} aria-labelledby='project-detail-name'>
          <span className={styles.eyebrow}>{t('enterprise.projectDetail.profileEyebrow')}</span>
          <h2 id='project-detail-name'>{protectedProjectName}</h2>
          <div className={styles.detailTags}>
            <Tag>{region}</Tag>
            <Tag>{nature}</Tag>
          </div>
        </section>

        {!purchased ? (
          <Alert
            type='info'
            showIcon
            icon={<Lock />}
            title={t('enterprise.projectDetail.locked.title')}
            action={
              <Button type='primary' loading={unlocking} onClick={() => void unlock()}>
                {t('enterprise.projectDetail.unlock.action')}
              </Button>
            }
          />
        ) : null}
        {unlockError && !membershipOpen ? <Alert type='error' showIcon title={unlockError} /> : null}

        <div className={styles.detailColumns}>
          <Card title={t('enterprise.projectDetail.sections.profile')} variant='outlined'>
            <dl className={styles.detailFacts}>
              {commonFacts.map(([key, value]) => (
                <div key={key}>
                  <dt>{t(`enterprise.projectDetail.fields.${key}`)}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title={t('enterprise.projectDetail.sections.contact')} variant='outlined'>
            <dl className={styles.detailFacts}>
              {[
                ['constructionUnit', project.constructionUnit],
                ['contactName', project.contactName],
                ['phone', project.phone],
                ['address', project.address],
              ].map(([key, value]) => (
                <div key={key}>
                  <dt>{t(`enterprise.projectDetail.fields.${key}`)}</dt>
                  <dd aria-label={!purchased ? t('enterprise.projectDetail.locked.title') : undefined}>
                    <span
                      className={!purchased ? styles.protectedContactValue : undefined}
                      aria-hidden={!purchased || undefined}
                      data-protected={!purchased ? 'true' : undefined}
                    >
                      {value || missing}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            {purchased ? (
              <>
                <EnterpriseContactAccessPanel
                  client={client}
                  resourceType='PROJECT'
                  resourceId={project.hpInfoId}
                  maskedPhone={project.phone}
                />
                <p className={styles.permissionNote}>{t('enterprise.projectDetail.contactPermissionNote')}</p>
              </>
            ) : null}
          </Card>
        </div>

        <div className={styles.detailContentGrid}>
          {[
            ['composition', project.projectComposition],
            ['equipment', project.equipment],
            ['materials', project.materials],
          ].map(([key, value]) => (
            <Card key={key} title={t(`enterprise.projectDetail.sections.${key}`)} variant='outlined'>
              <p className={styles.plainText}>{value || missing}</p>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  return (
    <section className={styles.page} aria-labelledby='project-detail-title'>
      <header className={styles.detailPageHeader}>
        <Button type='text' icon={<Left />} onClick={() => navigate('/enterprise/projects')}>
          {t('enterprise.projectDetail.backToList')}
        </Button>
        <div>
          <span className={styles.eyebrow}>{t('enterprise.projectDetail.eyebrow')}</span>
          <h1 id='project-detail-title'>{t('enterprise.routes.projectDetail.title')}</h1>
        </div>
      </header>
      <div className={styles.detailContent}>{renderContent()}</div>
      <MembershipUpgradeModal
        open={membershipOpen}
        message={unlockError}
        onClose={() => setMembershipOpen(false)}
        onRefreshed={async () => {
          setMembershipOpen(false);
          await unlock();
        }}
      />
    </section>
  );
};

export default ProjectDetailPage;
