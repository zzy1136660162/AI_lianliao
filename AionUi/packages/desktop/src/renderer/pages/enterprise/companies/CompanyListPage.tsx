import { Button, Form, Input, Pagination, Select, Table, type TableColumnProps } from '@arco-design/web-react';
import { Refresh, Search } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import type { EnterpriseCompanySummary } from '@/common/enterprise/contracts';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';

import CompanyQuickView from './CompanyQuickView';
import { type CompanyFilters, useCompanyCatalog } from './companyData';
import styles from './company-catalog.module.css';

export type CompanyListPageProps = {
  client?: EnterpriseClient;
};

const companyDetailPath = (companyId: string): string => `/enterprise/companies/${encodeURIComponent(companyId)}`;

const CompanyListPage: React.FC<CompanyListPageProps> = ({ client = enterpriseClient }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const catalog = useCompanyCatalog(client);
  const [draftFilters, setDraftFilters] = useState<CompanyFilters>({});
  const [selectedCompany, setSelectedCompany] = useState<EnterpriseCompanySummary | null>(null);
  const missing = t('enterprise.companies.missing');

  const viewDetails = (company: EnterpriseCompanySummary) => {
    navigate(companyDetailPath(company.companyId));
  };

  const columns = useMemo<TableColumnProps<EnterpriseCompanySummary>[]>(
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
        render: (value) =>
          typeof value === 'number'
            ? t('enterprise.companies.memberLevel.value', { level: value })
            : t('enterprise.companies.memberLevel.unknown'),
      },
      {
        title: t('enterprise.companies.columns.businessSummary'),
        dataIndex: 'businessSummary',
        width: 240,
        ellipsis: true,
        render: (value) => value || missing,
      },
      {
        title: t('enterprise.companies.columns.updatedAt'),
        dataIndex: 'updatedAt',
        width: 132,
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
    catalog.applyFilters(emptyFilters);
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
        <div className={styles.tablePanel}>
          <Table<EnterpriseCompanySummary>
            rowKey='companyId'
            columns={columns}
            data={catalog.data.list}
            pagination={false}
            loading={catalog.isLoading && catalog.isRetainingData}
            scroll={{ x: 1148 }}
            onRow={(company) => ({
              tabIndex: 0,
              onClick: () => setSelectedCompany(company),
              onDoubleClick: () => viewDetails(company),
              onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedCompany(company);
                }
              },
            })}
          />
          <div className={styles.paginationBar}>
            <span>{t('enterprise.companies.resultCount', { count: catalog.data.total })}</span>
            <Pagination
              current={catalog.query.pageNum}
              pageSize={catalog.query.pageSize}
              total={catalog.data.total}
              size='small'
              showJumper
              showTotal
              sizeCanChange
              sizeOptions={[10, 20, 50]}
              onChange={catalog.changePage}
            />
          </div>
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

  return (
    <section className={styles.page} aria-labelledby='company-catalog-title'>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>{t('enterprise.companies.eyebrow')}</span>
          <h1 id='company-catalog-title'>{t('enterprise.routes.companies.title')}</h1>
          <p>{t('enterprise.companies.description')}</p>
        </div>
        <div className={styles.headerRule} aria-hidden='true' />
      </header>

      <Form className={styles.filterForm} layout='vertical' onSubmit={() => catalog.applyFilters(draftFilters)}>
        <Form.Item label={t('enterprise.companies.filters.keywordLabel')}>
          <Input
            value={draftFilters.keyword}
            allowClear
            placeholder={t('enterprise.companies.filters.keywordPlaceholder')}
            onChange={(keyword) => setDraftFilters((current) => ({ ...current, keyword }))}
          />
        </Form.Item>
        <Form.Item label={t('enterprise.companies.filters.industryLabel')}>
          <Input
            value={draftFilters.industry}
            allowClear
            placeholder={t('enterprise.companies.filters.industryPlaceholder')}
            onChange={(industry) => setDraftFilters((current) => ({ ...current, industry }))}
          />
        </Form.Item>
        <Form.Item label={t('enterprise.companies.filters.provinceLabel')}>
          <Input
            value={draftFilters.province}
            allowClear
            placeholder={t('enterprise.companies.filters.provincePlaceholder')}
            onChange={(province) => setDraftFilters((current) => ({ ...current, province }))}
          />
        </Form.Item>
        <Form.Item label={t('enterprise.companies.filters.cityLabel')}>
          <Input
            value={draftFilters.city}
            allowClear
            placeholder={t('enterprise.companies.filters.cityPlaceholder')}
            onChange={(city) => setDraftFilters((current) => ({ ...current, city }))}
          />
        </Form.Item>
        <Form.Item label={t('enterprise.companies.filters.districtLabel')}>
          <Input
            value={draftFilters.district}
            allowClear
            placeholder={t('enterprise.companies.filters.districtPlaceholder')}
            onChange={(district) => setDraftFilters((current) => ({ ...current, district }))}
          />
        </Form.Item>
        <Form.Item label={t('enterprise.companies.filters.memberLevelLabel')}>
          <Select
            value={draftFilters.companyLevel}
            allowClear
            placeholder={t('enterprise.companies.filters.memberLevelPlaceholder')}
            options={[1, 2, 3, 4, 5, 6].map((level) => ({
              value: level,
              label: t('enterprise.companies.memberLevel.value', { level }),
            }))}
            onChange={(companyLevel) =>
              setDraftFilters((current) => ({
                ...current,
                companyLevel: typeof companyLevel === 'number' ? companyLevel : undefined,
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

      <div className={styles.content}>{renderContent()}</div>
    </section>
  );
};

export default CompanyListPage;
