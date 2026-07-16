import { ArrowRight, Box, BuildingFour, ChartHistogram, EngineeringBrand, RadarChart, User } from '@icon-park/react';
import { Card, Empty, Statistic } from 'antd';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useEnterpriseAuth } from '@/renderer/hooks/context/EnterpriseAuthContext';
import EnterpriseChart from '@/renderer/pages/enterprise/charts/EnterpriseChart';
import {
  buildCategoryComparisonOption,
  buildDistributionBarOption,
} from '@/renderer/pages/enterprise/charts/projectChartOptions';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
import CompanyMembershipBadge from '@/renderer/pages/enterprise/membership/CompanyMembershipBadge';
import { useProjectDashboard } from '@/renderer/pages/enterprise/projects/projectData';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import GlobalSearch from './GlobalSearch';
import styles from './dashboard-workbench.module.css';

export type DashboardPageProps = { client?: EnterpriseClient };

const quickLinks = [
  { path: '/enterprise/companies', labelKey: 'enterprise.navigation.companies', Icon: BuildingFour },
  { path: '/enterprise/products', labelKey: 'enterprise.navigation.products', Icon: Box },
  { path: '/enterprise/projects', labelKey: 'enterprise.navigation.projects', Icon: EngineeringBrand },
] as const;

/** Authenticated enterprise landing page backed only by live identity and project data. */
const DashboardPage: React.FC<DashboardPageProps> = ({ client = enterpriseClient }) => {
  const { t } = useTranslation();
  const { user } = useEnterpriseAuth();
  const radar = useProjectDashboard(client);
  const reducedMotion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);
  const radarCharts = useMemo(() => {
    if (!radar.data) return null;
    return {
      region: buildDistributionBarOption(radar.data.dashboard.regionDistribution, reducedMotion),
      material: buildDistributionBarOption(radar.data.dashboard.materialTop, reducedMotion),
      category: buildCategoryComparisonOption(radar.data.drillItems, reducedMotion),
    };
  }, [radar.data, reducedMotion]);

  const renderRadar = () => {
    if (radar.errorCode) {
      return (
        <EnterprisePageState
          state='error'
          title={t('enterprise.dashboard.radar.errorTitle')}
          description={t('enterprise.dashboard.radar.errorDescription')}
          onRetry={radar.retry}
        />
      );
    }
    if (radar.isLoading || !radar.data) {
      return <EnterprisePageState state='loading' title={t('enterprise.dashboard.radar.loading')} />;
    }

    const { dashboard, drillItems } = radar.data;
    const emptyDistribution = t('enterprise.projects.dashboard.distributionEmpty');
    const emptyCategory = t('enterprise.projects.dashboard.categoryEmpty');
    const distributions = [
      {
        key: 'regions',
        title: t('enterprise.projects.dashboard.regionTitle'),
        items: dashboard.regionDistribution,
        option: radarCharts?.region ?? null,
      },
      {
        key: 'materials',
        title: t('enterprise.projects.dashboard.materialTitle'),
        items: dashboard.materialTop,
        option: radarCharts?.material ?? null,
      },
    ];
    return (
      <div className={styles.radarContent}>
        <div className={styles.radarMetrics}>
          <Statistic
            title={t('enterprise.projects.dashboard.metrics.projects')}
            value={dashboard.projectCount}
            suffix={t('enterprise.projects.dashboard.units.projects')}
          />
          <Statistic
            title={t('enterprise.projects.dashboard.metrics.investment')}
            value={dashboard.investmentTotalYi}
            suffix={t('enterprise.projects.dashboard.units.investment')}
          />
          <Statistic
            title={t('enterprise.projects.dashboard.metrics.categoryL1')}
            value={dashboard.categoryL1Count}
            suffix={t('enterprise.projects.dashboard.units.categoryL1')}
          />
          <Statistic
            title={t('enterprise.projects.dashboard.metrics.materialName')}
            value={dashboard.materialNameCount}
            suffix={t('enterprise.projects.dashboard.units.materialName')}
          />
        </div>
        <div className={styles.radarDistributions}>
          {distributions.map(({ key, title, items, option }) => (
            <section key={key} aria-label={title}>
              <h3>{title}</h3>
              {option ? (
                <div className={styles.chartFrame}>
                  <EnterpriseChart ariaLabel={title} option={option} rows={items} fallback={emptyDistribution} />
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDistribution} />
              )}
            </section>
          ))}
        </div>
        <section className={styles.radarCategories} aria-label={t('enterprise.projects.dashboard.categoryTitle')}>
          <h3>{t('enterprise.projects.dashboard.categoryTitle')}</h3>
          {radarCharts?.category ? (
            <div className={styles.categoryChartFrame}>
              <EnterpriseChart
                ariaLabel={t('enterprise.projects.dashboard.categoryTitle')}
                option={radarCharts.category}
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
        </section>
      </div>
    );
  };

  return (
    <section className={styles.page} aria-labelledby='enterprise-dashboard-title'>
      <header className={styles.hero}>
        <div>
          <span>{t('enterprise.dashboard.eyebrow')}</span>
          <h1 id='enterprise-dashboard-title'>{t('enterprise.routes.dashboard.title')}</h1>
          <p>{t('enterprise.routes.dashboard.description')}</p>
        </div>
        <div className={styles.heroIndex} aria-hidden='true'>
          {t('enterprise.dashboard.heroIndex')}
        </div>
      </header>

      <GlobalSearch client={client} />

      <div className={styles.overviewGrid}>
        <Card className={styles.identityCard} variant='outlined'>
          <div className={styles.cardHeading}>
            <span>{t('enterprise.dashboard.identity.index')}</span>
            <User aria-hidden='true' />
          </div>
          <div className={styles.identityCompany}>
            <BuildingFour aria-hidden='true' />
            <div>
              <small>{t('enterprise.dashboard.identity.companyLabel')}</small>
              <h2>{user?.companyName || t('enterprise.shell.unknownCompany')}</h2>
            </div>
          </div>
          <dl className={styles.identityFacts}>
            <div>
              <dt>{t('enterprise.dashboard.identity.userLabel')}</dt>
              <dd>{user?.userName || t('enterprise.shell.unknownUser')}</dd>
            </div>
            {user?.companyLevel !== undefined ? (
              <div>
                <dt>{t('enterprise.dashboard.identity.levelLabel')}</dt>
                <dd>
                  <CompanyMembershipBadge level={user.companyLevel} />
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <Card className={styles.quickCard} variant='outlined'>
          <div className={styles.cardHeading}>
            <span>{t('enterprise.dashboard.quick.index')}</span>
            <ChartHistogram aria-hidden='true' />
          </div>
          <h2>{t('enterprise.dashboard.quick.title')}</h2>
          <p>{t('enterprise.dashboard.quick.description')}</p>
          <nav aria-label={t('enterprise.dashboard.quick.ariaLabel')}>
            {quickLinks.map(({ path, labelKey, Icon }) => (
              <Link key={path} to={path}>
                <Icon aria-hidden='true' />
                <span>{t(labelKey)}</span>
                <ArrowRight aria-hidden='true' />
              </Link>
            ))}
          </nav>
        </Card>
      </div>

      <section className={styles.radarSection} aria-labelledby='enterprise-dashboard-radar-title'>
        <div className={styles.radarHeading}>
          <div>
            <span>{t('enterprise.dashboard.radar.eyebrow')}</span>
            <h2 id='enterprise-dashboard-radar-title'>{t('enterprise.dashboard.radar.title')}</h2>
          </div>
          <Link to='/enterprise/projects' className={styles.radarLink}>
            <RadarChart aria-hidden='true' />
            <span>{t('enterprise.dashboard.radar.viewAll')}</span>
            <ArrowRight aria-hidden='true' />
          </Link>
        </div>
        {renderRadar()}
      </section>
    </section>
  );
};

export default DashboardPage;
