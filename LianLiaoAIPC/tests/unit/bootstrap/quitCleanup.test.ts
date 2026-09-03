/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { installQuitCleanup } from '@/process/startup/quitCleanup';

type BeforeQuitEvent = {
  preventDefault: () => void;
};

describe('installQuitCleanup', () => {
  it('prevents the first quit until cleanup finishes, then requests quit again', async () => {
    const calls: string[] = [];
    let beforeQuitHandler: ((event: BeforeQuitEvent) => void) | undefined;
    let resolveStopBackend: (() => void) | undefined;

    const quitApp = vi.fn(() => calls.push('quit-app'));
    const stopBackend = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          calls.push('stop-backend-start');
          resolveStopBackend = resolve;
        })
    );

    installQuitCleanup({
      onBeforeQuit: (handler) => {
        beforeQuitHandler = handler;
      },
      quitApp,
      setIsQuitting: (value) => calls.push(`set-quitting:${value}`),
      markExplicitQuit: () => calls.push('mark-explicit-quit'),
      destroyTray: () => calls.push('destroy-tray'),
      disposeCronResumeListener: () => calls.push('dispose-cron'),
      stopIndustrySearchGateway: async () => {
        calls.push('stop-industry-gateway');
      },
      stopBackend,
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
    });

    const preventDefault = vi.fn();
    beforeQuitHandler?.({ preventDefault });
    await vi.waitFor(() => expect(stopBackend).toHaveBeenCalledTimes(1));

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(quitApp).not.toHaveBeenCalled();
    expect(calls).toEqual([
      'set-quitting:true',
      'mark-explicit-quit',
      'destroy-tray',
      'dispose-cron',
      'stop-industry-gateway',
      'stop-backend-start',
    ]);

    resolveStopBackend?.();
    await vi.waitFor(() => expect(quitApp).toHaveBeenCalledTimes(1));

    expect(quitApp).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      'set-quitting:true',
      'mark-explicit-quit',
      'destroy-tray',
      'dispose-cron',
      'stop-industry-gateway',
      'stop-backend-start',
      'quit-app',
    ]);
  });

  it('allows the second before-quit after cleanup has completed', async () => {
    let beforeQuitHandler: ((event: BeforeQuitEvent) => void) | undefined;
    const quitApp = vi.fn();

    installQuitCleanup({
      onBeforeQuit: (handler) => {
        beforeQuitHandler = handler;
      },
      quitApp,
      setIsQuitting: vi.fn(),
      markExplicitQuit: vi.fn(),
      destroyTray: vi.fn(),
      disposeCronResumeListener: vi.fn(),
      stopIndustrySearchGateway: async () => {},
      stopBackend: async () => {},
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
    });

    beforeQuitHandler?.({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(quitApp).toHaveBeenCalledTimes(1));

    const preventDefault = vi.fn();
    beforeQuitHandler?.({ preventDefault });

    expect(preventDefault).not.toHaveBeenCalled();
  });
});
