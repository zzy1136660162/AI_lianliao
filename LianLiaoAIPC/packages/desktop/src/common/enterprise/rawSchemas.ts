import { z } from 'zod';

import {
  ENTERPRISE_LOGIN_STATUSES,
  ENTERPRISE_PROJECT_DRILL_LEVELS,
  ENTERPRISE_PROJECT_FILTER_DIMENSIONS,
} from './constants';
import {
  catalogPlanPayloadSchema,
  catalogRankPayloadSchema,
  enterpriseAssistantPlanPayloadSchema,
} from './catalog-assistant/schemas';
import { UNIFIED_RESOURCE_TYPES } from './unified-search/contracts';
import { ENTERPRISE_CONTACT_RESOURCE_TYPES } from './contact-access/contracts';
import { isEnterpriseEntityId } from './entityId';

const rawTextSchema = z.string().nullish();
const rawIdentifierSchema = z.union([z.string(), z.number()]).nullish();
const rawNumberSchema = z.union([z.string(), z.number()]).nullish();
const rawBooleanSchema = z.union([z.string(), z.number(), z.boolean()]).nullish();
const positiveIntegerSchema = z.number().int().positive().refine(Number.isSafeInteger, 'Expected a safe integer');
const nonNegativeIntegerSchema = z.number().int().nonnegative().refine(Number.isSafeInteger, 'Expected a safe integer');
const requestIdentifierSchema = z.string().trim().min(1);
const projectRequestIdentifierSchema = z.string().refine((value) => isEnterpriseEntityId(value, 31));
const projectKeywordSchema = z.string().max(100);
const projectShortTextSchema = z.string().max(100);
const projectLongTextSchema = z.string().max(200);
const projectDateSchema = z.string().max(32);
const projectPageNumSchema = positiveIntegerSchema.refine((value) => value <= 1_000_000, 'Page number is too large');
const projectPageSizeSchema = positiveIntegerSchema.refine((value) => value <= 100, 'Page size is too large');
const projectInvestmentSchema = z.number().finite().nonnegative().max(1_000_000_000_000);
const FORBIDDEN_OBJECT_KEYS = ['__proto__', 'prototype', 'constructor'] as const;

const hasOwn = (input: object, key: string): boolean => Object.prototype.hasOwnProperty.call(input, key);

const sanitizePlainJsonObject = (input: unknown, requiredOwnKeys: readonly string[]): object | undefined => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return undefined;

    const sanitized = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== 'string' || FORBIDDEN_OBJECT_KEYS.includes(key as (typeof FORBIDDEN_OBJECT_KEYS)[number])) {
        return undefined;
      }

      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || 'get' in descriptor || 'set' in descriptor) return undefined;
      if (!descriptor.enumerable) continue;
      Object.defineProperty(sanitized, key, {
        value: descriptor.value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    for (const key in input) {
      if (!hasOwn(input, key)) return undefined;
    }
    return requiredOwnKeys.every((key) => hasOwn(sanitized, key)) ? sanitized : undefined;
  } catch {
    return undefined;
  }
};

const jsonObjectGuard = (requiredOwnKeys: readonly string[] = []) =>
  z.preprocess(
    (input) => sanitizePlainJsonObject(input, requiredOwnKeys),
    z.custom<object>((input) => input !== undefined, 'Expected a plain JSON object with own required fields')
  );

const guardedObject = <Schema extends z.ZodTypeAny>(schema: Schema, requiredOwnKeys: readonly string[] = []) =>
  jsonObjectGuard(requiredOwnKeys)
    .pipe(schema)
    .transform((output, context): z.output<Schema> => {
      const sanitized = sanitizePlainJsonObject(output, []);
      if (!sanitized) {
        context.addIssue({
          code: 'custom',
          message: 'Expected a plain JSON object with own data fields',
        });
        return z.NEVER;
      }
      return sanitized as z.output<Schema>;
    });

const fieldShape = <const Keys extends readonly string[], Schema extends z.ZodTypeAny>(keys: Keys, schema: Schema) =>
  Object.fromEntries(keys.map((key) => [key, schema])) as {
    [Key in Keys[number]]: Schema;
  };

interface RawFieldGroups<
  TextKeys extends readonly string[],
  IdentifierKeys extends readonly string[],
  NumberKeys extends readonly string[],
  BooleanKeys extends readonly string[],
> {
  text: TextKeys;
  identifiers: IdentifierKeys;
  numbers: NumberKeys;
  booleans: BooleanKeys;
}

const passthroughRawObjectSchema = <
  const TextKeys extends readonly string[],
  const IdentifierKeys extends readonly string[],
  const NumberKeys extends readonly string[],
  const BooleanKeys extends readonly string[],
