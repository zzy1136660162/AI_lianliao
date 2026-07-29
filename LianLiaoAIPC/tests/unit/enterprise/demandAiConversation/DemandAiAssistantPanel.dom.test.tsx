import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DemandAiConversationSnapshot } from '@/common/enterprise/contracts';
import DemandAiAssistantPanel from '@/renderer/pages/enterprise/supplyDemand/Publish/assistant/DemandAiAssistantPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${Object.values(values).join(',')}` : key),
  }),
}));

const snapshot: DemandAiConversationSnapshot = {
  sessionId: 'c1d7599a-0c56-42bf-be40-54d37645b29c',
  version: 1,
  state: 'CONFIRMING_LINE',
  action: 'CONFIRM_LINE',
  message: '请选择业务类型',
  lineDecision: {
    candidates: [
      { typeId: 22, typeName: '紧急采购', confidence: 0.82, variantCode: 'DEFAULT' },
      { typeId: 0, typeName: '机加外包', confidence: 0.32, variantCode: 'DEFAULT' },
    ],
  },
  fieldPatch: {},
  formValues: {},
  missingRequiredFields: [],
  warnings: [],
  completion: 0,
};

afterEach(cleanup);

describe('DemandAiAssistantPanel candidate confirmation', () => {
  it('shows progress and prevents duplicate candidate submissions while confirmation is pending', async () => {
    let resolveConfirmation: (() => void) | undefined;
    const onConfirmLine = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirmation = resolve;
        })
    );
    render(
      <DemandAiAssistantPanel
        snapshot={snapshot}
        messages={[]}
        loading={false}
        onStart={vi.fn()}
        onSend={vi.fn()}
        onConfirmLine={onConfirmLine}
        onRejectSwitch={vi.fn()}
        onRetry={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const user = userEvent.setup();
    const selected = screen.getByRole('button', { name: '机加外包' });
    const alternative = screen.getByRole('button', { name: '紧急采购' });
    await user.click(selected);
    await user.click(selected);
    await user.click(alternative);

    expect(onConfirmLine).toHaveBeenCalledTimes(1);
    expect(selected).toBeDisabled();
    expect(alternative).toBeDisabled();

    await act(async () => {
      resolveConfirmation?.();
      await Promise.resolve();
    });
  });
});
