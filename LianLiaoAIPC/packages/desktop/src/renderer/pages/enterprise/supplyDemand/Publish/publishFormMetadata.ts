import type { EnterpriseDemandPublishField } from '@/common/enterprise/contracts';

export type PublishFormValue = string | string[] | number | { format: (template: string) => string } | undefined;
export type PublishFormValues = Record<string, PublishFormValue>;

type VisibilityRule = {
  field?: string;
  operator?: 'EQ' | 'CONTAINS' | 'NOT_EMPTY';
  value?: string;
};

export type PublishValidationRule = {
  minLength?: number;
  pattern?: string;
};

export type PublishControlProps = {
  allowCustom?: boolean;
  maxCount?: number;
};

const parseObject = <T>(value?: string): T | undefined => {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as T) : undefined;
  } catch {
    return undefined;
  }
};

const valuesForComparison = (value: PublishFormValue): string[] => {
  if (Array.isArray(value))
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean);
  if (value === undefined) return [];
  return String(value)
    .split(/[、，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

/**
 * Evaluates the small, server-defined visibility DSL without executing code from metadata.
 * Unknown or malformed rules fail open in the renderer; the server repeats validation and
 * remains the authority for writes.
 */
export const isPublishFieldVisible = (field: EnterpriseDemandPublishField, values: PublishFormValues): boolean => {
  const rule = parseObject<VisibilityRule>(field.visibleWhenJson);
  if (!rule?.field) return true;
  const actual = valuesForComparison(values[rule.field]);
  if (rule.operator === 'NOT_EMPTY') return actual.length > 0;
  if (rule.operator === 'CONTAINS') return rule.value !== undefined && actual.includes(rule.value);
  return rule.value !== undefined && actual.length === 1 && actual[0] === rule.value;
};

export const readPublishValidationRule = (field: EnterpriseDemandPublishField): PublishValidationRule =>
  parseObject<PublishValidationRule>(field.validationJson) ?? {};

export const readPublishControlProps = (field: EnterpriseDemandPublishField): PublishControlProps =>
  parseObject<PublishControlProps>(field.controlPropsJson) ?? {};

export const allowsCustomPublishOption = (field: EnterpriseDemandPublishField): boolean =>
  readPublishControlProps(field).allowCustom === true;

export const serializePublishFieldValue = (field: EnterpriseDemandPublishField, value: PublishFormValue): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object' && !Array.isArray(value) && 'format' in value) return value.format('YYYY-MM-DD');
  if (Array.isArray(value)) return value.map(String).join(field.valueSeparator || '、');
  return String(value).trim();
};
