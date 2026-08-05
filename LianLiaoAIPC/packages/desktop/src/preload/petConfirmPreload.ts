/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { Theme } from '@/common/theme/types';

// Keep this preload self-contained. Electron's sandbox cannot require Rollup's
// shared local chunks, so importing the main runtime helper breaks every preload.
const isPackaged = ipcRenderer.sendSync('get-is-packaged') as unknown;
contextBridge.exposeInMainWorld('__isPackaged', isPackaged === true);

contextBridge.exposeInMainWorld('petConfirmAPI', {
  onConfirmationAdd: (callback: (data: any) => void) => {
    ipcRenderer.on('pet:confirm-add', (_event, data) => callback(data));
  },
  onConfirmationUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('pet:confirm-update', (_event, data) => callback(data));
  },
  onConfirmationRemove: (callback: (data: any) => void) => {
    ipcRenderer.on('pet:confirm-remove', (_event, data) => callback(data));
  },
  onThemeChange: (callback: (theme: Theme) => void) => {
    ipcRenderer.on('pet:confirm-theme', (_event, theme) => callback(theme));
  },
  respond: (data: { conversation_id: string; msg_id: string; call_id: string; data: any }) => {
    ipcRenderer.send('pet:confirm-respond', data);
  },
  dragStart: () => {
    ipcRenderer.send('pet:confirm-drag-start');
  },
  dragEnd: () => {
    ipcRenderer.send('pet:confirm-drag-end');
  },
});
