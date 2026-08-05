/** Stable AionCore provider identity owned by the Chain Liaoning desktop runtime. */
export const DESKTOP_MANAGED_AI_PROVIDER_ID = 'lianliao-managed-desktop-ai' as const;

/** No-argument renderer-to-main command used to retry managed model synchronization. */
export const DESKTOP_MANAGED_AI_SYNC_CHANNEL = 'desktop-managed-ai:sync' as const;

export type DesktopManagedAiSyncState = 'synced' | 'cached' | 'unavailable';

/**
 * Renderer-safe synchronization result. Provider credentials and cloud model
 * configuration intentionally never cross this IPC boundary.
 */
export type DesktopManagedAiSyncResult = {
  state: DesktopManagedAiSyncState;
  providerId: typeof DESKTOP_MANAGED_AI_PROVIDER_ID;
  modelName?: string;
};

export const unavailableDesktopManagedAiSyncResult = (): DesktopManagedAiSyncResult => ({
  state: 'unavailable',
  providerId: DESKTOP_MANAGED_AI_PROVIDER_ID,
});
