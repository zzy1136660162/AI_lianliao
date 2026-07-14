import { Button, Tag } from '@arco-design/web-react';
import { ArrowRight, BuildingFour, CloseSmall } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { EnterpriseProductSummary } from '@/common/enterprise/contracts';

import styles from './product-catalog.module.css';

export type ProductQuickViewProps = {
  product: EnterpriseProductSummary;
  onClose: () => void;
  onViewDetails: (product: EnterpriseProductSummary) => void;
};

const ProductQuickView: React.FC<ProductQuickViewProps> = ({ product, onClose, onViewDetails }) => {
  const { t } = useTranslation();
  const missing = t('enterprise.products.missing');
  const region = [product.province, product.city, product.district].filter(Boolean).join(' / ') || missing;

  return (
    <aside className={styles.quickView} role='complementary' aria-label={t('enterprise.products.quickView.label')}>
      <div className={styles.quickViewIndex}>
        {t('enterprise.products.quickView.index', { index: product.productId.slice(-4).padStart(4, '0') })}
      </div>
      <Button
        className={styles.quickViewClose}
        type='text'
        size='small'
        icon={<CloseSmall />}
        aria-label={t('enterprise.products.actions.closeQuickView')}
        onClick={onClose}
      />
      <div className={styles.quickViewHeading}>
        <span>{t('enterprise.products.quickView.title')}</span>
        <h2>{product.name}</h2>
        {product.industry || product.companyIndustry ? <Tag>{product.industry || product.companyIndustry}</Tag> : null}
      </div>

      <dl className={styles.quickViewFacts}>
        <div>
          <dt>{t('enterprise.products.fields.company')}</dt>
          <dd>{product.companyName || missing}</dd>
        </div>
        <div>
          <dt>{t('enterprise.products.fields.region')}</dt>
          <dd>{region}</dd>
        </div>
        <div>
          <dt>{t('enterprise.products.fields.summary')}</dt>
          <dd>{product.summary || missing}</dd>
        </div>
      </dl>

      <p className={styles.quickViewHint}>{t('enterprise.products.quickView.hint')}</p>
      <div className={styles.quickViewActions}>
        <Button type='primary' long icon={<ArrowRight />} onClick={() => onViewDetails(product)}>
          {t('enterprise.products.actions.viewDetails')}
        </Button>
        <Link className={styles.companyLink} to={`/enterprise/companies/${encodeURIComponent(product.companyId)}`}>
          <BuildingFour aria-hidden='true' />
          {t('enterprise.products.actions.viewCompany')}
        </Link>
      </div>
    </aside>
  );
};

export default ProductQuickView;
