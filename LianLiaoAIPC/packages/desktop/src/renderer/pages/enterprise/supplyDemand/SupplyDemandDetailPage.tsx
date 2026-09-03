import { ArrowLeft } from '@icon-park/react';
import { Button, Card, Descriptions, Tag } from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import type { EnterpriseDemandDetail, EnterpriseDemandDetailField } from '@/common/enterprise/contracts';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
import { readAiConversationReturnState } from '@/renderer/pages/enterprise/layout/catalog/catalogReturnState';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import {
  isDemandImageField,
  loadDemandDetail,
  parseDemandRouteParams,
  parseSafeDemandImageUrls,
} from './supplyDemandData';
import styles from './supply-demand.module.css';
import DemandContactCard from './DemandContactCard';

export type SupplyDemandDetailPageProps = { client?: EnterpriseClient };

const displayFieldValue = (field: EnterpriseDemandDetailField): string =>
  field.unit ? `${field.value} ${field.unit}` : field.value;

type DemandRelatedImagesProps = {
  imageUrls: string[];
  title: string;
};

const DemandRelatedImages: React.FC<DemandRelatedImagesProps> = ({ imageUrls, title }) => {
  const { t } = useTranslation();
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const visibleUrls = imageUrls.filter((url) => !failedUrls.has(url));

  return (
    <section className={styles.relatedImages} aria-labelledby='enterprise-demand-related-images-title'>
      <h3 id='enterprise-demand-related-images-title'>{t('enterprise.supplyDemand.detail.relatedImages')}</h3>
      {visibleUrls.length > 0 ? (
        <div className={styles.relatedImageGrid}>
          {visibleUrls.map((url, index) => (
            <div className={styles.relatedImageFrame} key={url}>
              <img
                src={url}
                alt={t('enterprise.supplyDemand.detail.relatedImageAlt', { name: title, index: index + 1 })}
                loading='lazy'
                decoding='async'
                referrerPolicy='no-referrer'
                onError={() => setFailedUrls((current) => new Set(current).add(url))}
              />
            </div>
          ))}
        </div>
      ) : (
        <div
          className={styles.relatedImageUnavailable}
          role='img'
          aria-label={t('enterprise.supplyDemand.detail.relatedImageUnavailable')}
        >
          {t('enterprise.supplyDemand.detail.relatedImageUnavailable')}
        </div>
      )}
    </section>
  );
};

const SupplyDemandDetailPage: React.FC<SupplyDemandDetailPageProps> = ({ client = enterpriseClient }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const aiConversationReturn = useMemo(() => readAiConversationReturnState(location.state), [location.state]);
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

  const detailFields = detail.fields.filter((field) => !isDemandImageField(field));
  const hasRelatedImageField = detail.fields.some(isDemandImageField);
  const relatedImageUrls = parseSafeDemandImageUrls(detail.fields);

  return (
    <section className={styles.page} aria-labelledby='enterprise-supply-demand-detail-title'>
      <header className={styles.detailHeader}>
        <Button
          type='text'
          icon={<ArrowLeft />}
          onClick={() =>
            aiConversationReturn
              ? navigate(aiConversationReturn.path, {
                  state: { targetMessageId: aiConversationReturn.targetMessageId },
                })
              : navigate('/enterprise/supply-demand')
          }
        >
          {t('enterprise.supplyDemand.actions.back')}
        </Button>
        <div>
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
            <Descriptions.Item label={t('enterprise.supplyDemand.columns.region')}>
              {[detail.city, detail.district].filter(Boolean).join(' / ') || t('enterprise.supplyDemand.notProvided')}
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
            {detailFields.map((field) => (
              <Descriptions.Item key={field.key} label={field.label}>
                {displayFieldValue(field)}
              </Descriptions.Item>
            ))}
          </Descriptions>
          {hasRelatedImageField ? (
            <DemandRelatedImages
              key={`${detail.demandId}:${relatedImageUrls.join('|')}`}
              imageUrls={relatedImageUrls}
              title={detail.title}
            />
          ) : null}
        </Card>
        <DemandContactCard
          client={client}
          typeId={detail.typeId}
          demandId={detail.demandId}
          demandTitle={detail.title}
        />
      </div>
    </section>
  );
};

export default SupplyDemandDetailPage;