>(
  fields: RawFieldGroups<TextKeys, IdentifierKeys, NumberKeys, BooleanKeys>
) =>
  z
    .object({
      ...fieldShape(fields.text, rawTextSchema),
      ...fieldShape(fields.identifiers, rawIdentifierSchema),
      ...fieldShape(fields.numbers, rawNumberSchema),
      ...fieldShape(fields.booleans, rawBooleanSchema),
    })
    .passthrough();

const passthroughRawSchema = <
  const TextKeys extends readonly string[],
  const IdentifierKeys extends readonly string[],
  const NumberKeys extends readonly string[],
  const BooleanKeys extends readonly string[],
>(
  fields: RawFieldGroups<TextKeys, IdentifierKeys, NumberKeys, BooleanKeys>
) => guardedObject(passthroughRawObjectSchema(fields));

export const commonResultSchema = guardedObject(
  z
    .object({
      success: z.literal(true),
      data: z.unknown(),
      message: z.string().optional(),
      code: z.union([z.string(), z.number()]).optional(),
    })
    .passthrough(),
  ['success', 'data']
);

export const enterpriseLoginStatusSchema = z.enum(ENTERPRISE_LOGIN_STATUSES);

export const enterpriseCompanyRawSchema = passthroughRawSchema({
  text: [
    'name',
    'NAME',
    'companyName',
    'COMPANY_NAME',
    'shortName',
    'SHORT_NAME',
    'industry',
    'INDUSTRY',
    'province',
    'PROVINCE',
    'city',
    'CITY',
    'district',
    'DISTRICT',
    'address',
    'ADDRESS',
    'corporation',
    'CORPORATION',
    'legalRepresentative',
    'LEGAL_REPRESENTATIVE',
    'comType',
    'COM_TYPE',
    'companyType',
    'COMPANY_TYPE',
    'foundTime',
    'FOUND_TIME',
    'establishedAt',
    'ESTABLISHED_AT',
    'tempPic',
    'TEMP_PIC',
    'logoUrl',
    'LOGO_URL',
    'comAbs',
    'COM_ABS',
    'comIntro',
    'COM_INTRO',
    'description',
    'DESCRIPTION',
    'inputTime',
    'INPUT_TIME',
    'societyCode',
    'SOCIETY_CODE',
    'unifiedSocialCreditCode',
    'UNIFIED_SOCIAL_CREDIT_CODE',
    'contactPerson',
    'CONTACT_PERSON',
    'contactName',
    'CONTACT_NAME',
    'contactDuty',
    'CONTACT_DUTY',
    'contactTitle',
    'CONTACT_TITLE',
    'phone',
    'PHONE',
  ] as const,
  identifiers: ['id', 'ID', 'companyId', 'COMPANY_ID'] as const,
  numbers: [
    'comLevel',
    'COM_LEVEL',
    'companyLevel',
    'COMPANY_LEVEL',
    'resCost',
    'RES_COST',
    'registeredCapital',
    'REGISTERED_CAPITAL',
    'featuredProductCount',
    'FEATURED_PRODUCT_COUNT',
  ] as const,
  booleans: ['vip', 'VIP', 'payVip', 'PAY_VIP', 'isCollect', 'IS_COLLECT', 'collected', 'COLLECTED'] as const,
});

export const enterpriseIndustryOptionRawSchema = passthroughRawSchema({
  text: ['industry', 'INDUSTRY'] as const,
  identifiers: [] as const,
  numbers: ['companyCount', 'COMPANY_COUNT'] as const,
  booleans: [] as const,
});

export const enterpriseCompanyDetailEnvelopeRawSchema = guardedObject(
  z.object({ company: enterpriseCompanyRawSchema.optional() }).passthrough()
);

