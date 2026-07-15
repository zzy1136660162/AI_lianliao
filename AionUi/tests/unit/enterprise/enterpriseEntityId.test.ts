import { describe, expect, it } from 'vitest';

import { isEnterpriseEntityId } from '@/common/enterprise/entityId';

describe('enterprise entity identifiers', () => {
  it.each(['1', '-1', '900719925474099312345', '-900719925474099312345'])(
    'accepts a non-zero signed decimal: %s',
    (value) => expect(isEnterpriseEntityId(value)).toBe(true)
  );

  it.each(['0', '-0', '+1', '1.0', '1e3', ' 1', '1 ', 'company-1', ''])('rejects a non-entity ID: %s', (value) =>
    expect(isEnterpriseEntityId(value)).toBe(false)
  );

  it('enforces a digit limit without counting the minus sign', () => {
    expect(isEnterpriseEntityId(`-${'1'.repeat(31)}`, 31)).toBe(true);
    expect(isEnterpriseEntityId(`-${'1'.repeat(32)}`, 31)).toBe(false);
  });
});
