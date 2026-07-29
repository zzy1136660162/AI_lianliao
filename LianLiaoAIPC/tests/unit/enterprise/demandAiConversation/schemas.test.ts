import { describe, expect, it } from 'vitest';

import { enterpriseRequestSchema, parseEnterpriseResponse } from '@/common/enterprise/schemas';

const SESSION_ID = '3f594650-3437-4fd8-9cb8-bcef46f1df72';
const REQUEST_ID = 'f7cd98f4-ef72-4878-9f99-e2a31b9ad93c';

describe('demand AI conversation contracts', () => {
  it('accepts a strict start request and rejects renderer supplied openId', () => {
    expect(
      enterpriseRequestSchema.safeParse({
        operation: 'demand.aiConversation.start',
        payload: { requestId: REQUEST_ID, initialMessage: '采购200件零件' },
      }).success
    ).toBe(true);
    expect(
      enterpriseRequestSchema.safeParse({
        operation: 'demand.aiConversation.start',
        payload: {
          requestId: REQUEST_ID,
          initialMessage: '采购200件零件',
          openId: 'forged',
        },
      }).success
    ).toBe(false);
  });

  it('rejects unknown server actions', () => {
    expect(() =>
      parseEnterpriseResponse('demand.aiConversation.start', {
        sessionId: SESSION_ID,
        version: 1,
        state: 'COLLECTING_FIELDS',
        action: 'RUN_TOOL',
        message: '继续',
        lineDecision: { candidates: [] },
        fieldPatch: {},
        formValues: {},
        missingRequiredFields: [],
        warnings: [],
        completion: 0,
      })
    ).toThrow();
  });
});
