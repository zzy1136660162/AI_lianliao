import { Button, Form, Input, Pagination, Select, Table, Tag, type TableColumnsType } from 'antd';
import { Plus } from '@icon-park/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import type {
  EnterpriseDemandSummary,
  EnterpriseDemandTypeOption,
  EnterprisePage,
} from '@/common/enterprise/contracts';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
import { useEnterprisePaginationScroll } from '@/renderer/pages/enterprise/layout/useEnterprisePaginationScroll';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import SupplyDemandQuickView from './SupplyDemandQuickView';
import { buildDemandListQuery, loadDemandList, loadDemandTypes, type DemandListFilters } from './supplyDemandData';
import styles from './supply-demand.module.css';

export type SupplyDemandListPageProps = { client?: EnterpriseClient };

const SupplyDemandListPage: React.FC<SupplyDemandListPageProps> = ({ client = enterpriseClient }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<DemandListFilters>({});
  const [filters, setFilters] = useState<DemandListFilters>({});
  const [pagination, setPagination] = useState({ pageNum: 1, pageSize: 20 });
  const [page, setPage] = useState<EnterprisePage<EnterpriseDemandSummary> | null>(null);
  const [demandTypes, setDemandTypes] = useState<EnterpriseDemandTypeOption[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [selected, setSelected] = useState<EnterpriseDemandSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const generationRef = useRef(0);
  const pendingPageScrollRef = useRef(false);
  const { targetRef: listTopRef, scrollToTarget } = useEnterprisePaginationScroll<HTMLDivElement>();

  const query = useMemo(() => buildDemandListQuery(filters, pagination), [filters, pagination]);

  useEffect(() => {
    const controller = new AbortController();
    setTypesLoading(true);
    void loadDemandTypes(client, controller.signal)
      .then(setDemandTypes)
      .catch(() => setDemandTypes([]))
      .finally(() => {
        if (!controller.signal.aborted) setTypesLoading(false);
      });
    return () => controller.abort();
  }, [client]);

  useEffect(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    void loadDemandList(client, query, controller.signal)
      .then((result) => {
        if (generation !== generationRef.current) return;
        setPage(result);
        setSelected((current) =>
          current
            ? (result.list.find((item) => item.demandId === current.demandId && item.typeId === current.typeId) ?? null)
            : null
        );
        if (pendingPageScrollRef.current) {
          pendingPageScrollRef.current = false;
          scrollToTarget();
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && generation === generationRef.current) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === generationRef.current) setLoading(false);
      });
    return () => controller.abort();
  }, [client, query, reloadKey, scrollToTarget]);

  const columns: TableColumnsType<EnterpriseDemandSummary> = [
    {
      title: t('enterprise.supplyDemand.columns.title'),
      dataIndex: 'title',
      key: 'title',
      render: (_value, item) => (
        <div className={styles.titleCell}>
          <strong>{item.title}</strong>
        </div>
      ),
    },
    {
      title: t('enterprise.supplyDemand.columns.type'),
      dataIndex: 'typeName',
      key: 'typeName',
      width: 120,
      responsive: ['lg'],
      render: (value: string) => <Tag color='blue'>{value}</Tag>,
    },
    {
      title: t('enterprise.supplyDemand.columns.region'),
      key: 'region',
      width: 150,
      responsive: ['xl'],
      render: (_value, item) => [item.city, item.district].filter(Boolean).join(' / ') || '-',
    },
    {
      title: t('enterprise.supplyDemand.columns.budget'),
      dataIndex: 'budget',
      key: 'budget',
      width: 110,
      responsive: ['xl'],
      render: (value?: string) => value || '-',
    },
    {
      title: t('enterprise.supplyDemand.columns.progress'),
      key: 'progress',
      width: 138,
      responsive: ['xxl'],
      render: (_value, item) => (
        <div className={styles.progressCell}>
          <span>
            {t(
              item.statMode === 'APPLICATION'
                ? 'enterprise.supplyDemand.stats.applied'
                : 'enterprise.supplyDemand.stats.grabbed',
              { count: item.grabCount ?? 0 }
            )}
          </span>
          <span>{t('enterprise.supplyDemand.stats.remaining', { count: item.remainingGrabCount ?? 0 })}</span>
          {item.capacityLabel ? (
            <span>{t('enterprise.supplyDemand.stats.capacity', { value: item.capacityLabel })}</span>
          ) : null}
        </div>
      ),
    },
    {
      title: t('enterprise.supplyDemand.columns.remainingDays'),
      dataIndex: 'remainingDays',
      key: 'remainingDays',
      width: 100,
      responsive: ['xxl'],
      render: (value?: number) =>
        value === undefined ? '-' : t('enterprise.supplyDemand.stats.daysRemaining', { count: value }),
    },
    {
      title: t('enterprise.supplyDemand.columns.publishedAt'),
      dataIndex: 'publishedAt',
      key: 'publishedAt',
      width: 118,
      responsive: ['xxl'],
      render: (value?: string) => value || '-',
    },
    {
      title: t('enterprise.supplyDemand.columns.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value?: number) => {
        if (value === 0) return <Tag color='green'>{t('enterprise.supplyDemand.status.open')}</Tag>;
        if (value === 1) return <Tag>{t('enterprise.supplyDemand.status.closed')}</Tag>;
        if (value === 2) return <Tag color='default'>{t('enterprise.supplyDemand.status.expired')}</Tag>;
        return '-';
      },
    },
    {
      title: t('enterprise.supplyDemand.columns.actions'),
      key: 'actions',
      width: 160,
      render: (_value, item) => (
        <div className={styles.rowActions}>
          <Button className={styles.rowAction} type='link' onClick={() => setSelected(item)}>
            {t('enterprise.supplyDemand.actions.preview')}
          </Button>
          <Link
            className={styles.rowAction}
            aria-label={t('enterprise.supplyDemand.actions.detail')}
            to={`/enterprise/supply-demand/${encodeURIComponent(String(item.typeId))}/${encodeURIComponent(item.demandId)}`}
          >
            {t('enterprise.supplyDemand.actions.detail')}
          </Link>
        </div>
      ),
    },
  ];

  const search = () => {
    pendingPageScrollRef.current = false;
    setFilters(draft);
    setPagination((current) => ({ ...current, pageNum: 1 }));
    setSelected(null);
  };

  const reset = () => {
    pendingPageScrollRef.current = false;
    setDraft({});
    setFilters({});
    setPagination({ pageNum: 1, pageSize: 20 });
    setSelected(null);
  };

  const renderContent = () => {
    if (loading && !page)
      return <EnterprisePageState state='loading' title={t('enterprise.supplyDemand.states.loading')} />;
    if (failed) {
      return (
        <EnterprisePageState
          state='error'
          title={t('enterprise.supplyDemand.states.errorTitle')}
          description={t('enterprise.supplyDemand.states.errorDescription')}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      );
    }
    if (!page || page.list.length === 0) {
      return (
        <EnterprisePageState
          state='empty'
          title={t('enterprise.supplyDemand.states.emptyTitle')}
          description={t('enterprise.supplyDemand.states.emptyDescription')}
        />
      );
    }
    return (
      <div className={selected ? styles.catalogWithPreview : styles.catalog}>
        <div className={styles.tablePanel}>
          <Table
            rowKey={(item) => `${item.typeId}:${item.demandId}`}
            columns={columns}
            dataSource={page.list}
            pagination={false}
            loading={loading}
          />
          <div className={styles.paginationBar}>
            <span>{t('enterprise.supplyDemand.total', { total: page.total })}</span>
            <Pagination
              current={page.pageNum}
              pageSize={page.pageSize}
              total={page.total}
              responsive
              showSizeChanger
              pageSizeOptions={[10, 20, 50]}
              onChange={(pageNum, pageSize) => {
                pendingPageScrollRef.current = true;
                setPagination({ pageNum, pageSize });
              }}
            />
          </div>
        </div>
        {selected ? <SupplyDemandQuickView demand={selected} onClose={() => setSelected(null)} /> : null}
      </div>
    );
  };

  return (
    <section className={styles.page} aria-labelledby='enterprise-supply-demand-title'>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>{t('enterprise.supplyDemand.eyebrow')}</span>
          <h1 id='enterprise-supply-demand-title'>{t('enterprise.routes.supplyDemand.title')}</h1>
          <p>{t('enterprise.routes.supplyDemand.description')}</p>
        </div>
        <div className={styles.headerActions}>
          <Button type='primary' icon={<Plus />} onClick={() => navigate('/enterprise/supply-demand/publish')}>
            {t('enterprise.supplyDemand.actions.publish')}
          </Button>
          <span className={styles.headerRule} aria-hidden='true' />
        </div>
      </header>

      <Form className={styles.filterForm} layout='vertical' onFinish={search}>
        <Form.Item label={t('enterprise.supplyDemand.filters.keyword')} htmlFor='supply-demand-keyword'>
          <Input
            id='supply-demand-keyword'
            value={draft.keyword ?? ''}
            placeholder={t('enterprise.supplyDemand.filters.keywordPlaceholder')}
            onChange={(event) => setDraft((current) => ({ ...current, keyword: event.target.value }))}
          />
        </Form.Item>
        <Form.Item label={t('enterprise.supplyDemand.filters.type')} htmlFor='supply-demand-type'>
          <Select
            id='supply-demand-type'
            allowClear
            loading={typesLoading}
            value={draft.typeId}
            placeholder={t('enterprise.supplyDemand.filters.allTypes')}
            options={demandTypes.map(({ typeId, typeName }) => ({ value: typeId, label: typeName }))}
            onChange={(typeId) => setDraft((current) => ({ ...current, typeId }))}
          />
        </Form.Item>
        <Form.Item label={t('enterprise.supplyDemand.filters.city')} htmlFor='supply-demand-city'>
          <Input
            id='supply-demand-city'
            value={draft.city ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))}
          />
        </Form.Item>
        <Form.Item label={t('enterprise.supplyDemand.filters.district')} htmlFor='supply-demand-district'>
          <Input
            id='supply-demand-district'
            value={draft.district ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, district: event.target.value }))}
          />
        </Form.Item>
        <Form.Item label={t('enterprise.supplyDemand.filters.status')} htmlFor='supply-demand-status'>
          <Select
            id='supply-demand-status'
            allowClear
            value={draft.status}
            options={[
              { value: 0, label: t('enterprise.supplyDemand.status.open') },
              { value: 1, label: t('enterprise.supplyDemand.status.closed') },
              { value: 2, label: t('enterprise.supplyDemand.status.expired') },
            ]}
            onChange={(status) => setDraft((current) => ({ ...current, status }))}
          />
        </Form.Item>
        <div className={styles.filterActions}>
          <Button onClick={reset}>{t('enterprise.supplyDemand.actions.reset')}</Button>
          <Button type='primary' htmlType='submit'>
            {t('enterprise.supplyDemand.actions.search')}
          </Button>
        </div>
      </Form>

      <div ref={listTopRef} className={styles.content}>
        {renderContent()}
      </div>
    </section>
  );
};

export default SupplyDemandListPage;
