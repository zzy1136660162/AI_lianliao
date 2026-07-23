import { BuildingFour, Left } from '@icon-park/react';
import { Button, Card, Tag } from 'antd';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { EnterpriseCompanyDetail, EnterpriseProductSummary } from '@/common/enterprise/contracts';
import CompanyMembershipBadge from '@/renderer/pages/enterprise/membership/CompanyMembershipBadge';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';

import { parseSafeCompanyImageUrl, useCompanyDetail } from './companyData';
import styles from './company-catalog.module.css';

export type CompanyDetailPageProps = {
  client?: EnterpriseClient;
};

type DetailFact = {
  label: string;
  value?: React.ReactNode;
};

const isMissingFact = (value: React.ReactNode): boolean => value === undefined || value === null || value === '';

const DetailFacts: React.FC<{ facts: DetailFact[]; missing: string }> = ({ facts, missing }) => (
  <dl className={styles.detailFacts}>
    {facts.map((fact) => (
      <div key={fact.label}>
        <dt>{fact.label}</dt>
        <dd>{isMissingFact(fact.value) ? missing : fact.value}</dd>
      </div>
    ))}
  </dl>
);

const CompanyLogo: React.FC<{ company: EnterpriseCompanyDetail }> = ({ company }) => {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const logoUrl = parseSafeCompanyImageUrl(company.logoUrl);
  if (!logoUrl || failed) {
    return (
      <div className={styles.logoFallback} role='img' aria-label={t('enterprise.companyDetail.logoUnavailable')}>
        <BuildingFour size={30} />
      </div>
    );
  }
  return (
    <img
      className={styles.companyLogo}
      src={logoUrl}
      alt={t('enterprise.companyDetail.logoAlt', { name: company.name })}
      onError={() => setFailed(true)}
    />
  );
};

const CompanyProductCard: React.FC<{ product: EnterpriseProductSummary }> = ({ product }) => {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = parseSafeCompanyImageUrl(product.imageUrl);
  return (
    <Link className={styles.productCard} to={`/enterprise/products/${encodeURIComponent(product.productId)}`}>
      <div className={styles.productImage}>
        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt={t('enterprise.companyDetail.productImageAlt', { name: product.name })}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span>{t('enterprise.companyDetail.productImageUnavailable')}</span>
        )}
      </div>
      <strong>{product.name}</strong>
      <p>{product.summary || t('enterprise.companies.missing')}</p>
    </Link>
  );
};

const CompanyDetailPage: React.FC<CompanyDetailPageProps> = ({ client = enterpriseClient }) => {
  const { companyId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const detail = useCompanyDetail(client, companyId);
  const missing = t('enterprise.companies.missing');

  const renderContent = () => {
    if (detail.isInvalidId) {
      return (
        <EnterprisePageState
          state='error'
          title={t('enterprise.companyDetail.invalid.title')}
          description={t('enterprise.companyDetail.invalid.description')}
        />
      );
    }
    if (detail.errorCode) {
      return (
        <EnterprisePageState
          state='error'
          title={t('enterprise.companyDetail.error.title')}
          description={t('enterprise.companyDetail.error.description')}
          onRetry={detail.retry}
        />
      );
    }
    if (detail.isLoading || !detail.data) {
      return <EnterprisePageState state='loading' title={t('enterprise.companyDetail.loading')} />;
    }

    const { company, products } = detail.data;
    const region = [company.province, company.city, company.district].filter(Boolean).join(' / ');
    return (
      <div className={styles.detailBody}>
        <section className={styles.detailIdentity} aria-labelledby='company-name'>
          <CompanyLogo company={company} />
          <div>
            <span className={styles.eyebrow}>{company.shortName || t('enterprise.companyDetail.profileEyebrow')}</span>
            <h2 id='company-name'>{company.name}</h2>
            <div className={styles.detailTags}>
              {company.industry ? <Tag>{company.industry}</Tag> : null}
              {region ? <Tag>{region}</Tag> : null}
              {company.companyLevel !== undefined ? (
                <CompanyMembershipBadge className={styles.detailMembership} level={company.companyLevel} compact />
              ) : null}
            </div>
          </div>
        </section>

        <div className={styles.detailColumns}>
          <Card title={t('enterprise.companyDetail.sections.basic')} variant='outlined'>
            <DetailFacts
              missing={missing}
              facts={[
                {
                  label: t('enterprise.companyDetail.fields.legalRepresentative'),
                  value: company.legalRepresentative,
                },
                {
                  label: t('enterprise.companyDetail.fields.companyType'),
                  value: company.companyType,
                },
                {
                  label: t('enterprise.companyDetail.fields.establishedAt'),
                  value: company.establishedAt,
                },
                {
                  label: t('enterprise.companyDetail.fields.unifiedSocialCreditCode'),
                  value: company.unifiedSocialCreditCode,
                },
                { label: t('enterprise.companyDetail.fields.industry'), value: company.industry },
                {
                  label: t('enterprise.companyDetail.fields.memberLevel'),
                  value:
                    company.companyLevel === undefined ? undefined : (
                      <CompanyMembershipBadge level={company.companyLevel} compact />
                    ),
                },
              ]}
            />
          </Card>
          <Card title={t('enterprise.companyDetail.sections.contact')} variant='outlined'>
            <DetailFacts
              missing={missing}
              facts={[
                {
                  label: t('enterprise.companyDetail.fields.contactName'),
                  value: company.contactName,
                },
                {
                  label: t('enterprise.companyDetail.fields.contactTitle'),
                  value: company.contactTitle,
                },
                { label: t('enterprise.companyDetail.fields.phone'), value: company.phone },
                { label: t('enterprise.companyDetail.fields.address'), value: company.address },
              ]}
            />
            <p className={styles.permissionNote}>{t('enterprise.companyDetail.contactPermissionNote')}</p>
          </Card>
        </div>

        <Card title={t('enterprise.companyDetail.sections.businessSummary')} variant='outlined'>
          <p className={styles.plainText}>{company.businessSummary || missing}</p>
        </Card>
        <Card title={t('enterprise.companyDetail.sections.description')} variant='outlined'>
          <p className={styles.plainText}>{company.description || missing}</p>
        </Card>
        <Card title={t('enterprise.companyDetail.sections.products')} variant='outlined'>
          {products.list.length ? (
            <div className={styles.productGrid}>
              {products.list.map((product) => (
                <CompanyProductCard key={product.productId} product={product} />
              ))}
            </div>
          ) : (
            <p className={styles.emptyProducts}>{t('enterprise.companyDetail.productsEmpty')}</p>
          )}
        </Card>
      </div>
    );
  };

  return (
    <section className={styles.page} aria-labelledby='company-detail-title'>
      <header className={styles.detailPageHeader}>
        <Button type='text' icon={<Left />} onClick={() => navigate('/enterprise/companies')}>
          {t('enterprise.companyDetail.backToList')}
        </Button>
        <div>
          <span className={styles.eyebrow}>{t('enterprise.companyDetail.eyebrow')}</span>
          <h1 id='company-detail-title'>{t('enterprise.routes.companyDetail.title')}</h1>
        </div>
      </header>
      <div className={styles.content}>{renderContent()}</div>
    </section>
  );
};

export default CompanyDetailPage;
