import { Button, Tag } from '@arco-design/web-react';
import { ArrowRight, CloseSmall } from '@icon-park/react';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { EnterpriseProjectSummary } from '@/common/enterprise/contracts';

import styles from './project-workspace.module.css';

export type ProjectQuickViewProps = {
  project: EnterpriseProjectSummary;
  onClose: () => void;
  onViewDetails: (project: EnterpriseProjectSummary) => void;
};

const ProjectQuickView: React.FC<ProjectQuickViewProps> = ({ project, onClose, onViewDetails }) => {
  const quickViewRef = useRef<HTMLElement>(null);
  const { t } = useTranslation();
  const missing = t('enterprise.projects.missing');
  const region = [project.province, project.city].filter(Boolean).join(' / ') || missing;

  useEffect(() => {
    const quickView = quickViewRef.current;
    if (!quickView) return;
    quickView.focus({ preventScroll: true });
    if (!window.matchMedia('(max-width: 820px)').matches) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    quickView.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [project.hpInfoId]);

  return (
    <aside
      ref={quickViewRef}
      className={styles.quickView}
      role='complementary'
      tabIndex={-1}
      aria-label={t('enterprise.projects.quickView.label')}
    >
      <div className={styles.quickViewIndex}>
        {t('enterprise.projects.quickView.index', { index: project.hpInfoId.slice(-4).padStart(4, '0') })}
      </div>
      <Button
        className={styles.quickViewClose}
        type='text'
        size='small'
        icon={<CloseSmall />}
        aria-label={t('enterprise.projects.actions.closeQuickView')}
        onClick={onClose}
      />
      <div className={styles.quickViewHeading}>
        <span>{t('enterprise.projects.quickView.title')}</span>
        <h2>{project.projectName}</h2>
        {project.constructionNature || project.projectNature ? (
          <Tag>{project.constructionNature || project.projectNature}</Tag>
        ) : null}
      </div>
      <dl className={styles.quickViewFacts}>
        <div>
          <dt>{t('enterprise.projects.fields.region')}</dt>
          <dd>{region}</dd>
        </div>
        <div>
          <dt>{t('enterprise.projects.fields.investment')}</dt>
          <dd>
            {project.totalInvestment === undefined
              ? missing
              : t('enterprise.projects.investmentWan', { value: project.totalInvestment })}
          </dd>
        </div>
        <div>
          <dt>{t('enterprise.projects.fields.procurement')}</dt>
          <dd>{project.procurementSummary || project.materialMatch || missing}</dd>
        </div>
        <div>
          <dt>{t('enterprise.projects.fields.publishedAt')}</dt>
          <dd>{project.publishedAt || missing}</dd>
        </div>
      </dl>
      <p className={styles.quickViewHint}>{t('enterprise.projects.quickView.hint')}</p>
      <Button type='primary' long icon={<ArrowRight />} onClick={() => onViewDetails(project)}>
        {t('enterprise.projects.actions.viewDetails')}
      </Button>
    </aside>
  );
};

export default ProjectQuickView;
