import { Button, Tag } from '@arco-design/web-react';
import { ArrowRight, CloseSmall } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { EnterpriseCompanySummary } from '@/common/enterprise/contracts';

import styles from './company-catalog.module.css';

export type CompanyQuickViewProps = {
  company: EnterpriseCompanySummary;
  onClose: () => void;
  onViewDetails: (company: EnterpriseCompanySummary) => void;
};

const displayRegion = (company: EnterpriseCompanySummary, fallback: string): string =>
  [company.province, company.city, company.district].filter(Boolean).join(' / ') || fallback;

/** Compact read-only company preview. Mutating actions are deliberately excluded from this phase. */
const CompanyQuickView: React.FC<CompanyQuickViewProps> = ({ company, onClose, onViewDetails }) => {
  const { t } = useTranslation();
  const missing = t('enterprise.companies.missing');

  return (
    <aside className={styles.quickView} role='complementary' aria-label={t('enterprise.companies.quickView.label')}>
      <div className={styles.quickViewIndex}>
        {t('enterprise.companies.quickView.index', {
          index: company.companyId.slice(-4).padStart(4, '0'),
        })}
      </div>
      <Button
        className={styles.quickViewClose}
        type='text'
        size='small'
        icon={<CloseSmall />}
        aria-label={t('enterprise.companies.actions.closeQuickView')}
        onClick={onClose}
      />
      <div className={styles.quickViewHeading}>
        <span>{t('enterprise.companies.quickView.title')}</span>
        <h2>{company.name}</h2>
        {company.companyLevel !== undefined ? (
          <Tag>{t('enterprise.companies.memberLevel.value', { level: company.companyLevel })}</Tag>
        ) : null}
      </div>

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
        <div>
          <dt>{t('enterprise.companies.columns.updatedAt')}</dt>
          <dd>{company.updatedAt || missing}</dd>
        </div>
      </dl>

      <p className={styles.quickViewHint}>{t('enterprise.companies.quickView.hint')}</p>
      <Button type='primary' long icon={<ArrowRight />} onClick={() => onViewDetails(company)}>
        {t('enterprise.companies.actions.viewDetails')}
      </Button>
    </aside>
  );
};

export default CompanyQuickView;
