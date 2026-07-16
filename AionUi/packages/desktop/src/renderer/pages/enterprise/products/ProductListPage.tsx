import { ArrowRight, Refresh, Search } from '@icon-park/react';
import { Button, Form, Input, Pagination, Tag } from 'antd';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import type { EnterpriseProductSummary } from '@/common/enterprise/contracts';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
import { useEnterprisePaginationScroll } from '@/renderer/pages/enterprise/layout/useEnterprisePaginationScroll';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import { parseSafeProductImageUrl, type ProductFilters, useProductCatalog } from './productData';
import ProductQuickView from './ProductQuickView';
import styles from './product-catalog.module.css';

export type ProductListPageProps = { client?: EnterpriseClient };

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
      <span className={styles.cardIndex} aria-hidden='true'>
        {product.productId.slice(-3).padStart(3, '0')}
      </span>
    </div>
  );
};

const ProductCard: React.FC<{
  product: EnterpriseProductSummary;
  onSelect: (product: EnterpriseProductSummary) => void;
  onViewDetails: (product: EnterpriseProductSummary) => void;
}> = ({ product, onSelect, onViewDetails }) => {
  const { t } = useTranslation();
  const missing = t('enterprise.products.missing');
  const region = [product.province, product.city, product.district].filter(Boolean).join(' / ') || missing;
  const displayIndustry = product.industry || product.companyIndustry;
  return (
    <article className={styles.productCard} aria-label={t('enterprise.products.cardLabel', { name: product.name })}>
      <ProductImage product={product} />
      <div className={styles.cardBody}>
        <div className={styles.cardHeading}>
          <span>{product.companyName || missing}</span>
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
  const navigate = useNavigate();
  const catalog = useProductCatalog(client);
  const [draftFilters, setDraftFilters] = useState<ProductFilters>({});
  const [selectedProduct, setSelectedProduct] = useState<EnterpriseProductSummary | null>(null);
  const { targetRef, scrollToTarget } = useEnterprisePaginationScroll<HTMLDivElement>();

  const viewDetails = (product: EnterpriseProductSummary) => {
    navigate(`/enterprise/products/${encodeURIComponent(product.productId)}`);
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
                onSelect={setSelectedProduct}
                onViewDetails={viewDetails}
              />
            ))}
          </div>
          <div className={styles.paginationBar}>
            <span>{t('enterprise.products.resultCount', { count: catalog.data.total })}</span>
            <Pagination
              current={catalog.query.pageNum}
              pageSize={catalog.query.pageSize}
              total={catalog.data.total}
              size='small'
              showQuickJumper
              showSizeChanger
              pageSizeOptions={[10, 20, 50]}
              onChange={changePage}
            />
          </div>
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

  return (
    <section className={`enterprise-product-list ${styles.page}`} aria-labelledby='product-catalog-title'>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>{t('enterprise.products.eyebrow')}</span>
          <h1 id='product-catalog-title'>{t('enterprise.routes.products.title')}</h1>
          <p>{t('enterprise.products.description')}</p>
        </div>
        <div className={styles.headerRule} aria-hidden='true' />
      </header>

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

      <div className={styles.content}>{renderContent()}</div>
    </section>
  );
};

export default ProductListPage;
