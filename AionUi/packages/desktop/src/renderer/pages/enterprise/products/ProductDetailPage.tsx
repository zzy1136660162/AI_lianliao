import { Button, Card, Tag } from '@arco-design/web-react';
import { CubeFive, Left } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { EnterpriseProductDetail } from '@/common/enterprise/contracts';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import { parseSafeProductImageUrl, useProductDetail } from './productData';
import styles from './product-catalog.module.css';

export type ProductDetailPageProps = { client?: EnterpriseClient };

export const DetailImage: React.FC<{ product: EnterpriseProductDetail }> = ({ product }) => {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const imageUrl = parseSafeProductImageUrl(product.imageUrl);

  useEffect(() => {
    setFailed(false);
  }, [product.productId, product.imageUrl]);

  return (
    <div className={styles.detailImage}>
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt={t('enterprise.products.imageAlt', { name: product.name })}
          onError={() => setFailed(true)}
        />
      ) : (
        <div role='img' aria-label={t('enterprise.products.imageUnavailable')}>
          <CubeFive size={34} />
          <span>{t('enterprise.products.imageUnavailable')}</span>
        </div>
      )}
    </div>
  );
};

const ProductDetailPage: React.FC<ProductDetailPageProps> = ({ client = enterpriseClient }) => {
  const { productId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const detail = useProductDetail(client, productId);
  const missing = t('enterprise.products.missing');

  const renderContent = () => {
    if (detail.isInvalidId) {
      return (
        <EnterprisePageState
          state='error'
          title={t('enterprise.productDetail.invalid.title')}
          description={t('enterprise.productDetail.invalid.description')}
        />
      );
    }
    if (detail.errorCode) {
      return (
        <EnterprisePageState
          state='error'
          title={t('enterprise.productDetail.error.title')}
          description={t('enterprise.productDetail.error.description')}
          onRetry={detail.retry}
        />
      );
    }
    if (detail.isLoading || !detail.data) {
      return <EnterprisePageState state='loading' title={t('enterprise.productDetail.loading')} />;
    }

    const product = detail.data;
    const region = [product.province, product.city, product.district].filter(Boolean).join(' / ') || missing;
    const displayIndustry = product.industry || product.companyIndustry;
    const showCompanyIndustry = Boolean(product.companyIndustry) && product.companyIndustry !== displayIndustry;
    return (
      <div className={styles.detailBody}>
        <section className={styles.detailHero} aria-labelledby='product-name'>
          <DetailImage product={product} />
          <div className={styles.detailIdentity}>
            <span className={styles.eyebrow}>{t('enterprise.productDetail.profileEyebrow')}</span>
            <h2 id='product-name'>{product.name}</h2>
            <div className={styles.detailTags}>
              {displayIndustry ? <Tag>{displayIndustry}</Tag> : null}
              <Tag>{region}</Tag>
            </div>
            <Link className={styles.detailCompanyLink} to={`/enterprise/companies/${product.companyId}`}>
              {product.companyName || missing}
            </Link>
          </div>
        </section>

        <div className={styles.detailColumns}>
          <Card title={t('enterprise.productDetail.sections.profile')} bordered>
            <dl className={styles.detailFacts}>
              <div>
                <dt>{t('enterprise.products.fields.company')}</dt>
                <dd>{product.companyName || missing}</dd>
              </div>
              <div>
                <dt>{t('enterprise.products.fields.industry')}</dt>
                <dd>{displayIndustry || missing}</dd>
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
                <dt>{t('enterprise.products.fields.address')}</dt>
                <dd>{product.address || missing}</dd>
              </div>
            </dl>
          </Card>
          <Card title={t('enterprise.productDetail.sections.contact')} bordered>
            <dl className={styles.detailFacts}>
              <div>
                <dt>{t('enterprise.products.fields.contactName')}</dt>
                <dd>{product.contactName || missing}</dd>
              </div>
              <div>
                <dt>{t('enterprise.products.fields.phone')}</dt>
                <dd>{product.phone || missing}</dd>
              </div>
            </dl>
            <p className={styles.permissionNote}>{t('enterprise.productDetail.contactPermissionNote')}</p>
          </Card>
        </div>
        <Card title={t('enterprise.productDetail.sections.summary')} bordered>
          <p className={styles.plainText}>{product.summary || missing}</p>
        </Card>
      </div>
    );
  };

  return (
    <section className={styles.page} aria-labelledby='product-detail-title'>
      <header className={styles.detailPageHeader}>
        <Button type='text' icon={<Left />} onClick={() => navigate('/enterprise/products')}>
          {t('enterprise.productDetail.backToList')}
        </Button>
        <div>
          <span className={styles.eyebrow}>{t('enterprise.productDetail.eyebrow')}</span>
          <h1 id='product-detail-title'>{t('enterprise.routes.productDetail.title')}</h1>
        </div>
      </header>
      <div className={styles.content}>{renderContent()}</div>
    </section>
  );
};

export default ProductDetailPage;
