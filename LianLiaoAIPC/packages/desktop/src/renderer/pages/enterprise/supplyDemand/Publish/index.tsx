import { ArrowLeft } from '@icon-park/react';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Upload,
  type UploadFile,
  type UploadProps,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import type {
  EnterpriseDemandPublishField,
  EnterpriseDemandPublishPayload,
  EnterpriseDemandPublishSchema,
  EnterpriseDemandTypeOption,
} from '@/common/enterprise/contracts';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import {
  getCurrentEnterprisePagePath,
  recordEnterpriseBehavior,
} from '@/renderer/services/enterprise/enterpriseBehaviorLog';

import { loadPublishDemandSchema, loadPublishDemandTypes, publishDemand } from './publishDemandData';
import DemandAiAssistantPanel from './assistant/DemandAiAssistantPanel';
import { toManualPatch, toPublishFormPatch } from './assistant/demandAiFormAdapter';
import { useDemandAiConversation } from './assistant/useDemandAiConversation';
import {
  allowsCustomPublishOption,
  isPublishFieldVisible,
  readPublishValidationRule,
  readPublishControlProps,
  serializePublishFieldValue,
} from './publishFormMetadata';
import styles from './publish-demand.module.css';

const BASE_FIELD_KEYS = new Set(['title', 'summary', 'province', 'city', 'district', 'address', 'budget', 'endTime']);

