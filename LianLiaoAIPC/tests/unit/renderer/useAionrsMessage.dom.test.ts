/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { useAionrsMessage } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsMessage';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mergeLiveMessageMock, responseStreamHandlerRef, responseStreamOnMock } = vi.hoisted(() => ({
  mergeLiveMessageMock: vi.fn(),
  responseStreamHandlerRef: {
    current: undefined as ((message: IResponseMessage) => void) | undefined,
  },
  responseStreamOnMock: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useMergeLiveMessage: () => mergeLiveMessageMock,
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: {
        on: responseStreamOnMock.mockImplementation((handler: (message: IResponseMessage) => void) => {
          responseStreamHandlerRef.current = handler;
          return vi.fn();
        }),
      },
      update: {
        invoke: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

const emit = (message: Partial<IResponseMessage> & Pick<IResponseMessage, 'type'>) => {
  responseStreamHandlerRef.current?.({
    conversation_id: 'conv-1',
    msg_id: 'msg-1',
    data: null,
    ...message,
  } as IResponseMessage);
};

describe('useAionrsMessage terminal state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    responseStreamHandlerRef.current = undefined;
    vi.mocked(getConversationOrNull).mockResolvedValue(null);
  });

  it('stops the processing indicator when a turn finishes with an active tool snapshot', async () => {
    const { result } = renderHook(() => useAionrsMessage('conv-1'));

    await waitFor(() => expect(result.current.hasHydratedRunningState).toBe(true));

    act(() => {
      emit({ type: 'start' });
      emit({
        type: 'tool_group',
        data: [{ name: 'search', status: 'Executing' }],
      });
    });
    expect(result.current.running).toBe(true);

    act(() => emit({ type: 'finish' }));

    expect(result.current.running).toBe(false);
  });

  it('does not reopen the processing indicator for a late event after finish', async () => {
    const { result } = renderHook(() => useAionrsMessage('conv-1'));

    await waitFor(() => expect(result.current.hasHydratedRunningState).toBe(true));

    act(() => emit({ type: 'start' }));
    act(() => emit({ type: 'finish' }));
    expect(result.current.running).toBe(false);

    act(() => emit({ type: 'content', data: 'late persisted chunk' }));

    expect(result.current.running).toBe(false);
  });
});
