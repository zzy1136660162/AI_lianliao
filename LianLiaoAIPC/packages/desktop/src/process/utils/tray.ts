/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow, Tray as TrayInstance } from 'electron';
import {
  electronApp as app,
  electronMenu as Menu,
  electronNativeImage as nativeImage,
  electronTray as Tray,
} from '@/common/electronSafe';
import * as path from 'path';
import { ipcBridge } from '@/common';
import {
  CUSTOMER_CONSULTATION_NAVIGATE_CHANNEL,
  CUSTOMER_SERVICE_NAVIGATE_CHANNEL,
} from '@/common/enterprise/customer-service/constants';
import { DESKTOP_NOTIFICATION_NAVIGATE_CHANNEL } from '@/common/enterprise/desktop-notification/constants';
import type { DesktopNotificationAction } from '@/common/enterprise/desktop-notification/contracts';
import { DESKTOP_PRODUCT_NAME } from '@/common/platform/productIdentity';
import i18n from '@process/services/i18n';

let tray: TrayInstance | null = null;
let closeToTrayEnabled = false;
let isQuitting = false;
let mainWindowRef: BrowserWindow | null = null;
let createMainWindowRef: (() => void) | null = null;
let cachedActiveCount = 0;
let customerServiceUnreadCount = 0;
let customerConsultationUnreadCount = 0;
let desktopNotificationUnreadCount = 0;

const showAndFocusMainWindow = (): BrowserWindow | null => {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) {
    createMainWindowRef?.();
    return null;
  }
  if (process.platform === 'darwin' && app.dock) {
    void app.dock.show();
  }
  if (mainWindowRef.isMinimized()) mainWindowRef.restore();
  mainWindowRef.show();
  mainWindowRef.focus();
  return mainWindowRef;
};

/** Native notifications are reserved for messages received away from the active window. */
export const shouldNotifyCustomerServiceMessage = (): boolean =>
  !mainWindowRef || mainWindowRef.isDestroyed() || mainWindowRef.isMinimized() || !mainWindowRef.isFocused();

const isCustomerConsultationRouteVisible = (): boolean => {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return false;
  try {
    const hashPath = new URL(mainWindowRef.webContents.getURL()).hash.slice(1).split('?')[0];
    return hashPath === '/enterprise/consultation';
  } catch {
    return false;
  }
};

/** Customer notifications are suppressed only while the focused consultation page is visible. */
export const shouldNotifyCustomerConsultationMessage = (): boolean =>
  !mainWindowRef ||
  mainWindowRef.isDestroyed() ||
  mainWindowRef.isMinimized() ||
  !mainWindowRef.isFocused() ||
  !isCustomerConsultationRouteVisible();

/** Business notifications always request an operating-system reminder, including while the inbox is foregrounded. */
export const shouldNotifyDesktopNotification = (): boolean => true;

/** Restores the desktop shell before handing a validated conversation ID to the renderer. */
export const openCustomerServiceConversation = (conversationId: string): void => {
  if (!/^-?[1-9][0-9]{0,18}$/.test(conversationId)) return;
  const window = showAndFocusMainWindow();
  window?.webContents.send(CUSTOMER_SERVICE_NAVIGATE_CHANNEL, { conversationId });
};

/** Opens the authenticated customer's own consultation without accepting an external business ID. */
export const openCustomerConsultation = (): void => {
  const window = showAndFocusMainWindow();
  window?.webContents.send(CUSTOMER_CONSULTATION_NAVIGATE_CHANNEL);
};

/**
 * Converts a validated backend action to a fixed enterprise route before it reaches preload.
 * No raw URL or arbitrary identifier from a native notification is ever forwarded to the renderer.
 */
export const openDesktopNotification = (input: {
  action: DesktopNotificationAction;
  businessId: string | null;
  notificationId: string;
}): void => {
  const hasBusinessId = typeof input.businessId === 'string' && /^-?[1-9][0-9]{0,18}$/.test(input.businessId);
  const hasNotificationId = /^-?[1-9][0-9]{0,18}$/.test(input.notificationId);
  let route: string | undefined;
  switch (input.action) {
    case 'OPEN_SUPPLY_DEMAND':
      route = '/enterprise/supply-demand';
      break;
    case 'OPEN_PROJECT':
      route = hasBusinessId ? `/enterprise/projects/${input.businessId}` : undefined;
      break;
    case 'OPEN_COMPANY':
      route = hasBusinessId ? `/enterprise/companies/${input.businessId}` : undefined;
      break;
    case 'OPEN_PRODUCT':
      route = hasBusinessId ? `/enterprise/products/${input.businessId}` : undefined;
      break;
    case 'OPEN_MEMBERSHIP':
      route = '/enterprise/dashboard';
      break;
    case 'OPEN_CUSTOMER_SERVICE':
      route = hasBusinessId ? `/enterprise/customer-service?conversationId=${input.businessId}` : undefined;
      break;
    case 'OPEN_VERSION_UPDATE':
      route = '/enterprise/version-update';
      break;
    case 'OPEN_NOTIFICATION_DETAIL':
      route = hasNotificationId ? `/enterprise/notifications?notificationId=${input.notificationId}` : undefined;
      break;
    default:
      route = undefined;
  }
  if (!route) return;
  const window = showAndFocusMainWindow();
  window?.webContents.send(DESKTOP_NOTIFICATION_NAVIGATE_CHANNEL, { route });
};

