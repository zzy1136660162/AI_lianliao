import { Card, Progress, Statistic } from 'antd';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { EnterpriseDashboardDistributionItem } from '@/common/enterprise/contracts';

import type { ProjectDashboardBundle } from './projectData';
import styles from './project-workspace.module.css';

export type ProjectDashboardProps = { data: ProjectDashboardBundle };

const DistributionList: React.FC<{
  items: EnterpriseDashboardDistributionItem[];
  emptyText: string;
}> = ({ items, emptyText }) => {
  const maximum = Math.max(0, ...items.map((item) => item.value));
  if (!items.length) return <p className={styles.distributionEmpty}>{emptyText}</p>;
  return (
    <ol className={styles.distributionList}>
      {items.slice(0, 8).map((item) => (
        <li key={`${item.label}-${item.dimension ?? ''}`}>
          <div>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
          <Progress percent={maximum === 0 ? 0 : (item.value / maximum) * 100} showInfo={false} size='small' />
        </li>
      ))}
    </ol>
  );
};

const ProjectDashboard: React.FC<ProjectDashboardProps> = ({ data }) => {
  const { t } = useTranslation();
  const { dashboard, drillItems } = data;
  const metrics = [
    ['projects', dashboard.projectCount],
    ['categoryL1', dashboard.categoryL1Count],
    ['categoryL2', dashboard.categoryL2Count],
    ['materialShortName', dashboard.materialShortNameCount],
    ['materialName', dashboard.materialNameCount],
    ['investment', dashboard.investmentTotalYi],
  ] as const;

  return (
    <section className={styles.dashboard} aria-labelledby='project-dashboard-title'>
      <div className={styles.sectionHeading}>
        <div>
          <span>{t('enterprise.projects.dashboard.eyebrow')}</span>
          <h2 id='project-dashboard-title'>{t('enterprise.projects.dashboard.title')}</h2>
        </div>
        {dashboard.updatedAt ? (
          <p>{t('enterprise.projects.dashboard.updatedAt', { date: dashboard.updatedAt })}</p>
        ) : null}
      </div>

      <div className={styles.metricGrid}>
        {metrics.map(([key, value], index) => (
          <Card key={key} className={index < 2 ? styles.metricPrimary : styles.metricCard} variant='outlined'>
            <Statistic
              title={t(`enterprise.projects.dashboard.metrics.${key}`)}
              value={value}
              suffix={t(`enterprise.projects.dashboard.units.${key}`)}
            />
          </Card>
        ))}
      </div>

      <div className={styles.insightGrid}>
        <Card title={t('enterprise.projects.dashboard.regionTitle')} variant='outlined'>
          <DistributionList
            items={dashboard.regionDistribution}
            emptyText={t('enterprise.projects.dashboard.distributionEmpty')}
          />
        </Card>
        <Card title={t('enterprise.projects.dashboard.materialTitle')} variant='outlined'>
          <DistributionList
            items={dashboard.materialTop}
            emptyText={t('enterprise.projects.dashboard.distributionEmpty')}
          />
        </Card>
      </div>

      <Card className={styles.drillCard} title={t('enterprise.projects.dashboard.categoryTitle')} variant='outlined'>
        {drillItems.length ? (
          <div className={styles.drillGrid}>
            {drillItems.slice(0, 8).map((item, index) => (
              <article key={`${item.dimension}-${item.label}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{item.label}</h3>
                <dl>
                  <div>
                    <dt>{t('enterprise.projects.dashboard.projectCount')}</dt>
                    <dd>{item.projectCount}</dd>
                  </div>
                  <div>
                    <dt>{t('enterprise.projects.dashboard.materialCount')}</dt>
                    <dd>{item.materialNameCount ?? 0}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.distributionEmpty}>{t('enterprise.projects.dashboard.categoryEmpty')}</p>
        )}
      </Card>
    </section>
  );
};

export default ProjectDashboard;
