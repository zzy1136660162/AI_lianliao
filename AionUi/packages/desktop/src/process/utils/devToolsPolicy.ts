import type { BrowserWindow, Event, Input, WebContents } from 'electron';

type DevToolsEvent = Pick<Event, 'preventDefault'>;
type DevToolsInput = Pick<Input, 'type' | 'key' | 'code' | 'isAutoRepeat' | 'isComposing'>;
type DevToolsWebContents = Pick<WebContents, 'isDevToolsOpened' | 'openDevTools' | 'closeDevTools'>;

/** Packaged builds intentionally expose no local or remote DevTools entry point. */
export const isDevToolsEnabled = (isPackaged: boolean): boolean => !isPackaged;

export const handleDevToolsShortcut = (
  event: DevToolsEvent,
  input: DevToolsInput,
  webContents: DevToolsWebContents,
  isPackaged: boolean
): boolean => {
  const isF12 = input.key === 'F12' || input.code === 'F12';
  if (
    !isDevToolsEnabled(isPackaged) ||
    input.type !== 'keyDown' ||
    input.isAutoRepeat ||
    input.isComposing ||
    !isF12
  ) {
    return false;
  }

  event.preventDefault();
  if (webContents.isDevToolsOpened()) webContents.closeDevTools();
  else webContents.openDevTools();
  return true;
};

/** Attaches the focused-window shortcut without claiming a system-wide hotkey. */
export const attachDevToolsShortcutToWindow = (win: BrowserWindow, isPackaged: boolean): void => {
  win.webContents.on('before-input-event', (event, input) => {
    handleDevToolsShortcut(event, input, win.webContents, isPackaged);
  });
};
