import { z } from 'zod';

import { ENTERPRISE_PROJECT_DRILL_LEVELS } from './constants';
import type {
  EnterpriseCompanyDetail,
  EnterpriseDashboardDistributionItem,
  EnterpriseOperation,
  EnterprisePage,
  EnterpriseProductDetail,
  EnterpriseProjectDashboard,
  EnterpriseProjectDetail,
  EnterpriseProjectDrillItem,
  EnterpriseProjectDrillLevel,
  EnterpriseProjectSummary,
  EnterpriseUserContext,
} from './contracts';
import {
  enterpriseCompanyRawSchema,
  enterpriseDashboardRawSchema,
  enterpriseDrillRawSchema,
  enterprisePageRawSchema,
  enterpriseProductRawSchema,
  enterpriseProjectRawSchema,
  type enterpriseDistributionRawSchema,
  type userContextRawSchema,
} from './rawSchemas';

const hasScalarValue = (value: unknown): value is string | number | boolean =>
  value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');

const firstScalar = (...values: unknown[]): string | number | boolean | undefined => values.find(hasScalarValue);

const optionalText = (...values: unknown[]): string | undefined => {
  const value = firstScalar(...values);
  return typeof value === 'string' ? value.trim() : undefined;
};

/** Mirrors the H5 getPhonexxx policy so full company phones never leave the trusted boundary. */
export const maskEnterprisePhone = (phone: string | null | undefined): string => {
  const value = String(phone || '');
  if (!value) return '';
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, -4)}****`;
};

const optionalIdentifier = (...values: unknown[]): string | undefined => {
  const value = firstScalar(...values);
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isSafeInteger(value)) return undefined;
  return String(value);
};

const ORDINARY_DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;
const DECIMAL_WITH_EXPONENT_PATTERN = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i;
const MAX_SAFE_SCALED_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

const canonicalDecimal = (value: string): string | undefined => {
  const match = DECIMAL_WITH_EXPONENT_PATTERN.exec(value);
  if (!match) return undefined;

  const sign = match[1] === '-' ? '-' : '';
  const integerDigits = match[2] as string;
  const fractionDigits = match[3] ?? '';
  const exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent)) return undefined;

  const digits = `${integerDigits}${fractionDigits}`;
  const decimalPosition = integerDigits.length + exponent;
  let whole: string;
  let fraction: string;
  if (decimalPosition <= 0) {
    whole = '0';
    fraction = `${'0'.repeat(-decimalPosition)}${digits}`;
  } else if (decimalPosition >= digits.length) {
    whole = `${digits}${'0'.repeat(decimalPosition - digits.length)}`;
    fraction = '';
  } else {
    whole = digits.slice(0, decimalPosition);
    fraction = digits.slice(decimalPosition);
  }

  whole = whole.replace(/^0+/, '') || '0';
  fraction = fraction.replace(/0+$/, '');
  const isZero = whole === '0' && fraction === '';
  return `${isZero ? '' : sign}${whole}${fraction ? `.${fraction}` : ''}`;
};

const parseOrdinaryDecimalString = (value: string): number | undefined => {
  const normalized = value.trim();
  const match = ORDINARY_DECIMAL_PATTERN.exec(normalized);
  if (!match) return undefined;

  const negative = match[1] === '-';
  const integerDigits = match[2] as string;
  const effectiveFractionDigits = (match[3] ?? '').replace(/0+$/, '');
  const combinedDigits = `${integerDigits}${effectiveFractionDigits}`.replace(/^0+/, '') || '0';
  const scaledMagnitude = BigInt(combinedDigits);
  if (scaledMagnitude > MAX_SAFE_SCALED_INTEGER) return undefined;

  const scale = 10 ** effectiveFractionDigits.length;
  if (!Number.isFinite(scale)) return undefined;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return undefined;

  const signedNormalized = `${negative ? '-' : ''}${integerDigits}${effectiveFractionDigits ? `.${effectiveFractionDigits}` : ''}`;
  if (canonicalDecimal(signedNormalized) !== canonicalDecimal(parsed.toString())) return undefined;
  return parsed;
};

const optionalNumber = (...values: unknown[]): number | undefined => {
  const value = firstScalar(...values);
  if (value === undefined || typeof value === 'boolean') return undefined;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return Number.isInteger(value) && !Number.isSafeInteger(value) ? undefined : value;
  }

  return parseOrdinaryDecimalString(value);
};

const optionalBoolean = (...values: unknown[]): boolean | undefined => {
  const value = firstScalar(...values);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'y', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'n', 'no'].includes(normalized)) return false;
  return undefined;
};

const operationError = (operation: string, detail: string): Error =>
  new Error(`[${operation}] Invalid enterprise response: ${detail}`);

const requiredText = (operation: string, field: string, ...values: unknown[]): string => {
  const value = optionalText(...values);
  if (!value) throw operationError(operation, `missing required ${field}`);
  return value;
};

const requiredIdentifier = (operation: string, field: string, ...values: unknown[]): string => {
  const value = optionalIdentifier(...values);
  if (!value) throw operationError(operation, `missing required ${field}`);
  return value;
};

const numberWithRule = (
  operation: string,
  field: string,
  required: boolean,
  isValid: (value: number) => boolean,
  ...values: unknown[]
): number | undefined => {
  const rawValue = firstScalar(...values);
  if (rawValue === undefined) {
    if (required) throw operationError(operation, `missing required ${field}`);
    return undefined;
  }
  const value = optionalNumber(rawValue);
  if (value === undefined || !isValid(value)) throw operationError(operation, `invalid ${field}`);
  return value;
};

const requiredPositiveInteger = (operation: string, field: string, ...values: unknown[]): number =>
  numberWithRule(operation, field, true, (value) => Number.isInteger(value) && value > 0, ...values) as number;

const requiredNonNegativeInteger = (operation: string, field: string, ...values: unknown[]): number =>
  numberWithRule(operation, field, true, (value) => Number.isInteger(value) && value >= 0, ...values) as number;

const optionalNonNegativeInteger = (operation: string, field: string, ...values: unknown[]): number | undefined =>
  numberWithRule(operation, field, false, (value) => Number.isInteger(value) && value >= 0, ...values);

const requiredNonNegativeNumber = (operation: string, field: string, ...values: unknown[]): number =>
  numberWithRule(operation, field, true, (value) => value >= 0, ...values) as number;

const setText = <T extends object, K extends keyof T>(target: T, key: K, ...values: unknown[]) => {
  const value = optionalText(...values);
  if (value !== undefined) target[key] = value as T[K];
};

const setIdentifier = <T extends object, K extends keyof T>(
  target: T,
  key: K,
  operation: string,
  ...values: unknown[]
) => {
  const rawValue = firstScalar(...values);
  if (rawValue === undefined) return;
  const value = optionalIdentifier(rawValue);
  if (value === undefined) throw operationError(operation, `invalid ${String(key)}`);
  target[key] = value as T[K];
};

const setNumber = <T extends object, K extends keyof T>(target: T, key: K, ...values: unknown[]) => {
  const value = optionalNumber(...values);
  if (value !== undefined) target[key] = value as T[K];
};

const setNonNegativeNumber = <T extends object, K extends keyof T>(
  target: T,
  key: K,
  operation: string,
  ...values: unknown[]
) => {
  const value = numberWithRule(operation, String(key), false, (candidate) => candidate >= 0, ...values);
  if (value !== undefined) target[key] = value as T[K];
};

const setBoolean = <T extends object, K extends keyof T>(target: T, key: K, ...values: unknown[]) => {
  const value = optionalBoolean(...values);
  if (value !== undefined) target[key] = value as T[K];
};

const normalizeUserContextRaw = (raw: z.infer<typeof userContextRawSchema>): EnterpriseUserContext => {
  const operation = 'auth.userContext';
  const registered = optionalBoolean(raw.registered, raw.REGISTERED);
  if (registered === undefined) throw operationError(operation, 'missing required registered');

  const result: EnterpriseUserContext = {
    registered,
    openId: requiredIdentifier(operation, 'openId', raw.openId, raw.openid, raw.OPEN_ID, raw.OPENID),
  };
  setIdentifier(result, 'userId', operation, raw.userId, raw.USER_ID, raw.id, raw.ID);
  setText(result, 'userName', raw.userName, raw.USER_NAME);
  setIdentifier(result, 'companyId', operation, raw.companyId, raw.COMPANY_ID);
  setText(result, 'companyName', raw.companyName, raw.COMPANY_NAME);
  setNumber(result, 'companyLevel', raw.companyLevel, raw.COMPANY_LEVEL, raw.comLevel, raw.COM_LEVEL);
  setIdentifier(result, 'roleId', operation, raw.roleId, raw.ROLE_ID);
  return result;
};

const normalizeCompany = (input: unknown, operation: 'company.list' | 'company.detail'): EnterpriseCompanyDetail => {
  const raw = enterpriseCompanyRawSchema.parse(input);
  const result: EnterpriseCompanyDetail = {
    companyId: requiredIdentifier(operation, 'companyId', raw.companyId, raw.COMPANY_ID, raw.id, raw.ID),
    name: requiredText(operation, 'name', raw.name, raw.NAME, raw.companyName, raw.COMPANY_NAME),
  };
  setText(result, 'shortName', raw.shortName, raw.SHORT_NAME);
  setText(result, 'industry', raw.industry, raw.INDUSTRY);
  setText(result, 'province', raw.province, raw.PROVINCE);
  setText(result, 'city', raw.city, raw.CITY);
  setText(result, 'district', raw.district, raw.DISTRICT);
  setText(result, 'address', raw.address, raw.ADDRESS);
  setText(
    result,
    'legalRepresentative',
    raw.legalRepresentative,
    raw.LEGAL_REPRESENTATIVE,
    raw.corporation,
    raw.CORPORATION
  );
  setText(result, 'companyType', raw.companyType, raw.COMPANY_TYPE, raw.comType, raw.COM_TYPE);
  setNumber(result, 'companyLevel', raw.companyLevel, raw.COMPANY_LEVEL, raw.comLevel, raw.COM_LEVEL);
  setBoolean(result, 'vip', raw.vip, raw.VIP, raw.payVip, raw.PAY_VIP);
  setText(result, 'establishedAt', raw.establishedAt, raw.ESTABLISHED_AT, raw.foundTime, raw.FOUND_TIME);
  setText(result, 'businessSummary', raw.comAbs, raw.COM_ABS);
  setText(result, 'updatedAt', raw.inputTime, raw.INPUT_TIME);
  setBoolean(result, 'collected', raw.collected, raw.COLLECTED, raw.isCollect, raw.IS_COLLECT);
  if (operation === 'company.detail') {
    setText(result, 'logoUrl', raw.logoUrl, raw.LOGO_URL, raw.tempPic, raw.TEMP_PIC);
    setText(
      result,
      'description',
      raw.comIntro,
      raw.COM_INTRO,
      raw.description,
      raw.DESCRIPTION,
      raw.comAbs,
      raw.COM_ABS
    );
    setText(
      result,
      'unifiedSocialCreditCode',
      raw.unifiedSocialCreditCode,
      raw.UNIFIED_SOCIAL_CREDIT_CODE,
      raw.societyCode,
      raw.SOCIETY_CODE
    );
    setText(result, 'contactName', raw.contactName, raw.CONTACT_NAME, raw.contactPerson, raw.CONTACT_PERSON);
    setText(result, 'contactTitle', raw.contactTitle, raw.CONTACT_TITLE, raw.contactDuty, raw.CONTACT_DUTY);
    const phone = raw.phone ?? raw.PHONE;
    if (phone !== undefined) result.phone = maskEnterprisePhone(phone);
  }
  return result;
};

const normalizeProduct = (input: unknown, operation: 'product.list' | 'product.detail'): EnterpriseProductDetail => {
  const raw = enterpriseProductRawSchema.parse(input);
  const hasDedicatedProductName =
    optionalText(raw.productName, raw.PRODUCT_NAME, raw.productsName, raw.PRODUCTS_NAME) !== undefined;
  const result: EnterpriseProductDetail = {
    productId: requiredIdentifier(operation, 'productId', raw.productId, raw.PRODUCT_ID, raw.id, raw.ID),
    name: requiredText(
      operation,
      'name',
      raw.productName,
      raw.PRODUCT_NAME,
      raw.productsName,
      raw.PRODUCTS_NAME,
      raw.name,
      raw.NAME
    ),
    companyId: requiredIdentifier(operation, 'companyId', raw.companyId, raw.COMPANY_ID),
  };
  setText(result, 'imageUrl', raw.imageUrl, raw.IMAGE_URL, raw.tempPic, raw.TEMP_PIC);
  setText(result, 'summary', raw.summary, raw.SUMMARY, raw.productAbs, raw.PRODUCT_ABS);
  setText(
    result,
    'industry',
    raw.compIndustry,
    raw.COMP_INDUSTRY,
    raw.industry1,
    raw.INDUSTRY1,
    raw.industry,
    raw.INDUSTRY
  );
  setText(result, 'companyName', raw.companyName, raw.COMPANY_NAME);
  if (result.companyName === undefined && hasDedicatedProductName) setText(result, 'companyName', raw.name, raw.NAME);
  setText(result, 'companyIndustry', raw.compIndustry, raw.COMP_INDUSTRY, raw.industry1, raw.INDUSTRY1);
  setText(
    result,
    'province',
    raw.province1,
    raw.PROVINCE1,
    raw.compProvince,
    raw.COMP_PROVINCE,
    raw.province,
    raw.PROVINCE
  );
  setText(result, 'city', raw.city1, raw.CITY1, raw.compCity, raw.COMP_CITY, raw.city, raw.CITY);
  setText(
    result,
    'district',
    raw.district1,
    raw.DISTRICT1,
    raw.compDistrict,
    raw.COMP_DISTRICT,
    raw.district,
    raw.DISTRICT
  );
  setText(result, 'address', raw.compAddress, raw.COMP_ADDRESS, raw.address, raw.ADDRESS);
  setText(result, 'contactName', raw.compContactPerson, raw.COMP_CONTACT_PERSON, raw.contactName, raw.CONTACT_NAME);
  const phone = optionalText(raw.compPhone, raw.COMP_PHONE, raw.phone, raw.PHONE);
  if (phone !== undefined) result.phone = maskEnterprisePhone(phone);
  setBoolean(result, 'collected', raw.collected, raw.COLLECTED, raw.isCollect, raw.IS_COLLECT);
  return result;
};

const normalizeProjectSummary = (
  input: unknown,
  operation: 'project.list' | 'project.detail'
): EnterpriseProjectSummary => {
  const raw = enterpriseProjectRawSchema.parse(input);
  const result: EnterpriseProjectSummary = {
    hpInfoId: requiredIdentifier(
      operation,
      'hpInfoId',
      raw.hpInfoId,
      raw.HP_INFO_ID,
      raw.dbId,
      raw.DB_ID,
      raw.id,
      raw.ID
    ),
    projectName: requiredText(
      operation,
      'projectName',
      raw.projectName,
      raw.PROJECT_NAME,
      raw.title,
      raw.TITLE,
      raw.name,
      raw.NAME
    ),
  };
  setText(
    result,
    'constructionUnit',
    raw.constructionUnit,
    raw.CONSTRUCTION_UNIT,
    raw.ownerName,
    raw.OWNER_NAME,
    raw.danwei,
    raw.DANWEI
  );
  setText(result, 'province', raw.province, raw.PROVINCE, raw.sheng, raw.SHENG);
  setText(result, 'city', raw.city, raw.CITY, raw.region, raw.REGION);
  setNonNegativeNumber(
    result,
    'totalInvestment',
    operation,
    raw.totalInvestment,
    raw.TOTAL_INVESTMENT,
    raw.zongtouzi,
    raw.ZONGTOUZI
  );
  setText(result, 'constructionNature', raw.constructionNature, raw.CONSTRUCTION_NATURE, raw.xingzhi, raw.XINGZHI);
  setText(result, 'investmentType', raw.investmentType, raw.INVESTMENT_TYPE);
  setText(result, 'projectNature', raw.projectNature, raw.PROJECT_NATURE, raw.xiangmuxingzhi, raw.XIANGMUXINGZHI);
  setText(result, 'publishedAt', raw.publishDate, raw.PUBLISH_DATE, raw.inputTime, raw.INPUT_TIME);
  const constructionPeriod = optionalText(
    raw.constructionPeriod,
    raw.CONSTRUCTION_PERIOD,
    raw.buildCycleText,
    raw.BUILD_CYCLE_TEXT,
    raw.jianshezhouqi,
    raw.JIANSHEZHOUQI
  );
  if (constructionPeriod) {
    result.constructionPeriod = constructionPeriod;
  } else {
    const startDate = optionalText(raw.startDate, raw.START_DATE);
    const endDate = optionalText(raw.endDate, raw.END_DATE);
    const dateRange = [startDate, endDate].filter((value): value is string => Boolean(value)).join(' – ');
    if (dateRange) result.constructionPeriod = dateRange;
  }
  setText(result, 'materialMatch', raw.materialName, raw.MATERIAL_NAME, raw.materialShortName, raw.MATERIAL_SHORT_NAME);
  setText(result, 'procurementSummary', raw.procurementSummary, raw.PROCUREMENT_SUMMARY);
  return result;
};

const normalizeProjectDetail = (input: unknown): EnterpriseProjectDetail => {
  const operation = 'project.detail';
  const raw = enterpriseProjectRawSchema.parse(input);
  const result: EnterpriseProjectDetail = normalizeProjectSummary(raw, operation);
  setText(result, 'contactName', raw.contactName, raw.CONTACT_NAME, raw.lianxiren, raw.LIANXIREN);
  setText(result, 'phone', raw.phone, raw.PHONE);
  setText(result, 'email', raw.email, raw.EMAIL);
  setText(result, 'address', raw.address, raw.ADDRESS, raw.buildLocation, raw.BUILD_LOCATION, raw.didian, raw.DIDIAN);
  setText(result, 'industry', raw.industry, raw.INDUSTRY, raw.hangye, raw.HANGYE);
  setText(result, 'landArea', raw.landArea, raw.LAND_AREA, raw.zhandimianji, raw.ZHANDIMIANJI);
  setText(result, 'buildingArea', raw.buildingArea, raw.BUILDING_AREA, raw.jianzhumianji, raw.JIANZHUMIANJI);
  setText(result, 'greenArea', raw.greenArea, raw.GREEN_AREA, raw.lvhualv, raw.LVHUALV);
  setText(result, 'constructionScale', raw.constructionScale, raw.CONSTRUCTION_SCALE, raw.guimo, raw.GUIMO);
  setText(result, 'equipment', raw.equipment, raw.EQUIPMENT, raw.shebeigouzhi, raw.SHEBEIGOUZHI);
  setText(result, 'materials', raw.materials, raw.MATERIALS, raw.yuancailiao, raw.YUANCAILIAO);
  setText(
    result,
    'projectComposition',
    raw.projectComposition,
    raw.PROJECT_COMPOSITION,
    raw.jianshezucheng,
    raw.JIANSHEZUCHENG
  );
  setText(result, 'sourceUrl', raw.sourceUrl, raw.SOURCE_URL, raw.reqUrl, raw.REQ_URL);
  setBoolean(result, 'collected', raw.collected, raw.COLLECTED, raw.isCollect, raw.IS_COLLECT);
  setText(result, 'followStatus', raw.followStatus, raw.FOLLOW_STATUS);
  setBoolean(result, 'purchased', raw.purchased, raw.PURCHASED, raw.isPurchased, raw.IS_PURCHASED);
  return result;
};

const normalizePage = <T>(
  input: unknown,
  operation: EnterpriseOperation,
  normalizeItem: (item: unknown) => T
): EnterprisePage<T> => {
  const raw = enterprisePageRawSchema.parse(input);
  const list = raw.list ?? raw.LIST ?? raw.rows ?? raw.ROWS;
  if (!list) throw operationError(operation, 'missing required list');
  const pageNum = requiredPositiveInteger(operation, 'pageNum', raw.pageNum, raw.PAGE_NUM);
  const pageSize = requiredPositiveInteger(operation, 'pageSize', raw.pageSize, raw.PAGE_SIZE);
  const total = requiredNonNegativeInteger(operation, 'total', raw.total, raw.TOTAL);
  const explicitPages = optionalNonNegativeInteger(operation, 'pages', raw.pages, raw.PAGES);
  return {
    list: list.map(normalizeItem),
    pageNum,
    pageSize,
    pages: explicitPages ?? Math.ceil(total / pageSize),
    total,
  };
};

const normalizeDistribution = (
  input: z.infer<typeof enterpriseDistributionRawSchema>,
  operation: 'project.dashboard'
): EnterpriseDashboardDistributionItem => {
  const result: EnterpriseDashboardDistributionItem = {
    label: requiredText(operation, 'distribution label', input.label, input.LABEL, input.name, input.NAME),
    value: requiredNonNegativeInteger(
      operation,
      'distribution value',
      input.value,
      input.VALUE,
      input.projectCount,
      input.PROJECT_COUNT
    ),
  };
  setText(result, 'dimension', input.dimension, input.DIMENSION, input.budgetRange, input.BUDGET_RANGE);
  const projectCount = optionalNonNegativeInteger(operation, 'projectCount', input.projectCount, input.PROJECT_COUNT);
  if (projectCount !== undefined) result.projectCount = projectCount;
  return result;
};

const normalizeDashboard = (input: unknown): EnterpriseProjectDashboard => {
  const operation = 'project.dashboard';
  const raw = enterpriseDashboardRawSchema.parse(input);
  const kpi = raw.kpi;
  const regionDistribution = raw.regionDistribution ?? raw.REGION_DISTRIBUTION;
  const budgetDistribution = raw.budgetDistribution ?? raw.BUDGET_DISTRIBUTION;
  const categoryDistribution = raw.categoryDistribution ?? raw.CATEGORY_DISTRIBUTION;
  const materialTop = raw.materialTop ?? raw.MATERIAL_TOP ?? raw.shortNameTop ?? raw.SHORT_NAME_TOP;
  if (!regionDistribution) throw operationError(operation, 'missing required regionDistribution');
  if (!budgetDistribution) throw operationError(operation, 'missing required budgetDistribution');
  if (!categoryDistribution) throw operationError(operation, 'missing required categoryDistribution');
  if (!materialTop) throw operationError(operation, 'missing required materialTop');
  const result: EnterpriseProjectDashboard = {
    projectCount: requiredNonNegativeInteger(
      operation,
      'projectCount',
      kpi?.projectCount,
      kpi?.PROJECT_COUNT,
      raw.projectCount,
      raw.PROJECT_COUNT
    ),
    categoryL1Count: requiredNonNegativeInteger(
      operation,
      'categoryL1Count',
      kpi?.categoryL1Count,
      kpi?.CATEGORY_L1_COUNT,
      raw.categoryL1Count,
      raw.CATEGORY_L1_COUNT
    ),
    categoryL2Count: requiredNonNegativeInteger(
      operation,
      'categoryL2Count',
      kpi?.categoryL2Count,
      kpi?.CATEGORY_L2_COUNT,
      raw.categoryL2Count,
      raw.CATEGORY_L2_COUNT
    ),
    materialShortNameCount: requiredNonNegativeInteger(
      operation,
      'materialShortNameCount',
      kpi?.materialShortNameCount,
      kpi?.MATERIAL_SHORT_NAME_COUNT,
      kpi?.shortNameCount,
      kpi?.SHORT_NAME_COUNT,
      raw.materialShortNameCount,
      raw.MATERIAL_SHORT_NAME_COUNT,
      raw.shortNameCount,
      raw.SHORT_NAME_COUNT
    ),
    materialNameCount: requiredNonNegativeInteger(
      operation,
      'materialNameCount',
      kpi?.materialNameCount,
      kpi?.MATERIAL_NAME_COUNT,
      raw.materialNameCount,
      raw.MATERIAL_NAME_COUNT
    ),
    investmentTotalYi: requiredNonNegativeNumber(
      operation,
      'investmentTotalYi',
      kpi?.investmentTotalYi,
      kpi?.INVESTMENT_TOTAL_YI,
      raw.investmentTotalYi,
      raw.INVESTMENT_TOTAL_YI
    ),
    regionDistribution: regionDistribution.map((item) => normalizeDistribution(item, operation)),
    budgetDistribution: budgetDistribution.map((item) => normalizeDistribution(item, operation)),
    categoryDistribution: categoryDistribution.map((item) => normalizeDistribution(item, operation)),
    materialTop: materialTop.map((item) => normalizeDistribution(item, operation)),
  };
  setText(result, 'runId', raw.runId, raw.RUN_ID);
  setText(result, 'updatedAt', raw.updatedAt, raw.UPDATED_AT);
  return result;
};

const inferDrillLevel = (
  raw: z.infer<typeof enterpriseDrillRawSchema>,
  operation: 'project.drill'
): EnterpriseProjectDrillLevel => {
  const explicit = optionalText(raw.level, raw.LEVEL, raw.resultLevel, raw.RESULT_LEVEL);
  if (explicit) {
    const parsed = z.enum(ENTERPRISE_PROJECT_DRILL_LEVELS).safeParse(explicit);
    if (!parsed.success) throw operationError(operation, 'invalid dimension');
    return parsed.data;
  }
  if (optionalText(raw.materialName, raw.MATERIAL_NAME)) return 'materialName';
  if (optionalText(raw.materialShortName, raw.MATERIAL_SHORT_NAME)) return 'shortName';
  if (optionalText(raw.categoryL2, raw.CATEGORY_L2)) return 'l2';
  if (optionalText(raw.categoryL1, raw.CATEGORY_L1)) return 'l1';
  throw operationError(operation, 'missing required dimension');
};

const normalizeDrillItem = (input: unknown): EnterpriseProjectDrillItem => {
  const operation = 'project.drill';
  const raw = enterpriseDrillRawSchema.parse(input);
  const result: EnterpriseProjectDrillItem = {
    label: requiredText(
      operation,
      'label',
      raw.label,
      raw.LABEL,
      raw.name,
      raw.NAME,
      raw.materialName,
      raw.MATERIAL_NAME,
      raw.materialShortName,
      raw.MATERIAL_SHORT_NAME,
      raw.categoryL2,
      raw.CATEGORY_L2,
      raw.categoryL1,
      raw.CATEGORY_L1
    ),
    dimension: inferDrillLevel(raw, operation),
    projectCount: requiredNonNegativeInteger(operation, 'projectCount', raw.projectCount, raw.PROJECT_COUNT),
  };
  setText(result, 'categoryL1', raw.categoryL1, raw.CATEGORY_L1);
  setText(result, 'categoryL2', raw.categoryL2, raw.CATEGORY_L2);
  setText(result, 'materialShortName', raw.materialShortName, raw.MATERIAL_SHORT_NAME);
  setText(result, 'materialName', raw.materialName, raw.MATERIAL_NAME);
  const categoryL2Count = optionalNonNegativeInteger(
    operation,
    'categoryL2Count',
    raw.categoryL2Count,
    raw.CATEGORY_L2_COUNT
  );
  if (categoryL2Count !== undefined) result.categoryL2Count = categoryL2Count;
  const materialShortNameCount = optionalNonNegativeInteger(
    operation,
    'materialShortNameCount',
    raw.materialShortNameCount,
    raw.MATERIAL_SHORT_NAME_COUNT,
    raw.shortNameCount,
    raw.SHORT_NAME_COUNT
  );
  if (materialShortNameCount !== undefined) result.materialShortNameCount = materialShortNameCount;
  const materialNameCount = optionalNonNegativeInteger(
    operation,
    'materialNameCount',
    raw.materialNameCount,
    raw.MATERIAL_NAME_COUNT
  );
  if (materialNameCount !== undefined) result.materialNameCount = materialNameCount;
  return result;
};

const describeParseError = (error: unknown): string => {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join('.') || 'data'}: ${issue.message}`).join('; ');
  }
  if (error instanceof Error) return error.message;
  return 'unknown validation error';
};

/**
 * @internal
 * Pure fail-closed normalizers used only by the enterprise schema facade.
 */
export const enterpriseNormalizers = {
  describeParseError,
  normalizeCompany,
  normalizeDashboard,
  normalizeDrillItem,
  normalizePage,
  normalizeProduct,
  normalizeProjectDetail,
  normalizeProjectSummary,
  normalizeUserContextRaw,
  operationError,
};
