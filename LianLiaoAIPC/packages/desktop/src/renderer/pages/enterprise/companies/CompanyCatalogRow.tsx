import { ArrowRight, BuildingOne, CubeFive, Local } from '@icon-park/react';
import { Button, Tag } from 'antd';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { EnterpriseCompanySummary, EnterpriseProductSummary } from '@/common/enterprise/contracts';
import CompanyMembershipBadge from '@/renderer/pages/enterprise/membership/CompanyMembershipBadge';

import { parseSafeCompanyImageUrl } from './companyData';
import styles from './company-catalog.module.css';

export type CompanyCatalogRowProps = {
  company: EnterpriseCompanySummary;
  selected: boolean;
  onSelect: (company: EnterpriseCompanySummary) => void;
  onViewDetails: (company: EnterpriseCompanySummary) => void;
  onViewProduct: (product: EnterpriseProductSummary) => void;
};

const displayRegion = (company: EnterpriseCompanySummary): string =>
  [company.province, company.city, company.district].filter(Boolean).join(' / ');

const formatRegisteredCapital = (
  value: string | undefined,
  locale: string,
  formatNumericValue: (value: string) => string
): string | undefined => {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return normalized;
  return formatNumericValue(new Intl.NumberFormat(locale).format(Number(normalized)));
};

const CompanyLogo: React.FC<{ company: EnterpriseCompanySummary }> = ({ company }) => {
  const [failed, setFailed] = useState(false);
  const logoUrl = parseSafeCompanyImageUrl(company.logoUrl);
  return (
    <div className={styles.catalogLogo}>
      {logoUrl && !failed ? (
        <img src={logoUrl} alt={company.name} onError={() => setFailed(true)} />
      ) : (
        <BuildingOne size={30} aria-hidden='true' />
      )}
    </div>
  );
};

const ProductPreview: React.FC<{
  product: EnterpriseProductSummary;
  onViewProduct: (product: EnterpriseProductSummary) => void;
}> = ({ product, onViewProduct }) => {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const imageUrl = parseSafeCompanyImageUrl(product.imageUrl);
  return (
    <Button
      type='text'
      className={styles.featuredProduct}
      aria-label={product.name}
      onClick={(event) => {
        event.stopPropagation();
        onViewProduct(product);
      }}
    >
      <span className={styles.featuredProductImage}>
        {imageUrl && !failed ? (
          <img
            src={imageUrl}
            alt={t('enterprise.products.imageAlt', { name: product.name })}
            onError={() => setFailed(true)}
          />
        ) : (
          <CubeFive size={20} aria-hidden='true' />
        )}
      </span>
      <span className={styles.featuredProductName}>{product.name}</span>
    </Button>
  );
};

const CompanyCatalogRow: React.FC<CompanyCatalogRowProps> = ({
  company,
  selected,
  onSelect,
  onViewDetails,
  onViewProduct,
}) => {
  const { i18n, t } = useTranslation();
  const missing = t('enterprise.companies.missing');
  const region = displayRegion(company);
  const featuredProducts = company.featuredProducts?.slice(0, 3) ?? [];
  const hiddenProductCount = Math.max(
    0,
    (company.featuredProductCount ?? featuredProducts.length) - featuredProducts.length
  );
  const registeredCapital =
    formatRegisteredCapital(company.registeredCapital, i18n.resolvedLanguage ?? i18n.language, (value) =>
      t('enterprise.companies.registeredCapitalValue', { value })
    ) ?? missing;

  const viewDetails = () => onViewDetails(company);

  return (
    <article
      className={[styles.catalogRow, selected ? styles.selectedCatalogRow : ''].filter(Boolean).join(' ')}
      tabIndex={0}
      aria-selected={selected}
      onClick={() => onSelect(company)}
      onDoubleClick={viewDetails}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          viewDetails();
        } else if (event.key === ' ') {
          event.preventDefault();
          onSelect(company);
        }
      }}
    >
      <div className={styles.catalogIdentity}>
        <CompanyLogo company={company} />
        <div className={styles.catalogIdentityBody}>
          <div className={styles.catalogTitleLine}>
            <h2>{company.name}</h2>
            {company.companyLevel !== undefined ? (
              <CompanyMembershipBadge level={company.companyLevel} compact />
            ) : null}
            {company.industry ? <Tag>{company.industry}</Tag> : null}
          </div>
          {company.shortName ? <p className={styles.catalogShortName}>{company.shortName}</p> : null}
          <dl className={styles.catalogFacts}>
            <div>
              <dt>{t('enterprise.companyDetail.fields.legalRepresentative')}</dt>
              <dd>{company.legalRepresentative || missing}</dd>
            </div>
            <div>
              <dt>{t('enterprise.companyDetail.fields.registeredCapital')}</dt>
              <dd>{registeredCapital}</dd>
            </div>
            <div>
              <dt>{t('enterprise.companyDetail.fields.establishedAt')}</dt>
              <dd>{company.establishedAt || missing}</dd>
            </div>
            <div>
              <dt>{t('enterprise.companyDetail.fields.companyType')}</dt>
              <dd>{company.companyType || missing}</dd>
            </div>
          </dl>
          <div className={styles.catalogLocation}>
            <Local size={14} aria-hidden='true' />
            <span>{[region, company.address].filter(Boolean).join(' · ') || missing}</span>
          </div>
          <p className={styles.catalogSummary}>{company.businessSummary || missing}</p>
        </div>
      </div>

      <div className={styles.featuredProducts}>
        <div className={styles.featuredProductsHeader}>
          <span>{t('enterprise.navigation.products')}</span>
          {company.featuredProductCount ? <small>{company.featuredProductCount}</small> : null}
          <Button
            className={styles.catalogMoreButton}
            type='link'
            icon={<ArrowRight />}
            onClick={(event) => {
              event.stopPropagation();
              viewDetails();
            }}
          >
            {t('enterprise.companies.actions.viewDetails')}
          </Button>
        </div>
        {featuredProducts.length ? (
          <div className={styles.featuredProductGrid}>
            {featuredProducts.map((product) => (
              <ProductPreview key={product.productId} product={product} onViewProduct={onViewProduct} />
            ))}
            {hiddenProductCount > 0 ? <span className={styles.moreProducts}>+{hiddenProductCount}</span> : null}
          </div>
        ) : (
          <div className={styles.featuredProductsEmpty}>
            <CubeFive size={18} aria-hidden='true' />
            <span>{t('enterprise.companyDetail.productsEmpty')}</span>
          </div>
        )}
      </div>
    </article>
  );
};

export default CompanyCatalogRow;
