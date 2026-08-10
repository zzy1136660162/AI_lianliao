/** Counts Unicode decimal digits across the entire phone field, regardless of separators or labels. */
export const countEnterprisePhoneDecimalDigits = (value: string): number => (value.match(/\p{Nd}/gu) ?? []).length;

/** Hides every character of a contact name until contact access has been granted. */
export const maskEnterpriseContactName = (name: string | null | undefined): string => {
  const value = String(name || '').trim();
  return '*'.repeat([...value].length);
};

/** Keeps at most the first three decimal digits when a field contains a complete phone number. */
export const maskEnterprisePhone = (phone: string | null | undefined): string => {
  const value = String(phone || '');
  if (!value) return '';

  if (countEnterprisePhoneDecimalDigits(value) >= 7) {
    let visibleDigits = 0;
    return value.replace(/\p{Nd}/gu, (digit) => {
      visibleDigits += 1;
      return visibleDigits <= 3 ? digit : '*';
    });
  }

  if (value.includes('*')) {
    return /\*+\p{Nd}{1,6}$/u.test(value)
      ? value.replace(/\p{Nd}{1,6}$/u, (digits) => '*'.repeat([...digits].length))
      : value;
  }
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, -4)}****`;
};
