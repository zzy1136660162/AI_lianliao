import type { IProvider } from '@/common/config/storage';
import { DESKTOP_MANAGED_AI_PROVIDER_ID } from '@/common/enterprise/managed-ai-model/contracts';
import type { DesktopAiModelConfig } from '@process/services/enterprise/enterpriseApiClient';
import {
  DesktopManagedAiModelService,
  type DesktopManagedAiModelDependencies,
} from '@process/services/enterprise/desktopManagedAiModelService';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false } }));
vi.mock('@/common', () => ({ ipcBridge: {} }));

const config: DesktopAiModelConfig = {
  providerCode: 'minimax-cn',
  modelName: 'MiniMax-M3',
  baseUrl: 'https://api.example.test/v1',
  protocolType: 'OPENAI_CHAT_COMPLETIONS',
  apiKey: 'x',
  timeoutMs: 60_000,
  maxTokens: 4096,
  configVersion: '2:20260803120000',
};

const provider = (overrides: Partial<IProvider> = {}): IProvider => ({
  id: DESKTOP_MANAGED_AI_PROVIDER_ID,
  platform: 'custom',
  name: 'managed',
  base_url: config.baseUrl,
  api_key: 'stored',
  models: [config.modelName],
  enabled: true,
  model_enabled: { [config.modelName]: true },
  ...overrides,
});

const dependencies = (): DesktopManagedAiModelDependencies => ({
  fetchConfig: vi.fn().mockResolvedValue(config),
  listProviders: vi.fn().mockResolvedValue([]),
  createProvider: vi.fn().mockImplementation(async (request) => provider({ ...request } as Partial<IProvider>)),
  updateProvider: vi.fn().mockImplementation(async (request) => provider({ ...request } as Partial<IProvider>)),
});

describe('DesktopManagedAiModelService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the fixed managed provider and returns no credentials', async () => {
    const deps = dependencies();
    const result = await new DesktopManagedAiModelService(deps).sync();

    expect(deps.createProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: DESKTOP_MANAGED_AI_PROVIDER_ID,
        model_enabled: { 'MiniMax-M3': true },
        models: ['MiniMax-M3'],
        platform: 'custom',
      })
    );
    expect(result).toEqual({
      state: 'synced',
      providerId: DESKTOP_MANAGED_AI_PROVIDER_ID,
      modelName: 'MiniMax-M3',
    });
  });

  it('updates the managed provider without creating a duplicate', async () => {
    const deps = dependencies();
    vi.mocked(deps.listProviders).mockResolvedValue([provider()]);

    await new DesktopManagedAiModelService(deps).sync();

    expect(deps.createProvider).not.toHaveBeenCalled();
    expect(deps.updateProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: DESKTOP_MANAGED_AI_PROVIDER_ID, models: ['MiniMax-M3'] })
    );
  });

  it('uses an enabled cached provider when cloud synchronization fails', async () => {
    const deps = dependencies();
    vi.mocked(deps.fetchConfig).mockRejectedValue(new Error('offline'));
    vi.mocked(deps.listProviders).mockResolvedValue([provider()]);

    await expect(new DesktopManagedAiModelService(deps).sync()).resolves.toEqual({
      state: 'cached',
      providerId: DESKTOP_MANAGED_AI_PROVIDER_ID,
      modelName: 'MiniMax-M3',
    });
  });

  it('reports unavailable when cloud and cache cannot provide a model', async () => {
    const deps = dependencies();
    vi.mocked(deps.fetchConfig).mockRejectedValue(new Error('offline'));

    await expect(new DesktopManagedAiModelService(deps).sync()).resolves.toEqual({
      state: 'unavailable',
      providerId: DESKTOP_MANAGED_AI_PROVIDER_ID,
    });
  });

  it('coalesces concurrent synchronization and allows a later retry', async () => {
    const deps = dependencies();
    let releaseConfig: ((value: DesktopAiModelConfig) => void) | undefined;
    vi.mocked(deps.fetchConfig).mockImplementationOnce(
      () =>
        new Promise<DesktopAiModelConfig>((resolve) => {
          releaseConfig = resolve;
        })
    );
    const service = new DesktopManagedAiModelService(deps);

    const first = service.sync();
    const second = service.sync();
    expect(second).toBe(first);
    releaseConfig?.(config);
    await first;

    await service.sync();
    expect(deps.fetchConfig).toHaveBeenCalledTimes(2);
  });
});
