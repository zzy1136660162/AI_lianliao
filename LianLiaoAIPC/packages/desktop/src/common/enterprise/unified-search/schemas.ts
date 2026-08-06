import { z } from 'zod';

import { isEnterpriseEntityId } from '../entityId';
import { UNIFIED_RESOURCE_TYPES, type UnifiedSearchResult } from './contracts';

const nullAsUndefined = (value: unknown): unknown => (value === null ? undefined : value);
const optionalText = z.preprocess(nullAsUndefined, z.string().min(1).optional());
const optionalHttpsUrl = z.preprocess(nullAsUndefined, z.string().url().startsWith('https://').optional());

const itemSchema = z
  .object({
    resourceType: z.enum(UNIFIED_RESOURCE_TYPES),
    businessId: z.string().refine((value) => isEnterpriseEntityId(value, 31)),
    title: z.string().min(1).max(200),
    subtitle: optionalText,
    summary: optionalText,
    coverUrl: optionalHttpsUrl,
    city: optionalText,
    district: optionalText,
    industry: optionalText,
    tags: z.array(z.string().min(1).max(40)).max(8),
    publishedAt: optionalText,
  })
  .strict();

const resultSchema = z
  .object({
    total: z.number().int().nonnegative().safe(),
    pageNum: z.number().int().positive().safe(),
    pageSize: z.number().int().positive().max(50).safe(),
    items: z.array(itemSchema),
  })
  .strict();

export const parseUnifiedSearchResult = (input: unknown): UnifiedSearchResult =>
  resultSchema.parse(input) as UnifiedSearchResult;

export const parseUnifiedSearchSuggestions = (input: unknown): string[] =>
  z.array(z.string().trim().min(1).max(100)).max(10).parse(input);
