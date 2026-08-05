import { z } from 'zod';

import {
  CATALOG_CONVERSATION_MODES,
  CATALOG_ENTITY_TYPES,
  ENTERPRISE_ASSISTANT_INTENTS,
  ENTERPRISE_ASSISTANT_TARGET_MODULES,
} from './contracts';

const optionalShortText = (maximum: number) => z.string().trim().min(1).max(maximum).optional();
const nullishShortText = (maximum: number) => z.string().trim().min(1).max(maximum).nullish();
const catalogIdSchema = z.string().trim().min(1).max(100);
const MAX_CATALOG_RESULTS = 50;

export const catalogFiltersSchema = z
  .object({
    keyword: nullishShortText(100),
    industry: nullishShortText(100),
    province: nullishShortText(100),
    city: nullishShortText(100),
    district: nullishShortText(100),
    categoryL1: nullishShortText(100),
    categoryL2: nullishShortText(100),
    materialShortName: nullishShortText(100),
    materialName: nullishShortText(100),
    budgetRange: nullishShortText(100),
    constructionNature: nullishShortText(100),
    investmentType: nullishShortText(100),
    publishedFrom: nullishShortText(10),
    publishedTo: nullishShortText(10),
    minInvestment: nullishShortText(30),
    maxInvestment: nullishShortText(30),
  })
  .strict()
  .transform((filters) =>
    Object.fromEntries(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])))
  );

const catalogContextSchema = z
  .object({
    lastEntityType: z.enum(CATALOG_ENTITY_TYPES).optional(),
    lastFilters: catalogFiltersSchema.optional(),
    lastResultCount: z.number().int().min(0).max(MAX_CATALOG_RESULTS).optional(),
    lastUserMessage: optionalShortText(300),
    lastSummary: optionalShortText(300),
    currentScope: z
      .object({
        scopeId: z.string().uuid(),
        entityType: z.enum(CATALOG_ENTITY_TYPES),
        filters: catalogFiltersSchema,
        resultIds: z.array(catalogIdSchema).max(MAX_CATALOG_RESULTS),
        resultDigest: z
          .array(
            z
              .object({
                id: catalogIdSchema,
                name: z.string().trim().min(1).max(200),
                province: optionalShortText(100),
                city: optionalShortText(100),
                district: optionalShortText(100),
                industry: optionalShortText(100),
                investment: z.number().finite().nonnegative().optional(),
                nature: optionalShortText(100),
                publishedAt: optionalShortText(30),
                summary: optionalShortText(500),
              })
              .strict()
          )
          .max(MAX_CATALOG_RESULTS),
        createdAt: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    nextBatchExcludedIds: z.array(catalogIdSchema).max(MAX_CATALOG_RESULTS).optional(),
    excludedIds: z.array(catalogIdSchema).max(MAX_CATALOG_RESULTS).optional(),
  })
  .strict();

export const catalogPlanPayloadSchema = z
  .object({
    message: z.string().trim().min(2).max(1000),
    context: catalogContextSchema.optional(),
  })
  .strict();

export const catalogPlanResponseSchema = z
  .object({
    mode: z.enum(CATALOG_CONVERSATION_MODES).optional().default('NEW_SEARCH'),
    entityType: z.enum(CATALOG_ENTITY_TYPES).nullish(),
    baseScopeId: z.string().uuid().nullish(),
    filters: catalogFiltersSchema,
    resultLimit: z.number().int().min(1).max(MAX_CATALOG_RESULTS),
    clarification: z.string().trim().min(1).max(200).nullish(),
    summary: z.string().trim().min(1).max(300),
  })
  .strict()
  .transform(({ entityType, baseScopeId, clarification, ...rest }) => ({
    ...rest,
    ...(entityType ? { entityType } : {}),
    ...(baseScopeId ? { baseScopeId } : {}),
    ...(clarification ? { clarification } : {}),
  }));

export const enterpriseAssistantPlanPayloadSchema = z
  .object({
    message: z.string().trim().min(2).max(1000),
    currentModule: z.string().trim().min(1).max(100),
    hasCatalogScope: z.boolean(),
    recentSummary: optionalShortText(300),
  })
  .strict();

export const enterpriseAssistantPlanResponseSchema = z
  .object({
    intent: z.enum(ENTERPRISE_ASSISTANT_INTENTS),
    confidence: z.number().min(0).max(1),
    requiresConfirmation: z.boolean(),
    targetModule: z.enum(ENTERPRISE_ASSISTANT_TARGET_MODULES).nullish(),
    reason: z.string().trim().min(1).max(200),
    clarification: z.string().trim().min(1).max(200).nullish(),
    initialMessage: z.string().trim().min(2).max(1000),
  })
  .strict()
  .transform(({ targetModule, clarification, ...rest }) => ({
    ...rest,
    ...(targetModule ? { targetModule } : {}),
    ...(clarification ? { clarification } : {}),
  }));

export const catalogCandidateSchema = z
  .object({
    id: catalogIdSchema,
    name: z.string().trim().min(1).max(200),
    companyName: optionalShortText(200),
    industry: optionalShortText(100),
    region: optionalShortText(100),
    investment: z.number().finite().nonnegative().optional(),
    nature: optionalShortText(100),
    publishedAt: optionalShortText(30),
    summary: optionalShortText(500),
  })
  .strict();

export const catalogRankPayloadSchema = z
  .object({
    message: z.string().trim().min(2).max(1000),
    plan: catalogPlanResponseSchema,
    candidates: z.array(catalogCandidateSchema).min(1).max(100),
  })
  .strict();

export const catalogRankResponseSchema = z
  .object({
    summary: z.string().trim().min(1).max(300),
    items: z
      .array(
        z
          .object({
            id: catalogIdSchema,
            reason: z.string().trim().min(1).max(120),
          })
          .strict()
      )
      .min(1)
      .max(MAX_CATALOG_RESULTS),
  })
  .strict();
