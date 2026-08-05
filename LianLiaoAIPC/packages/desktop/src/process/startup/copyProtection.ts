import type { App, Event, Input, WebContents } from 'electron';
import { session } from 'electron';

type CopyProtectionEvent = Pick<Event, 'preventDefault'>;
type CopyProtectionInput = Pick<Input, 'type' | 'key' | 'control' | 'meta'>;
type CopyProtectionWebContents = Pick<WebContents, 'on'>;
type CopyProtectionApp = Pick<App, 'on' | 'whenReady'>;

const CLIPBOARD_WRITE_PERMISSION = 'clipboard-sanitized-write';

const isClipboardWritePermission = (permission: string): boolean => permission === CLIPBOARD_WRITE_PERMISSION;

/**
 * Blocks only the operating-system copy and cut accelerators.
 * Paste, select-all and ordinary input deliberately remain available.
 */
export const handleCopyProtectionShortcut = (
  event: CopyProtectionEvent,
  input: CopyProtectionInput,
  isPackaged: boolean
): boolean => {
  const key = input.key.toLowerCase();
  if (!isPackaged || input.type !== 'keyDown' || (!input.control && !input.meta) || (key !== 'c' && key !== 'x')) {
    return false;
  }

  event.preventDefault();
  return true;
};

const attachCopyProtectionToWebContents = (webContents: CopyProtectionWebContents): void => {
  webContents.on('before-input-event', (event, input) => {
    handleCopyProtectionShortcut(event, input, true);
  });
};

/**
 * Installs one packaged-build policy for existing window families and future WebContents.
 * Clipboard permission denial provides a second boundary for page scripts and embedded webviews.
 */
export const installMainCopyProtection = (application: CopyProtectionApp, isPackaged: boolean): void => {
  if (!isPackaged) return;

  application.on('web-contents-created', (_event, webContents) => {
    attachCopyProtectionToWebContents(webContents);
  });

  void application.whenReady().then(() => {
    session.defaultSession.setPermissionCheckHandler(
      (_webContents, permission) => !isClipboardWritePermission(permission)
    );
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(!isClipboardWritePermission(permission));
    });
  });
};
