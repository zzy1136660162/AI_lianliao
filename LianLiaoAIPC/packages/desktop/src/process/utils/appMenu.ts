/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MenuItemConstructorOptions } from 'electron';
import { BrowserWindow, Menu, app } from 'electron';
import { DESKTOP_NOTIFICATION_NAVIGATE_CHANNEL } from '@/common/enterprise/desktop-notification/constants';
import i18n from '@process/services/i18n';
import { isDevToolsEnabled } from './devToolsPolicy';

export const buildViewMenuItems = (isPackaged: boolean): MenuItemConstructorOptions[] => [
  { role: 'reload' },
  { role: 'forceReload' },
  ...(isDevToolsEnabled(isPackaged) ? ([{ role: 'toggleDevTools' }] as MenuItemConstructorOptions[]) : []),
  { type: 'separator' },
  { role: 'resetZoom' },
  { role: 'zoomIn' },
  { role: 'zoomOut' },
  { type: 'separator' },
  { role: 'togglefullscreen' },
];

export const buildEditMenuItems = (_isPackaged: boolean, isMac: boolean): MenuItemConstructorOptions[] => [
  { role: 'undo' },
  { role: 'redo' },
  { type: 'separator' },
  { role: 'cut' },
  { role: 'copy' },
  { role: 'paste' },
  ...(isMac
    ? ([{ role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' }] as MenuItemConstructorOptions[])
    : ([{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }] as MenuItemConstructorOptions[])),
];

export function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  template.push({
    label: 'Edit',
    submenu: buildEditMenuItems(app.isPackaged, isMac),
  });

  template.push({
    label: 'View',
    submenu: buildViewMenuItems(app.isPackaged),
  });

  template.push({
    label: 'Help',
    submenu: [
      {
        label: i18n.t('common.tray.checkUpdate'),
        click: () => {
          for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
              window.webContents.send(DESKTOP_NOTIFICATION_NAVIGATE_CHANNEL, { route: '/enterprise/version-update' });
            }
          }
        },
      },
    ],
  });

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
