import { z } from 'zod';

import type {
  DemandAiConversationSnapshot,
  EnterpriseCompanySummary,
  EnterpriseDemandAiParseResult,
  EnterpriseDemandImage,
  EnterpriseDemandPublishResult,
  EnterpriseDemandPublishSchema,
  EnterpriseDemandSummary,
  EnterpriseDemandTypeOption,
  EnterpriseIndustryOption,
  EnterpriseOperation,
  EnterpriseProductSummary,
  EnterpriseProjectFilterOption,
  EnterpriseProjectSummary,
  EnterpriseResponse,
  EnterpriseUserContext,
} from './contracts';
import { enterpriseNormalizers } from './normalizers';
import {
  catalogPlanResponseSchema,
  catalogRankResponseSchema,
  catalogWorkflowPlanResponseSchema,
  catalogWorkflowRankResponseSchema,
  enterpriseAssistantPlanResponseSchema,
} from './catalog-assistant/schemas';
import type {
  CatalogAssistantPlan,
  CatalogAssistantRankResult,
  CatalogWorkflowPlan,
  CatalogWorkflowRankResult,
  EnterpriseAssistantRoutePlan,
} from './catalog-assistant/contracts';
import { parseDemandContactAccess } from './demand-contact/schemas';
import { parseUnifiedSearchResult, parseUnifiedSearchSuggestions } from './unified-search/schemas';
import { parseEnterpriseContactAccess, parseEnterpriseProjectContactUnlock } from './contact-access/schemas';
import {
  commonResultSchema,
  enterpriseCompanyDetailEnvelopeRawSchema,
  enterpriseCompanyRawSchema,
  enterpriseDrillEnvelopeRawSchema,
  enterpriseProjectFilterOptionsEnvelopeRawSchema,
  enterpriseLoginStatusSchema,
  enterpriseRequestSchema,
  userContextRawSchema,
} from './rawSchemas';

