import { Search } from '@icon-park/react';
import { Button, Input, Pagination, Table, Tabs, Tag, type TableColumnsType } from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import type { EnterpriseIpcErrorCode } from '@/common/enterprise/contracts';
import type { UnifiedResourceType, UnifiedSearchItem } from '@/common/enterprise/unified-search/contracts';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
import { enterpriseClient, type EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import styles from './unified-search.module.css';

type SearchTab = 'ALL' | UnifiedResourceType;

const typeLabels: Record<UnifiedResourceType, string> = {
  COMPANY: '企业',
  PRODUCT: '产品',
  PROJECT: '在建项目',
};

const resultPath = (item: UnifiedSearchItem): string => {
  const segment =
    item.resourceType === 'COMPANY' ? 'companies' : item.resourceType === 'PRODUCT' ? 'products' : 'projects';
  return `/enterprise/${segment}/${encodeURIComponent(item.businessId)}`;
};

/** Highlights user keywords as React text nodes; backend HTML is never rendered. */
const HighlightedText: React.FC<{ text: string; keyword: string }> = ({ text, keyword }) => {
  const normalized = keyword.trim();
  if (!normalized) return <>{text}</>;
  const lowerText = text.toLocaleLowerCase();
  const lowerKeyword = normalized.toLocaleLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let match = lowerText.indexOf(lowerKeyword);
  while (match >= 0) {
    if (match > cursor) parts.push(text.slice(cursor, match));
    parts.push(<mark key={`${match}-${cursor}`}>{text.slice(match, match + normalized.length)}</mark>);
    cursor = match + normalized.length;
    match = lowerText.indexOf(lowerKeyword, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
};

export type UnifiedSearchPageProps = {
  client?: Pick<EnterpriseClient, 'request'>;
};

const UnifiedSearchPage: React.FC<UnifiedSearchPageProps> = ({ client = enterpriseClient }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialKeyword = searchParams.get('q')?.trim() ?? '';
  const [draftKeyword, setDraftKeyword] = useState(initialKeyword);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [tab, setTab] = useState<SearchTab>('ALL');
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [items, setItems] = useState<UnifiedSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<EnterpriseIpcErrorCode | null>(null);
  const requestGeneration = useRef(0);
  const tableTopRef = useRef<HTMLDivElement>(null);
  const ready = Array.from(keyword).length >= 2;

  const load = () => {
    if (!ready) {
      setItems([]);
      setTotal(0);
      setErrorCode(null);
      return;
    }
    const generation = ++requestGeneration.current;
    setLoading(true);
    setErrorCode(null);
    void client
      .request({
        operation: 'unified.search',
        payload: {
          keyword,
          resourceTypes: tab === 'ALL' ? undefined : [tab],
          pageNum,
          pageSize,
          enableGroupTop: false,
          groupTopN: 5,
        },
      })
      .then((response) => {
        if (generation !== requestGeneration.current || response.operation !== 'unified.search') return;
        setItems(response.data.items);
        setTotal(response.data.total);
      })
      .catch((error: unknown) => {
        if (generation !== requestGeneration.current) return;
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? (String(error.code) as EnterpriseIpcErrorCode)
            : 'REQUEST_FAILED';
        setErrorCode(code);
        setItems([]);
        setTotal(0);
      })
      .finally(() => {
        if (generation === requestGeneration.current) setLoading(false);
      });
  };

  useEffect(load, [client, keyword, pageNum, pageSize, ready, tab]);

  const columns = useMemo<TableColumnsType<UnifiedSearchItem>>(
    () => [
      {
        title: '名称',
        dataIndex: 'title',
        width: 260,
        render: (value: string) => (
          <strong className={styles.titleCell}>
            <HighlightedText text={value} keyword={keyword} />
          </strong>
        ),
      },
      {
        title: '类型',
        dataIndex: 'resourceType',
        width: 100,
        render: (value: UnifiedResourceType) => <Tag color='blue'>{typeLabels[value]}</Tag>,
      },
      {
        title: '内容摘要',
        dataIndex: 'summary',
        ellipsis: true,
        render: (value?: string, item?: UnifiedSearchItem) => value || item?.subtitle || '暂未提供',
      },
      {
        title: '所在地区',
        width: 180,
        render: (_value, item) => [item.city, item.district].filter(Boolean).join(' / ') || '暂未提供',
      },
      {
        title: '发布时间',
        dataIndex: 'publishedAt',
        width: 130,
        render: (value?: string) => value || '暂未提供',
      },
      {
        title: '操作',
        width: 100,
        fixed: 'right',
        render: (_value, item) => (
          <Button type='link' onClick={() => navigate(resultPath(item))}>
            查看详情
          </Button>
        ),
      },
    ],
    [keyword, navigate]
  );

  const submit = () => {
    const next = draftKeyword.trim().replace(/\s+/g, ' ');
    if (Array.from(next).length < 2) return;
    setKeyword(next);
    setPageNum(1);
    setSearchParams({ q: next });
  };

  return (
    <section className={styles.page} aria-labelledby='unified-search-title'>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>跨域产业情报</span>
          <h1 id='unified-search-title'>统一检索</h1>
          <p>一次检索企业、产品与在建项目，结果均来自服务端可信业务数据。</p>
        </div>
        <div className={styles.headerRule} aria-hidden='true' />
      </header>

      <div className={styles.searchCard}>
        <Input.Search
          value={draftKeyword}
          maxLength={100}
          allowClear
          enterButton={
            <span className={styles.searchButtonText}>
              <Search />
              检索
            </span>
          }
          placeholder='请输入至少两个字符'
          onChange={(event) => setDraftKeyword(event.target.value)}
          onSearch={submit}
        />
      </div>

      <div ref={tableTopRef} className={styles.resultCard}>
        <Tabs
          activeKey={tab}
          items={[
            { key: 'ALL', label: '全部' },
            { key: 'COMPANY', label: '企业' },
            { key: 'PRODUCT', label: '产品' },
            { key: 'PROJECT', label: '在建项目' },
          ]}
          onChange={(key) => {
            setTab(key as SearchTab);
            setPageNum(1);
          }}
        />
        {!ready ? (
          <EnterprisePageState state='empty' title='请输入检索关键词' description='输入至少两个字符后开始检索。' />
        ) : errorCode ? (
          <EnterprisePageState
            state='error'
            title='统一检索暂不可用'
            description='请稍后重试，或检查本地 cloud-api 服务状态。'
            onRetry={load}
          />
        ) : !loading && items.length === 0 ? (
          <EnterprisePageState state='empty' title='未找到相关结果' description='请尝试更换关键词或资源类型。' />
        ) : (
          <>
            <Table<UnifiedSearchItem>
              rowKey={(item) => `${item.resourceType}-${item.businessId}`}
              columns={columns}
              dataSource={items}
              loading={loading}
              pagination={false}
              scroll={{ x: 980 }}
              onRow={(item) => ({ onDoubleClick: () => navigate(resultPath(item)) })}
            />
            <div className={styles.pagination}>
              <span>共 {total} 条</span>
              <Pagination
                current={pageNum}
                pageSize={pageSize}
                total={total}
                showQuickJumper
                showSizeChanger
                pageSizeOptions={[10, 20, 50]}
                onChange={(nextPage, nextPageSize) => {
                  setPageNum(nextPageSize === pageSize ? nextPage : 1);
                  setPageSize(nextPageSize);
                  requestAnimationFrame(() =>
                    tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  );
                }}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default UnifiedSearchPage;
