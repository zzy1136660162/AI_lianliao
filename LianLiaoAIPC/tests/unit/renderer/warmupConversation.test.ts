import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetWarmupConversationStateForTests,
  warmupConversation,
} from '@/renderer/pages/conversation/utils/warmupConversation';
import type { EnsureConversationRuntimeResponse } from '@/common/types/platform/acpTypes';

const { ensureRuntimeInvokeMock, legacyWarmupInvokeMock } = vi.hoisted(() => ({
  ensureRuntimeInvokeMock: vi.fn(),
  legacyWarmupInvokeMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      ensureRuntime: {
        invoke: ensureRuntimeInvokeMock,
      },
      warmup: {
        invoke: legacyWarmupInvokeMock,
      },
    },
  },
}));

const createRuntimeResponse = (modelId: string): EnsureConversationRuntimeResponse => ({
  recovered: false,
  config_options: [
    {
      id: 'model',
      category: 'model',
      option_type: 'select',
      current_value: modelId,
      options: [{ value: modelId, label: modelId }],
    },
  ],
  runtime: {
    state: 'idle',
    can_send_message: true,
    has_task: false,
    is_processing: false,
    pending_confirmations: 0,
    turn_id: null,
  },
});

describe('warmupConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWarmupConversationStateForTests();
  });

  it('coalesces concurrent warmups for the same conversation', async () => {
    const response = createRuntimeResponse('MiniMax-M3');
    let resolveWarmup: ((value: EnsureConversationRuntimeResponse) => void) | undefined;
    ensureRuntimeInvokeMock.mockReturnValue(
      new Promise<EnsureConversationRuntimeResponse>((resolve) => {
        resolveWarmup = resolve;
      })
    );

    const first = warmupConversation('conv-1');
    const second = warmupConversation('conv-1');

    expect(ensureRuntimeInvokeMock).toHaveBeenCalledTimes(1);
    expect(ensureRuntimeInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1' });
    expect(legacyWarmupInvokeMock).not.toHaveBeenCalled();

    resolveWarmup?.(response);
    await expect(Promise.all([first, second])).resolves.toEqual([response, response]);
  });

  it('retries after a failed warmup', async () => {
    const response = createRuntimeResponse('MiniMax-M3');
    ensureRuntimeInvokeMock.mockRejectedValueOnce(new Error('warmup failed')).mockResolvedValueOnce(response);

    await expect(warmupConversation('conv-1')).rejects.toThrow('warmup failed');
    await expect(warmupConversation('conv-1')).resolves.toEqual(response);

    expect(ensureRuntimeInvokeMock).toHaveBeenCalledTimes(2);
  });

  it('refreshes the runtime snapshot after a conversation is already ready', async () => {
    const firstResponse = createRuntimeResponse('MiniMax-M3');
    const secondResponse = createRuntimeResponse('MiniMax-M3-Highspeed');
    ensureRuntimeInvokeMock.mockResolvedValueOnce(firstResponse).mockResolvedValueOnce(secondResponse);

    await expect(warmupConversation('conv-1')).resolves.toEqual(firstResponse);
    await expect(warmupConversation('conv-1')).resolves.toEqual(secondResponse);

    expect(ensureRuntimeInvokeMock).toHaveBeenCalledTimes(2);
  });
});
