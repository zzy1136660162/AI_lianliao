import { z } from 'zod';

import type {
  EnterpriseCompanySummary,
  EnterpriseOperation,
  EnterpriseProductSummary,
  EnterpriseProjectSummary,
  EnterpriseResponse,
  EnterpriseUserContext,
} from './contracts';
import { enterpriseNormalizers } from './normalizers';
import {
  commonResultSchema,
  enterpriseCompanyDetailEnvelopeRawSchema,
  enterpriseCompanyRawSchema,
  enterpriseDrillEnvelopeRawSchema,
  enterpriseLoginStatusSchema,
  enterpriseRequestSchema,
  userContextRawSchema,
} from './rawSchemas';

const {
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
      case 'product.list':
        return {
          operation,
          data: normalizePage<EnterpriseProductSummary>(input, operation, (item) => normalizeProduct(item, operation)),
        };
      case 'product.detail':
        return { operation, data: normalizeProduct(input, operation) };
      case 'project.dashboard':
        return { operation, data: normalizeDashboard(input) };
      case 'project.drill':
        return { operation, data: projectDrillResponseSchema.parse(input).map(normalizeDrillItem) };
      case 'project.list':
        return {
          operation,
          data: normalizePage<EnterpriseProjectSummary>(input, operation, (item) =>
            normalizeProjectSummary(item, operation)
          ),
        };
      case 'project.detail':
        return { operation, data: normalizeProjectDetail(input) };
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`[${operation}]`)) throw error;
    throw operationError(operation, describeParseError(error));
  }
};
