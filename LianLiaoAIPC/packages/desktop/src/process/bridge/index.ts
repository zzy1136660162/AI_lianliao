/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { initApplicationBridge } from './applicationBridge';
import { initDialogBridge } from './dialogBridge';
import { initUpdateBridge } from './updateBridge';
import { initSystemSettingsBridge } from './systemSettingsBridge';
import { initWindowControlsBridge } from './windowControlsBridge';
import { initNotificationBridge } from './notificationBridge';
import { initWebuiBridge } from './webuiBridge';
import { initThemeBridge } from './themeBridge';
import {
  initCustomerConsultationBridge,
  initCustomerServiceBridge,
  initDesktopNotificationBridge,
  initDesktopManagedAiModelBridge,
  initDesktopVersionBridge,
  initEnterpriseBridge,
  type CustomerConsultationBridgeDependencies,
  type CustomerServiceBridgeDependencies,
  type DesktopNotificationBridgeDependencies,
  type DesktopManagedAiModelBridgeDependencies,
  type DesktopVersionBridgeDependencies,
  type EnterpriseBridgeDependencies,
} from './enterpriseBridge';

export type BridgeDependencies = {
  customerConsultation?: CustomerConsultationBridgeDependencies;
  customerService?: CustomerServiceBridgeDependencies;
  desktopNotification?: DesktopNotificationBridgeDependencies;
  desktopManagedAiModel?: DesktopManagedAiModelBridgeDependencies;
  desktopVersion?: DesktopVersionBridgeDependencies;
  enterprise?: EnterpriseBridgeDependencies;
};

export function initAllBridges(deps: BridgeDependencies = {}): void {
  initDialogBridge();
  initApplicationBridge();
  initWindowControlsBridge();
  initUpdateBridge();
  initSystemSettingsBridge();
  initNotificationBridge();
  initWebuiBridge();
  initThemeBridge();
  initEnterpriseBridge(deps.enterprise);
  initCustomerServiceBridge(deps.customerService);
  initCustomerConsultationBridge(deps.customerConsultation);
  initDesktopNotificationBridge(deps.desktopNotification);
  initDesktopManagedAiModelBridge(deps.desktopManagedAiModel);
  initDesktopVersionBridge(deps.desktopVersion);
}

export {
  initApplicationBridge,
  initDialogBridge,
  initNotificationBridge,
  initSystemSettingsBridge,
  initThemeBridge,
  initUpdateBridge,
  initWindowControlsBridge,
  initWebuiBridge,
  initCustomerConsultationBridge,
  initCustomerServiceBridge,
  initDesktopNotificationBridge,
  initDesktopManagedAiModelBridge,
  initDesktopVersionBridge,
  initEnterpriseBridge,
};
export { registerWindowMaximizeListeners } from './windowControlsBridge';
export const disposeAllTeamSessions = (): Promise<void> => Promise.resolve();
