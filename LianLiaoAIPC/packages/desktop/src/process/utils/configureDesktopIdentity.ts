import type { App } from 'electron';
import { DESKTOP_APP_ID, DESKTOP_PRODUCT_NAME } from '@/common/platform/productIdentity';

export type DesktopIdentityApp = Pick<App, 'setAppUserModelId' | 'setName'>;

/**
 * Configure the operating-system identity before creating BrowserWindow or
 * sending notifications. Windows uses the AUMID to group notifications under
 * the installed product name instead of electron.app.Electron.
 */
export function configureDesktopIdentity(app: DesktopIdentityApp): void {
  app.setName(DESKTOP_PRODUCT_NAME);

  if (process.platform === 'win32') {
    app.setAppUserModelId(DESKTOP_APP_ID);
  }
}
