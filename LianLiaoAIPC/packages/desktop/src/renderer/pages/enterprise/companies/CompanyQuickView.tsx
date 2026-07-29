import { ArrowRight } from '@icon-park/react';
import { Button } from 'antd';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { EnterpriseCompanySummary } from '@/common/enterprise/contracts';
import { CatalogQuickViewPanel } from '@/renderer/pages/enterprise/layout/catalog/CatalogLayout';
import CompanyMembershipBadge from '@/renderer/pages/enterprise/membership/CompanyMembershipBadge';

import styles from './company-catalog.module.css';

export type CompanyQuickViewProps = {
  company: EnterpriseCompanySummary;
  onClose: () => void;
  onViewDetails: (company: EnterpriseCompanySummary) => void;
};

const displayRegion = (company: EnterpriseCompanySummary, fallback: string): string =>
  [company.province, company.city, company.district].filter(Boolean).join(' / ') || fallback;

/** Compact read-only preview; data mutations remain in dedicated enterprise workflows. */
const CompanyQuickView: React.FC<CompanyQuickViewProps> = ({ company, onClose, onViewDetails }) => {
  const { t } = useTranslation();
  const missing = t('enterprise.companies.missing');

  return (
    <CatalogQuickViewPanel
      ariaLabel={t('enterprise.companies.quickView.label')}
      closeAriaLabel={t('enterprise.companies.actions.closeQuickView')}
      eyebrow={t('enterprise.companies.quickView.title')}
      title={company.name}
      badge={
        company.companyLevel !== undefined ? <CompanyMembershipBadge level={company.companyLevel} compact /> : undefined
      }
      onClose={onClose}
      footer={
        <>
          <p className={styles.quickViewHint}>{t('enterprise.companies.quickView.hint')}</p>
          <Button type='primary' block icon={<ArrowRight />} onClick={() => onViewDetails(company)}>
            {t('enterprise.companies.quickView.action')}
          </Button>
        </>
      }
    >
      <dl className={styles.quickViewFacts}>
        <div>
          <dt>{t('enterprise.companies.columns.industry')}</dt>
          <dd>{company.industry || missing}</dd>
        </div>
        <div>
          <dt>{t('enterprise.companies.columns.region')}</dt>
          <dd>{displayRegion(company, missing)}</dd>
        </div>
        <div>
          <dt>{t('enterprise.companies.columns.businessSummary')}</dt>
          <dd>{company.businessSummary || missing}</dd>
        </div>
      </dl>
    </CatalogQuickViewPanel>
  );
};

export default CompanyQuickView;
