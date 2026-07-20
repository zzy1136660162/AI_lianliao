import { Button, Tag } from 'antd';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { EnterpriseDemandSummary } from '@/common/enterprise/contracts';

import styles from './supply-demand.module.css';

type SupplyDemandQuickViewProps = {
  demand: EnterpriseDemandSummary;
  onClose: () => void;
};

const SupplyDemandQuickView: React.FC<SupplyDemandQuickViewProps> = ({ demand, onClose }) => {
  const { t } = useTranslation();
  return (
    <aside className={styles.quickView} aria-label={t('enterprise.supplyDemand.preview.title')}>
      <Button className={styles.quickViewClose} type='text' onClick={onClose}>
        {t('enterprise.supplyDemand.actions.closePreview')}
      </Button>
      <span className={styles.eyebrow}>{demand.typeName}</span>
      <h2>{demand.title}</h2>
      <div className={styles.tags}>
        {demand.primaryTags.map((tag) => (
          <Tag key={tag}>{tag}</Tag>
        ))}
      </div>
      <dl className={styles.factList}>
        <div>
          <dt>{t('enterprise.supplyDemand.columns.company')}</dt>
          <dd>{demand.companyName || t('enterprise.supplyDemand.notProvided')}</dd>
        </div>
        <div>
          <dt>{t('enterprise.supplyDemand.columns.region')}</dt>
          <dd>
            {[demand.city, demand.district].filter(Boolean).join(' / ') || t('enterprise.supplyDemand.notProvided')}
          </dd>
        </div>
        <div>
          <dt>{t('enterprise.supplyDemand.columns.budget')}</dt>
          <dd>{demand.budget || t('enterprise.supplyDemand.notProvided')}</dd>
        </div>
      </dl>
      <Link
        className={styles.primaryLink}
        to={`/enterprise/supply-demand/${encodeURIComponent(String(demand.typeId))}/${encodeURIComponent(demand.demandId)}`}
      >
        {t('enterprise.supplyDemand.actions.detail')}
      </Link>
    </aside>
  );
};

export default SupplyDemandQuickView;
