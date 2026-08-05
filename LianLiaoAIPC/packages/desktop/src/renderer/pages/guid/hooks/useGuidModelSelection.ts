/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { DESKTOP_MANAGED_AI_PROVIDER_ID } from '@/common/enterprise/managed-ai-model/contracts';
import { useGoogleAuthModels } from '@/renderer/hooks/agent/useGoogleAuthModels';
import { useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';
import { hasAvailableModels } from '../utils/modelUtils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Build a unique key for a provider/model pair.
 */
const buildModelKey = (providerId?: string, modelName?: string) => {
  if (!providerId || !modelName) return null;
  return `${providerId}:${modelName}`;
};

/**
 * Check if a model key still exists in the provider list.
 */
const isModelKeyAvailable = (key: string | null, providers?: IProvider[]) => {
  if (!key || !providers || providers.length === 0) return false;
  return providers.some((provider) => {
    if (!provider.id || !provider.models?.length) return false;
    return provider.models.some((modelName) => buildModelKey(provider.id, modelName) === key);
  });
};

/** Provider-based agent keys that share the model list UI */
type ProviderAgentKey = 'aionrs';

export type GuidModelSelectionResult = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  formatGeminiModelLabel: (provider: { platform?: string } | undefined, modelName?: string) => string;
  current_model: TProviderWithModel | undefined;
  setCurrentModel: (model_info: TProviderWithModel, options?: { persistPreference?: boolean }) => Promise<void>;
  resetCurrentModel: (options?: { persistPreference?: boolean }) => Promise<void>;
};

/**
 * Hook that manages the provider-backed model selection state for the Guid page.
 * Assistant-driven defaults are applied by the caller; this hook only owns the
 * transient in-page selection.
 * @param agentKey - current provider-based agent (currently only 'aionrs')
 */
export const useGuidModelSelection = (agentKey: ProviderAgentKey = 'aionrs'): GuidModelSelectionResult => {
  const { isGoogleAuth } = useGoogleAuthModels();
  const { data: modelConfig, mutate: refreshProviders } = useProvidersQuery();

  const modelList = useMemo(() => {
    const allProviders: IProvider[] = (modelConfig || []).filter((platform) => !!platform.models.length);
    return allProviders.filter(hasAvailableModels);
  }, [modelConfig]);

  const formatGeminiModelLabel = useCallback((_provider: { platform?: string } | undefined, modelName?: string) => {
    if (!modelName) return '';
    return modelName;
  }, []);

  const [current_model, _setCurrentModel] = useState<TProviderWithModel>();
  const selectedModelKeyRef = useRef<string | null>(null);
  const managedSyncStartedRef = useRef(false);

  // Startup synchronization is best-effort; retry once when the AI workspace
  // opens, then refresh the local AionCore provider list on success or cache use.
  useEffect(() => {
    if (managedSyncStartedRef.current) return;
    managedSyncStartedRef.current = true;
    const sync = window.electronAPI?.desktopManagedAi?.sync;
    if (!sync) return;
    void sync().then((result) => {
      if (result.state !== 'unavailable') void refreshProviders();
    });
  }, [refreshProviders]);

  const setCurrentModel = useCallback(
    async (model_info: TProviderWithModel, _options?: { persistPreference?: boolean }) => {
      selectedModelKeyRef.current = buildModelKey(model_info.id, model_info.use_model);
      _setCurrentModel(model_info);
    },
    []
  );

  const resetCurrentModel = useCallback(
    async (_options?: { persistPreference?: boolean }) => {
      if (!modelList || modelList.length === 0) {
        return;
      }

      selectedModelKeyRef.current = null;

      const defaultModel = modelList.find((provider) => provider.id === DESKTOP_MANAGED_AI_PROVIDER_ID) ?? modelList[0];
      const resolvedUseModel = defaultModel?.models[0] ?? '';

      if (!defaultModel || !resolvedUseModel) return;

      // A reset is a system-selected fallback rather than an explicit user choice.
      // Keep selectedModelKeyRef empty so a managed provider arriving after the
      // cloud synchronization can replace an earlier first-provider fallback.
      _setCurrentModel({
        ...defaultModel,
        use_model: resolvedUseModel,
      });
    },
    [modelList]
  );

  // Set default model when modelList or agent changes
  useEffect(() => {
    const setDefaultModel = async () => {
      if (!modelList || modelList.length === 0) {
        return;
      }
      const selectedKey = selectedModelKeyRef.current;
      if (isModelKeyAvailable(selectedKey, modelList)) {
        return;
      }

      // A removed manual model no longer blocks the centrally managed default.
      selectedModelKeyRef.current = null;
      const defaultProvider =
        modelList.find((provider) => provider.id === DESKTOP_MANAGED_AI_PROVIDER_ID) ?? modelList[0];
      const defaultKey = buildModelKey(defaultProvider?.id, defaultProvider?.models[0]);
      const currentKey = buildModelKey(current_model?.id, current_model?.use_model);
      if (currentKey === defaultKey) return;

      await resetCurrentModel();
    };

    setDefaultModel().catch((error) => {
      console.error('Failed to set default model:', error);
    });
  }, [agentKey, current_model?.id, current_model?.use_model, modelList, resetCurrentModel]);
  return {
    modelList,
    isGoogleAuth,
    formatGeminiModelLabel,
    current_model,
    setCurrentModel,
    resetCurrentModel,
  };
};