export const enterpriseProductRawSchema = passthroughRawSchema({
  text: [
    'productsName',
    'PRODUCTS_NAME',
    'displayProductName',
    'DISPLAY_PRODUCT_NAME',
    'productName',
    'PRODUCT_NAME',
    'name',
    'NAME',
    'companyName',
    'COMPANY_NAME',
    'detailCompanyName',
    'DETAIL_COMPANY_NAME',
    'tempPic',
    'TEMP_PIC',
    'imageUrl',
    'IMAGE_URL',
    'productAbs',
    'PRODUCT_ABS',
    'summary',
    'SUMMARY',
    'industry',
    'INDUSTRY',
    'compIndustry',
    'COMP_INDUSTRY',
    'industry1',
    'INDUSTRY1',
    'province',
    'PROVINCE',
    'compProvince',
    'COMP_PROVINCE',
    'province1',
    'PROVINCE1',
    'city',
    'CITY',
    'compCity',
    'COMP_CITY',
    'city1',
    'CITY1',
    'district',
    'DISTRICT',
    'compDistrict',
    'COMP_DISTRICT',
    'district1',
    'DISTRICT1',
    'address',
    'ADDRESS',
    'compAddress',
    'COMP_ADDRESS',
    'compContactPerson',
    'COMP_CONTACT_PERSON',
    'contactName',
    'CONTACT_NAME',
    'compPhone',
    'COMP_PHONE',
    'phone',
    'PHONE',
  ] as const,
  identifiers: [
    'id',
    'ID',
    'detailProductId',
    'DETAIL_PRODUCT_ID',
    'productId',
    'PRODUCT_ID',
    'companyId',
    'COMPANY_ID',
  ] as const,
  numbers: ['comLevel', 'COM_LEVEL', 'companyLevel', 'COMPANY_LEVEL'] as const,
  booleans: ['vip', 'VIP', 'payVip', 'PAY_VIP', 'isCollect', 'IS_COLLECT', 'collected', 'COLLECTED'] as const,
});

export const enterpriseProjectRawSchema = passthroughRawSchema({
  text: [
    'projectName',
    'PROJECT_NAME',
    'name',
    'NAME',
    'title',
    'TITLE',
    'constructionUnit',
    'CONSTRUCTION_UNIT',
    'ownerName',
    'OWNER_NAME',
    'danwei',
    'DANWEI',
    'province',
    'PROVINCE',
    'sheng',
    'SHENG',
    'city',
    'CITY',
    'region',
    'REGION',
    'constructionNature',
    'CONSTRUCTION_NATURE',
    'xingzhi',
    'XINGZHI',
    'investmentType',
    'INVESTMENT_TYPE',
    'projectNature',
    'PROJECT_NATURE',
    'xiangmuxingzhi',
    'XIANGMUXINGZHI',
    'publishDate',
    'PUBLISH_DATE',
    'constructionPeriod',
    'CONSTRUCTION_PERIOD',
    'buildCycleText',
    'BUILD_CYCLE_TEXT',
    'jianshezhouqi',
    'JIANSHEZHOUQI',
    'startDate',
    'START_DATE',
    'endDate',
    'END_DATE',
    'materialName',
    'MATERIAL_NAME',
    'materialShortName',
    'MATERIAL_SHORT_NAME',
    'procurementSummary',
    'PROCUREMENT_SUMMARY',
    'lianxiren',
    'LIANXIREN',
    'contactName',
    'CONTACT_NAME',
    'phone',
    'PHONE',
    'email',
    'EMAIL',
    'address',
    'ADDRESS',
    'didian',
    'DIDIAN',
    'buildLocation',
    'BUILD_LOCATION',
    'industry',
    'INDUSTRY',
    'hangye',
    'HANGYE',
    'landArea',
    'LAND_AREA',
    'zhandimianji',
    'ZHANDIMIANJI',
    'buildingArea',
    'BUILDING_AREA',
    'jianzhumianji',
    'JIANZHUMIANJI',
    'greenArea',
    'GREEN_AREA',
    'lvhualv',
    'LVHUALV',
    'constructionScale',
    'CONSTRUCTION_SCALE',
    'guimo',
    'GUIMO',
    'equipment',
    'EQUIPMENT',
    'shebeigouzhi',
    'SHEBEIGOUZHI',
    'materials',
    'MATERIALS',
    'yuancailiao',
    'YUANCAILIAO',
    'projectComposition',
    'PROJECT_COMPOSITION',
    'jianshezucheng',
    'JIANSHEZUCHENG',
    'sourceUrl',
    'SOURCE_URL',
    'reqUrl',
    'REQ_URL',
    'followStatus',
    'FOLLOW_STATUS',
  ] as const,
  identifiers: ['id', 'ID', 'hpInfoId', 'HP_INFO_ID', 'dbId', 'DB_ID'] as const,
  numbers: ['totalInvestment', 'TOTAL_INVESTMENT', 'zongtouzi', 'ZONGTOUZI', 'inputTime', 'INPUT_TIME'] as const,
  booleans: [
    'isCollect',
    'IS_COLLECT',
    'collected',
    'COLLECTED',
    'isPurchased',
    'IS_PURCHASED',
    'purchased',
    'PURCHASED',
  ] as const,
});

const enterpriseDemandDetailFieldRawSchema = guardedObject(
  z
    .object({
      key: z.string(),
      label: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
      valueType: z.string(),
      unit: z.string().nullish(),
    })
    .passthrough(),
  ['key', 'label', 'value', 'valueType']
);

