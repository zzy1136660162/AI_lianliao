import { Button, Form, Input, InputNumber } from '@arco-design/web-react';
import { Refresh, Search } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import type { EnterpriseProjectSummary } from '@/common/enterprise/contracts';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import ProjectDashboard from './ProjectDashboard';
import type { ProjectFilters } from './projectData';
import { useProjectCatalog, useProjectDashboard } from './projectData';
import ProjectQuickView from './ProjectQuickView';
import ProjectTable from './ProjectTable';
import styles from './project-workspace.module.css';

export type ProjectPageProps = { client?: EnterpriseClient };

const ProjectPage: React.FC<ProjectPageProps> = ({ client = enterpriseClient }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const overview = useProjectDashboard(client);
  const catalog = useProjectCatalog(client);
  const [draftFilters, setDraftFilters] = useState<ProjectFilters>({});
  const [selectedProject, setSelectedProject] = useState<EnterpriseProjectSummary | null>(null);

  const viewDetails = (project: EnterpriseProjectSummary) => {
    navigate(`/enterprise/projects/${encodeURIComponent(project.hpInfoId)}`);
  };
  const applyFilters = () => {
    setSelectedProject(null);
    catalog.applyFilters(draftFilters);
  };
  const resetFilters = () => {
    setDraftFilters({});
    setSelectedProject(null);
    catalog.applyFilters({});
  };
  const changePage = (pageNum: number, pageSize?: number) => {
    setSelectedProject(null);
    catalog.changePage(pageNum, pageSize);
  };
  const retry = () => {
    overview.retry();
    catalog.retry();
  };

  const renderWorkspace = () => {
    if (overview.errorCode || catalog.errorCode) {
      return (
        <EnterprisePageState
          state='error'
          title={t('enterprise.projects.error.title')}
          description={t('enterprise.projects.error.description')}
          onRetry={retry}
        />
      );
    }
    if ((overview.isLoading && !overview.data) || (catalog.isLoading && !catalog.data)) {
      return <EnterprisePageState state='loading' title={t('enterprise.projects.loading')} />;
    }
    if (!overview.data || !catalog.data) {
      return (
        <EnterprisePageState
          state='empty'
          title={t('enterprise.projects.empty.title')}
          description={t('enterprise.projects.empty.description')}
        />
      );
    }
    return (
      <>
        <ProjectDashboard data={overview.data} />
        <section className={styles.catalogSection} aria-labelledby='project-catalog-title'>
          <div className={styles.sectionHeading}>
            <div>
              <span>{t('enterprise.projects.catalog.eyebrow')}</span>
              <h2 id='project-catalog-title'>{t('enterprise.projects.catalog.title')}</h2>
            </div>
            <p>{t('enterprise.projects.catalog.description')}</p>
          </div>
          {!catalog.data.list.length ? (
            <EnterprisePageState
              state='empty'
              title={t('enterprise.projects.empty.title')}
              description={t('enterprise.projects.empty.description')}
            />
          ) : (
            <div className={selectedProject ? styles.catalogWithPreview : styles.catalog}>
              <ProjectTable
                page={catalog.data}
                loading={catalog.isLoading && catalog.isRetainingData}
                selected={selectedProject}
                onSelect={setSelectedProject}
                onViewDetails={viewDetails}
                onPageChange={changePage}
              />
              {selectedProject ? (
                <ProjectQuickView
                  project={selectedProject}
                  onClose={() => setSelectedProject(null)}
                  onViewDetails={viewDetails}
                />
              ) : null}
            </div>
          )}
        </section>
      </>
    );
  };

  const textFields = [
    'keyword',
    'categoryL1',
    'categoryL2',
    'materialShortName',
    'materialName',
    'province',
    'city',
  ] as const;

  return (
    <section className={styles.page} aria-labelledby='project-page-title'>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>{t('enterprise.projects.eyebrow')}</span>
          <h1 id='project-page-title'>{t('enterprise.routes.projects.title')}</h1>
          <p>{t('enterprise.projects.description')}</p>
        </div>
        <div className={styles.headerRule} aria-hidden='true' />
      </header>

      <Form className={styles.filterForm} layout='vertical' onSubmit={applyFilters}>
        {textFields.map((field) => (
          <Form.Item key={field} label={t(`enterprise.projects.filters.${field}Label`)}>
            <Input
              value={draftFilters[field]}
              allowClear
              placeholder={t(`enterprise.projects.filters.${field}Placeholder`)}
              onChange={(value) => setDraftFilters((current) => ({ ...current, [field]: value }))}
            />
          </Form.Item>
        ))}
        {(['minInvestment', 'maxInvestment'] as const).map((field) => (
          <Form.Item key={field} label={t(`enterprise.projects.filters.${field}Label`)}>
            <InputNumber
              value={draftFilters[field]}
              min={0}
              precision={2}
              placeholder={t(`enterprise.projects.filters.${field}Placeholder`)}
              onChange={(value) =>
                setDraftFilters((current) => ({ ...current, [field]: typeof value === 'number' ? value : undefined }))
              }
            />
          </Form.Item>
        ))}
        <div className={styles.filterActions}>
          <Button htmlType='submit' type='primary' icon={<Search />}>
            {t('enterprise.projects.actions.search')}
          </Button>
          <Button icon={<Refresh />} onClick={resetFilters}>
            {t('enterprise.projects.actions.reset')}
          </Button>
        </div>
      </Form>

      <div className={styles.workspace}>{renderWorkspace()}</div>
    </section>
  );
};

export default ProjectPage;
