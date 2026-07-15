import { Card, Progress, Statistic, Tag } from '@arco-design/web-react';
import { ArrowRight, Box, BuildingFour, ChartHistogram, EngineeringBrand, RadarChart, User } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useEnterpriseAuth } from '@/renderer/hooks/context/EnterpriseAuthContext';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
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
    const distributions = [
      {
        key: 'regions',
        title: t('enterprise.projects.dashboard.regionTitle'),
        items: dashboard.regionDistribution,
      },
      {
        key: 'materials',
        title: t('enterprise.projects.dashboard.materialTitle'),
        items: dashboard.materialTop,
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
          {distributions.map(({ key, title, items }) => {
            const maximum = Math.max(0, ...items.map((item) => item.value));
            return (
              <section key={key} aria-label={title}>
                <h3>{title}</h3>
                {items.length ? (
                  <ol>
                    {items.slice(0, 4).map((item) => (
                      <li key={`${item.label}-${item.dimension ?? ''}`}>
                        <div>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                        <Progress
                          percent={maximum === 0 ? 0 : (item.value / maximum) * 100}
                          showText={false}
                          size='small'
                        />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>{t('enterprise.projects.dashboard.distributionEmpty')}</p>
                )}
              </section>
            );
          })}
        </div>
        <div className={styles.radarCategories}>
          <span>{t('enterprise.projects.dashboard.categoryTitle')}</span>
          <div>
            {drillItems.slice(0, 5).map((item) => (
              <Tag key={`${item.dimension}-${item.label}`}>{item.label}</Tag>
            ))}
            {!drillItems.length ? <small>{t('enterprise.projects.dashboard.categoryEmpty')}</small> : null}
          </div>
        </div>
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
        <Card className={styles.identityCard} bordered>
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
                <dd>{t('enterprise.companies.memberLevel.value', { level: user.companyLevel })}</dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <Card className={styles.quickCard} bordered>
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
