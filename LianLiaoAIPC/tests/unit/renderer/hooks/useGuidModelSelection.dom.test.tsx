import type { IProvider } from '@/common/config/storage';
import { DESKTOP_MANAGED_AI_PROVIDER_ID } from '@/common/enterprise/managed-ai-model/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  providers: [] as IProvider[],
  refresh: vi.fn(),
  sync: vi.fn(),
}));

vi.mock('@/renderer/hooks/agent/useGoogleAuthModels', () => ({
  useGoogleAuthModels: () => ({ isGoogleAuth: false }),
}));

vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  useProvidersQuery: () => ({ data: state.providers, mutate: state.refresh }),
}));

const { useGuidModelSelection } = await import('@/renderer/pages/guid/hooks/useGuidModelSelection');

const provider = (id: string, model: string): IProvider => ({
  id,
  platform: 'custom',
  name: id,
  base_url: 'https://api.example.test/v1',
  api_key: 'stored',
  models: [model],
  enabled: true,
  model_enabled: { [model]: true },
  capabilities: [{ type: 'text' }, { type: 'function_calling' }],
});

describe('useGuidModelSelection managed default', () => {
  beforeEach(() => {
    state.providers = [];
    state.refresh.mockReset();
    state.sync.mockReset().mockResolvedValue({
      state: 'unavailable',
      providerId: DESKTOP_MANAGED_AI_PROVIDER_ID,
    });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { desktopManagedAi: { sync: state.sync } },
    });
  });

  it('prefers the managed provider and refreshes providers after synchronization', async () => {
    state.providers = [provider('user-provider', 'user-model'), provider(DESKTOP_MANAGED_AI_PROVIDER_ID, 'MiniMax-M3')];
    state.sync.mockResolvedValue({
      state: 'synced',
      providerId: DESKTOP_MANAGED_AI_PROVIDER_ID,
      modelName: 'MiniMax-M3',
    });

    const { result } = renderHook(() => useGuidModelSelection());

    await waitFor(() => expect(result.current.current_model?.id).toBe(DESKTOP_MANAGED_AI_PROVIDER_ID));
    await waitFor(() => expect(state.refresh).toHaveBeenCalledTimes(1));
  });

  it('falls back to the first configured provider when the managed provider is absent', async () => {
    state.providers = [provider('user-provider', 'user-model')];

    const { result } = renderHook(() => useGuidModelSelection());

    await waitFor(() => expect(result.current.current_model?.id).toBe('user-provider'));
  });

  it('replaces a temporary fallback when the managed provider arrives later', async () => {
    const userProvider = provider('user-provider', 'user-model');
    const managedProvider = provider(DESKTOP_MANAGED_AI_PROVIDER_ID, 'MiniMax-M3');
    state.providers = [userProvider];
    const { result, rerender } = renderHook(() => useGuidModelSelection());
    await waitFor(() => expect(result.current.current_model?.id).toBe('user-provider'));

    state.providers = [userProvider, managedProvider];
    rerender();

    await waitFor(() => expect(result.current.current_model?.id).toBe(DESKTOP_MANAGED_AI_PROVIDER_ID));
  });

  it('preserves a valid manual selection after the provider list refreshes', async () => {
    const userProvider = provider('user-provider', 'user-model');
    const managedProvider = provider(DESKTOP_MANAGED_AI_PROVIDER_ID, 'MiniMax-M3');
    state.providers = [userProvider, managedProvider];
    const { result, rerender } = renderHook(() => useGuidModelSelection());
    await waitFor(() => expect(result.current.current_model?.id).toBe(DESKTOP_MANAGED_AI_PROVIDER_ID));

    await act(async () => {
      await result.current.setCurrentModel({ ...userProvider, use_model: 'user-model' });
    });
    state.providers = [{ ...managedProvider }, { ...userProvider }];
    rerender();

    await waitFor(() => expect(result.current.current_model?.id).toBe('user-provider'));
  });
});
