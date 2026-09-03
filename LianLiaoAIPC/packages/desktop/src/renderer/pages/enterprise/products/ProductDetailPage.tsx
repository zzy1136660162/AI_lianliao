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
  createCompanyDetailProductReturnState,
  type ProductDetailOrigin,
  readAiConversationReturnState,
  readCatalogReturnState,
  readProductDetailCompanyReturnState,
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
  const productCatalogReturn = useMemo(() => readCatalogReturnState(location.state, 'products'), [location.state]);
  const companyCatalogReturn = useMemo(() => readCatalogReturnState(location.state, 'companies'), [location.state]);
  const companyReturn = useMemo(() => readProductDetailCompanyReturnState(location.state), [location.state]);
  const aiConversationReturn = useMemo(
    () => readAiConversationReturnState(location.state) ?? companyReturn?.aiConversationReturn ?? null,
    [companyReturn, location.state]
  );
  const detail = useProductDetail(client, productId);
  const missing = t('enterprise.products.missing');
  const productDetailOrigin = useMemo<ProductDetailOrigin | undefined>(() => {
    if (companyReturn) return { kind: 'company-detail', companyReturn };
    if (aiConversationReturn) return { kind: 'ai-conversation', aiConversationReturn };
    const catalogReturn = companyCatalogReturn ?? productCatalogReturn;
    return catalogReturn ? { kind: 'catalog', catalogReturn } : undefined;
  }, [aiConversationReturn, companyCatalogReturn, companyReturn, productCatalogReturn]);

  const backToList = () => {
    if (companyReturn) {
      navigate(`/enterprise/companies/${encodeURIComponent(companyReturn.companyId)}`, {
        state: companyReturn.aiConversationReturn
          ? companyReturn.aiConversationReturn
          : companyReturn.catalogReturn
            ? createCatalogReturnState(companyReturn.catalogReturn)
            : undefined,
      });
      return;
    }
    if (aiConversationReturn) {
      navigate(aiConversationReturn.path, { state: { targetMessageId: aiConversationReturn.targetMessageId } });
      return;
    }
    const catalogReturn = companyCatalogReturn ?? productCatalogReturn;
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
    const contactCard = (
      <DetailSectionCard title={t('enterprise.productDetail.sections.contact')}>
        <EnterpriseContactAccessPanel
          client={client}
          resourceType='PRODUCT'
          resourceId={product.productId}
          resourceTitle={product.name}
          toCompanyId={product.companyId}
          toCompanyName={product.companyName}
          contactName={product.contactName}
          contactNameLabel={t('enterprise.products.fields.contactName')}
          maskedPhone={product.phone}
        />
      </DetailSectionCard>
    );
    const sidebar = (
      <StickyDetailSidebar ariaLabel={t('enterprise.products.fields.company')}>
        <DetailSectionCard title={t('enterprise.products.fields.company')}>
          <div className={styles.companySummary}>
            <BuildingFour size={28} aria-hidden='true' />
            <div>
              <Link
                className={styles.detailCompanyLink}
                to={`/enterprise/companies/${encodeURIComponent(product.companyId)}`}
                state={createCompanyDetailProductReturnState(product.productId, productDetailOrigin)}
              >
                {product.companyName || missing}
              </Link>
              {product.companyLevel !== undefined ? (
                <CompanyMembershipBadge level={product.companyLevel} compact />
              ) : null}
            </div>
          </div>
        </DetailSectionCard>
      </StickyDetailSidebar>
    );

    return (
      <div className={styles.detailBody}>
        <DetailHeroCard media={<DetailImage product={product} />} aside={contactCard} ariaLabelledBy='product-name'>
          <div className={styles.detailIdentity}>
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
          {t(
            companyReturn
              ? 'enterprise.productDetail.backToCompanyDetail'
              : companyCatalogReturn
                ? 'enterprise.productDetail.backToCompanyList'
                : 'enterprise.productDetail.backToList'
          )}
        </Button>
        <div>
          <h1 id='product-detail-title'>{t('enterprise.routes.productDetail.title')}</h1>
        </div>
      </header>
      <div className={styles.detailContent}>{renderContent()}</div>
    </section>
  );
};

export default ProductDetailPage;