const demandPublishFieldSchema = z
  .object({
    sourceColumn: z.string().nullish(),
    fieldKey: z.string().min(1),
    fieldLabel: z.string().min(1),
    targetKind: z.enum(['BASE', 'DYNAMIC']).nullish(),
    groupCode: z.string().nullish(),
    groupName: z.string().nullish(),
    groupOrder: z.number().int().nullish(),
    displayOrder: z.number().int().nullish(),
    inputType: z.enum(['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'SELECT', 'MULTISELECT', 'IMAGE']),
    required: z.boolean(),
    placeholder: z.string().nullish(),
    maxLength: z.number().int().positive(),
    options: z.array(z.string()),
    visibleWhenJson: z.string().nullish(),
    validationJson: z.string().nullish(),
    defaultValue: z.string().nullish(),
    controlPropsJson: z.string().nullish(),
    valueSeparator: z.string().nullish(),
    aiHint: z.string().nullish(),
  })
  .passthrough()
  .transform((field) => ({
    ...(field.sourceColumn ? { sourceColumn: field.sourceColumn } : {}),
    fieldKey: field.fieldKey,
    fieldLabel: field.fieldLabel,
    ...(field.targetKind ? { targetKind: field.targetKind } : {}),
    ...(field.groupCode ? { groupCode: field.groupCode } : {}),
    ...(field.groupName ? { groupName: field.groupName } : {}),
    ...(field.groupOrder === null || field.groupOrder === undefined ? {} : { groupOrder: field.groupOrder }),
    ...(field.displayOrder === null || field.displayOrder === undefined ? {} : { displayOrder: field.displayOrder }),
    inputType: field.inputType,
    required: field.required,
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
    maxLength: field.maxLength,
    options: field.options,
    ...(field.visibleWhenJson ? { visibleWhenJson: field.visibleWhenJson } : {}),
    ...(field.validationJson ? { validationJson: field.validationJson } : {}),
    ...(field.defaultValue ? { defaultValue: field.defaultValue } : {}),
    ...(field.controlPropsJson ? { controlPropsJson: field.controlPropsJson } : {}),
    ...(field.valueSeparator ? { valueSeparator: field.valueSeparator } : {}),
    ...(field.aiHint ? { aiHint: field.aiHint } : {}),
  }));

const demandPublishSchemaResponse = z
  .object({
    typeId: z.number().int().nonnegative(),
    typeName: z.string().min(1),
    variantCode: z.string().min(1).default('DEFAULT'),
    variants: z
      .array(
        z
          .object({
            variantCode: z.string().min(1),
            variantName: z.string().min(1),
          })
          .passthrough()
      )
      .default([]),
    fields: z.array(demandPublishFieldSchema),
  })
  .passthrough();

const demandAiParseResponse = z
  .object({
    suggestedFields: z.record(z.string(), z.string()),
    warnings: z.array(z.string()),
  })
  .passthrough();

const demandAiFieldSnapshotResponse = z
  .object({
    value: z.string(),
    source: z.enum(['AI', 'MANUAL', 'SYSTEM']),
    confidence: z.number().min(0).max(1).nullish(),
    updatedTurn: z.number().int().nonnegative(),
    locked: z.boolean(),
  })
  .passthrough()
  .transform((value) => ({
    value: value.value,
    source: value.source,
    ...(value.confidence === null || value.confidence === undefined ? {} : { confidence: value.confidence }),
    updatedTurn: value.updatedTurn,
    locked: value.locked,
  }));

const demandAiLineCandidateResponse = z
  .object({
    typeId: z.number().int().nonnegative(),
    typeName: z.string().min(1),
    variantCode: z.string().min(1).nullish(),
    variantName: z.string().min(1).nullish(),
    confidence: z.number().min(0).max(1),
    reason: z.string().max(300).nullish(),
  })
  .passthrough();

const demandAiConversationResponse = z
  .object({
    sessionId: z.string().uuid(),
    version: z.number().int().positive(),
    state: z.enum([
      'DISCOVERING_LINE',
      'CONFIRMING_LINE',
      'COLLECTING_FIELDS',
      'CONFIRMING_SWITCH',
      'REVIEW_READY',
      'SUBMITTED',
      'CANCELLED',
    ]),
    action: z.enum(['ASK', 'CONFIRM_LINE', 'APPLY_PATCH', 'CONFIRM_SWITCH', 'REVIEW_READY', 'RETRY_AVAILABLE']),
    message: z.string().min(1).max(1000),
    lineDecision: z
      .object({
        typeId: z.number().int().nonnegative().nullish(),
        typeName: z.string().min(1).nullish(),
        variantCode: z.string().min(1).nullish(),
        confidence: z.number().min(0).max(1).nullish(),
        candidates: z.array(demandAiLineCandidateResponse).max(3),
      })
      .passthrough(),
    fieldPatch: z.record(z.string(), z.string()),
    formValues: z.record(z.string(), demandAiFieldSnapshotResponse),
    missingRequiredFields: z.array(z.string().min(1).max(100)).max(100),
    warnings: z.array(z.string().max(300)).max(10),
    completion: z.number().min(0).max(1),
    submittedDemandId: z
      .string()
      .regex(/^-?[1-9][0-9]{0,30}$/)
      .nullish(),
  })
  .passthrough();

const demandPublishResultResponse = z
  .object({
    demandId: z.union([z.string(), z.number()]).transform((value) => String(value)),
    typeId: z.number().int().nonnegative(),
    reviewStatus: z.literal('PENDING'),
  })
  .passthrough()
  .refine((value) => /^-?[1-9][0-9]{0,30}$/.test(value.demandId), 'Invalid demand identifier');

const demandImageResponse = z
  .object({
    url: z.string().url().startsWith('https://'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    sizeBytes: z.number().int().positive(),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  })
  .passthrough();

const {
  describeParseError,
  normalizeCompany,
  normalizeDashboard,
  normalizeDemandDetail,
  normalizeDemandSummary,
  normalizeDemandTypeOption,
  normalizeDrillItem,
  normalizeProjectFilterOption,
  normalizeIndustryOptions,
  normalizePage,
  normalizeProduct,
  normalizeProjectDetail,
  normalizeProjectSummary,
  normalizeUserContextRaw,
  operationError,
} = enterpriseNormalizers;

export {
  commonResultSchema,
  enterpriseCompanyRawSchema,
  enterpriseLoginStatusSchema,
  enterpriseProductRawSchema,
  enterpriseRequestSchema,
} from './rawSchemas';

export const enterpriseUserContextSchema = userContextRawSchema.transform(normalizeUserContextRaw);

const projectDrillResponseSchema = z
  .union([z.array(z.unknown()), enterpriseDrillEnvelopeRawSchema])
  .transform((input) => (Array.isArray(input) ? input : input.list));

const projectFilterOptionsResponseSchema = z
  .union([z.array(z.unknown()), enterpriseProjectFilterOptionsEnvelopeRawSchema])
  .transform((input) => (Array.isArray(input) ? input : input.list));

/**
 * Normalizes a user-context payload into the cross-process enterprise contract.
 * Numeric identifiers are converted to strings so callers never depend on backend storage types.
 */
export const normalizeEnterpriseUserContext = (input: unknown): EnterpriseUserContext =>
  enterpriseUserContextSchema.parse(input);

/**
 * Validates and unwraps a successful CommonResult envelope without changing its data payload.
 */
export const parseCommonResult = (input: unknown, operation: string): unknown => {
  const result = commonResultSchema.safeParse(input);
  if (!result.success) throw operationError(operation, describeParseError(result.error));
  return result.data.data;
};

/**
 * Converts backend response data into the stable model for a whitelisted enterprise operation.
 * Validation failures always identify the operation and never synthesize missing domain records.
 */
export const parseEnterpriseResponse = (operation: EnterpriseOperation, input: unknown): EnterpriseResponse => {
  try {
    switch (operation) {
      case 'company.list':
        return {
          operation,
          data: normalizePage<EnterpriseCompanySummary>(input, operation, (item) => normalizeCompany(item, operation)),
        };
      case 'company.detail': {
        const envelope = enterpriseCompanyDetailEnvelopeRawSchema.parse(input);
        return { operation, data: normalizeCompany(envelope.company ?? envelope, operation) };
      }
      case 'company.batchGet':
        return {
          operation,
          data: z
            .array(enterpriseCompanyRawSchema)
            .max(100)
            .parse(input)
            .map((item) => normalizeCompany(item, operation)),
        };
      case 'company.industries':
        return { operation, data: normalizeIndustryOptions(input) as EnterpriseIndustryOption[] };
      case 'product.list':
        return {
          operation,
          data: normalizePage<EnterpriseProductSummary>(input, operation, (item) => normalizeProduct(item, operation)),
        };
      case 'product.detail':
        return { operation, data: normalizeProduct(input, operation) };
      case 'catalogAssistant.plan':
        return {
          operation,
          data: catalogPlanResponseSchema.parse(input) as CatalogAssistantPlan,
        };
      case 'catalogAssistant.rank':
        return {
          operation,
          data: catalogRankResponseSchema.parse(input) as CatalogAssistantRankResult,
        };
      case 'catalogAssistant.workflowPlan':
        return {
          operation,
          data: catalogWorkflowPlanResponseSchema.parse(input) as CatalogWorkflowPlan,
        };
      case 'catalogAssistant.workflowRank':
        return {
          operation,
          data: catalogWorkflowRankResponseSchema.parse(input) as CatalogWorkflowRankResult,
        };
      case 'enterpriseAssistant.plan':
        return {
          operation,
          data: enterpriseAssistantPlanResponseSchema.parse(input) as EnterpriseAssistantRoutePlan,
        };
      case 'project.dashboard':
        return { operation, data: normalizeDashboard(input) };
      case 'project.drill':
        return { operation, data: projectDrillResponseSchema.parse(input).map(normalizeDrillItem) };
      case 'project.filterOptions':
        return {
          operation,
          data: projectFilterOptionsResponseSchema
            .parse(input)
            .map((item): EnterpriseProjectFilterOption => normalizeProjectFilterOption(item)),
        };
      case 'project.list':
        return {
          operation,
          data: normalizePage<EnterpriseProjectSummary>(input, operation, (item) =>
            normalizeProjectSummary(item, operation)
          ),
        };
      case 'project.detail':
        return { operation, data: normalizeProjectDetail(input) };
      case 'contact.acquire':
        return { operation, data: parseEnterpriseContactAccess(input) };
      case 'project.contactUnlock':
        return { operation, data: parseEnterpriseProjectContactUnlock(input) };
      case 'demand.types':
      case 'demand.publishTypes':
        return {
          operation,
          data: z
            .array(z.unknown())
            .parse(input)
            .map((item): EnterpriseDemandTypeOption => normalizeDemandTypeOption(item)),
        };
      case 'demand.list':
        return {
          operation,
          data: normalizePage<EnterpriseDemandSummary>(input, operation, (item) =>
            normalizeDemandSummary(item, operation)
          ),
        };
      case 'demand.detail':
        return { operation, data: normalizeDemandDetail(input) };
      case 'demand.contactStatus':
      case 'demand.contactAcquire':
        return { operation, data: parseDemandContactAccess(input) };
      case 'demand.publishSchema':
        return { operation, data: demandPublishSchemaResponse.parse(input) as EnterpriseDemandPublishSchema };
      case 'demand.aiParse':
        return { operation, data: demandAiParseResponse.parse(input) as EnterpriseDemandAiParseResult };
      case 'demand.aiConversation.start':
      case 'demand.aiConversation.turn':
      case 'demand.aiConversation.confirmLine':
      case 'demand.aiConversation.patch':
      case 'demand.aiConversation.resume':
      case 'demand.aiConversation.cancel':
      case 'demand.aiConversation.complete':
        return {
          operation,
          data: demandAiConversationResponse.parse(input) as DemandAiConversationSnapshot,
        } as EnterpriseResponse;
      case 'demand.publish':
        return { operation, data: demandPublishResultResponse.parse(input) as EnterpriseDemandPublishResult };
      case 'demand.uploadImage':
        return { operation, data: demandImageResponse.parse(input) as EnterpriseDemandImage };
      case 'unified.suggest':
        return { operation, data: parseUnifiedSearchSuggestions(input) };
      case 'unified.search':
        return { operation, data: parseUnifiedSearchResult(input) };
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`[${operation}]`)) throw error;
    throw operationError(operation, describeParseError(error));
  }
};
