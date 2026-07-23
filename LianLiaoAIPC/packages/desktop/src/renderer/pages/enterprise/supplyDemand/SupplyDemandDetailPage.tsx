import { ArrowLeft } from '@icon-park/react';
import { Button, Card, Descriptions, Tag } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import type { EnterpriseDemandDetail, EnterpriseDemandDetailField } from '@/common/enterprise/contracts';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import { loadDemandDetail, parseDemandRouteParams } from './supplyDemandData';
import styles from './supply-demand.module.css';

export type SupplyDemandDetailPageProps = { client?: EnterpriseClient };

const displayFieldValue = (field: EnterpriseDemandDetailField): string =>
  field.unit ? `${field.value} ${field.unit}` : field.value;

const SupplyDemandDetailPage: React.FC<SupplyDemandDetailPageProps> = ({ client = enterpriseClient }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ typeId: string; demandId: string }>();
  const [detail, setDetail] = useState<EnterpriseDemandDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [invalidRoute, setInvalidRoute] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setInvalidRoute(false);
    try {
      const route = parseDemandRouteParams(params.typeId, params.demandId);
      void loadDemandDetail(client, route.typeId, route.demandId, controller.signal)
        .then((result) => {
          if (generation === generationRef.current) setDetail(result);
        })
        .catch(() => {
          if (!controller.signal.aborted && generation === generationRef.current) setFailed(true);
        })
        .finally(() => {
          if (!controller.signal.aborted && generation === generationRef.current) setLoading(false);
        });
    } catch {
      setInvalidRoute(true);
      setLoading(false);
    }
    return () => controller.abort();
  }, [client, params.demandId, params.typeId, reloadKey]);

  if (invalidRoute) {
    return (
      <EnterprisePageState
        state='error'
        title={t('enterprise.supplyDemand.errors.invalidRoute')}
        description={t('enterprise.supplyDemand.errors.invalidRouteDescription')}
      />
    );
  }
  if (loading) return <EnterprisePageState state='loading' title={t('enterprise.supplyDemand.states.detailLoading')} />;
  if (failed || !detail) {
    return (
      <EnterprisePageState
        state='error'
        title={t('enterprise.supplyDemand.states.detailErrorTitle')}
        description={t('enterprise.supplyDemand.states.detailErrorDescription')}
        onRetry={() => setReloadKey((value) => value + 1)}
      />
    );
  }

  return (
    <section className={styles.page} aria-labelledby='enterprise-supply-demand-detail-title'>
      <header className={styles.detailHeader}>
        <Button type='text' icon={<ArrowLeft />} onClick={() => navigate('/enterprise/supply-demand')}>
          {t('enterprise.supplyDemand.actions.back')}
        </Button>
        <div>
          <span className={styles.eyebrow}>{detail.typeName}</span>
          <h1 id='enterprise-supply-demand-detail-title'>{detail.title}</h1>
        </div>
      </header>

      <div className={styles.detailGrid}>
        <Card className={styles.detailSummary} title={t('enterprise.supplyDemand.detail.summaryTitle')}>
          <div className={styles.tags}>
            {detail.primaryTags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
          <p>{detail.summary || t('enterprise.supplyDemand.notProvided')}</p>
          <Descriptions column={{ xs: 1, sm: 2 }} size='small'>
            <Descriptions.Item label={t('enterprise.supplyDemand.columns.company')}>
              {detail.companyName || t('enterprise.supplyDemand.notProvided')}
            </Descriptions.Item>
            <Descriptions.Item label={t('enterprise.supplyDemand.columns.region')}>
              {[detail.city, detail.district].filter(Boolean).join(' / ') || t('enterprise.supplyDemand.notProvided')}
            </Descriptions.Item>
            <Descriptions.Item label={t('enterprise.supplyDemand.columns.address')}>
              {detail.address || t('enterprise.supplyDemand.notProvided')}
            </Descriptions.Item>
            <Descriptions.Item label={t('enterprise.supplyDemand.columns.budget')}>
              {detail.budget || t('enterprise.supplyDemand.notProvided')}
            </Descriptions.Item>
            <Descriptions.Item label={t('enterprise.supplyDemand.columns.publishedAt')}>
              {detail.publishedAt || t('enterprise.supplyDemand.notProvided')}
            </Descriptions.Item>
            <Descriptions.Item label={t('enterprise.supplyDemand.columns.endTime')}>
              {detail.endTime || t('enterprise.supplyDemand.notProvided')}
            </Descriptions.Item>
            <Descriptions.Item label={t('enterprise.supplyDemand.columns.status')}>
              {detail.status === 0
                ? t('enterprise.supplyDemand.status.open')
                : detail.status === 1
                  ? t('enterprise.supplyDemand.status.closed')
                  : t('enterprise.supplyDemand.notProvided')}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card className={styles.detailFields} title={t('enterprise.supplyDemand.detail.fieldsTitle')}>
          {detail.fields.length > 0 ? (
            <Descriptions className={styles.fieldGrid} column={{ xs: 1, sm: 2 }} size='small'>
              {detail.fields.map((field) => (
                <Descriptions.Item key={field.key} label={field.label}>
                  {displayFieldValue(field)}
                </Descriptions.Item>
              ))}
            </Descriptions>
          ) : (
            <p>{t('enterprise.supplyDemand.detail.noFields')}</p>
          )}
        </Card>
      </div>
    </section>
  );
};

export default SupplyDemandDetailPage;
