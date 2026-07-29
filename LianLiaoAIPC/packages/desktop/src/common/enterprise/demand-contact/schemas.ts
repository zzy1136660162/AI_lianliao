import { z } from 'zod';

import { DEMAND_CONTACT_STATES, type DemandContactAccess } from './contracts';

/**
 * Oracle-backed demand records can contain NULL or blank optional contact fields.
 * Normalize both forms to an omitted value so one missing address, for example,
 * does not invalidate an otherwise successful contact-unlock response.
 */
const optionalContactTextSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value) => value?.trim() || undefined);

const optionalMetadataTextSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value) => value?.trim() || undefined);

const contactSchema = z
  .object({
    companyName: optionalContactTextSchema,
    contactPerson: optionalContactTextSchema,
    contactPhone: optionalContactTextSchema,
    address: optionalContactTextSchema,
  })
  .strict();

const accessSchema = z
  .object({
    state: z.enum(DEMAND_CONTACT_STATES),
    // Java's default JSON serialization keeps these nullable fields on
    // OWNER/UNLOCKED responses; the renderer contract uses undefined instead.
    memberLevel: z
      .number()
      .nonnegative()
      .nullable()
      .optional()
      .transform((value) => value ?? undefined),
    memberLevelLabel: optionalMetadataTextSchema,
    remainingQuota: z
      .number()
      .int()
      .nonnegative()
      .safe()
      .nullable()
      .optional()
      .transform((value) => value ?? undefined),
    canAcquire: z.boolean(),
    canUpgrade: z.boolean(),
    contact: contactSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const canExposeContact = value.state === 'OWNER' || value.state === 'UNLOCKED';
    if (canExposeContact !== (value.contact !== null)) {
      context.addIssue({ code: 'custom', message: 'Contact exposure does not match access state' });
    }
  });

export const parseDemandContactAccess = (input: unknown): DemandContactAccess =>
  accessSchema.parse(input) as DemandContactAccess;
