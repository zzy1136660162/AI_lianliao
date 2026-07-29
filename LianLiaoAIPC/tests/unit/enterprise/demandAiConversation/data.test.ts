import { describe, expect, it, vi } from 'vitest';

import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { startDemandAiConversation } from '@/renderer/pages/enterprise/supplyDemand/Publish/assistant/demandAiConversationData';

const SESSION_ID = '3f594650-3437-4fd8-9cb8-bcef46f1df72';
const REQUEST_ID = 'f7cd98f4-ef72-4878-9f99-e2a31b9ad93c';

describe('demand AI conversation data', () => {
  it('uses the fixed start operation without renderer identity fields', async () => {
    const request = vi.fn().mockResolvedValue({
      operation: 'demand.aiConversation.start',
      data: {
        sessionId: SESSION_ID,
        version: 1,
        state: 'CONFIRMING_LINE',
        action: 'CONFIRM_LINE',
        message: '请选择业务类型',
        lineDecision: { candidates: [] },
        fieldPatch: {},
        formValues: {},
        missingRequiredFields: [],
        warnings: [],
        completion: 0,
      },
    });
    const client = { request } as unknown as EnterpriseClient;

    await startDemandAiConversation(client, REQUEST_ID, '采购200件零件');

    expect(request).toHaveBeenCalledWith({
      operation: 'demand.aiConversation.start',
      payload: { requestId: REQUEST_ID, initialMessage: '采购200件零件' },
    });
  });
});
