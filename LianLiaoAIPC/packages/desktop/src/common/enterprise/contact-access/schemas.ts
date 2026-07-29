import { z } from 'zod';

import type { EnterpriseContactAccess, EnterpriseProjectContactUnlock } from './contracts';

const backendBoolean = z.union([z.boolean(), z.number(), z.string()]).transform((value) => {
  if (value === true || value === 1 || value === '1' || value === 'true' || value === 'Y') return true;
  return false;
});

const boundedText = z
  .string()
  .max(2_000)
  .nullish()
  .transform((value) => value?.trim() ?? '');

const contactAccessRawSchema = z
  .object({
    type: backendBoolean,
    errType: z.union([z.number(), z.string()]).nullish(),
    msg: boundedText,
    url: boundedText,
    phone: z.string().min(1).max(256).optional(),
  })
  .passthrough();

const unlockRawSchema = z
  .object({
    isPurchased: backendBoolean,
    inserted: backendBoolean.optional().default(false),
  })
  .passthrough();

/** Converts the legacy H5 phone result to the strict desktop contract. */
export const parseEnterpriseContactAccess = (input: unknown): EnterpriseContactAccess => {
  const raw = contactAccessRawSchema.parse(input);
  const parsedErrType = typeof raw.errType === 'number' ? raw.errType : Number(raw.errType ?? 0);
  const errType = Number.isSafeInteger(parsedErrType) && parsedErrType >= 0 ? parsedErrType : 0;
  const result: EnterpriseContactAccess = {
    allowed: raw.type,
    errType,
    message: raw.msg,
    actionUrl: raw.url,
  };
  if (raw.type && raw.phone) result.phone = raw.phone;
  return result;
};

/** Converts unlockAiMaterialProjectDetail output to the stable desktop contract. */
export const parseEnterpriseProjectContactUnlock = (input: unknown): EnterpriseProjectContactUnlock => {
  const raw = unlockRawSchema.parse(input);
  return { purchased: raw.isPurchased, inserted: raw.inserted };
};