/** Fail-closed schema for the two public fields returned by the type endpoint. */
export const enterpriseDemandTypeOptionRawSchema = guardedObject(
  z
    .object({
      typeId: rawNumberSchema,
      typeName: rawTextSchema,
      groupCode: rawTextSchema,
      groupName: rawTextSchema,
      displayOrder: rawNumberSchema,
      variantEnabled: rawBooleanSchema,
      statMode: rawTextSchema,
    })
    .passthrough(),
  ['typeId', 'typeName']
);

export const enterpriseDemandRawSchema = guardedObject(
  z
    .object({
      demandId: rawIdentifierSchema,
      DEMAND_ID: rawIdentifierSchema,
      typeId: rawNumberSchema,
      TYPE_ID: rawNumberSchema,
      typeName: rawTextSchema,
      TYPE_NAME: rawTextSchema,
      title: rawTextSchema,
      TITLE: rawTextSchema,
      companyName: rawTextSchema,
      COMPANY_NAME: rawTextSchema,
      city: rawTextSchema,
      CITY: rawTextSchema,
      district: rawTextSchema,
      DISTRICT: rawTextSchema,
      address: rawTextSchema,
      ADDRESS: rawTextSchema,
      budget: rawTextSchema,
      BUDGET: rawTextSchema,
      summary: rawTextSchema,
      SUMMARY: rawTextSchema,
      publishedAt: rawTextSchema,
      PUBLISHED_AT: rawTextSchema,
      endTime: rawTextSchema,
      END_TIME: rawTextSchema,
      status: rawNumberSchema,
      STATUS: rawNumberSchema,
      grabCount: rawNumberSchema,
      GRAB_COUNT: rawNumberSchema,
      remainingGrabCount: rawNumberSchema,
      REMAINING_GRAB_COUNT: rawNumberSchema,
      remainingDays: rawNumberSchema,
      REMAINING_DAYS: rawNumberSchema,
      capacityLabel: rawTextSchema,
      CAPACITY_LABEL: rawTextSchema,
      statMode: rawTextSchema,
      STAT_MODE: rawTextSchema,
      primaryTags: z.array(z.string()).optional(),
      PRIMARY_TAGS: z.array(z.string()).optional(),
      fields: z.array(enterpriseDemandDetailFieldRawSchema).optional(),
      FIELDS: z.array(enterpriseDemandDetailFieldRawSchema).optional(),
    })
    .passthrough()
);

export const enterprisePageRawSchema = guardedObject(
  z
    .object({
      list: z.array(z.unknown()).optional(),
      LIST: z.array(z.unknown()).optional(),
      rows: z.array(z.unknown()).optional(),
      ROWS: z.array(z.unknown()).optional(),
      pageNum: rawNumberSchema,
      PAGE_NUM: rawNumberSchema,
      pageSize: rawNumberSchema,
      PAGE_SIZE: rawNumberSchema,
      pages: rawNumberSchema,
      PAGES: rawNumberSchema,
      total: rawNumberSchema,
      TOTAL: rawNumberSchema,
    })
    .passthrough()
);

export const enterpriseDistributionRawSchema = passthroughRawSchema({
  text: ['name', 'NAME', 'label', 'LABEL', 'dimension', 'DIMENSION', 'budgetRange', 'BUDGET_RANGE'] as const,
  identifiers: [] as const,
  numbers: ['value', 'VALUE', 'projectCount', 'PROJECT_COUNT'] as const,
  booleans: [] as const,
});

const DASHBOARD_NUMBER_FIELDS = [
  'projectCount',
  'PROJECT_COUNT',
  'categoryL1Count',
  'CATEGORY_L1_COUNT',
  'categoryL2Count',
  'CATEGORY_L2_COUNT',
  'shortNameCount',
  'SHORT_NAME_COUNT',
  'materialShortNameCount',
  'MATERIAL_SHORT_NAME_COUNT',
  'materialNameCount',
  'MATERIAL_NAME_COUNT',
  'investmentTotalYi',
  'INVESTMENT_TOTAL_YI',
] as const;

const enterpriseDashboardKpiRawSchema = passthroughRawSchema({
  text: [] as const,
  identifiers: [] as const,
  numbers: DASHBOARD_NUMBER_FIELDS,
  booleans: [] as const,
});

