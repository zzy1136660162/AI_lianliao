import { ArrowRight, BuildingFour } from '@icon-park/react';
import { Button, Tag } from 'antd';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { EnterpriseProductSummary } from '@/common/enterprise/contracts';
import { CatalogQuickViewPanel } from '@/renderer/pages/enterprise/layout/catalog/CatalogLayout';
import CompanyMembershipBadge from '@/renderer/pages/enterprise/membership/CompanyMembershipBadge';

import ProductRichText from './ProductRichText';
import styles from './product-catalog.module.css';

export type ProductQuickViewProps = {
  product: EnterpriseProductSummary;
  onClose: () => void;
  onViewDetails: (product: EnterpriseProductSummary) => void;
};

const ProductQuickView: React.FC<ProductQuickViewProps> = ({ product, onClose, onViewDetails }) => {
  const quickViewRef = useRef<HTMLElement>(null);
  const { t } = useTranslation();
  const missing = t('enterprise.products.missing');
  const region = [product.province, product.city, product.district].filter(Boolean).join(' / ') || missing;
  const displayIndustry = product.industry || product.companyIndustry;
  const showCompanyIndustry = Boolean(product.companyIndustry) && product.companyIndustry !== displayIndustry;

  useEffect(() => {
    const quickView = quickViewRef.current;
    if (!quickView) return;

    quickView.focus({ preventScroll: true });
    if (!window.matchMedia('(max-width: 820px)').matches) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    quickView.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [product.productId]);

  return (
    <CatalogQuickViewPanel
      panelRef={quickViewRef}
      tabIndex={-1}
      ariaLabel={t('enterprise.products.quickView.label')}
      closeAriaLabel={t('enterprise.products.actions.closeQuickView')}
      eyebrow={t('enterprise.products.quickView.title')}
      title={product.name}
      badge={
        product.companyLevel !== undefined ? (
          <CompanyMembershipBadge level={product.companyLevel} compact />
        ) : displayIndustry ? (
          <Tag>{displayIndustry}</Tag>
        ) : undefined
      }
      onClose={onClose}
      footer={
        <div className={styles.quickViewActions}>
          <p className={styles.quickViewHint}>{t('enterprise.products.quickView.hint')}</p>
          <Button type='primary' block icon={<ArrowRight />} onClick={() => onViewDetails(product)}>
            {t('enterprise.products.quickView.action')}
          </Button>
          <Link className={styles.companyLink} to={`/enterprise/companies/${encodeURIComponent(product.companyId)}`}>
            <BuildingFour aria-hidden='true' />
            {t('enterprise.products.actions.viewCompany')}
          </Link>
        </div>
      }
    >
      <dl className={styles.quickViewFacts}>
        <div>
          <dt>{t('enterprise.products.fields.company')}</dt>
          <dd>{product.companyName || missing}</dd>
        </div>
        {showCompanyIndustry ? (
          <div>
            <dt>{t('enterprise.products.fields.companyIndustry')}</dt>
            <dd>{product.companyIndustry}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t('enterprise.products.fields.region')}</dt>
          <dd>{region}</dd>
        </div>
        <div>
          <dt>{t('enterprise.products.fields.summary')}</dt>
          <dd>
            <ProductRichText className={styles.richText} html={product.summary} fallback={missing} />
          </dd>
        </div>
      </dl>
    </CatalogQuickViewPanel>
  );
};

export default ProductQuickView;
