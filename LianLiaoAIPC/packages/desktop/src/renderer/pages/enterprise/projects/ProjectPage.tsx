import { Refresh, Search } from '@icon-park/react';
import { Button, Form, Input, Select } from 'antd';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import type { EnterpriseProjectFilterDimension, EnterpriseProjectSummary } from '@/common/enterprise/contracts';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
import { useEnterprisePaginationScroll } from '@/renderer/pages/enterprise/layout/useEnterprisePaginationScroll';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import ProjectDashboard from './ProjectDashboard';
import type { ProjectFilters } from './projectData';
import { useProjectCatalog, useProjectDashboard } from './projectData';
import ProjectQuickView from './ProjectQuickView';
import ProjectTable from './ProjectTable';
import styles from './project-workspace.module.css';
import { useProjectFilterOptions } from './useProjectFilterOptions';

export type ProjectPageProps = { client?: EnterpriseClient };

const MATERIAL_FILTER_DIMENSIONS: EnterpriseProjectFilterDimension[] = [
  'categoryL1',
  'categoryL2',
  'materialShortName',
  'materialName',
];
const MIN_VISIBLE_CATEGORY_L2_PROJECT_COUNT = 50;

const ProjectPage: React.FC<ProjectPageProps> = ({ client = enterpriseClient }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const overview = useProjectDashboard(client);
  const catalog = useProjectCatalog(client);
  const filterOptions = useProjectFilterOptions(client);
  const [draftFilters, setDraftFilters] = useState<ProjectFilters>({});
  const [selectedProject, setSelectedProject] = useState<EnterpriseProjectSummary | null>(null);
  const selectionTriggerRef = useRef<HTMLTableRowElement | null>(null);
  const catalogSectionRef = useRef<HTMLElement | null>(null);
  const { targetRef: listTopRef, scrollToTarget } = useEnterprisePaginationScroll<HTMLDivElement>();

  const clearPreviewAndFocus = (preferredTarget?: HTMLElement | null) => {
    const hadSelection = selectedProject !== null;
    setSelectedProject(null);
    if (!hadSelection) return;
    window.requestAnimationFrame(() => {
      const target = preferredTarget?.isConnected ? preferredTarget : catalogSectionRef.current;
      target?.focus({ preventScroll: true });
    });
  };

  const viewDetails = (project: EnterpriseProjectSummary) => {
    navigate(`/enterprise/projects/${encodeURIComponent(project.hpInfoId)}`);
  };
  const applyFilters = () => {
    clearPreviewAndFocus(catalogSectionRef.current);
    // Only submit filters that remain visible in the desktop workspace. This also
    // prevents stale city or investment values from surviving a development hot reload.
    catalog.applyFilters({
      keyword: draftFilters.keyword,
      province: draftFilters.province,
      categoryL1: draftFilters.categoryL1,
      categoryL2: draftFilters.categoryL2,
      materialShortName: draftFilters.materialShortName,
      materialName: draftFilters.materialName,
    });
  };
  const resetFilters = () => {
    setDraftFilters({});
    filterOptions.reset();
    clearPreviewAndFocus(catalogSectionRef.current);
    catalog.applyFilters({});
  };
  const changePage = (pageNum: number, pageSize: number) => {
    clearPreviewAndFocus(catalogSectionRef.current);
    catalog.changePage(pageNum, pageSize);
    scrollToTarget();
  };
  const retry = () => {
    overview.retry();
    catalog.retry();
  };

  const changeDatabaseFilter = (field: EnterpriseProjectFilterDimension, value: string | undefined) => {
    const next: ProjectFilters = { ...draftFilters, [field]: value };
    if (field === 'province') {
      next.city = undefined;
      next.categoryL1 = undefined;
      next.categoryL2 = undefined;
      next.materialShortName = undefined;
      next.materialName = undefined;
      filterOptions.clear(['city', ...MATERIAL_FILTER_DIMENSIONS]);
      void filterOptions.load({ dimension: 'categoryL1', province: value });
    } else if (field === 'categoryL1') {
      next.categoryL2 = undefined;
      next.materialShortName = undefined;
      next.materialName = undefined;
      filterOptions.clear(['categoryL2', 'materialShortName', 'materialName']);
      if (value) {
        void filterOptions.load({
          dimension: 'categoryL2',
          province: next.province,
          categoryL1: value,
        });
      }
    } else if (field === 'categoryL2') {
      next.materialShortName = undefined;
      next.materialName = undefined;
      filterOptions.clear(['materialShortName', 'materialName']);
      if (value && next.categoryL1) {
        void filterOptions.load({
          dimension: 'materialShortName',
          province: next.province,
          categoryL1: next.categoryL1,
          categoryL2: value,
        });
      }
    } else if (field === 'materialShortName') {
      next.materialName = undefined;
      filterOptions.clear(['materialName']);
      if (value && next.categoryL1 && next.categoryL2) {
        void filterOptions.load({
          dimension: 'materialName',
          province: next.province,
          categoryL1: next.categoryL1,
          categoryL2: next.categoryL2,
          materialShortName: value,
        });
      }
    }
    setDraftFilters(next);
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
        <section
          ref={catalogSectionRef}
          className={styles.catalogSection}
          aria-labelledby='project-catalog-title'
          tabIndex={-1}
        >
          <div className={styles.sectionHeading}>
            <div>
              <h2 id='project-catalog-title'>{t('enterprise.projects.catalog.title')}</h2>
            </div>
            {/*<p>{t('enterprise.projects.catalog.description')}</p>*/}
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
                listTopRef={listTopRef}
                page={catalog.data}
                loading={catalog.isLoading && catalog.isRetainingData}
                selected={selectedProject}
                onSelect={(project, trigger) => {
                  selectionTriggerRef.current = trigger;
                  setSelectedProject(project);
                }}
                onViewDetails={viewDetails}
                onPageChange={changePage}
              />
              {selectedProject ? (
                <ProjectQuickView
                  project={selectedProject}
                  onClose={() => clearPreviewAndFocus(selectionTriggerRef.current)}
                  onViewDetails={viewDetails}
                />
              ) : null}
            </div>
          )}
        </section>
      </>
    );
  };

  const linkedDatabaseFields: EnterpriseProjectFilterDimension[] = [
    'categoryL1',
    'categoryL2',
    'materialShortName',
    'materialName',
  ];

  const renderDatabaseFilter = (field: EnterpriseProjectFilterDimension) => {
    const state = filterOptions.states[field];
    const visibleOptions =
      field === 'categoryL2'
        ? state.options.filter((option) => option.projectCount > MIN_VISIBLE_CATEGORY_L2_PROJECT_COUNT)
        : state.options;
    const disabled =
      (field === 'categoryL2' && !draftFilters.categoryL1) ||
      (field === 'materialShortName' && !draftFilters.categoryL2) ||
      (field === 'materialName' && !draftFilters.materialShortName);
    const notFoundContent = state.loading
      ? t('enterprise.projects.filters.optionsLoading')
      : state.failed
        ? t('enterprise.projects.filters.optionsError')
        : t('enterprise.projects.filters.optionsEmpty');
    return (
      <Form.Item key={field} label={t(`enterprise.projects.filters.${field}Label`)}>
        <Select
          value={draftFilters[field]}
          aria-label={t(`enterprise.projects.filters.${field}Label`)}
          allowClear
          showSearch
          loading={state.loading}
          disabled={disabled}
          optionFilterProp='label'
          notFoundContent={<span className={styles.optionState}>{notFoundContent}</span>}
          options={visibleOptions.map((option) => ({
            value: option.value,
            label: `${option.label} (${option.projectCount})`,
          }))}
          placeholder={t(`enterprise.projects.filters.${field}Placeholder`)}
          onChange={(selected) => changeDatabaseFilter(field, selected)}
        />
      </Form.Item>
    );
  };

  return (
    <section className={styles.page} aria-labelledby='project-page-title'>
      <header className={styles.pageHeader}>
        <div>
          <h1 id='project-page-title'>{t('enterprise.routes.projects.title')}</h1>
          <p>{t('enterprise.projects.description')}</p>
        </div>
        <div className={styles.headerRule} aria-hidden='true' />
      </header>

      <Form className={styles.filterForm} layout='vertical' onFinish={applyFilters}>
        <div className={styles.linkedFilterRow}>{linkedDatabaseFields.map(renderDatabaseFilter)}</div>
        <Form.Item className={styles.keywordFilter} label={t('enterprise.projects.filters.keywordLabel')}>
          <Input
            value={draftFilters.keyword}
            maxLength={100}
            allowClear
            placeholder={t('enterprise.projects.filters.keywordPlaceholder')}
            onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
          />
        </Form.Item>
        <div className={styles.provinceFilter}>{renderDatabaseFilter('province')}</div>
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
