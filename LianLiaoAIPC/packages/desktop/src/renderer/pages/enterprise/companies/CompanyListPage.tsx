import { Refresh, Search } from '@icon-park/react';
import { Button, Form, Input, Select, Table, type TableColumnsType } from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import type { CompanyListQuery, EnterpriseCompanySummary } from '@/common/enterprise/contracts';
import {
  CatalogFilterCard,
  CatalogPagination,
  EnterpriseCatalogShell,
} from '@/renderer/pages/enterprise/layout/catalog/CatalogLayout';
import {
  createCatalogReturnState,
  getEnterpriseCatalogScrollTop,
  readCatalogReturnState,
  restoreEnterpriseCatalogScroll,
} from '@/renderer/pages/enterprise/layout/catalog/catalogReturnState';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
import { useEnterprisePaginationScroll } from '@/renderer/pages/enterprise/layout/useEnterprisePaginationScroll';
import CompanyMembershipBadge from '@/renderer/pages/enterprise/membership/CompanyMembershipBadge';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import CompanyQuickView from './CompanyQuickView';
import { COMPANY_LEVEL_FILTERS, COMPANY_VIP_FILTER_VALUE, type CompanyFilters, useCompanyCatalog } from './companyData';
import styles from './company-catalog.module.css';

export type CompanyListPageProps = {
  client?: EnterpriseClient;
};

const companyDetailPath = (companyId: string): string => `/enterprise/companies/${encodeURIComponent(companyId)}`;

const companyFiltersFromQuery = (query: CompanyListQuery): CompanyFilters => ({
  keyword: query.keyword,
  industry: query.industry,
  province: query.province,
  city: query.city,
  district: query.district,
  companyLevel: query.companyLevel,
  vip: query.vip,
});