export const enterpriseDashboardRawSchema = guardedObject(
  passthroughRawObjectSchema({
    text: ['runId', 'RUN_ID', 'updatedAt', 'UPDATED_AT'] as const,
    identifiers: [] as const,
    numbers: DASHBOARD_NUMBER_FIELDS,
    booleans: [] as const,
  }).extend({
    kpi: enterpriseDashboardKpiRawSchema.optional(),
    regionDistribution: z.array(enterpriseDistributionRawSchema).optional(),
    REGION_DISTRIBUTION: z.array(enterpriseDistributionRawSchema).optional(),
    budgetDistribution: z.array(enterpriseDistributionRawSchema).optional(),
    BUDGET_DISTRIBUTION: z.array(enterpriseDistributionRawSchema).optional(),
    categoryDistribution: z.array(enterpriseDistributionRawSchema).optional(),
    CATEGORY_DISTRIBUTION: z.array(enterpriseDistributionRawSchema).optional(),
    shortNameTop: z.array(enterpriseDistributionRawSchema).optional(),
    SHORT_NAME_TOP: z.array(enterpriseDistributionRawSchema).optional(),
    materialTop: z.array(enterpriseDistributionRawSchema).optional(),
    MATERIAL_TOP: z.array(enterpriseDistributionRawSchema).optional(),
  })
);

export const enterpriseDrillRawSchema = passthroughRawSchema({
  text: [
    'name',
    'NAME',
    'label',
    'LABEL',
    'level',
    'LEVEL',
    'resultLevel',
    'RESULT_LEVEL',
    'categoryL1',
    'CATEGORY_L1',
    'categoryL2',
    'CATEGORY_L2',
    'materialShortName',
    'MATERIAL_SHORT_NAME',
    'materialName',
    'MATERIAL_NAME',
  ] as const,
  identifiers: [] as const,
  numbers: [
    'categoryL2Count',
    'CATEGORY_L2_COUNT',
    'shortNameCount',
    'SHORT_NAME_COUNT',
    'materialShortNameCount',
    'MATERIAL_SHORT_NAME_COUNT',
    'materialNameCount',
    'MATERIAL_NAME_COUNT',
    'projectCount',
    'PROJECT_COUNT',
  ] as const,
  booleans: [] as const,
});

export const enterpriseDrillEnvelopeRawSchema = guardedObject(z.object({ list: z.array(z.unknown()) }).passthrough(), [
  'list',
]);

export const enterpriseProjectFilterOptionRawSchema = passthroughRawSchema({
  text: ['value', 'VALUE', 'label', 'LABEL'] as const,
  identifiers: [] as const,
  numbers: ['projectCount', 'PROJECT_COUNT'] as const,
  booleans: [] as const,
});

export const enterpriseProjectFilterOptionsEnvelopeRawSchema = guardedObject(
  z.object({ list: z.array(z.unknown()) }).passthrough(),
  ['list']
);

export const userContextRawSchema = passthroughRawSchema({
  text: ['userName', 'USER_NAME', 'companyName', 'COMPANY_NAME'] as const,
  identifiers: [
    'openId',
    'OPEN_ID',
    'openid',
    'OPENID',
    'userId',
    'USER_ID',
    'id',
    'ID',
    'companyId',
    'COMPANY_ID',
    'roleId',
    'ROLE_ID',
  ] as const,
  numbers: [
    'companyLevel',
    'COMPANY_LEVEL',
    'comLevel',
    'COM_LEVEL',
    'remainingDemandQuota',
    'REMAINING_DEMAND_QUOTA',
    'payResNum',
    'PAY_RES_NUM',
  ] as const,
  booleans: ['registered', 'REGISTERED'] as const,
});

const companyListQuerySchema = guardedObject(
  z
    .object({
      keyword: z.string().optional(),
      industry: z.string().optional(),
      province: z.string().optional(),
      city: z.string().optional(),
      district: z.string().optional(),
      companyLevel: z.number().finite().nonnegative().optional(),
      vip: z.boolean().optional(),
      pageNum: positiveIntegerSchema,
      pageSize: positiveIntegerSchema,
    })
    .strict(),
  ['pageNum', 'pageSize']
);

const productListQuerySchema = guardedObject(
  z
    .object({
      keyword: z.string().optional(),
      industry: z.string().optional(),
      province: z.string().optional(),
      city: z.string().optional(),
      district: z.string().optional(),
      companyId: requestIdentifierSchema.optional(),
      parkId: z.string().optional(),
      sort: z.string().optional(),
      pageNum: positiveIntegerSchema,
      pageSize: positiveIntegerSchema,
    })
    .strict(),
  ['pageNum', 'pageSize']
);

const projectDrillQuerySchema = guardedObject(
  z
    .object({
      level: z.enum(ENTERPRISE_PROJECT_DRILL_LEVELS),
      runId: projectShortTextSchema.optional(),
      province: projectShortTextSchema.optional(),
      city: projectShortTextSchema.optional(),
      budgetRange: projectShortTextSchema.optional(),
      categoryL1: projectLongTextSchema.optional(),
      categoryL2: projectLongTextSchema.optional(),
      materialShortName: projectLongTextSchema.optional(),
      materialName: projectLongTextSchema.optional(),
      minProjectCount: nonNegativeIntegerSchema.optional(),
    })
    .strict(),
  ['level']
);

