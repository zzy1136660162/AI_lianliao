import type {
  DesktopNotificationChangedResult,
  DesktopNotificationConnectionSnapshot,
  DesktopNotificationFailureCode,
  DesktopNotificationInboxItem,
  DesktopNotificationListRequest,
  DesktopNotificationMarkAllReadResult,
  DesktopNotificationPage,
  DesktopNotificationServerEnvelope,
  DesktopNotificationUnreadCount,
  DesktopNotificationWebSocketTicket,
} from '@/common/enterprise/desktop-notification/contracts';

import type { EnterpriseSessionEvents } from '../enterpriseSessionEvents';
import { enterpriseSessionEvents } from '../enterpriseSessionEvents';
import {
  DesktopNotificationApiClient,
  DesktopNotificationApiError,
  resolveDesktopNotificationApiClientOptions,
} from './desktopNotificationApiClient';
import { DesktopNotificationSocketClient } from './desktopNotificationSocketClient';

const MAX_TRACKED_NOTIFICATION_IDS = 2_000;

export type DesktopNotificationGatewaySessionStore = {
  loadOpenId: () => Promise<string | null>;
};

export type DesktopNotificationGatewayApiClient = {
  issueWebSocketTicket: (openId: string) => Promise<DesktopNotificationWebSocketTicket>;
  list: (openId: string, request: DesktopNotificationListRequest) => Promise<DesktopNotificationPage>;
  getUnreadCount: (openId: string) => Promise<DesktopNotificationUnreadCount>;
  markRead: (openId: string, notificationId: string) => Promise<DesktopNotificationChangedResult>;
  markAllRead: (openId: string) => Promise<DesktopNotificationMarkAllReadResult>;
  acknowledgeDelivery: (openId: string, notificationId: string) => Promise<DesktopNotificationChangedResult>;
  markDesktopNotified: (openId: string, notificationId: string) => Promise<DesktopNotificationChangedResult>;
  reportDeliveryFailure: (
    openId: string,
    notificationId: string,
    failureCode: DesktopNotificationFailureCode
  ) => Promise<DesktopNotificationChangedResult>;
};

export type DesktopNotificationGatewaySocketClient = {
  connect: () => Promise<void>;
  disconnect: () => void;
  subscribe: (listener: (event: DesktopNotificationServerEnvelope) => void) => () => void;
  getSnapshot?: (unreadCount?: number) => DesktopNotificationConnectionSnapshot;
};

export type DesktopNotificationGatewayDesktopIntegration = {
  /** True only when an operating-system notification should interrupt the user. */
  shouldNotify: () => boolean;
  /** Uses a safe action mapping; renderer code never selects a native notification destination. */
  showNotification: (input: { notification: DesktopNotificationInboxItem }) => boolean | Promise<boolean>;
  /** Keeps tray badge state derived from this gateway's unread source of truth. */
  setUnreadCount: (count: number) => void;
};

export type DesktopNotificationGatewayOptions = {
  sessionStore: DesktopNotificationGatewaySessionStore;
  apiClient?: DesktopNotificationGatewayApiClient;
  socketClient?: DesktopNotificationGatewaySocketClient;
  sessionEvents?: EnterpriseSessionEvents;
  desktopIntegration?: DesktopNotificationGatewayDesktopIntegration;
  isPackaged?: boolean;
};

export type DesktopNotificationGatewayEventListener = (event: DesktopNotificationServerEnvelope) => void;

/**
 * Trusted main-process notification facade. It owns OpenID reads, one-time tickets,
 * socket reconnects, unread state and delivery acknowledgements outside the renderer.
 */
export class DesktopNotificationGateway {
  private readonly sessionStore: DesktopNotificationGatewaySessionStore;
  private readonly apiClient: DesktopNotificationGatewayApiClient;
  private readonly socketClient: DesktopNotificationGatewaySocketClient;
  private readonly desktopIntegration?: DesktopNotificationGatewayDesktopIntegration;
  private readonly listeners = new Set<DesktopNotificationGatewayEventListener>();
  private readonly trackedNotificationIds = new Set<string>();
  private readonly trackedNotificationIdOrder: string[] = [];
  private readonly unsubscribeSocket: () => void;
  private readonly unsubscribeSessionCleared: () => void;

  private unreadCount = 0;

  constructor(options: DesktopNotificationGatewayOptions) {
    this.sessionStore = options.sessionStore;
    this.desktopIntegration = options.desktopIntegration;
    const apiOptions = resolveDesktopNotificationApiClientOptions(options.isPackaged ?? false);
    this.apiClient = options.apiClient ?? new DesktopNotificationApiClient(apiOptions);
    this.socketClient =
      options.socketClient ??
      new DesktopNotificationSocketClient({
        baseUrl: apiOptions.baseUrl as string,
        ticketProvider: async () => this.withOpenId((openId) => this.apiClient.issueWebSocketTicket(openId)),
      });
    const events = options.sessionEvents ?? enterpriseSessionEvents;
    this.unsubscribeSocket = this.socketClient.subscribe((event) => this.handleServerEvent(event));
    this.unsubscribeSessionCleared = events.subscribeCleared(() => this.clearForEnterpriseLogout());
    this.publishUnreadCount();
  }

  async connect(): Promise<DesktopNotificationConnectionSnapshot> {
    const openId = await this.requireOpenId();
    await this.socketClient.connect();
    await this.refreshUnreadCount(openId);
    return this.currentSnapshot('CONNECTING');
  }