const CompanyListPage: React.FC<CompanyListPageProps> = ({ client = enterpriseClient }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const restoredReturn = useMemo(() => readCatalogReturnState(location.state, 'companies'), [location.state]);
  const initialQueryRef = useRef<CompanyListQuery>(restoredReturn?.query ?? { pageNum: 1, pageSize: 20 });
  const catalog = useCompanyCatalog(client, initialQueryRef.current);
  const [draftFilters, setDraftFilters] = useState<CompanyFilters>(() =>
    companyFiltersFromQuery(initialQueryRef.current)
  );
  const [selectedCompany, setSelectedCompany] = useState<EnterpriseCompanySummary | null>(null);
  const restoredRef = useRef(false);
  const { targetRef, scrollToTarget } = useEnterprisePaginationScroll<HTMLDivElement>();
  const missing = t('enterprise.companies.missing');

  useEffect(() => {
    if (!catalog.data || restoredRef.current) return;
    restoredRef.current = true;
    if (restoredReturn?.selectedId) {
      setSelectedCompany(catalog.data.list.find((company) => company.companyId === restoredReturn.selectedId) ?? null);
    }
    restoreEnterpriseCatalogScroll(restoredReturn?.scrollTop ?? 0);
  }, [catalog.data, restoredReturn]);

  const viewDetails = (company: EnterpriseCompanySummary) => {
    navigate(companyDetailPath(company.companyId), {
      state: createCatalogReturnState({
        kind: 'companies',
        path: '/enterprise/companies',
        query: catalog.query,
        selectedId: company.companyId,
        scrollTop: getEnterpriseCatalogScrollTop(),
      }),
    });
  };

  const columns = useMemo<TableColumnsType<EnterpriseCompanySummary>>(
    () => [
      {
        title: t('enterprise.companies.columns.name'),
        dataIndex: 'name',
        width: 210,
        render: (_value, company) => (
          <div className={styles.companyNameCell}>
            <strong>{company.name}</strong>
            <span>{company.shortName || missing}</span>
          </div>
        ),
      },
      {
        title: t('enterprise.companies.columns.industry'),
        dataIndex: 'industry',
        width: 150,
        render: (value) => value || missing,
      },
      {
        title: t('enterprise.companies.columns.region'),
        width: 180,
        render: (_value, company) =>
          [company.province, company.city, company.district].filter(Boolean).join(' / ') || missing,
      },
      {
        title: t('enterprise.companies.columns.memberLevel'),
        dataIndex: 'companyLevel',
        width: 120,
        render: (value) => <CompanyMembershipBadge level={typeof value === 'number' ? value : undefined} compact />,
      },
      {
        title: t('enterprise.companies.columns.businessSummary'),
        dataIndex: 'businessSummary',
        width: 240,
        ellipsis: true,
        render: (value) => value || missing,
      },
      {
        title: t('enterprise.companies.columns.actions'),
        width: 116,
        fixed: 'right',
        render: (_value, company) => (
          <Button
            type='text'
            size='small'
            onClick={(event) => {
              event.stopPropagation();
              viewDetails(company);
            }}
          >
            {t('enterprise.companies.actions.viewDetails')}
          </Button>
        ),
      },
    ],
    [missing, t]
  );

  const resetFilters = () => {
    const emptyFilters: CompanyFilters = {};
    setDraftFilters(emptyFilters);
    setSelectedCompany(null);
    catalog.applyFilters(emptyFilters);
  };

  const submitFilters = () => {
    setSelectedCompany(null);
    catalog.applyFilters(draftFilters);
  };

  const changePage = (pageNum: number, pageSize: number) => {
    setSelectedCompany(null);
    catalog.changePage(pageNum, pageSize);
    scrollToTarget();
  };

  const renderContent = () => {
    if (catalog.errorCode) {
      return (
        <EnterprisePageState
          state='error'
          title={t('enterprise.companies.error.title')}
          description={t('enterprise.companies.error.description')}
          onRetry={catalog.retry}
        />
      );
    }

    if (catalog.isLoading && !catalog.data) {
      return <EnterprisePageState state='loading' title={t('enterprise.companies.loading')} />;
    }

    if (!catalog.data?.list.length) {
      return (
        <EnterprisePageState
          state='empty'
          title={t('enterprise.companies.empty.title')}
          description={t('enterprise.companies.empty.description')}
        />
      );
    }

    return (
      <div className={selectedCompany ? styles.catalogGridWithPreview : styles.catalogGrid}>
        <div ref={targetRef} className={styles.tablePanel}>
          <Table<EnterpriseCompanySummary>
            rowKey='companyId'
            columns={columns}
            dataSource={catalog.data.list}
            pagination={false}
            loading={catalog.isLoading && catalog.isRetainingData}
            scroll={{ x: 1016 }}
            rowClassName={(company) => (company.companyId === selectedCompany?.companyId ? styles.selectedRow : '')}
            onRow={(company) => ({
              tabIndex: 0,
              'aria-selected': company.companyId === selectedCompany?.companyId,
              onClick: () => setSelectedCompany(company),
              onDoubleClick: () => viewDetails(company),
              onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  viewDetails(company);
                } else if (event.key === ' ') {
                  event.preventDefault();
                  setSelectedCompany(company);
                }
              },
            })}
          />
          <CatalogPagination
            current={catalog.query.pageNum}
            pageSize={catalog.query.pageSize}
            total={catalog.data.total}
            resultLabel={t('enterprise.companies.resultCount', { count: catalog.data.total })}
            onChange={changePage}
          />
        </div>
        {selectedCompany ? (
          <CompanyQuickView
            company={selectedCompany}
            onClose={() => setSelectedCompany(null)}
            onViewDetails={viewDetails}
          />
        ) : null}
      </div>
    );
  };

  const filters = (
    <CatalogFilterCard>
      <Form className={styles.filterForm} layout='vertical' onFinish={submitFilters}>
        <Form.Item label={t('enterprise.companies.filters.keywordLabel')}>
          <Input
            value={draftFilters.keyword}
            allowClear
            placeholder={t('enterprise.companies.filters.keywordPlaceholder')}
            onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
          />
        </Form.Item>
        <Form.Item label={t('enterprise.companies.filters.industryLabel')}>
          <Input
            value={draftFilters.industry}
            allowClear
            placeholder={t('enterprise.companies.filters.industryPlaceholder')}
            onChange={(event) => setDraftFilters((current) => ({ ...current, industry: event.target.value }))}
          />
        </Form.Item>
        <Form.Item label={t('enterprise.companies.filters.provinceLabel')}>
          <Input
            value={draftFilters.province}
            allowClear
            placeholder={t('enterprise.companies.filters.provincePlaceholder')}
            onChange={(event) => setDraftFilters((current) => ({ ...current, province: event.target.value }))}
          />
        </Form.Item>
        <Form.Item label={t('enterprise.companies.filters.cityLabel')}>
          <Input
            value={draftFilters.city}
            allowClear
            placeholder={t('enterprise.companies.filters.cityPlaceholder')}
            onChange={(event) => setDraftFilters((current) => ({ ...current, city: event.target.value }))}
          />
        </Form.Item>
        <Form.Item label={t('enterprise.companies.filters.districtLabel')}>
          <Input
            value={draftFilters.district}
            allowClear
            placeholder={t('enterprise.companies.filters.districtPlaceholder')}
            onChange={(event) => setDraftFilters((current) => ({ ...current, district: event.target.value }))}
          />
        </Form.Item>
        <Form.Item label={t('enterprise.companies.filters.memberLevelLabel')}>
          <Select
            value={draftFilters.vip ? COMPANY_VIP_FILTER_VALUE : draftFilters.companyLevel}
            allowClear
            virtual={false}
            placeholder={t('enterprise.companies.filters.memberLevelPlaceholder')}
            options={[
              {
                value: COMPANY_VIP_FILTER_VALUE,
                label: (
                  <span className={styles.memberFilterOption}>
                    <CompanyMembershipBadge level={1.2} compact />
                    <span>{t('enterprise.companies.memberLevel.vipAggregate')}</span>
                  </span>
                ),
              },
              ...COMPANY_LEVEL_FILTERS.map((level) => ({
                value: level,
                label: <CompanyMembershipBadge level={level} compact />,
              })),
            ]}
            onChange={(membership) =>
              setDraftFilters((current) => ({
                ...current,
                vip: membership === COMPANY_VIP_FILTER_VALUE ? true : undefined,
                companyLevel: typeof membership === 'number' ? membership : undefined,
              }))
            }
          />
        </Form.Item>
        <div className={styles.filterActions}>
          <Button htmlType='submit' type='primary' icon={<Search />}>
            {t('enterprise.companies.actions.search')}
          </Button>
          <Button icon={<Refresh />} onClick={resetFilters}>
            {t('enterprise.companies.actions.reset')}
          </Button>
        </div>
      </Form>
    </CatalogFilterCard>
  );

  return (
    <EnterpriseCatalogShell
      titleId='company-catalog-title'
      eyebrow={t('enterprise.companies.eyebrow')}
      title={t('enterprise.routes.companies.title')}
      description={t('enterprise.companies.description')}
      filters={filters}
    >
      {renderContent()}
    </EnterpriseCatalogShell>
  );
};

export default CompanyListPage;
