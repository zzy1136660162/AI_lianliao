import { contextBridge, ipcRenderer } from 'electron';

/**
 * Exposes immutable runtime facts without granting renderer code direct Electron access.
 * The main process remains the sole authority for packaged-build security policy.
 */
export const exposeRuntimeEnvironment = (): void => {
  const isPackaged = ipcRenderer.sendSync('get-is-packaged') as unknown;
  contextBridge.exposeInMainWorld('__isPackaged', isPackaged === true);
};
