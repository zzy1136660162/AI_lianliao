import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  changeLanguageInvoke: vi.fn(),
  languageChangedOn: vi.fn(),
  configWhenReady: vi.fn(),
  configGet: vi.fn(),
  configSet: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    systemSettings: {
      changeLanguage: {
        invoke: mocks.changeLanguageInvoke,
      },
      languageChanged: {
        on: mocks.languageChangedOn,
      },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    whenReady: mocks.configWhenReady,
    get: mocks.configGet,
    set: mocks.configSet,
  },
}));

describe('initial desktop language synchronization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    mocks.configWhenReady.mockResolvedValue(undefined);
    mocks.configGet.mockReturnValue('zh_CN');
    mocks.changeLanguageInvoke.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'electronAPI');
  });

  it('sends the resolved locale to the Electron main process on startup', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {},
    });

    await import('@/renderer/services/i18n');

    await vi.waitFor(() => {
      expect(mocks.changeLanguageInvoke).toHaveBeenCalledWith({ language: 'zh-CN' });
    });
  });

  it('does not call desktop IPC when initialized in browser mode', async () => {
    Reflect.deleteProperty(window, 'electronAPI');

    await import('@/renderer/services/i18n');
    await vi.waitFor(() => {
      expect(mocks.configWhenReady).toHaveBeenCalledOnce();
    });

    expect(mocks.changeLanguageInvoke).not.toHaveBeenCalled();
  });
});
