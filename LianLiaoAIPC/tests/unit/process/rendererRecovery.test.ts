import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearRendererOriginWebStorage,
  createRendererCrashRecoveryGate,
} from '../../../packages/desktop/src/process/startup/rendererRecovery';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('clearRendererOriginWebStorage', () => {
  it('clears only service worker and cache storage for the development renderer origin', async () => {
    const clearStorageData = vi.fn().mockResolvedValue(undefined);

    const cleared = await clearRendererOriginWebStorage(
      { clearStorageData },
      'http://localhost:5173/dashboard?source=desktop'
    );

    expect(cleared).toBe(true);
    expect(clearStorageData).toHaveBeenCalledWith({
      origin: 'http://localhost:5173',
      storages: ['serviceworkers', 'cachestorage'],
    });
  });

  it('does not clear unrelated storage when the renderer URL is absent', async () => {
    const clearStorageData = vi.fn().mockResolvedValue(undefined);

    const cleared = await clearRendererOriginWebStorage({ clearStorageData }, undefined);

    expect(cleared).toBe(false);
    expect(clearStorageData).not.toHaveBeenCalled();
  });

  it('does not abort startup when Chromium rejects cache cleanup', async () => {
    const clearStorageData = vi.fn().mockRejectedValue(new Error('storage service unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(clearRendererOriginWebStorage({ clearStorageData }, 'http://localhost:5173')).resolves.toBe(false);
  });
});

describe('createRendererCrashRecoveryGate', () => {
  it('allows one recovery and suppresses another crash before the renderer is stable', () => {
    const gate = createRendererCrashRecoveryGate();

    expect(gate.tryBeginRecovery()).toBe(true);
    expect(gate.tryBeginRecovery()).toBe(false);
  });

  it('allows recovery again only after a loaded renderer remains stable', () => {
    vi.useFakeTimers();
    const gate = createRendererCrashRecoveryGate({ stableAfterMs: 30_000 });

    expect(gate.tryBeginRecovery()).toBe(true);
    gate.markRendererLoaded();
    vi.advanceTimersByTime(29_999);
    vi.advanceTimersByTime(1);
    expect(gate.tryBeginRecovery()).toBe(true);
  });
});
