import { ArrowRight, Refresh, Search } from '@icon-park/react';
import { Button, Form, Input, Select, Tag } from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import type { EnterpriseProductSummary, ProductListQuery } from '@/common/enterprise/contracts';
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
import CompanyMembershipBadge from '@/renderer/pages/enterprise/membership/CompanyMembershipBadge';
import { useCompanyIndustryOptions } from '@/renderer/pages/enterprise/companies/companyData';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import { parseSafeProductImageUrl, type ProductFilters, useProductCatalog } from './productData';
import { toPlainProductText } from './productDescription';
import ProductQuickView from './ProductQuickView';
import styles from './product-catalog.module.css';

export type ProductListPageProps = { client?: EnterpriseClient };

type ProductSearchFilters = Pick<ProductFilters, 'keyword' | 'industry' | 'city' | 'district'>;

const productFiltersFromQuery = (query: ProductListQuery): ProductSearchFilters => ({
  keyword: query.keyword,
  industry: query.industry,
  ...normalizeLiaoningAreaValue(query.city, query.district),
});

const normalizeProductListQuery = (query: ProductListQuery): ProductListQuery => ({
  pageNum: query.pageNum,
  pageSize: query.pageSize,
  ...productFiltersFromQuery(query),
});

const ProductImage: React.FC<{ product: EnterpriseProductSummary }> = ({ product }) => {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const imageUrl = parseSafeProductImageUrl(product.imageUrl);
  return (
    <div className={styles.cardImage}>
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt={t('enterprise.products.imageAlt', { name: product.name })}
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{t('enterprise.products.imageUnavailable')}</span>
      )}
    </div>
  );
};

const ProductCard: React.FC<{
  product: EnterpriseProductSummary;
  selected: boolean;
  onSelect: (product: EnterpriseProductSummary) => void;
  onViewDetails: (product: EnterpriseProductSummary) => void;
}> = ({ product, selected, onSelect, onViewDetails }) => {
  const { t } = useTranslation();
  const missing = t('enterprise.products.missing');
  const region = [product.province, product.city, product.district].filter(Boolean).join(' / ') || missing;
  const displayIndustry = product.industry || product.companyIndustry;
  const summary = toPlainProductText(product.summary) || missing;
  return (
    <article
      className={[styles.productCard, selected ? styles.selectedCard : ''].filter(Boolean).join(' ')}
      aria-label={t('enterprise.products.cardLabel', { name: product.name })}
    >
      <ProductImage product={product} />
      <div className={styles.cardBody}>
        <div className={styles.cardHeading}>
          <div className={styles.cardCompanyLine}>
            <span>{product.companyName || missing}</span>
            {product.companyLevel !== undefined ? (
              <CompanyMembershipBadge level={product.companyLevel} compact />
            ) : null}
          </div>
          <h2>{product.name}</h2>
        </div>
        <div className={styles.cardTags}>
          {displayIndustry ? <Tag>{displayIndustry}</Tag> : null}
          <Tag>{region}</Tag>
        </div>
        <p>{summary}</p>
        <div className={styles.cardActions}>
          <Button type='text' size='small' onClick={() => onSelect(product)}>
            {t('enterprise.products.actions.quickPreview')}
          </Button>
          <Button type='text' size='small' icon={<ArrowRight />} onClick={() => onViewDetails(product)}>
            {t('enterprise.products.actions.viewDetails')}
          </Button>
        </div>
      </div>
    </article>
  );
};

