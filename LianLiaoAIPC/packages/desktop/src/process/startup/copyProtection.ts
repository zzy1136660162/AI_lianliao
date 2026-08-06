import type { App } from 'electron';
import { session } from 'electron';

type CopyProtectionApp = Pick<App, 'whenReady'>;

const CLIPBOARD_WRITE_PERMISSION = 'clipboard-sanitized-write';

const isClipboardWritePermission = (permission: string): boolean => permission === CLIPBOARD_WRITE_PERMISSION;

/**
 * Denies programmatic clipboard writes in packaged builds. Native copy and cut
 * events are filtered in the renderer so editable text controls remain usable.
 */
export const installMainCopyProtection = (application: CopyProtectionApp, isPackaged: boolean): void => {
  if (!isPackaged) return;

  void application.whenReady().then(() => {
    session.defaultSession.setPermissionCheckHandler(
      (_webContents, permission) => !isClipboardWritePermission(permission)
    );
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(!isClipboardWritePermission(permission));
    });
  });
};
