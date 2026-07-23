import type { EnterprisePage } from '@/common/enterprise/contracts';
import { isEnterpriseEntityId } from '@/common/enterprise/entityId';

export type EnterpriseDataFieldKind = 'string' | 'finiteNumber' | 'boolean';
export type EnterpriseDataFieldRule = readonly [
  key: string,
  kind: EnterpriseDataFieldKind,
  required?: true,
  nonEmpty?: true,
];

const ENTERPRISE_IMAGE_HOSTS = new Set(['cloud.lslnii.com', 'sjbang.lslnii.com', 'www.lslnii.com']);

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isPositiveInteger = (value: unknown): value is number => isNonNegativeInteger(value) && value > 0;

export const getPlainEnterpriseDataFields = (value: unknown): Map<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const fields = new Map<string, unknown>();
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        return null;
      }
      fields.set(key, descriptor.value);
    }
    return fields;
  } catch {
    return null;
  }
};

const matchesFieldKind = (value: unknown, kind: EnterpriseDataFieldKind): boolean => {
  if (kind === 'finiteNumber') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === kind;
};

export const createPlainEnterpriseRecordParser = <T extends object>(rules: readonly EnterpriseDataFieldRule[]) => {
  const rulesByKey = new Map(rules.map((rule) => [rule[0], rule] as const));
  return (value: unknown): T | null => {
    const fields = getPlainEnterpriseDataFields(value);
    if (!fields) return null;
    const result: Record<string, unknown> = {};

    for (const [key, fieldValue] of fields) {
      const rule = rulesByKey.get(key);
      if (!rule) return null;
      if (fieldValue !== undefined && !matchesFieldKind(fieldValue, rule[1])) return null;
      if (rule[3] === true && fieldValue === '') return null;
      result[key] = fieldValue;
    }
    for (const [key, , required] of rules) {
      if (required === true && (!fields.has(key) || fields.get(key) === undefined)) return null;
    }
    return result as T;
  };
};

const parsePlainDataArray = <T>(value: unknown, parseItem: (item: unknown) => T | null): T[] | null => {
  if (!Array.isArray(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    const length = lengthDescriptor?.value;
    if (!isNonNegativeInteger(length) || Reflect.ownKeys(value).length !== length + 1) return null;

    const result: T[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        return null;
      }
      const item = parseItem(descriptor.value);
      if (!item) return null;
      result.push(item);
    }
    return result;
  } catch {
    return null;
  }
};

export const parseEnterprisePage = <T>(
  value: unknown,
  parseItem: (item: unknown) => T | null,
  expectedPageNum: number,
  expectedPageSize: number
): EnterprisePage<T> | null => {
  const fields = getPlainEnterpriseDataFields(value);
  if (
    !fields ||
    fields.size !== 5 ||
    !['list', 'pageNum', 'pageSize', 'pages', 'total'].every((key) => fields.has(key))
  ) {
    return null;
  }
  const list = parsePlainDataArray(fields.get('list'), parseItem);
  const pageNum = fields.get('pageNum');
  const pageSize = fields.get('pageSize');
  const pages = fields.get('pages');
  const total = fields.get('total');
  if (
    !list ||
    pageNum !== expectedPageNum ||
    pageSize !== expectedPageSize ||
    !isPositiveInteger(pageNum) ||
    !isPositiveInteger(pageSize) ||
    !isNonNegativeInteger(pages) ||
    !isNonNegativeInteger(total)
  ) {
    return null;
  }
  return { list, pageNum, pageSize, pages, total };
};

export const parseEnterpriseOperationData = (value: unknown, expectedOperation: string): unknown => {
  const fields = getPlainEnterpriseDataFields(value);
  if (!fields || fields.size !== 2 || fields.get('operation') !== expectedOperation || !fields.has('data')) {
    return undefined;
  }
  return fields.get('data');
};

export const isNumericEnterpriseId = (value: string | undefined): value is string => isEnterpriseEntityId(value, 31);

export const parseSafeEnterpriseImageUrl = (value: string | undefined): string | null => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return null;

  try {
    const parsedUrl = new URL(trimmedValue.startsWith('//') ? `https:${trimmedValue}` : trimmedValue);
    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.port !== '' ||
      parsedUrl.username !== '' ||
      parsedUrl.password !== '' ||
      !ENTERPRISE_IMAGE_HOSTS.has(parsedUrl.hostname)
    ) {
      return null;
    }
    return parsedUrl.toString();
  } catch {
    return null;
  }
};