const ProductListPage: React.FC<ProductListPageProps> = ({ client = enterpriseClient }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const restoredReturn = useMemo(() => readCatalogReturnState(location.state, 'products'), [location.state]);
  const initialQueryRef = useRef<ProductListQuery>(
    normalizeProductListQuery(restoredReturn?.query ?? { pageNum: 1, pageSize: 20 })
  );
  const catalog = useProductCatalog(client, initialQueryRef.current);
  const industryOptions = useCompanyIndustryOptions(client);
  const [draftFilters, setDraftFilters] = useState<ProductSearchFilters>(() =>
    productFiltersFromQuery(initialQueryRef.current)
  );
  const [selectedProduct, setSelectedProduct] = useState<EnterpriseProductSummary | null>(null);
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
      setSelectedProduct(catalog.data.list.find((product) => product.productId === restoredReturn.selectedId) ?? null);
    }
    restoreEnterpriseCatalogScroll(restoredReturn?.scrollTop ?? 0);
  }, [catalog.data, restoredReturn]);

  const viewDetails = (product: EnterpriseProductSummary) => {
    navigate(`/enterprise/products/${encodeURIComponent(product.productId)}`, {
      state: createCatalogReturnState({
        kind: 'products',
        path: '/enterprise/products',
        query: catalog.query,
        selectedId: product.productId,
        scrollTop: getEnterpriseCatalogScrollTop(),
      }),
    });
  };

  const submitFilters = () => {
    setSelectedProduct(null);
    catalog.applyFilters(draftFilters);
  };

  const resetFilters = () => {
    setDraftFilters({});
    setSelectedProduct(null);
    catalog.applyFilters({});
  };

  const changePage = (pageNum: number, pageSize: number) => {
    setSelectedProduct(null);
    catalog.changePage(pageNum, pageSize);
    scrollToTarget();
  };

  const renderContent = () => {
    if (catalog.errorCode) {
      return (
        <EnterprisePageState
          state='error'
          title={t('enterprise.products.error.title')}
          description={t('enterprise.products.error.description')}
          onRetry={catalog.retry}
        />
      );
    }
    if (catalog.isLoading && !catalog.data) {
      return <EnterprisePageState state='loading' title={t('enterprise.products.loading')} />;
    }
    if (!catalog.data?.list.length) {
      return (
        <EnterprisePageState
          state='empty'
          title={t('enterprise.products.empty.title')}
          description={t('enterprise.products.empty.description')}
        />
      );
    }
    return (
      <div className={selectedProduct ? styles.catalogWithPreview : styles.catalog}>
        <div ref={targetRef} className={styles.gridPanel}>
          <div className={styles.productGrid} aria-live='polite' aria-busy={catalog.isLoading}>
            {catalog.data.list.map((product) => (
              <ProductCard
                key={product.productId}
                product={product}
                selected={selectedProduct?.productId === product.productId}
                onSelect={setSelectedProduct}
                onViewDetails={viewDetails}
              />
            ))}
          </div>
          <CatalogPagination
            current={catalog.query.pageNum}
            pageSize={catalog.query.pageSize}
            total={catalog.data.total}
            resultLabel={t('enterprise.products.resultCount', { count: catalog.data.total })}
            onChange={changePage}
          />
        </div>
        {selectedProduct ? (
          <ProductQuickView
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            onViewDetails={viewDetails}
          />
        ) : null}
      </div>
    );
  };

  const filters = (
    <CatalogFilterCard>
      <Form className={styles.filterForm} layout='vertical' onFinish={submitFilters}>
        <Form.Item label={t('enterprise.products.filters.keywordLabel')}>
          <Input
            value={draftFilters.keyword}
            allowClear
            placeholder={t('enterprise.products.filters.keywordPlaceholder')}
            onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
          />
        </Form.Item>
        <Form.Item label={t('enterprise.products.filters.industryLabel')}>
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
          cityLabel={t('enterprise.products.filters.cityLabel')}
          cityPlaceholder={t('enterprise.products.filters.cityPlaceholder')}
          districtLabel={t('enterprise.products.filters.districtLabel')}
          districtPlaceholder={t('enterprise.products.filters.districtPlaceholder')}
          onChange={(area) => setDraftFilters((current) => ({ ...current, ...area }))}
        />
        <div className={styles.filterActions}>
          <Button htmlType='submit' type='primary' icon={<Search />}>
            {t('enterprise.products.actions.search')}
          </Button>
          <Button icon={<Refresh />} onClick={resetFilters}>
            {t('enterprise.products.actions.reset')}
          </Button>
        </div>
      </Form>
    </CatalogFilterCard>
  );

  return (
    <EnterpriseCatalogShell
      className='enterprise-product-list'
      titleId='product-catalog-title'
      title={t('enterprise.routes.products.title')}
      description={t('enterprise.products.description')}
      filters={filters}
    >
      {renderContent()}
    </EnterpriseCatalogShell>
  );
};

export default ProductListPage;
