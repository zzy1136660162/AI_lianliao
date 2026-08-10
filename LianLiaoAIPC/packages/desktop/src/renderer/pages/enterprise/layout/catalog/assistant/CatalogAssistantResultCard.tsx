import { BuildingOne, CubeFive, EngineeringBrand, ExchangeFour } from '@icon-park/react';
import { Button } from 'antd';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import type { CatalogAssistantTrustedResult } from '@/common/enterprise/catalog-assistant/contracts';
import { parseSafeCompanyImageUrl } from '@/renderer/pages/enterprise/companies/companyData';
import CompanyMembershipBadge from '@/renderer/pages/enterprise/membership/CompanyMembershipBadge';
import { parseSafeProductImageUrl } from '@/renderer/pages/enterprise/products/productData';

import styles from './catalog-ai-assistant.module.css';

const translateMarker = (value: string, translate: (key: string) => string): string =>
  value.startsWith('enterprise.catalogAssistant.') ? translate(value) : value;

const region = (city?: string, district?: string): string | undefined =>
  [city, district].filter(Boolean).join(' / ') || undefined;

const projectRegion = (province?: string, city?: string): string | undefined =>
  [province, city].filter(Boolean).join(' / ') || undefined;

export const CatalogAssistantResultCard: React.FC<{
  result: CatalogAssistantTrustedResult;
}> = ({ result }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [imageFailed, setImageFailed] = useState(false);

  if (result.entityType === 'COMPANY') {
    const item = result.item;
    const imageUrl = parseSafeCompanyImageUrl(item.logoUrl);
    return (
      <article className={styles.resultCard}>
        <div className={styles.resultImage}>
          {imageUrl && !imageFailed ? (
            <img src={imageUrl} alt={item.name} onError={() => setImageFailed(true)} />
          ) : (
            <BuildingOne size={26} aria-hidden='true' />
          )}
        </div>
        <div className={styles.resultBody}>
          <div className={styles.resultHeading}>
            <strong className={styles.resultTitle}>{item.name}</strong>
            {item.companyLevel !== undefined ? <CompanyMembershipBadge level={item.companyLevel} compact /> : null}
          </div>
          <span className={styles.resultMeta}>
            {[item.industry, region(item.city, item.district)].filter(Boolean).join(' · ') ||
              t('enterprise.catalogAssistant.notProvided')}
          </span>
          {item.businessSummary ? <p className={styles.resultDescription}>{item.businessSummary}</p> : null}
          <p className={styles.reason}>{translateMarker(result.reason, t)}</p>
          {result.evidenceProducts?.length ? (
            <div className={styles.productEvidence}>
              <span className={styles.productEvidenceLabel}>{t('enterprise.catalogAssistant.productEvidence')}</span>
              {result.evidenceProducts.map((product) => {
                const productImage = parseSafeProductImageUrl(product.imageUrl);
                return (
                  <button
                    key={product.id}
                    type='button'
                    className={styles.productEvidenceItem}
                    onClick={() => void navigate(`/enterprise/products/${product.id}`)}
                  >
                    <span className={styles.productEvidenceImage}>
                      {productImage ? <img src={productImage} alt='' /> : <CubeFive size={14} aria-hidden='true' />}
                    </span>
                    <span>{product.name}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <Button
            type='link'
            size='small'
            className={styles.resultAction}
            onClick={() => void navigate(`/enterprise/companies/${item.companyId}`)}
          >
            {t('enterprise.catalogAssistant.viewCompany')}
          </Button>
        </div>
      </article>
    );
  }

  if (result.entityType === 'PRODUCT') {
    const item = result.item;
    const imageUrl = parseSafeProductImageUrl(item.imageUrl);
    return (
      <article className={styles.resultCard}>
        <div className={styles.resultImage}>
          {imageUrl && !imageFailed ? (
            <img src={imageUrl} alt={item.name} onError={() => setImageFailed(true)} />
          ) : (
            <CubeFive size={26} aria-hidden='true' />
          )}
        </div>
        <div className={styles.resultBody}>
          <strong className={styles.resultTitle}>{item.name}</strong>
          <span className={styles.resultMeta}>
            {[item.companyName, item.industry ?? item.companyIndustry, region(item.city, item.district)]
              .filter(Boolean)
              .join(' · ') || t('enterprise.catalogAssistant.notProvided')}
          </span>
          <p className={styles.reason}>{translateMarker(result.reason, t)}</p>
          <Button
            type='link'
            size='small'
            className={styles.resultAction}
            onClick={() => void navigate(`/enterprise/products/${item.productId}`)}
          >
            {t('enterprise.catalogAssistant.viewProduct')}
          </Button>
        </div>
      </article>
    );
  }

  if (result.entityType === 'DEMAND') {
    const item = result.item;
    return (
      <article className={styles.resultCard}>
        <div className={styles.resultImage}>
          <ExchangeFour size={26} aria-hidden='true' />
        </div>
        <div className={styles.resultBody}>
          <strong className={styles.resultTitle}>{item.title}</strong>
          {item.summary ? <p className={styles.resultDescription}>{item.summary}</p> : null}
          {item.primaryTags.length ? (
            <span className={styles.resultMeta}>{item.primaryTags.slice(0, 4).join(' / ')}</span>
          ) : null}
          <p className={styles.reason}>{translateMarker(result.reason, t)}</p>
          <Button
            type='link'
            size='small'
            className={styles.resultAction}
            onClick={() =>
              void navigate(
                `/enterprise/supply-demand/${encodeURIComponent(String(item.typeId))}/${encodeURIComponent(item.demandId)}`
              )
            }
          >
            {t('enterprise.catalogAssistant.viewDemand')}
          </Button>
        </div>
      </article>
    );
  }

  const item = result.item;
  const investment =
    item.totalInvestment === undefined
      ? undefined
      : t('enterprise.catalogAssistant.projectInvestment', {
          value: new Intl.NumberFormat().format(item.totalInvestment),
        });
  return (
    <article className={styles.resultCard}>
      <div className={styles.resultImage}>
        <EngineeringBrand size={26} aria-hidden='true' />
      </div>
      <div className={styles.resultBody}>
        <strong className={styles.resultTitle}>{item.projectName}</strong>
        <span className={styles.resultMeta}>
          {[projectRegion(item.province, item.city), investment, item.projectNature ?? item.constructionNature]
            .filter(Boolean)
            .join(' · ') || t('enterprise.catalogAssistant.notProvided')}
        </span>
        {item.procurementSummary || item.materialMatch ? (
          <p className={styles.resultDescription}>{item.procurementSummary ?? item.materialMatch}</p>
        ) : null}
        <p className={styles.reason}>{translateMarker(result.reason, t)}</p>
        <Button
          type='link'
          size='small'
          className={styles.resultAction}
          onClick={() => void navigate(`/enterprise/projects/${item.hpInfoId}`)}
        >
          {t('enterprise.catalogAssistant.viewProject')}
        </Button>
      </div>
    </article>
  );
};