const getRealtimeServiceUnread = (): { count: number; labelKey: string } => {
  const count = customerServiceUnreadCount + customerConsultationUnreadCount + desktopNotificationUnreadCount;
  if (desktopNotificationUnreadCount > 0) return { count, labelKey: 'enterprise.notifications.title' };
  if (customerConsultationUnreadCount > 0) return { count, labelKey: 'enterprise.consultation.title' };
  return { count, labelKey: 'enterprise.customerService.title' };
};

export const setTrayMainWindow = (win: BrowserWindow, createWindow?: () => void): void => {
  mainWindowRef = win;
  if (createWindow) {
    createMainWindowRef = createWindow;
  }
};

export const getCloseToTrayEnabled = (): boolean => closeToTrayEnabled;

export const setCloseToTrayEnabled = (enabled: boolean): void => {
  closeToTrayEnabled = enabled;
};

export const getIsQuitting = (): boolean => isQuitting;

export const setIsQuitting = (quitting: boolean): void => {
  isQuitting = quitting;
};

/**
 * Get tray icon.
 * macOS uses Template image to adapt to dark/light menu bar.
 */
const getTrayIcon = (): Electron.NativeImage => {
  const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(process.cwd(), 'resources');
  const icon = nativeImage.createFromPath(path.join(resourcesPath, 'app.png'));
  if (process.platform === 'darwin') {
    return icon.resize({ width: 16, height: 16 });
  }
  return icon.resize({ width: 32, height: 32 });
};

/**
 * Build tray context menu (async to support dynamic content).
 */
const buildTrayContextMenu = async (): Promise<Electron.Menu> => {
  const getRecentConversations = async (): Promise<Array<{ id: string; title: string }>> => {
    try {
      const result = await ipcBridge.database.getUserConversations.invoke({ limit: 5 });
      return (result.items || []).slice(0, 5).map((conv) => ({
        id: conv.id,
        title: conv.name || i18n.t('common.tray.untitled'),
      }));
    } catch {
      return [];
    }
  };

  const getRunningTasksCount = (): number => cachedActiveCount;

  const recentConversations = await getRecentConversations();
  const runningTasksCount = getRunningTasksCount();

  const hideToTray = () => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.hide();
      if (process.platform === 'darwin' && app.dock) {
        void app.dock.hide();
      }
    }
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: i18n.t('common.tray.showWindow'),
      click: showAndFocusMainWindow,
    },
    {
      label: i18n.t('common.tray.closeToTray'),
      click: hideToTray,
    },
    { type: 'separator' },
    {
      label: i18n.t('common.tray.newChat'),
      click: () => {
        showAndFocusMainWindow();
        mainWindowRef?.webContents.send('tray:navigate-to-guid');
      },
    },
  ];

  if (recentConversations.length > 0) {
    template.push({ type: 'separator' });
    template.push({
      label: i18n.t('common.tray.recentChats'),
      enabled: false,
    });
    for (const conv of recentConversations) {
      const displayTitle = conv.title.length > 20 ? conv.title.slice(0, 20) + '...' : conv.title;
      template.push({
        label: displayTitle,
        click: () => {
          showAndFocusMainWindow();
          mainWindowRef?.webContents.send('tray:navigate-to-conversation', {
            conversation_id: conv.id,
          });
        },
      });
    }
  }

  template.push({ type: 'separator' });
  const realtimeUnread = getRealtimeServiceUnread();
  template.push({
    label: `${i18n.t(realtimeUnread.labelKey)}: ${realtimeUnread.count}`,
    enabled: false,
  });
  template.push({
    label: `${i18n.t('common.tray.runningTasks')}: ${runningTasksCount}`,
    enabled: false,
  });
  template.push({
    label: i18n.t('common.tray.pauseAll'),
    click: () => {
      showAndFocusMainWindow();
      mainWindowRef?.webContents.send('tray:pause-all-tasks');
    },
  });

  template.push({ type: 'separator' });
  template.push({
    label: `🐾 ${i18n.t('pet.desktopPet')}`,
    submenu: [
      {
        label: i18n.t('pet.showHide'),
        click: async () => {
          try {
            const petManager = await import('../pet/petManager');
            // Toggle: if pet windows exist, hide; otherwise show/create
            petManager.showPetWindow();
          } catch {
            /* pet not available */
          }
        },
      },
      { type: 'separator' as const },
      {
        label: i18n.t('pet.sizeSmall', { px: 200 }),
        click: async () => {
          try {
            const { resizePetWindow } = await import('../pet/petManager');
            resizePetWindow(200);
          } catch {
            /* ignore */
          }
        },
      },
      {
        label: i18n.t('pet.sizeMedium', { px: 280 }),
        click: async () => {
          try {
            const { resizePetWindow } = await import('../pet/petManager');
            resizePetWindow(280);
          } catch {
            /* ignore */
          }
        },
      },
      {
        label: i18n.t('pet.sizeLarge', { px: 360 }),
        click: async () => {
          try {
            const { resizePetWindow } = await import('../pet/petManager');
            resizePetWindow(360);
          } catch {
            /* ignore */
          }
        },
      },
    ],
  });
  template.push({ type: 'separator' });
  template.push({
    label: i18n.t('common.tray.checkUpdate'),
    click: () => {
      showAndFocusMainWindow();
      mainWindowRef?.webContents.send(DESKTOP_NOTIFICATION_NAVIGATE_CHANNEL, { route: '/enterprise/version-update' });
    },
  });
  template.push({ type: 'separator' });
  template.push({
    label: i18n.t('common.tray.about'),
    click: () => {
      showAndFocusMainWindow();
      mainWindowRef?.webContents.send('tray:open-about');
    },
  });
  template.push({
    label: i18n.t('common.tray.restart'),
    click: () => {
      isQuitting = true;
      app.relaunch();
      app.exit(0);
    },
  });
  template.push({ type: 'separator' });
  template.push({
    label: i18n.t('common.tray.quit'),
    click: () => {
      isQuitting = true;
      app.quit();
    },
  });

  return Menu.buildFromTemplate(template);
};

