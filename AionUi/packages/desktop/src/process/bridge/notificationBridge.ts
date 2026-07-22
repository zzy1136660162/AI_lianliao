/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * System Notification Module
 *
 * Provides showNotification() for direct use in main process,
 * and registers an IPC provider so renderer can invoke it cross-process.
 */

import { getPlatformServices } from '@/common/platform';
import { ipcBridge } from '@/common';
import { signedBusinessIdSchema } from '@/common/enterprise/customer-service/schemas';
import type { DesktopNotificationAction } from '@/common/enterprise/desktop-notification/contracts';
import { desktopNotificationNativeTargetSchema } from '@/common/enterprise/desktop-notification/schemas';
import { ProcessConfig } from '@process/utils/initStorage';
import {
  openCustomerConsultation,
  openCustomerServiceConversation,
  openDesktopNotification,
} from '@process/utils/tray';
import path from 'path';
import fs from 'fs';

export type MainProcessNotificationOptions = {
  title: string;
  body: string;
  conversation_id?: string;
  customer_service_conversation_id?: string;
  customer_consultation?: boolean;
  /** Trusted main-process target for a business notification. It is never accepted from renderer IPC. */
  desktop_notification?: {
    action: DesktopNotificationAction;
    businessId: string | null;
    notificationId: string;
  };
};

/**
 * Get app icon path for notifications
 */
const getNotificationIcon = (): string | undefined => {
  try {
    const resourcesPath = getPlatformServices().paths.isPackaged()
      ? process.resourcesPath
      : path.join(process.cwd(), 'resources');
    const iconPath = path.join(resourcesPath, 'app.png');
    if (fs.existsSync(iconPath)) {
      return iconPath;
    }
  } catch {
    // Ignore icon error, notification will still show
  }
  return undefined;
};

/**
 * Show a system notification.
 * Can be called directly from main process or via IPC from renderer.
 * In non-Electron mode this is a no-op (NodePlatformServices.notification.send is a no-op).
 */
export async function showNotification({
  title,
  body,
  conversation_id,
  customer_service_conversation_id,
  customer_consultation,
  desktop_notification,
}: MainProcessNotificationOptions): Promise<boolean> {
  // Check if notification is enabled
  const notificationEnabled = await ProcessConfig.get('system.notificationEnabled');
  if (notificationEnabled === false) {
    return false;
  }

  const iconPath = getNotificationIcon();
  const customerServiceConversationId = signedBusinessIdSchema.safeParse(customer_service_conversation_id);
  const desktopNotificationTarget = desktopNotificationNativeTargetSchema.safeParse(desktop_notification);
  const onClick =
    customer_consultation === true
      ? (): void => openCustomerConsultation()
      : customerServiceConversationId.success
        ? (): void => openCustomerServiceConversation(customerServiceConversationId.data)
        : desktopNotificationTarget.success && desktopNotificationTarget.data.action !== undefined
          ? (): void =>
              openDesktopNotification({
                action: desktopNotificationTarget.data.action,
                businessId: desktopNotificationTarget.data.businessId ?? null,
                notificationId: desktopNotificationTarget.data.notificationId,
              })
          : conversation_id
            ? (): void => ipcBridge.notification.clicked.emit({ conversation_id })
            : undefined;

  try {
    getPlatformServices().notification.send({ title, body, icon: iconPath, onClick });
    return true;
  } catch (error) {
    console.error('[Notification] Error creating notification:', error);
    return false;
  }
}

/**
 * Register IPC provider so renderer can trigger notifications cross-process.
 */
export function initNotificationBridge(): void {
  ipcBridge.notification.show.provider(async (options) => {
    await showNotification(options);
  });
}