  async disconnect(): Promise<void> {
    this.socketClient.disconnect();
  }

  list(request: DesktopNotificationListRequest): Promise<DesktopNotificationPage> {
    return this.withOpenId((openId) => this.apiClient.list(openId, request));
  }

  getUnreadCount(): Promise<DesktopNotificationUnreadCount> {
    return this.withOpenId(async (openId) => {
      await this.refreshUnreadCount(openId);
      return { unreadCount: this.unreadCount };
    });
  }

  markRead(notificationId: string): Promise<DesktopNotificationChangedResult> {
    return this.withOpenId(async (openId) => {
      const result = await this.apiClient.markRead(openId, notificationId);
      if (result.changed) this.setUnreadCount(Math.max(0, this.unreadCount - 1));
      return result;
    });
  }

  markAllRead(): Promise<DesktopNotificationMarkAllReadResult> {
    return this.withOpenId(async (openId) => {
      const result = await this.apiClient.markAllRead(openId);
      if (result.changedCount > 0) this.setUnreadCount(0);
      return result;
    });
  }

  subscribe(listener: DesktopNotificationGatewayEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.clearForEnterpriseLogout();
    this.unsubscribeSocket();
    this.unsubscribeSessionCleared();
    this.listeners.clear();
  }

  private async withOpenId<T>(operation: (openId: string) => Promise<T>): Promise<T> {
    return operation(await this.requireOpenId());
  }

  private async requireOpenId(): Promise<string> {
    const openId = await this.sessionStore.loadOpenId();
    if (typeof openId !== 'string') throw new DesktopNotificationApiError('MISSING_ENTERPRISE_SESSION', 401);
    const normalized = openId.trim();
    if (!normalized || normalized.length > 256 || /\p{C}/u.test(normalized)) {
      throw new DesktopNotificationApiError('MISSING_ENTERPRISE_SESSION', 401);
    }
    return normalized;
  }

  private handleServerEvent(event: DesktopNotificationServerEnvelope): void {
    if (event.event === 'notification.created') {
      void this.handleNotificationCreated(event).catch((): undefined => undefined);
      return;
    } else if (event.event === 'notification.badge') {
      const payload = event.payload as DesktopNotificationUnreadCount;
      this.setUnreadCount(payload.unreadCount);
    } else if (event.event === 'notification.read') {
      void this.getUnreadCount().catch((): undefined => undefined);
    }

    this.emitToListeners(event);
  }

  private async handleNotificationCreated(event: DesktopNotificationServerEnvelope): Promise<void> {
    const notification = event.payload as DesktopNotificationInboxItem;
    if (!this.trackNotification(notification.notificationId)) return;
    const openId = await this.requireOpenId();

    if (notification.contentType !== 'TEXT') {
      await this.apiClient.reportDeliveryFailure(openId, notification.notificationId, 'UNSUPPORTED_CONTENT');
      return;
    }

    await this.apiClient.acknowledgeDelivery(openId, notification.notificationId);
    this.setUnreadCount(this.unreadCount + 1);
    this.emitToListeners(event);

    if (await this.showDesktopNotification(notification)) {
      await this.apiClient.markDesktopNotified(openId, notification.notificationId);
    }
  }

  private emitToListeners(event: DesktopNotificationServerEnvelope): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Renderer subscribers cannot interfere with OpenID or socket ownership.
      }
    }
  }

  private async refreshUnreadCount(openId: string): Promise<void> {
    const result = await this.apiClient.getUnreadCount(openId);
    this.setUnreadCount(result.unreadCount);
  }

  private setUnreadCount(count: number): void {
    const normalized = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
    if (normalized === this.unreadCount) return;
    this.unreadCount = normalized;
    this.publishUnreadCount();
  }

  private publishUnreadCount(): void {
    try {
      this.desktopIntegration?.setUnreadCount(this.unreadCount);
    } catch {
      // Failure to paint a tray badge must not interrupt notification delivery.
    }
  }

  private async showDesktopNotification(notification: DesktopNotificationInboxItem): Promise<boolean> {
    if (!this.desktopIntegration) return false;
    try {
      if (this.desktopIntegration.shouldNotify()) {
        return await this.desktopIntegration.showNotification({ notification });
      }
    } catch {
      // Native notification failures are isolated from persisted inbox delivery.
    }
    return false;
  }

  private currentSnapshot(
    fallbackState: DesktopNotificationConnectionSnapshot['state']
  ): DesktopNotificationConnectionSnapshot {
    return (
      this.socketClient.getSnapshot?.(this.unreadCount) ?? {
        state: fallbackState,
        reconnectAttempt: 0,
        unreadCount: this.unreadCount,
      }
    );
  }

  private clearForEnterpriseLogout(): void {
    this.unreadCount = 0;
    this.trackedNotificationIds.clear();
    this.trackedNotificationIdOrder.length = 0;
    this.publishUnreadCount();
    this.socketClient.disconnect();
  }

  private trackNotification(notificationId: string): boolean {
    if (this.trackedNotificationIds.has(notificationId)) return false;
    this.trackedNotificationIds.add(notificationId);
    this.trackedNotificationIdOrder.push(notificationId);
    if (this.trackedNotificationIdOrder.length > MAX_TRACKED_NOTIFICATION_IDS) {
      const oldest = this.trackedNotificationIdOrder.shift();
      if (oldest) this.trackedNotificationIds.delete(oldest);
    }
    return true;
  }
}
