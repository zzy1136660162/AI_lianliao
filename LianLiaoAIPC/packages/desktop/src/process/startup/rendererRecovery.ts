type RendererStorageSession = {
  clearStorageData: (options: { origin: string; storages: Array<'serviceworkers' | 'cachestorage'> }) => Promise<void>;
};

type RendererCrashRecoveryGateOptions = {
  stableAfterMs?: number;
};

export type RendererCrashRecoveryGate = {
  dispose: () => void;
  markRendererLoaded: () => void;
  tryBeginRecovery: () => boolean;
};

const DEFAULT_STABLE_AFTER_MS = 30_000;

/**
 * Remove only PWA-owned storage for the renderer origin.
 *
 * Electron does not use the browser PWA cache. Keeping cookies, localStorage,
 * IndexedDB, and application databases untouched protects signed-in and local
 * user data while removing a stale worker that can crash Chromium CacheStorage.
 */
export async function clearRendererOriginWebStorage(
  storageSession: RendererStorageSession,
  rendererUrl: string | undefined
): Promise<boolean> {
  if (!rendererUrl) {
    return false;
  }

  try {
    const url = new URL(rendererUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    await storageSession.clearStorageData({
      origin: url.origin,
      storages: ['serviceworkers', 'cachestorage'],
    });
    return true;
  } catch (error) {
    // Cleanup is defensive. A temporary Chromium storage failure must not turn
    // into a desktop startup failure; the recovery gate still prevents a loop.
    console.warn('[LianLiaoAIPC] Failed to clear renderer PWA storage:', error);
    return false;
  }
}

/**
 * Allow one automatic renderer reload, then require a continuously healthy
 * load interval before another recovery is permitted.
 */
export function createRendererCrashRecoveryGate(
  options: RendererCrashRecoveryGateOptions = {}
): RendererCrashRecoveryGate {
  const stableAfterMs = options.stableAfterMs ?? DEFAULT_STABLE_AFTER_MS;
  let recoveryAttempted = false;
  let stableTimer: ReturnType<typeof setTimeout> | undefined;

  const clearStableTimer = (): void => {
    if (stableTimer !== undefined) {
      clearTimeout(stableTimer);
      stableTimer = undefined;
    }
  };

  return {
    tryBeginRecovery(): boolean {
      clearStableTimer();
      if (recoveryAttempted) {
        return false;
      }
      recoveryAttempted = true;
      return true;
    },
    markRendererLoaded(): void {
      clearStableTimer();
      stableTimer = setTimeout(() => {
        recoveryAttempted = false;
        stableTimer = undefined;
      }, stableAfterMs);
      stableTimer.unref?.();
    },
    dispose(): void {
      clearStableTimer();
    },
  };
}
