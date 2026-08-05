import dayjs, { type Dayjs } from 'dayjs';

import type {
  DemandAiFieldSnapshot,
  EnterpriseDemandPublishField,
  EnterpriseDemandPublishSchema,
} from '@/common/enterprise/contracts';

import { allowsCustomPublishOption, serializePublishFieldValue, type PublishFormValue } from '../publishFormMetadata';

export type DemandAiPublishFormPatch = Record<string, string | string[] | number | Dayjs | undefined>;

const toControlValue = (
  field: EnterpriseDemandPublishField,
  snapshot: DemandAiFieldSnapshot
): DemandAiPublishFormPatch[string] => {
  const value = snapshot.value;
  switch (field.inputType) {
    case 'DATE': {
      const parsed = dayjs(value);
      return parsed.isValid() ? parsed : undefined;
    }
    case 'NUMBER': {
      const numberText = value.match(/-?\d+(?:\.\d+)?/)?.[0];
      const numberValue = numberText === undefined ? Number.NaN : Number(numberText);
      return Number.isFinite(numberValue) ? numberValue : undefined;
    }
    case 'MULTISELECT':
      return value
        .split(field.valueSeparator || /[、，,]/)
        .map((item) => item.trim())
        .filter(Boolean);
    case 'SELECT':
      return allowsCustomPublishOption(field) ? [value] : value;
    case 'IMAGE':
      return value
        .split(field.valueSeparator || '、')
        .map((item) => item.trim())
        .filter(Boolean);
    default:
      return value;
  }
};

/** Converts only server-whitelisted AI snapshots into values understood by the existing Ant form. */
export const toPublishFormPatch = (
  schema: EnterpriseDemandPublishSchema,
  snapshots: Record<string, DemandAiFieldSnapshot>
): DemandAiPublishFormPatch => {
  const fields = new Map(schema.fields.map((field) => [field.fieldKey, field]));
  const patch: DemandAiPublishFormPatch = {};
  for (const [fieldKey, snapshot] of Object.entries(snapshots)) {
    const field = fields.get(fieldKey);
    if (!field) continue;
    const value = toControlValue(field, snapshot);
    if (value !== undefined) patch[fieldKey] = value;
  }
  return patch;
};

/** Serializes one Ant form change back to the server metadata representation. */
export const toManualPatch = (
  schema: EnterpriseDemandPublishSchema,
  changedValues: Record<string, PublishFormValue>
): Record<string, string> => {
  const fields = new Map(schema.fields.map((field) => [field.fieldKey, field]));
  const patch: Record<string, string> = {};
  for (const [fieldKey, value] of Object.entries(changedValues)) {
    const field = fields.get(fieldKey);
    if (!field) continue;
    patch[fieldKey] = serializePublishFieldValue(field, value);
  }
  return patch;
};
