import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DemandAiConversationSnapshot, EnterpriseResponse } from '@/common/enterprise/contracts';
import { useDemandAiConversation } from '@/renderer/pages/enterprise/supplyDemand/Publish/assistant/useDemandAiConversation';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

const confirmingSnapshot: DemandAiConversationSnapshot = {
  sessionId: 'c1d7599a-0c56-42bf-be40-54d37645b29c',
  version: 1,
  state: 'CONFIRMING_LINE',
  action: 'CONFIRM_LINE',
  message: '请选择业务类型',
  lineDecision: {
    candidates: [{ typeId: 0, typeName: '机加外包', confidence: 0.32, variantCode: 'DEFAULT' }],
  },
  fieldPatch: {},
  formValues: {},
  missingRequiredFields: [],
  warnings: [],
  completion: 0,
};

const recoveredSnapshot: DemandAiConversationSnapshot = {
  ...confirmingSnapshot,
  version: 2,
  state: 'COLLECTING_FIELDS',
  action: 'ASK',
  message: '请补充加工工艺',
  lineDecision: {
    typeId: 0,
    typeName: '机加外包',
    variantCode: 'DEFAULT',
    candidates: [],
  },
  completion: 0.5,
};

describe('useDemandAiConversation candidate recovery', () => {
  it('resumes the committed server snapshot when confirmation response is reported as failed', async () => {
    const request = vi.fn(async (input): Promise<EnterpriseResponse> => {
      if (input.operation === 'demand.aiConversation.start') {
        return { operation: input.operation, data: confirmingSnapshot };
      }
      if (input.operation === 'demand.aiConversation.confirmLine') {
        throw new Error('ambiguous API failure');
      }
      if (input.operation === 'demand.aiConversation.resume') {
        return { operation: input.operation, data: recoveredSnapshot };
      }
      throw new Error(`Unexpected operation: ${input.operation}`);
    });
    const client = { request } as unknown as EnterpriseClient;
    const { result } = renderHook(() => useDemandAiConversation(client));

    await act(async () => {
      await result.current.start('采购304不锈钢加工件');
    });
    await act(async () => {
      await result.current.confirmLine(confirmingSnapshot.lineDecision.candidates[0]!);
    });

    await waitFor(() => expect(result.current.snapshot?.version).toBe(2));
    expect(result.current.snapshot?.lineDecision.typeName).toBe('机加外包');
    expect(result.current.error).toBeUndefined();
  });
});
