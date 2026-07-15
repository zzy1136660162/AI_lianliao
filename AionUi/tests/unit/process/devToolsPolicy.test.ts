import { describe, expect, it, vi } from 'vitest';

import { handleDevToolsShortcut, isDevToolsEnabled } from '@process/utils/devToolsPolicy';

const input = (overrides: Record<string, unknown> = {}) => ({
  type: 'keyDown',
  key: 'F12',
  code: 'F12',
  isAutoRepeat: false,
  isComposing: false,
  ...overrides,
});

const makeWebContents = (opened: boolean) => ({
  isDevToolsOpened: vi.fn(() => opened),
  openDevTools: vi.fn(),
  closeDevTools: vi.fn(),
});

describe('DevTools runtime policy', () => {
  it('enables DevTools only outside packaged builds', () => {
    expect(isDevToolsEnabled(false)).toBe(true);
    expect(isDevToolsEnabled(true)).toBe(false);
  });

  it('opens DevTools for a development F12 keyDown', () => {
    const event = { preventDefault: vi.fn() };
    const webContents = makeWebContents(false);

    expect(handleDevToolsShortcut(event, input(), webContents, false)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(webContents.openDevTools).toHaveBeenCalledOnce();
    expect(webContents.closeDevTools).not.toHaveBeenCalled();
  });

  it('closes open DevTools for a development F12 keyDown', () => {
    const event = { preventDefault: vi.fn() };
    const webContents = makeWebContents(true);

    expect(handleDevToolsShortcut(event, input(), webContents, false)).toBe(true);
    expect(webContents.closeDevTools).toHaveBeenCalledOnce();
    expect(webContents.openDevTools).not.toHaveBeenCalled();
  });

  it.each([
    ['packaged build', true, input()],
    ['keyUp', false, input({ type: 'keyUp' })],
    ['auto repeat', false, input({ isAutoRepeat: true })],
    ['composition', false, input({ isComposing: true })],
    ['another key', false, input({ key: 'F11', code: 'F11' })],
  ])('ignores %s', (_name, isPackaged, keyboardInput) => {
    const event = { preventDefault: vi.fn() };
    const webContents = makeWebContents(false);

    expect(handleDevToolsShortcut(event, keyboardInput, webContents, isPackaged)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(webContents.openDevTools).not.toHaveBeenCalled();
    expect(webContents.closeDevTools).not.toHaveBeenCalled();
  });
});
