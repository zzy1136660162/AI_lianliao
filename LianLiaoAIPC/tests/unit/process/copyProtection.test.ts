import { beforeEach, describe, expect, it, vi } from 'vitest';

const defaultSessionMock = vi.hoisted(() => ({
  setPermissionCheckHandler: vi.fn(),
  setPermissionRequestHandler: vi.fn(),
}));

vi.mock('electron', () => ({
  session: {
    defaultSession: defaultSessionMock,
  },
}));

import { handleCopyProtectionShortcut, installMainCopyProtection } from '@process/startup/copyProtection';

describe('main copy protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['copy with Control', { type: 'keyDown', key: 'c', control: true, meta: false }],
    ['cut with Control', { type: 'keyDown', key: 'X', control: true, meta: false }],
    ['copy with Command', { type: 'keyDown', key: 'C', control: false, meta: true }],
  ])('blocks %s in packaged builds', (_name, input) => {
    const event = { preventDefault: vi.fn() };

    expect(handleCopyProtectionShortcut(event, input, true)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it.each([
    ['development copy', false, { type: 'keyDown', key: 'c', control: true, meta: false }],
    ['packaged paste', true, { type: 'keyDown', key: 'v', control: true, meta: false }],
    ['packaged select all', true, { type: 'keyDown', key: 'a', control: true, meta: false }],
    ['plain packaged input', true, { type: 'keyDown', key: 'c', control: false, meta: false }],
    ['packaged key up', true, { type: 'keyUp', key: 'c', control: true, meta: false }],
  ])('keeps %s available', (_name, isPackaged, input) => {
    const event = { preventDefault: vi.fn() };

    expect(handleCopyProtectionShortcut(event, input, isPackaged)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('attaches shortcut protection to every future WebContents in packaged builds', async () => {
    const appListeners = new Map<string, (...args: unknown[]) => void>();
    const application = {
      on: vi.fn((eventName: string, listener: (...args: unknown[]) => void) => {
        appListeners.set(eventName, listener);
      }),
      whenReady: vi.fn().mockResolvedValue(undefined),
    };
    const webContentsListeners = new Map<string, (...args: unknown[]) => void>();
    const webContents = {
      on: vi.fn((eventName: string, listener: (...args: unknown[]) => void) => {
        webContentsListeners.set(eventName, listener);
      }),
    };

    installMainCopyProtection(application as never, true);
    appListeners.get('web-contents-created')?.({}, webContents);

    expect(webContents.on).toHaveBeenCalledWith('before-input-event', expect.any(Function));
    await application.whenReady();
    expect(defaultSessionMock.setPermissionCheckHandler).toHaveBeenCalledOnce();
    expect(defaultSessionMock.setPermissionRequestHandler).toHaveBeenCalledOnce();
  });

  it('does not install listeners or permission handlers in development', () => {
    const application = {
      on: vi.fn(),
      whenReady: vi.fn().mockResolvedValue(undefined),
    };

    installMainCopyProtection(application as never, false);

    expect(application.on).not.toHaveBeenCalled();
    expect(application.whenReady).not.toHaveBeenCalled();
    expect(defaultSessionMock.setPermissionCheckHandler).not.toHaveBeenCalled();
    expect(defaultSessionMock.setPermissionRequestHandler).not.toHaveBeenCalled();
  });
});
