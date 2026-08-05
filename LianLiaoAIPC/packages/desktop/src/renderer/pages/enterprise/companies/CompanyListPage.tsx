import { Refresh, Search } from '@icon-park/react';
import { Button, Form, Input, Select } from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import type {
  CompanyListQuery,
  EnterpriseCompanySummary,
  EnterpriseProductSummary,
} from '@/common/enterprise/contracts';
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
import LiaoningAreaFields, {
  normalizeLiaoningAreaValue,
} from '@/renderer/pages/enterprise/layout/catalog/LiaoningAreaFields';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
import { useEnterprisePaginationScroll } from '@/renderer/pages/enterprise/layout/useEnterprisePaginationScroll';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import CompanyCatalogRow from './CompanyCatalogRow';
import { type CompanyFilters, useCompanyCatalog, useCompanyIndustryOptions } from './companyData';
import styles from './company-catalog.module.css';

export type CompanyListPageProps = {
  client?: EnterpriseClient;
};

const companyDetailPath = (companyId: string): string => `/enterprise/companies/${encodeURIComponent(companyId)}`;
const productDetailPath = (productId: string): string => `/enterprise/products/${encodeURIComponent(productId)}`;

type CompanySearchFilters = Pick<CompanyFilters, 'keyword' | 'industry' | 'city' | 'district'>;

const companyFiltersFromQuery = (query: CompanyListQuery): CompanySearchFilters => ({
  keyword: query.keyword,
  industry: query.industry,
  ...normalizeLiaoningAreaValue(query.city, query.district),
});

const normalizeCompanyListQuery = (query: CompanyListQuery): CompanyListQuery => ({
  pageNum: query.pageNum,
  pageSize: query.pageSize,
  ...companyFiltersFromQuery(query),
});

const CompanyListPage: React.FC<CompanyListPageProps> = ({ client = enterpriseClient }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const restoredReturn = useMemo(() => readCatalogReturnState(location.state, 'companies'), [location.state]);
  const initialQueryRef = useRef<CompanyListQuery>(
    normalizeCompanyListQuery(restoredReturn?.query ?? { pageNum: 1, pageSize: 20 })
  );
  const catalog = useCompanyCatalog(client, initialQueryRef.current);
  const industryOptions = useCompanyIndustryOptions(client);
  const [draftFilters, setDraftFilters] = useState<CompanySearchFilters>(() =>
    companyFiltersFromQuery(initialQueryRef.current)
  );
  const [selectedCompany, setSelectedCompany] = useState<EnterpriseCompanySummary | null>(null);
  const restoredRef = useRef(false);
  const { targetRef, scrollToTarget } = useEnterprisePaginationScroll<HTMLDivElement>();
  const industrySelectOptions = useMemo(() => {
    const options = industryOptions.data.map(({ industry, companyCount }) => ({
      value: industry,
      label: t('enterprise.companies.filters.industryOption', { industry, count: companyCount }),
    }));
    const selectedIndustry = draftFilters.industry;
    if (selectedIndustry && !options.some((option) => option.value === selectedIndustry)) {
      options.unshift({ value: selectedIndustry, label: selectedIndustry });
    }
    return options;
  }, [draftFilters.industry, industryOptions.data, t]);

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

  const viewProduct = (product: EnterpriseProductSummary) => {
    navigate(productDetailPath(product.productId));
  };

  const resetFilters = () => {
    const emptyFilters: CompanySearchFilters = {};
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
      <div className={styles.catalogGrid}>
        <div ref={targetRef} className={styles.catalogListPanel}>
          <div
            className={[
              styles.catalogList,
              catalog.isLoading && catalog.isRetainingData ? styles.catalogListLoading : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-busy={catalog.isLoading && catalog.isRetainingData}
          >
            {catalog.data.list.map((company) => (
              <CompanyCatalogRow
                key={company.companyId}
                company={company}
                selected={company.companyId === selectedCompany?.companyId}
                onSelect={setSelectedCompany}
                onViewDetails={viewDetails}
                onViewProduct={viewProduct}
              />
            ))}
          </div>
          <CatalogPagination
            current={catalog.query.pageNum}
            pageSize={catalog.query.pageSize}
            total={catalog.data.total}
            resultLabel={t('enterprise.companies.resultCount', { count: catalog.data.total })}
            onChange={changePage}
          />
        </div>
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
          <Select
            value={draftFilters.industry}
            allowClear
            showSearch
            loading={industryOptions.isLoading}
            optionFilterProp='label'
            options={industrySelectOptions}
            placeholder={t('enterprise.companies.filters.industryPlaceholder')}
            onChange={(industry) => setDraftFilters((current) => ({ ...current, industry }))}
          />
        </Form.Item>
        <LiaoningAreaFields
          city={draftFilters.city}
          district={draftFilters.district}
          cityLabel={t('enterprise.companies.filters.cityLabel')}
          cityPlaceholder={t('enterprise.companies.filters.cityPlaceholder')}
          districtLabel={t('enterprise.companies.filters.districtLabel')}
          districtPlaceholder={t('enterprise.companies.filters.districtPlaceholder')}
          onChange={(area) => setDraftFilters((current) => ({ ...current, ...area }))}
        />
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
