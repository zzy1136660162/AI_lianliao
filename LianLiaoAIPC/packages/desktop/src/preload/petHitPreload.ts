/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { contextBridge, ipcRenderer } from 'electron';

// Keep this preload self-contained. Electron's sandbox cannot require Rollup's
// shared local chunks, so importing the main runtime helper breaks every preload.
const isPackaged = ipcRenderer.sendSync('get-is-packaged') as unknown;
contextBridge.exposeInMainWorld('__isPackaged', isPackaged === true);

contextBridge.exposeInMainWorld('petHitAPI', {
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  click: (data: { side: string; count: number }) => ipcRenderer.send('pet:click', data),
  contextMenu: () => ipcRenderer.send('pet:context-menu'),
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) =>
    ipcRenderer.send('pet:set-ignore-mouse-events', ignore, options),
  onHitReset: (cb: () => void) => {
    ipcRenderer.on('pet:hit-reset', () => cb());
  },
});