type FormValues = Record<string, string | string[] | number | Dayjs | undefined>;
type DemandImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
const DEMAND_IMAGE_MIME_TYPES = new Set<DemandImageMimeType>(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const isDemandImageMimeType = (value: string): value is DemandImageMimeType =>
  DEMAND_IMAGE_MIME_TYPES.has(value as DemandImageMimeType);

export type PublishDemandPageProps = { client?: EnterpriseClient };

type DemandImageControlProps = {
  client: EnterpriseClient;
  maxCount: number;
  value?: string[];
  onChange?: (urls: string[]) => void;
};

const DemandImageControl: React.FC<DemandImageControlProps> = ({ client, maxCount, value = [], onChange }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const fileList: UploadFile[] = value.map((url) => ({
    uid: url,
    name: url.split('/').pop() || t('enterprise.supplyDemand.publish.image.uploadedName'),
    status: 'done',
    url,
  }));

  const upload: UploadProps['customRequest'] = async ({ file, onError, onSuccess }) => {
    try {
      const source = file as File;
      if (!isDemandImageMimeType(source.type)) throw new Error('Unsupported image type');
      const response = await client.request({
        operation: 'demand.uploadImage',
        payload: {
          fileName: source.name,
          mimeType: source.type,
          bytes: Array.from(new Uint8Array(await source.arrayBuffer())),
        },
      });
      if (response.operation !== 'demand.uploadImage') throw new Error('Invalid image upload response');
      onChange?.([...value, response.data.url]);
      onSuccess?.(response.data);
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('Image upload failed');
      onError?.(normalizedError);
      void message.error(t('enterprise.supplyDemand.publish.image.error'));
    }
  };

  return (
    <Upload
      accept='image/jpeg,image/png,image/webp,image/gif'
      multiple
      maxCount={maxCount}
      fileList={fileList}
      customRequest={upload}
      onRemove={(file) => {
        onChange?.(value.filter((url) => url !== file.url));
        return true;
      }}
    >
      <Button disabled={value.length >= maxCount}>{t('enterprise.supplyDemand.publish.image.action')}</Button>
      <span className={styles.imageHint}>{t('enterprise.supplyDemand.publish.image.hint', { count: maxCount })}</span>
    </Upload>
  );
};

const PublishDemandPage: React.FC<PublishDemandPageProps> = ({ client = enterpriseClient }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [types, setTypes] = useState<EnterpriseDemandTypeOption[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<number>();
  const [selectedVariantCode, setSelectedVariantCode] = useState<string>();
  const [schema, setSchema] = useState<EnterpriseDemandPublishSchema>();
  const [typesLoading, setTypesLoading] = useState(true);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string>();
  const aiConversation = useDemandAiConversation(client);
  const watchedValues = Form.useWatch([], form) ?? {};
  const handoffSessionId = searchParams.get('aiSession') ?? undefined;

  useEffect(() => {
    void aiConversation.resume(handoffSessionId);
  }, [aiConversation.resume, handoffSessionId]);

  useEffect(() => {
    const controller = new AbortController();
    setTypesLoading(true);
    void loadPublishDemandTypes(client, controller.signal)
      .then(setTypes)
      .catch(() => setError(t('enterprise.supplyDemand.publish.errors.types')))
      .finally(() => {
        if (!controller.signal.aborted) setTypesLoading(false);
      });
    return () => controller.abort();
  }, [client, t]);

  useEffect(() => {
    if (selectedTypeId === undefined) {
      setSchema(undefined);
      return;
    }
    const controller = new AbortController();
    setSchemaLoading(true);
    setError(undefined);
    form.resetFields();
    void loadPublishDemandSchema(client, selectedTypeId, controller.signal, selectedVariantCode)
      .then((nextSchema) => {
        setSchema(nextSchema);
        if (selectedVariantCode !== nextSchema.variantCode) setSelectedVariantCode(nextSchema.variantCode);
        const defaults: FormValues = {};
        for (const field of nextSchema.fields) {
          if (!field.defaultValue) continue;
          if (field.inputType === 'DATE') defaults[field.fieldKey] = dayjs(field.defaultValue);
          else if (field.inputType === 'NUMBER') defaults[field.fieldKey] = Number(field.defaultValue);
          else if (field.inputType === 'MULTISELECT') {
            defaults[field.fieldKey] = field.defaultValue.split(field.valueSeparator || '、').filter(Boolean);
          } else defaults[field.fieldKey] = field.defaultValue;
        }
        form.setFieldsValue(defaults);
      })
      .catch(() => setError(t('enterprise.supplyDemand.publish.errors.schema')))
      .finally(() => {
        if (!controller.signal.aborted) setSchemaLoading(false);
      });
    return () => controller.abort();
  }, [client, form, selectedTypeId, selectedVariantCode, t]);

  useEffect(() => {
    const line = aiConversation.snapshot?.lineDecision;
    if (line?.typeId === undefined) return;
    setSelectedTypeId(line.typeId);
    if (line.variantCode) setSelectedVariantCode(line.variantCode);
  }, [aiConversation.snapshot?.lineDecision]);

  useEffect(() => {
    if (!schema || !aiConversation.snapshot) return;
    form.setFieldsValue(toPublishFormPatch(schema, aiConversation.snapshot.formValues));
  }, [aiConversation.snapshot, form, schema]);

  const typeOptions = useMemo(() => {
    const groups = new Map<string, EnterpriseDemandTypeOption[]>();
    for (const type of [...types].sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0))) {
      const groupName = type.groupName || t('enterprise.supplyDemand.publish.otherGroup');
      groups.set(groupName, [...(groups.get(groupName) ?? []), type]);
    }
    return Array.from(groups, ([label, groupedTypes]) => ({
      label,
      options: groupedTypes.map(({ typeId, typeName }) => ({ value: typeId, label: typeName })),
    }));
  }, [t, types]);

  const visibleFieldGroups = useMemo(() => {
    if (!schema) return [];
    const groups = new Map<string, EnterpriseDemandPublishField[]>();
    const ordered = [...schema.fields].sort(
      (left, right) =>
        (left.groupOrder ?? 0) - (right.groupOrder ?? 0) || (left.displayOrder ?? 0) - (right.displayOrder ?? 0)
    );
    for (const field of ordered) {
      if (!isPublishFieldVisible(field, watchedValues)) continue;
      const groupName = field.groupName || t('enterprise.supplyDemand.publish.otherGroup');
      groups.set(groupName, [...(groups.get(groupName) ?? []), field]);
    }
    return Array.from(groups, ([groupName, fields]) => ({ groupName, fields }));
  }, [schema, t, watchedValues]);

  const selectDemandType = (typeId: number) => {
    const snapshot = aiConversation.snapshot;
    const selected = types.find((type) => type.typeId === typeId);
    if (
      snapshot &&
      selected &&
      snapshot.state !== 'SUBMITTED' &&
      snapshot.state !== 'CANCELLED' &&
      snapshot.lineDecision.typeId !== typeId
    ) {
      void aiConversation.confirmLine(
        { typeId, typeName: selected.typeName, confidence: 1 },
        snapshot.lineDecision.typeId !== undefined
      );
      return;
    }
    setSelectedVariantCode(undefined);
    setSelectedTypeId(typeId);
  };

  const submit = async (values: FormValues) => {
    if (!schema) return;
    setPublishing(true);
    setError(undefined);
    try {
      const dynamicFields: Record<string, string> = {};
      for (const field of schema.fields) {
        if (BASE_FIELD_KEYS.has(field.fieldKey)) continue;
        if (!isPublishFieldVisible(field, values)) continue;
        const serialized = serializePublishFieldValue(field, values[field.fieldKey]);
        if (serialized) dynamicFields[field.fieldKey] = serialized;
      }
      const payload: EnterpriseDemandPublishPayload = {
        typeId: schema.typeId,
        variantCode: schema.variantCode,
        title: serializeBaseValue(values.title),
        fields: dynamicFields,
      };
      assignOptional(payload, 'summary', values.summary);
      assignOptional(payload, 'province', values.province);
      assignOptional(payload, 'city', values.city);
      assignOptional(payload, 'district', values.district);
      assignOptional(payload, 'address', values.address);
      assignOptional(payload, 'budget', values.budget);
      assignOptional(payload, 'endTime', values.endTime);
      const result = await publishDemand(client, payload);
      if (aiConversation.snapshot) {
        await aiConversation.markSubmitted(result.demandId);
      }
      void recordEnterpriseBehavior(
        {
          eventType: 'DEMAND_PUBLISH',
          moduleName: '链辽AI桌面端-供需对接',
          title: `发布供需：${payload.title}`,
          pagePath: getCurrentEnterprisePagePath(),
          targetId: result.demandId,
          params: {
            typeId: result.typeId,
            reviewStatus: result.reviewStatus,
            variantCode: payload.variantCode ?? '',
            city: payload.city ?? '',
            district: payload.district ?? '',
          },
        },
        client
      );
      void message.success(t('enterprise.supplyDemand.publish.success'));
      navigate('/enterprise/supply-demand');
    } catch {
      setError(t('enterprise.supplyDemand.publish.errors.publish'));
    } finally {
      setPublishing(false);
    }
  };

  const renderField = (field: EnterpriseDemandPublishField) => {
    const configuredRule = readPublishValidationRule(field);
    const rules = [
      ...(field.required
        ? [
            {
              required: true,
              message: t('enterprise.supplyDemand.publish.validation.required', { label: field.fieldLabel }),
            },
          ]
        : []),
      ...(configuredRule.minLength
        ? [
            {
              min: configuredRule.minLength,
              message: t('enterprise.supplyDemand.publish.validation.minLength', {
                label: field.fieldLabel,
                count: configuredRule.minLength,
              }),
            },
          ]
        : []),
      ...createPatternRule(field, configuredRule.pattern),
    ];
    const wide = field.inputType === 'TEXTAREA' || field.fieldKey === 'title';
    return (
      <Form.Item
        key={field.fieldKey}
        className={wide ? styles.wideField : undefined}
        name={field.fieldKey}
        label={
          <span className={styles.fieldLabel}>
            {field.fieldLabel}
            {aiConversation.snapshot?.formValues[field.fieldKey]?.source === 'AI' ? (
              <span className={styles.aiFieldBadge}>
                {t('enterprise.supplyDemand.publish.aiConversation.aiFilled')}
              </span>
            ) : null}
            {aiConversation.snapshot?.formValues[field.fieldKey]?.source === 'MANUAL' ? (
              <span className={styles.manualFieldBadge}>
                {t('enterprise.supplyDemand.publish.aiConversation.manualFilled')}
              </span>
            ) : null}
          </span>
        }
        rules={rules.length > 0 ? rules : undefined}
      >
        {renderControl(field)}
      </Form.Item>
    );
  };

  const renderControl = (field: EnterpriseDemandPublishField) => {
    switch (field.inputType) {
      case 'TEXTAREA':
        return <Input.TextArea rows={field.fieldKey === 'summary' ? 5 : 3} maxLength={field.maxLength} showCount />;
      case 'NUMBER':
        return <InputNumber className={styles.fieldControl} min={0} />;
      case 'DATE':
        return <DatePicker className={styles.fieldControl} format='YYYY-MM-DD' />;
      case 'SELECT':
        if (allowsCustomPublishOption(field)) {
          return (
            <Select
              className={styles.fieldControl}
              mode='tags'
              maxCount={1}
              options={field.options.map((option) => ({ value: option, label: option }))}
              placeholder={field.placeholder}
            />
          );
        }
        return (
          <Select
            className={styles.fieldControl}
            options={field.options.map((option) => ({ value: option, label: option }))}
            placeholder={field.placeholder}
          />
        );
      case 'MULTISELECT':
        return (
          <Select
            className={styles.fieldControl}
            mode='multiple'
            options={field.options.map((option) => ({ value: option, label: option }))}
            placeholder={field.placeholder}
          />
        );
      case 'IMAGE':
        return <DemandImageControl client={client} maxCount={readPublishControlProps(field).maxCount ?? 6} />;
      default:
        return <Input maxLength={field.maxLength} placeholder={field.placeholder} />;
    }
  };

  return (
    <section className={styles.page} aria-labelledby='enterprise-demand-publish-title'>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <h1 id='enterprise-demand-publish-title'>{t('enterprise.supplyDemand.publish.title')}</h1>
          <p>{t('enterprise.supplyDemand.publish.description')}</p>
        </div>
        <Button icon={<ArrowLeft />} onClick={() => navigate('/enterprise/supply-demand')}>
          {t('enterprise.supplyDemand.actions.back')}
        </Button>
      </header>

      {error ? <Alert type='error' showIcon closable message={error} onClose={() => setError(undefined)} /> : null}

      <Card className={styles.formCard} title={t('enterprise.supplyDemand.publish.typeTitle')}>
        <Select
          className={styles.typeSelect}
          loading={typesLoading}
          value={selectedTypeId}
          options={typeOptions}
          placeholder={t('enterprise.supplyDemand.publish.typePlaceholder')}
          onChange={selectDemandType}
        />
        {schema && schema.variants.length > 1 ? (
          <Select
            className={styles.typeSelect}
            value={selectedVariantCode ?? schema.variantCode}
            options={schema.variants.map(({ variantCode, variantName }) => ({
              value: variantCode,
              label: variantName,
            }))}
            placeholder={t('enterprise.supplyDemand.publish.variantPlaceholder')}
            onChange={setSelectedVariantCode}
          />
        ) : null}
      </Card>

      <div className={styles.workspace}>
        <aside className={styles.aiPanel}>
          <DemandAiAssistantPanel
            snapshot={aiConversation.snapshot}
            messages={aiConversation.messages}
            loading={aiConversation.loading}
            error={aiConversation.error}
            onStart={aiConversation.start}
            onSend={aiConversation.send}
            onConfirmLine={aiConversation.confirmLine}
            onRejectSwitch={aiConversation.rejectSwitch}
            onRetry={aiConversation.retry}
            onCancel={aiConversation.cancel}
          />
        </aside>

        <Card className={styles.formCard} title={t('enterprise.supplyDemand.publish.formTitle')}>
          {schemaLoading ? (
            <div className={styles.emptySchema}>
              <EnterprisePageState state='loading' title={t('enterprise.supplyDemand.publish.loadingSchema')} />
            </div>
          ) : schema ? (
            <Form
              form={form}
              layout='vertical'
              onValuesChange={(changedValues) => {
                if (!schema || !aiConversation.snapshot) return;
                const patch = toManualPatch(schema, changedValues);
                if (Object.keys(patch).length > 0) aiConversation.patchManualFields(patch);
              }}
              onFinish={(values) => void submit(values)}
            >
              <div className={styles.formGrid}>
                {visibleFieldGroups.map(({ groupName, fields }) => (
                  <section className={styles.fieldGroup} key={groupName}>
                    <h3>{groupName}</h3>
                    <div className={styles.fieldGroupGrid}>{fields.map(renderField)}</div>
                  </section>
                ))}
                <div className={styles.formActions}>
                  <Button onClick={() => form.resetFields()}>
                    {t('enterprise.supplyDemand.publish.actions.clear')}
                  </Button>
                  <Button type='primary' htmlType='submit' loading={publishing}>
                    {t('enterprise.supplyDemand.publish.actions.submit')}
                  </Button>
                </div>
              </div>
            </Form>
          ) : (
            <div className={styles.emptySchema}>
              <EnterprisePageState state='empty' title={t('enterprise.supplyDemand.publish.selectType')} />
            </div>
          )}
        </Card>
      </div>
    </section>
  );
};

const serializeBaseValue = (value: FormValues[string]): string => {
  if (value === undefined || value === null) return '';
  if (dayjs.isDayjs(value)) return value.format('YYYY-MM-DD');
  if (Array.isArray(value)) return value.map(String).join('、');
  return String(value).trim();
};

const assignOptional = (
  payload: EnterpriseDemandPublishPayload,
  key: 'summary' | 'province' | 'city' | 'district' | 'address' | 'budget' | 'endTime',
  value: FormValues[string]
): void => {
  const serialized = serializeBaseValue(value);
  if (serialized) payload[key] = serialized;
};

const createPatternRule = (
  field: EnterpriseDemandPublishField,
  pattern?: string
): Array<{ pattern: RegExp; message: string }> => {
  if (!pattern) return [];
  try {
    return [{ pattern: new RegExp(pattern), message: field.placeholder || field.fieldLabel }];
  } catch {
    return [];
  }
};

export default PublishDemandPage;
