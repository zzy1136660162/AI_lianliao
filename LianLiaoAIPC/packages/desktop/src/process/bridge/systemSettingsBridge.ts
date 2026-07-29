/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 系统设置桥接模块
 * System Settings Bridge Module
 *
 * 负责���理系统级设置的读写操作（如关闭到托盘）
 * Handles read/write operations for system-level settings (e.g. close to tray)
 */

import { ipcBridge } from '@/common';
import { getPlatformServices } from '@/common/platform';
import { ProcessConfig } from '@process/utils/initStorage';
import { changeLanguage } from '@process/services/i18n';
import type { PetSize } from '@process/pet/petTypes';
import { createOrUpdateTray, setCloseToTrayEnabled } from '@process/utils/tray';
import { readCloseToTraySetting, writeCloseToTraySetting } from '@process/utils/closeToTraySetting';

// Keep-awake power blocker state
let _keepAwakeBlockerId: number | null = null;

type LanguageChangeListener = () => void;
let _languageChangeListener: LanguageChangeListener | null = null;

const CLOSE_TO_TRAY_DEFAULT_FLAG = 'system.closeToTrayDefaultV1Applied' as const;

export type CloseToTrayStorage = {
  get: (key: typeof CLOSE_TO_TRAY_DEFAULT_FLAG) => Promise<boolean | undefined>;
  set: (key: typeof CLOSE_TO_TRAY_DEFAULT_FLAG, value: boolean) => Promise<unknown>;
};

export type CloseToTrayRuntime = {
  read: () => Promise<boolean>;
  persist: (enabled: boolean) => Promise<void>;
  setEnabled: (enabled: boolean) => void;
  ensureTray: () => void;
};

const closeToTrayRuntime: CloseToTrayRuntime = {
  read: readCloseToTraySetting,
  persist: writeCloseToTraySetting,
  setEnabled: setCloseToTrayEnabled,
  ensureTray: createOrUpdateTray,
};

/**
 * Applies close-to-tray behavior without coupling tray availability to it.
 * Disabling the behavior keeps the permanent tray entry alive.
 */
export async function updateCloseToTraySetting(
  enabled: boolean,
  storage: CloseToTrayStorage = ProcessConfig,
  runtime: CloseToTrayRuntime = closeToTrayRuntime
): Promise<void> {
  await runtime.persist(enabled);
  runtime.setEnabled(enabled);
  runtime.ensureTray();
  await storage.set(CLOSE_TO_TRAY_DEFAULT_FLAG, true);
}

/**
 * Applies the versioned default once, then defers to the user's saved choice.
 * The marker is recorded only after persistence and runtime application finish.
 */
export async function initializeCloseToTrayDefault(
  storage: CloseToTrayStorage = ProcessConfig,
  runtime: CloseToTrayRuntime = closeToTrayRuntime
): Promise<boolean> {
  if ((await storage.get(CLOSE_TO_TRAY_DEFAULT_FLAG)) !== true) {
    await updateCloseToTraySetting(true, storage, runtime);
    return true;
  }

  const enabled = await runtime.read();
  runtime.setEnabled(enabled);
  runtime.ensureTray();
  return enabled;
}

/**
 * 注册语言变更监听器（供主进程 index.ts 使用）
 * Register a listener for language changes (used by main process index.ts)
 */
export function onLanguageChanged(listener: LanguageChangeListener): void {
  _languageChangeListener = listener;
}

export function initSystemSettingsBridge(): void {
  ipcBridge.systemSettings.getCloseToTray.provider(async () => readCloseToTraySetting());

  ipcBridge.systemSettings.setCloseToTray.provider(async ({ enabled }) => {
    await updateCloseToTraySetting(enabled);
  });

  // Set "keep awake" — toggle prevent-display-sleep blocker.
  // getKeepAwake is served by the backend via HTTP; only the setter remains
  // because it drives the local power.preventDisplaySleep blocker.
  ipcBridge.systemSettings.setKeepAwake.provider(async ({ enabled }) => {
    await ProcessConfig.set('system.keepAwake', enabled);
    const power = getPlatformServices().power;
    if (enabled && _keepAwakeBlockerId === null) {
      _keepAwakeBlockerId = power.preventDisplaySleep();
    } else if (!enabled && _keepAwakeBlockerId !== null) {
      power.allowSleep(_keepAwakeBlockerId);
      _keepAwakeBlockerId = null;
    }
  });

  // 语言变更通知，同步主进程 i18n 并通知托盘重建
  // Language change notification, sync main process i18n and notify tray rebuild
  ipcBridge.systemSettings.changeLanguage.provider(async ({ language }) => {
    // Broadcast to all renderers FIRST (desktop + WebUI) for real-time sync.
    // This must happen before the potentially slow main-process i18n switch.
    ipcBridge.systemSettings.languageChanged.emit({ language });
    _languageChangeListener?.();

    // Update main process i18n (non-blocking – don't let a hang here block the provider)
    changeLanguage(language).catch((error) => {
      console.error('[SystemSettings] Main process changeLanguage failed:', error);
    });
  });

  // Restore keep-awake state on startup
  ProcessConfig.get('system.keepAwake')
    .then((enabled) => {
      if (enabled) {
        _keepAwakeBlockerId = getPlatformServices().power.preventDisplaySleep();
        console.log('[SystemSettings] Keep-awake restored on startup');
      }
    })
    .catch((err) => {
      console.warn('[SystemSettings] Failed to restore keep-awake:', err);
    });

  // Desktop pet settings
  ipcBridge.systemSettings.getPetEnabled.provider(async () => {
    const value = await ProcessConfig.get('pet.enabled');
    return value ?? false;
  });

  ipcBridge.systemSettings.setPetEnabled.provider(async ({ enabled }) => {
    const { createPetWindow, destroyPetWindow, isPetSupported } = await import('@process/pet/petManager');
    if (enabled && !isPetSupported()) {
      console.warn('[SystemSettings] Desktop pet is not supported in headless mode');
      return;
    }
    await ProcessConfig.set('pet.enabled', enabled);
    if (enabled) {
      createPetWindow();
    } else {
      destroyPetWindow();
    }
  });

  ipcBridge.systemSettings.getPetSize.provider(async () => {
    const value = await ProcessConfig.get('pet.size');
    return value ?? 280;
  });

  ipcBridge.systemSettings.setPetSize.provider(async ({ size }) => {
    await ProcessConfig.set('pet.size', size);
    const { resizePetWindow } = await import('@process/pet/petManager');
    resizePetWindow(size as PetSize);
  });

  ipcBridge.systemSettings.getPetDnd.provider(async () => {
    const value = await ProcessConfig.get('pet.dnd');
    return value ?? false;
  });

  ipcBridge.systemSettings.setPetDnd.provider(async ({ dnd }) => {
    await ProcessConfig.set('pet.dnd', dnd);
    const { setPetDndMode } = await import('@process/pet/petManager');
    setPetDndMode(dnd);
  });

  // Pet confirm-bubble toggle: when disabled, AI tool-call confirmations
  // are not routed to the pet's bubble window. Default true.
  ipcBridge.systemSettings.getPetConfirmEnabled.provider(async () => {
    const value = await ProcessConfig.get('pet.confirmEnabled');
    return value ?? true;
  });

  ipcBridge.systemSettings.setPetConfirmEnabled.provider(async ({ enabled }) => {
    await ProcessConfig.set('pet.confirmEnabled', enabled);
    const { setPetConfirmEnabled } = await import('@process/pet/petManager');
    setPetConfirmEnabled(enabled);
  });
}
