import { app } from 'electron';

import { ipcBridge } from '@/common';
import type { IProvider } from '@/common/config/storage';
import {
  DESKTOP_MANAGED_AI_PROVIDER_ID,
  type DesktopManagedAiSyncResult,
  unavailableDesktopManagedAiSyncResult,
} from '@/common/enterprise/managed-ai-model/contracts';
import type { CreateProviderRequest, UpdateProviderRequest } from '@/common/types/provider/providerApi';

import { EnterpriseApiClient, type DesktopAiModelConfig } from './enterpriseApiClient';
import { resolveEnterpriseApiClientOptions } from './enterpriseRuntimeConfig';

const MANAGED_PROVIDER_NAME = '链辽托管模型';

export type DesktopManagedAiModelDependencies = {
  fetchConfig: () => Promise<DesktopAiModelConfig>;
  listProviders: () => Promise<IProvider[]>;
  createProvider: (request: CreateProviderRequest) => Promise<IProvider>;
  updateProvider: (request: { id: string } & UpdateProviderRequest) => Promise<IProvider>;
};

/** Maps cloud configuration to the stable AionCore provider contract. */
export const toManagedProviderRequest = (config: DesktopAiModelConfig): CreateProviderRequest => ({
  id: DESKTOP_MANAGED_AI_PROVIDER_ID,
  platform: 'custom',
  name: MANAGED_PROVIDER_NAME,
  base_url: config.baseUrl,
  api_key: config.apiKey,
  models: [config.modelName],
  enabled: true,
  capabilities: [{ type: 'text' }, { type: 'function_calling' }],
  model_enabled: { [config.modelName]: true },
});

const findUsableManagedProvider = (providers: IProvider[]): IProvider | undefined =>
  providers.find(
    (provider) =>
      provider.id === DESKTOP_MANAGED_AI_PROVIDER_ID &&
      provider.enabled !== false &&
      provider.models.some((model) => provider.model_enabled?.[model] !== false)
  );

/**
 * Synchronizes one cloud-owned provider and keeps every user-created provider intact.
 * Public calls always settle with a renderer-safe status so a network failure can
 * never hang the AI page or reject an IPC invocation.
 */
export class DesktopManagedAiModelService {
  private syncPromise: Promise<DesktopManagedAiSyncResult> | undefined;

  constructor(private readonly dependencies: DesktopManagedAiModelDependencies) {}

  sync(): Promise<DesktopManagedAiSyncResult> {
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = this.performSync().finally(() => {
      this.syncPromise = undefined;
    });
    return this.syncPromise;
  }

  private async performSync(): Promise<DesktopManagedAiSyncResult> {
    try {
      const [config, providers] = await Promise.all([
        this.dependencies.fetchConfig(),
        this.dependencies.listProviders(),
      ]);
      const request = toManagedProviderRequest(config);
      const existing = providers.find((provider) => provider.id === DESKTOP_MANAGED_AI_PROVIDER_ID);
      if (existing) {
        const { id: _id, ...update } = request;
        await this.dependencies.updateProvider({ id: DESKTOP_MANAGED_AI_PROVIDER_ID, ...update });
      } else {
        await this.dependencies.createProvider(request);
      }
      return {
        state: 'synced',
        providerId: DESKTOP_MANAGED_AI_PROVIDER_ID,
        modelName: config.modelName,
      };
    } catch {
      // Do not include the thrown object: cloud/AionCore errors may carry request metadata.
      console.warn('[desktop-managed-ai] synchronization failed; checking the cached provider');
      return this.resolveCachedResult();
    }
  }

  private async resolveCachedResult(): Promise<DesktopManagedAiSyncResult> {
    try {
      const cached = findUsableManagedProvider(await this.dependencies.listProviders());
      if (!cached) return unavailableDesktopManagedAiSyncResult();
      return {
        state: 'cached',
        providerId: DESKTOP_MANAGED_AI_PROVIDER_ID,
        modelName: cached.models.find((model) => cached.model_enabled?.[model] !== false),
      };
    } catch {
      return unavailableDesktopManagedAiSyncResult();
    }
  }
}

let defaultService: DesktopManagedAiModelService | undefined;

/** Returns the singleton shared by startup synchronization and renderer retries. */
export const getDefaultDesktopManagedAiModelService = (): DesktopManagedAiModelService => {
  if (defaultService) return defaultService;
  const apiClient = new EnterpriseApiClient(resolveEnterpriseApiClientOptions(app.isPackaged));
  defaultService = new DesktopManagedAiModelService({
    fetchConfig: () => apiClient.getDesktopAiModelConfig(),
    listProviders: async () => (await ipcBridge.mode.listProviders.invoke()) ?? [],
    createProvider: (request) => ipcBridge.mode.createProvider.invoke(request),
    updateProvider: (request) => ipcBridge.mode.updateProvider.invoke(request),
  });
  return defaultService;
};