const projectFilterOptionsQuerySchema = guardedObject(
  z
    .object({
      dimension: z.enum(ENTERPRISE_PROJECT_FILTER_DIMENSIONS),
      runId: projectShortTextSchema.optional(),
      province: projectShortTextSchema.optional(),
      city: projectShortTextSchema.optional(),
      categoryL1: projectLongTextSchema.optional(),
      categoryL2: projectLongTextSchema.optional(),
      materialShortName: projectLongTextSchema.optional(),
      limit: positiveIntegerSchema.refine((value) => value <= 1000, 'Limit is too large').optional(),
    })
    .strict(),
  ['dimension']
);

const projectListQuerySchema = guardedObject(
  z
    .object({
      keyword: projectKeywordSchema.optional(),
      runId: projectShortTextSchema.optional(),
      categoryL1: projectLongTextSchema.optional(),
      categoryL2: projectLongTextSchema.optional(),
      materialShortName: projectLongTextSchema.optional(),
      materialName: projectLongTextSchema.optional(),
      province: projectShortTextSchema.optional(),
      city: projectShortTextSchema.optional(),
      budgetRange: projectShortTextSchema.optional(),
      constructionNature: projectShortTextSchema.optional(),
      investmentType: projectShortTextSchema.optional(),
      publishedFrom: projectDateSchema.optional(),
      publishedTo: projectDateSchema.optional(),
      minInvestment: projectInvestmentSchema.optional(),
      maxInvestment: projectInvestmentSchema.optional(),
      pageNum: projectPageNumSchema,
      pageSize: projectPageSizeSchema,
    })
    .strict(),
  ['pageNum', 'pageSize']
);

