import { ArrowRight, Refresh, Search } from '@icon-park/react';
import { Button, Form, Input, Tag } from 'antd';
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
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
import { useEnterprisePaginationScroll } from '@/renderer/pages/enterprise/layout/useEnterprisePaginationScroll';
import CompanyMembershipBadge from '@/renderer/pages/enterprise/membership/CompanyMembershipBadge';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import { parseSafeProductImageUrl, type ProductFilters, useProductCatalog } from './productData';
import ProductQuickView from './ProductQuickView';
import styles from './product-catalog.module.css';

export type ProductListPageProps = { client?: EnterpriseClient };

const productFiltersFromQuery = (query: ProductListQuery): ProductFilters => ({
  keyword: query.keyword,
  industry: query.industry,
  province: query.province,
  city: query.city,
  district: query.district,
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
        <p>{product.summary || missing}</p>
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
  const initialQueryRef = useRef<ProductListQuery>(restoredReturn?.query ?? { pageNum: 1, pageSize: 20 });
  const catalog = useProductCatalog(client, initialQueryRef.current);
  const [draftFilters, setDraftFilters] = useState<ProductFilters>(() =>
    productFiltersFromQuery(initialQueryRef.current)
  );
  const [selectedProduct, setSelectedProduct] = useState<EnterpriseProductSummary | null>(null);
  const restoredRef = useRef(false);
  const { targetRef, scrollToTarget } = useEnterprisePaginationScroll<HTMLDivElement>();

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
        {(['keyword', 'industry', 'province', 'city', 'district'] as const).map((field) => (
          <Form.Item key={field} label={t(`enterprise.products.filters.${field}Label`)}>
            <Input
              value={draftFilters[field]}
              allowClear
              placeholder={t(`enterprise.products.filters.${field}Placeholder`)}
              onChange={(event) => setDraftFilters((current) => ({ ...current, [field]: event.target.value }))}
            />
          </Form.Item>
        ))}
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
      eyebrow={t('enterprise.products.eyebrow')}
      title={t('enterprise.routes.products.title')}
      description={t('enterprise.products.description')}
      filters={filters}
    >
      {renderContent()}
    </EnterpriseCatalogShell>
  );
};

export default ProductListPage;
