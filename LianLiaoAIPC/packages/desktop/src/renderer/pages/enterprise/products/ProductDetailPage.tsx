import { BuildingFour, CubeFive, Left } from '@icon-park/react';
import { Button, Tag } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import type { EnterpriseProductDetail } from '@/common/enterprise/contracts';
import EnterpriseContactAccessPanel from '@/renderer/pages/enterprise/contact/EnterpriseContactAccessPanel';
import {
  DetailColumns,
  DetailHeroCard,
  DetailSectionCard,
  StickyDetailSidebar,
} from '@/renderer/pages/enterprise/layout/catalog/DetailLayout';
import {
  createCatalogReturnState,
  readCatalogReturnState,
} from '@/renderer/pages/enterprise/layout/catalog/catalogReturnState';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
import CompanyMembershipBadge from '@/renderer/pages/enterprise/membership/CompanyMembershipBadge';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import { parseSafeProductImageUrl, useProductDetail } from './productData';
import ProductRichText from './ProductRichText';
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
  const location = useLocation();
  const navigate = useNavigate();
  const catalogReturn = useMemo(() => readCatalogReturnState(location.state, 'products'), [location.state]);
  const detail = useProductDetail(client, productId);
  const missing = t('enterprise.products.missing');

  const backToList = () => {
    navigate(catalogReturn?.path ?? '/enterprise/products', {
      state: catalogReturn ? createCatalogReturnState(catalogReturn) : undefined,
    });
  };

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
    const sidebar = (
      <StickyDetailSidebar ariaLabel={t('enterprise.productDetail.sections.contact')}>
        <DetailSectionCard title={t('enterprise.products.fields.company')}>
          <div className={styles.companySummary}>
            <BuildingFour size={28} aria-hidden='true' />
            <div>
              <Link
                className={styles.detailCompanyLink}
                to={`/enterprise/companies/${encodeURIComponent(product.companyId)}`}
              >
                {product.companyName || missing}
              </Link>
              {product.companyLevel !== undefined ? (
                <CompanyMembershipBadge level={product.companyLevel} compact />
              ) : null}
            </div>
          </div>
        </DetailSectionCard>
        <DetailSectionCard title={t('enterprise.productDetail.sections.contact')}>
          <dl className={styles.detailFacts}>
            <div>
              <dt>{t('enterprise.products.fields.contactName')}</dt>
              <dd>{product.contactName || missing}</dd>
            </div>
          </dl>
          <EnterpriseContactAccessPanel
            client={client}
            resourceType='PRODUCT'
            resourceId={product.productId}
            resourceTitle={product.name}
            toCompanyId={product.companyId}
            toCompanyName={product.companyName}
            maskedPhone={product.phone}
          />
        </DetailSectionCard>
      </StickyDetailSidebar>
    );

    return (
      <div className={styles.detailBody}>
        <DetailHeroCard media={<DetailImage product={product} />} ariaLabelledBy='product-name'>
          <div className={styles.detailIdentity}>
            <span className={styles.eyebrow}>{t('enterprise.productDetail.profileEyebrow')}</span>
            <h2 id='product-name'>{product.name}</h2>
            <div className={styles.detailTags}>
              {displayIndustry ? <Tag>{displayIndustry}</Tag> : null}
              <Tag>{region}</Tag>
            </div>
          </div>
        </DetailHeroCard>

        <DetailColumns sidebar={sidebar}>
          <DetailSectionCard title={t('enterprise.productDetail.sections.profile')}>
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
          </DetailSectionCard>
          <DetailSectionCard title={t('enterprise.productDetail.sections.summary')}>
            <ProductRichText className={styles.richText} html={product.summary} fallback={missing} />
          </DetailSectionCard>
        </DetailColumns>
      </div>
    );
  };

  return (
    <section className={styles.page} aria-labelledby='product-detail-title'>
      <header className={styles.detailPageHeader}>
        <Button type='text' icon={<Left />} onClick={backToList}>
          {t('enterprise.productDetail.backToList')}
        </Button>
        <div>
          {/*<span className={styles.eyebrow}>{t('enterprise.productDetail.eyebrow')}</span>*/}
          <h1 id='product-detail-title'>{t('enterprise.routes.productDetail.title')}</h1>
        </div>
      </header>
      <div className={styles.detailContent}>{renderContent()}</div>
    </section>
  );
};

export default ProductDetailPage;
