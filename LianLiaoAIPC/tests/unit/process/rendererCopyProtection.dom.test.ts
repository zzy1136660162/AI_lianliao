// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCopyProtectionError, installRendererCopyProtection } from '@renderer/utils/ui/copyProtection';

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

describe('renderer copy protection', () => {
  let dispose: () => void;

  beforeEach(() => {
    dispose = () => {};
    Reflect.deleteProperty(window, '__isPackaged');
  });

  afterEach(() => {
    dispose();
    Reflect.deleteProperty(window, '__isPackaged');
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
    vi.restoreAllMocks();
  });

  it.each(['copy', 'cut'])('prevents %s DOM events in packaged builds', (eventName) => {
    dispose = installRendererCopyProtection({
      isPackaged: true,
      window,
      document,
      navigator,
    });
    const event = new Event(eventName, { cancelable: true });

    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps copy events available in development', () => {
    dispose = installRendererCopyProtection({
      isPackaged: false,
      window,
      document,
      navigator,
    });
    const event = new Event('copy', { cancelable: true });

    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('blocks legacy execCommand copy without affecting other commands', () => {
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
      writable: true,
    });
    dispose = installRendererCopyProtection({
      isPackaged: true,
      window,
      document,
      navigator,
    });

    expect(document.execCommand('copy')).toBe(false);
    expect(document.execCommand('insertText', false, 'allowed')).toBe(true);
    expect(execCommand).toHaveBeenCalledExactlyOnceWith('insertText', false, 'allowed');
  });

  it('returns a stable NotAllowedError for blocked writes', () => {
    const error = createCopyProtectionError();

    expect(error.name).toBe('NotAllowedError');
    expect(error.message).toContain('Clipboard writes are disabled');
  });

  it('blocks Clipboard API writes and restores the native methods on dispose', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    dispose = installRendererCopyProtection({
      isPackaged: true,
      window,
      document,
      navigator,
    });

    await expect(navigator.clipboard.writeText('protected')).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(writeText).not.toHaveBeenCalled();

    dispose();
    dispose = () => {};
    await navigator.clipboard.writeText('development');
    expect(writeText).toHaveBeenCalledExactlyOnceWith('development');
  });

  it('does not register duplicate DOM listeners', () => {
    const addEventListener = vi.spyOn(document, 'addEventListener');
    dispose = installRendererCopyProtection({
      isPackaged: true,
      window,
      document,
      navigator,
    });
    const disposeDuplicate = installRendererCopyProtection({
      isPackaged: true,
      window,
      document,
      navigator,
    });

    const protectedEventRegistrations = addEventListener.mock.calls.filter(
      ([eventName]) => eventName === 'copy' || eventName === 'cut'
    );
    expect(protectedEventRegistrations).toHaveLength(2);
    disposeDuplicate();
  });

  it('rejects the shared copy helper before touching Clipboard API', async () => {
    const writeText = vi.fn();
    Object.defineProperty(window, '__isPackaged', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const { copyText } = await import('@renderer/utils/ui/clipboard');

    await expect(copyText('protected')).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(writeText).not.toHaveBeenCalled();
  });
});