/**
 * Create system tray (idempotent — no-op if already exists).
 */
export const createOrUpdateTray = (): void => {
  if (tray) {
    return;
  }
  try {
    const icon = getTrayIcon();
    tray = new Tray(icon);
    updateTrayPresentation();
    void buildTrayContextMenu().then((menu) => tray?.setContextMenu(menu));

    // A single click is the most discoverable restore gesture on Windows and
    // Linux. Keep double-click support for users accustomed to that gesture.
    tray.on('click', () => {
      showAndFocusMainWindow();
    });

    tray.on('double-click', () => {
      showAndFocusMainWindow();
    });

    tray.on('right-click', () => {
      void buildTrayContextMenu().then((menu) => tray?.setContextMenu(menu));
    });

    void fetchActiveCountAndMaybeRebuild();
  } catch (err) {
    console.error('[Tray] Failed to create tray:', err);
  }
};

/**
 * Rebuild tray menu with current cached state (synchronous wrapper).
 */
const rebuildTrayMenu = (): void => {
  if (!tray) return;
  void buildTrayContextMenu().then((menu) => tray?.setContextMenu(menu));
};

const updateTrayPresentation = (): void => {
  if (!tray) return;
  const realtimeUnread = getRealtimeServiceUnread();
  const unreadLabel = `${i18n.t(realtimeUnread.labelKey)}: ${realtimeUnread.count}`;
  tray.setToolTip(realtimeUnread.count > 0 ? `${DESKTOP_PRODUCT_NAME} · ${unreadLabel}` : DESKTOP_PRODUCT_NAME);
  if (process.platform === 'darwin') tray.setTitle(realtimeUnread.count > 0 ? String(realtimeUnread.count) : '');
};

/** Updates the existing tray in place; creating or recreating the Tray is deliberately avoided. */
export const setCustomerServiceUnreadCount = (count: number): void => {
  const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  if (normalizedCount === customerServiceUnreadCount) return;
  customerServiceUnreadCount = normalizedCount;
  updateTrayPresentation();
  rebuildTrayMenu();
};

/** Updates the customer-side unread source without mixing it with staff queue counts. */
export const setCustomerConsultationUnreadCount = (count: number): void => {
  const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  if (normalizedCount === customerConsultationUnreadCount) return;
  customerConsultationUnreadCount = normalizedCount;
  updateTrayPresentation();
  rebuildTrayMenu();
};

/** Adds the notification-center unread source without merging it into customer-service queue state. */
export const setDesktopNotificationUnreadCount = (count: number): void => {
  const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  if (normalizedCount === desktopNotificationUnreadCount) return;
  desktopNotificationUnreadCount = normalizedCount;
  updateTrayPresentation();
  rebuildTrayMenu();
};

/**
 * Fetch active count from backend, update cache if changed, and rebuild menu.
 */
const fetchActiveCountAndMaybeRebuild = async (): Promise<void> => {
  try {
    const { count } = await ipcBridge.conversation.activeCount.invoke();
    if (count !== cachedActiveCount) {
      cachedActiveCount = count;
      rebuildTrayMenu();
    }
  } catch {
    // Keep last cached value on error
  }
};

/**
 * Refresh tray context menu labels (called on language change).
 * Immediately rebuilds with current cache, then fetches latest count.
 */
export const refreshTrayMenu = async (): Promise<void> => {
  rebuildTrayMenu();
  await fetchActiveCountAndMaybeRebuild();
};

/**
 * Destroy system tray.
 */
export const destroyTray = (): void => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
};
