const SIGNED_ENTITY_ID_PATTERN = /^-?([1-9][0-9]*)$/;

/**
 * Accepts canonical non-zero signed decimal entity IDs.
 * When provided, maxDigits counts decimal digits only and excludes the minus sign.
 */
export const isEnterpriseEntityId = (value: unknown, maxDigits?: number): value is string => {
  if (typeof value !== 'string') return false;
  const match = SIGNED_ENTITY_ID_PATTERN.exec(value);
  if (!match) return false;
  return maxDigits === undefined || (Number.isInteger(maxDigits) && maxDigits > 0 && match[1]!.length <= maxDigits);
};
