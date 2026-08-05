import { describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    systemSettings: {},
  },
}));

vi.mock('@/common/platform', () => ({
  getPlatformServices: vi.fn(),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {},
}));

vi.mock('@process/services/i18n', () => ({
  changeLanguage: vi.fn(),
}));

vi.mock('@process/utils/tray', () => ({
  createOrUpdateTray: vi.fn(),
  setCloseToTrayEnabled: vi.fn(),
}));

vi.mock('@process/utils/closeToTraySetting', () => ({
  readCloseToTraySetting: vi.fn(),
  writeCloseToTraySetting: vi.fn(),
}));

import {
  initializeCloseToTrayDefault,
  syncMainProcessLanguage,
  updateCloseToTraySetting,
} from '@process/bridge/systemSettingsBridge';

const CLOSE_TO_TRAY_DEFAULT_FLAG = 'system.closeToTrayDefaultV1Applied' as const;

describe('close-to-tray initialization and runtime setting', () => {
  it('forces close-to-tray on when the versioned flag is absent', async () => {
    const storage = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
    };
    const runtime = {
      read: vi.fn(async () => false),
      persist: vi.fn(async () => undefined),
      setEnabled: vi.fn(),
      ensureTray: vi.fn(),
    };

    const enabled = await initializeCloseToTrayDefault(storage, runtime);

    expect(enabled).toBe(true);
    expect(runtime.read).not.toHaveBeenCalled();
    expect(runtime.persist).toHaveBeenCalledWith(true);
    expect(storage.set).toHaveBeenCalledWith(CLOSE_TO_TRAY_DEFAULT_FLAG, true);
  });

  it('preserves a user-disabled choice after the versioned flag is recorded', async () => {
    const storage = {
      get: vi.fn(async () => true),
      set: vi.fn(async () => undefined),
    };
    const runtime = {
      read: vi.fn(async () => false),
      persist: vi.fn(async () => undefined),
      setEnabled: vi.fn(),
      ensureTray: vi.fn(),
    };

    const enabled = await initializeCloseToTrayDefault(storage, runtime);

    expect(enabled).toBe(false);
    expect(runtime.persist).not.toHaveBeenCalled();
    expect(runtime.setEnabled).toHaveBeenCalledWith(false);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('records an explicit user choice and keeps the permanent tray available', async () => {
    const storage = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
    };
    const runtime = {
      read: vi.fn(async () => false),
      persist: vi.fn(async () => undefined),
      setEnabled: vi.fn(),
      ensureTray: vi.fn(),
    };

    await updateCloseToTraySetting(false, storage, runtime);

    expect(runtime.persist).toHaveBeenCalledWith(false);
    expect(runtime.setEnabled).toHaveBeenCalledWith(false);
    expect(runtime.ensureTray).toHaveBeenCalledOnce();
    expect(storage.set).toHaveBeenCalledWith(CLOSE_TO_TRAY_DEFAULT_FLAG, true);
  });

  it('does not change runtime behavior or record success when persistence fails', async () => {
    const storage = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
    };
    const runtime = {
      read: vi.fn(async () => false),
      persist: vi.fn(async () => {
        throw new Error('write failed');
      }),
      setEnabled: vi.fn(),
      ensureTray: vi.fn(),
    };

    await expect(updateCloseToTraySetting(true, storage, runtime)).rejects.toThrow('write failed');

    expect(runtime.setEnabled).not.toHaveBeenCalled();
    expect(runtime.ensureTray).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });
});

describe('main-process language synchronization', () => {
  it('refreshes the tray only after the normalized language is persisted and applied', async () => {
    const calls: string[] = [];

    await syncMainProcessLanguage('zh_CN', {
      persist: async (language) => {
        calls.push(`persist:${language}`);
      },
      broadcast: (language) => {
        calls.push(`broadcast:${language}`);
      },
      switchLanguage: async (language) => {
        calls.push(`switch:${language}`);
      },
      refreshTray: () => {
        calls.push('refresh');
      },
    });

    expect(calls).toEqual(['persist:zh-CN', 'broadcast:zh-CN', 'switch:zh-CN', 'refresh']);
  });

  it('does not broadcast or refresh the tray when language persistence fails', async () => {
    const calls: string[] = [];

    await expect(
      syncMainProcessLanguage('zh-CN', {
        persist: async () => {
          calls.push('persist');
          throw new Error('write failed');
        },
        broadcast: () => {
          calls.push('broadcast');
        },
        switchLanguage: async () => {
          calls.push('switch');
        },
        refreshTray: () => {
          calls.push('refresh');
        },
      })
    ).rejects.toThrow('write failed');

    expect(calls).toEqual(['persist']);
  });
});
