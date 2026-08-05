import { Card, Collapse, Empty, Statistic } from 'antd';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import EnterpriseChart from '@/renderer/pages/enterprise/charts/EnterpriseChart';
import {
  buildCategoryComparisonOption,
  buildDistributionBarOption,
} from '@/renderer/pages/enterprise/charts/projectChartOptions';

import type { ProjectDashboardBundle } from './projectData';
import styles from './project-workspace.module.css';

export type ProjectDashboardProps = { data: ProjectDashboardBundle };

const ProjectDashboardContent: React.FC<ProjectDashboardProps> = ({ data }) => {
  const { t } = useTranslation();
  const { dashboard, drillItems } = data;
  const reducedMotion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);
  const regionOption = useMemo(
    () => buildDistributionBarOption(dashboard.regionDistribution, reducedMotion),
    [dashboard.regionDistribution, reducedMotion]
  );
  const materialOption = useMemo(
    () => buildDistributionBarOption(dashboard.materialTop, reducedMotion),
    [dashboard.materialTop, reducedMotion]
  );
  const categoryOption = useMemo(
    () => buildCategoryComparisonOption(drillItems, reducedMotion),
    [drillItems, reducedMotion]
  );
  const emptyDistribution = t('enterprise.projects.dashboard.distributionEmpty');
  const emptyCategory = t('enterprise.projects.dashboard.categoryEmpty');
  const metrics = [
    ['projects', dashboard.projectCount],
    ['categoryL1', dashboard.categoryL1Count],
    ['categoryL2', dashboard.categoryL2Count],
    ['materialShortName', dashboard.materialShortNameCount],
    ['materialName', dashboard.materialNameCount],
    ['investment', dashboard.investmentTotalYi],
  ] as const;

  return (
    <>
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
          {regionOption ? (
            <div className={styles.chartFrame}>
              <EnterpriseChart
                ariaLabel={t('enterprise.projects.dashboard.regionTitle')}
                option={regionOption}
                rows={dashboard.regionDistribution}
                fallback={emptyDistribution}
              />
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDistribution} />
          )}
        </Card>
        <Card title={t('enterprise.projects.dashboard.materialTitle')} variant='outlined'>
          {materialOption ? (
            <div className={styles.chartFrame}>
              <EnterpriseChart
                ariaLabel={t('enterprise.projects.dashboard.materialTitle')}
                option={materialOption}
                rows={dashboard.materialTop}
                fallback={emptyDistribution}
              />
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDistribution} />
          )}
        </Card>
      </div>

      <Card className={styles.drillCard} title={t('enterprise.projects.dashboard.categoryTitle')} variant='outlined'>
        {categoryOption ? (
          <div className={styles.chartFrame}>
            <EnterpriseChart
              ariaLabel={t('enterprise.projects.dashboard.categoryTitle')}
              option={categoryOption}
              rows={drillItems.map((item) => ({
                label: item.label,
                value: `${item.projectCount} / ${item.materialNameCount ?? 0}`,
              }))}
              fallback={emptyCategory}
            />
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyCategory} />
        )}
      </Card>
    </>
  );
};

const ProjectDashboard: React.FC<ProjectDashboardProps> = ({ data }) => {
  const { t } = useTranslation();
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const expanded = activeKeys.includes('overview');
  const { dashboard } = data;

  return (
    <section className={styles.dashboard} aria-labelledby='project-dashboard-title'>
      <Collapse
        className={styles.dashboardCollapse}
        bordered={false}
        activeKey={activeKeys}
        onChange={(keys) => setActiveKeys(Array.isArray(keys) ? keys : [keys])}
        items={[
          {
            key: 'overview',
            label: (
              <div className={styles.dashboardHeading}>
                <div>
                  <span>{t('enterprise.projects.dashboard.eyebrow')}</span>
                  <h2 id='project-dashboard-title'>{t('enterprise.projects.dashboard.title')}</h2>
                </div>
                <div className={styles.dashboardHeadingMeta}>
                  {dashboard.updatedAt ? (
                    <p>{t('enterprise.projects.dashboard.updatedAt', { date: dashboard.updatedAt })}</p>
                  ) : null}
                  <span>
                    {t(expanded ? 'enterprise.projects.dashboard.collapse' : 'enterprise.projects.dashboard.expand')}
                  </span>
                </div>
              </div>
            ),
            children: expanded ? <ProjectDashboardContent data={data} /> : null,
          },
        ]}
      />
    </section>
  );
};

export default ProjectDashboard;