const companyDetailPayloadSchema = guardedObject(z.object({ companyId: requestIdentifierSchema }).strict(), [
  'companyId',
]);
const productDetailPayloadSchema = guardedObject(z.object({ productId: requestIdentifierSchema }).strict(), [
  'productId',
]);
const projectDashboardPayloadSchema = guardedObject(z.object({ runId: projectShortTextSchema.optional() }).strict());
const projectDetailPayloadSchema = guardedObject(z.object({ hpInfoId: projectRequestIdentifierSchema }).strict(), [
  'hpInfoId',
]);
const contactAcquirePayloadSchema = guardedObject(
  z
    .object({
      resourceType: z.enum(ENTERPRISE_CONTACT_RESOURCE_TYPES),
      resourceId: projectRequestIdentifierSchema,
      consumeQuota: z.boolean().optional(),
    })
    .strict(),
  ['resourceType', 'resourceId']
);
const demandListQuerySchema = guardedObject(
  z
    .object({
      keyword: z.string().max(100).optional(),
      typeId: nonNegativeIntegerSchema.optional(),
      city: z.string().max(100).optional(),
      district: z.string().max(100).optional(),
      status: nonNegativeIntegerSchema.optional(),
      pageNum: projectPageNumSchema,
      pageSize: projectPageSizeSchema,
    })
    .strict(),
  ['pageNum', 'pageSize']
);
const demandDetailPayloadSchema = guardedObject(
  z
    .object({
      demandId: projectRequestIdentifierSchema,
      typeId: nonNegativeIntegerSchema,
    })
    .strict(),
  ['demandId', 'typeId']
);
const demandTypesPayloadSchema = guardedObject(z.object({}).strict());
const companyIndustriesPayloadSchema = guardedObject(z.object({}).strict());
const demandContactPayloadSchema = demandDetailPayloadSchema;
const demandPublishSchemaPayloadSchema = guardedObject(
  z
    .object({
      typeId: nonNegativeIntegerSchema,
      variantCode: z.string().trim().min(1).max(50).optional(),
    })
    .strict(),
  ['typeId']
);
const demandAiParsePayloadSchema = guardedObject(
  z
    .object({
      typeId: nonNegativeIntegerSchema,
      variantCode: z.string().trim().min(1).max(50).optional(),
      description: z.string().trim().min(5).max(5000),
    })
    .strict(),
  ['typeId', 'description']
);
const demandAiUuidSchema = z.string().uuid();
const demandAiVersionSchema = z.number().int().positive();
const demandAiSessionIdSchema = demandAiUuidSchema;
const demandAiRequestIdSchema = demandAiUuidSchema;
const demandAiConversationStartPayloadSchema = guardedObject(
  z
    .object({
      requestId: demandAiRequestIdSchema,
      initialMessage: z.string().trim().min(2).max(5000),
    })
    .strict(),
  ['requestId', 'initialMessage']
);
const demandAiConversationTurnPayloadSchema = guardedObject(
  z
    .object({
      sessionId: demandAiSessionIdSchema,
      requestId: demandAiRequestIdSchema,
      version: demandAiVersionSchema,
      message: z.string().trim().min(2).max(5000),
    })
    .strict(),
  ['sessionId', 'requestId', 'version', 'message']
);
const demandAiConversationConfirmLinePayloadSchema = guardedObject(
  z
    .object({
      sessionId: demandAiSessionIdSchema,
      requestId: demandAiRequestIdSchema,
      version: demandAiVersionSchema,
      typeId: nonNegativeIntegerSchema,
      variantCode: z.string().trim().min(1).max(50).optional(),
      confirmSwitch: z.boolean().optional(),
    })
    .strict(),
  ['sessionId', 'requestId', 'version', 'typeId']
);
const demandAiConversationPatchPayloadSchema = guardedObject(
  z
    .object({
      sessionId: demandAiSessionIdSchema,
      requestId: demandAiRequestIdSchema,
      version: demandAiVersionSchema,
      fields: z
        .record(z.string().trim().min(1).max(100), z.string().max(4000))
        .refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 50),
    })
    .strict(),
  ['sessionId', 'requestId', 'version', 'fields']
);
const demandAiConversationResumePayloadSchema = guardedObject(
  z.object({ sessionId: demandAiSessionIdSchema.optional() }).strict()
);
const demandAiConversationSessionPayloadSchema = guardedObject(
  z
    .object({
      sessionId: demandAiSessionIdSchema,
      requestId: demandAiRequestIdSchema,
      version: demandAiVersionSchema,
    })
    .strict(),
  ['sessionId', 'requestId', 'version']
);
const demandAiConversationCompletePayloadSchema = guardedObject(
  z
    .object({
      sessionId: demandAiSessionIdSchema,
      requestId: demandAiRequestIdSchema,
      version: demandAiVersionSchema,
      demandId: z.string().regex(/^-?[1-9][0-9]{0,30}$/),
    })
    .strict(),
  ['sessionId', 'requestId', 'version', 'demandId']
);
const demandPublishPayloadSchema = guardedObject(
  z
    .object({
      typeId: nonNegativeIntegerSchema,
      variantCode: z.string().trim().min(1).max(50).optional(),
      title: z.string().trim().min(1).max(500),
      summary: z.string().trim().max(4000).optional(),
      province: z.string().trim().max(50).optional(),
      city: z.string().trim().max(50).optional(),
      district: z.string().trim().max(100).optional(),
      address: z.string().trim().max(255).optional(),
      budget: z.string().trim().max(255).optional(),
      endTime: z.string().trim().max(14).optional(),
      fields: z.record(z.string(), z.string().max(4000)),
    })
    .strict(),
  ['typeId', 'title', 'fields']
);
const demandUploadImagePayloadSchema = guardedObject(
  z
    .object({
      fileName: z.string().trim().min(1).max(255),
      mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
      bytes: z
        .array(z.number().int().min(0).max(255))
        .min(1)
        .max(10 * 1024 * 1024),
    })
    .strict(),
  ['fileName', 'mimeType', 'bytes']
);
const enterpriseBehaviorLogPayloadSchema = guardedObject(
  z
    .object({
      eventType: z.enum(['PAGE_VIEW', 'CONTACT_ACQUIRE', 'PHONE_DIAL', 'DEMAND_PUBLISH']),
      moduleName: z.string().trim().min(1).max(100),
      title: z.string().trim().min(1).max(300),
      pagePath: z
        .string()
        .trim()
        .min(1)
        .max(500)
        .refine((value) => value.startsWith('/enterprise/'), 'Behavior path must stay in the enterprise workspace'),
      targetId: z.string().trim().min(1).max(100).optional(),
      toCompanyId: z.string().trim().min(1).max(100).optional(),
      toCompanyName: z.string().trim().min(1).max(300).optional(),
      params: z
        .record(z.string().trim().min(1).max(100), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        .refine((value) => Object.keys(value).length <= 50)
        .optional(),
    })
    .strict(),
  ['eventType', 'moduleName', 'title', 'pagePath']
);
const unifiedSuggestPayloadSchema = guardedObject(z.object({ keyword: z.string().trim().min(2).max(100) }).strict(), [
  'keyword',
]);
const unifiedSearchPayloadSchema = guardedObject(
  z
    .object({
      keyword: z.string().trim().min(2).max(100),
      resourceTypes: z.array(z.enum(UNIFIED_RESOURCE_TYPES)).max(3).optional(),
      pageNum: projectPageNumSchema,
      pageSize: positiveIntegerSchema.refine((value) => value <= 50, 'Page size is too large'),
      enableGroupTop: z.boolean(),
      groupTopN: positiveIntegerSchema.refine((value) => value <= 20, 'Group size is too large'),
    })
    .strict(),
  ['keyword', 'pageNum', 'pageSize', 'enableGroupTop', 'groupTopN']
);

const enterpriseRequestUnionSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('company.list'), payload: companyListQuerySchema }).strict(),
  z
    .object({
      operation: z.literal('company.detail'),
      payload: companyDetailPayloadSchema,
    })
    .strict(),
  z.object({ operation: z.literal('company.industries'), payload: companyIndustriesPayloadSchema }).strict(),
  z.object({ operation: z.literal('product.list'), payload: productListQuerySchema }).strict(),
  z
    .object({
      operation: z.literal('product.detail'),
      payload: productDetailPayloadSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('catalogAssistant.plan'),
      payload: guardedObject(catalogPlanPayloadSchema, ['message']),
    })
    .strict(),
  z
    .object({
      operation: z.literal('catalogAssistant.rank'),
      payload: guardedObject(catalogRankPayloadSchema, ['message', 'plan', 'candidates']),
    })
    .strict(),
  z
    .object({
      operation: z.literal('enterpriseAssistant.plan'),
      payload: guardedObject(enterpriseAssistantPlanPayloadSchema, ['message', 'currentModule', 'hasCatalogScope']),
    })
    .strict(),
  z
    .object({
      operation: z.literal('project.dashboard'),
      payload: projectDashboardPayloadSchema,
    })
    .strict(),
  z.object({ operation: z.literal('project.drill'), payload: projectDrillQuerySchema }).strict(),
  z.object({ operation: z.literal('project.filterOptions'), payload: projectFilterOptionsQuerySchema }).strict(),
  z.object({ operation: z.literal('project.list'), payload: projectListQuerySchema }).strict(),
  z
    .object({
      operation: z.literal('project.detail'),
      payload: projectDetailPayloadSchema,
    })
    .strict(),
  z.object({ operation: z.literal('contact.acquire'), payload: contactAcquirePayloadSchema }).strict(),
  z.object({ operation: z.literal('project.contactUnlock'), payload: projectDetailPayloadSchema }).strict(),
  z.object({ operation: z.literal('demand.types'), payload: demandTypesPayloadSchema }).strict(),
  z.object({ operation: z.literal('demand.list'), payload: demandListQuerySchema }).strict(),
  z.object({ operation: z.literal('demand.detail'), payload: demandDetailPayloadSchema }).strict(),
  z.object({ operation: z.literal('demand.contactStatus'), payload: demandContactPayloadSchema }).strict(),
  z.object({ operation: z.literal('demand.contactAcquire'), payload: demandContactPayloadSchema }).strict(),
  z.object({ operation: z.literal('demand.publishTypes'), payload: demandTypesPayloadSchema }).strict(),
  z.object({ operation: z.literal('demand.publishSchema'), payload: demandPublishSchemaPayloadSchema }).strict(),
  z.object({ operation: z.literal('demand.aiParse'), payload: demandAiParsePayloadSchema }).strict(),
  z
    .object({
      operation: z.literal('demand.aiConversation.start'),
      payload: demandAiConversationStartPayloadSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('demand.aiConversation.turn'),
      payload: demandAiConversationTurnPayloadSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('demand.aiConversation.confirmLine'),
      payload: demandAiConversationConfirmLinePayloadSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('demand.aiConversation.patch'),
      payload: demandAiConversationPatchPayloadSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('demand.aiConversation.resume'),
      payload: demandAiConversationResumePayloadSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('demand.aiConversation.cancel'),
      payload: demandAiConversationSessionPayloadSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('demand.aiConversation.complete'),
      payload: demandAiConversationCompletePayloadSchema,
    })
    .strict(),
  z.object({ operation: z.literal('demand.publish'), payload: demandPublishPayloadSchema }).strict(),
  z.object({ operation: z.literal('demand.uploadImage'), payload: demandUploadImagePayloadSchema }).strict(),
  z.object({ operation: z.literal('behavior.log'), payload: enterpriseBehaviorLogPayloadSchema }).strict(),
  z.object({ operation: z.literal('unified.suggest'), payload: unifiedSuggestPayloadSchema }).strict(),
  z.object({ operation: z.literal('unified.search'), payload: unifiedSearchPayloadSchema }).strict(),
]);

export const enterpriseRequestSchema = guardedObject(enterpriseRequestUnionSchema, ['operation', 'payload']);
