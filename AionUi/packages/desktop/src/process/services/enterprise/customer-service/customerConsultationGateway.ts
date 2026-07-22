import { randomUUID } from 'node:crypto';

import type {
  CustomerServiceAuthSession,
  CustomerServiceCloseRequest,
  CustomerServiceConnectionSnapshot,
  CustomerServiceConversation,
  CustomerServiceConversationIdRequest,
  CustomerServiceImage,
  CustomerServiceMarkReadRequest,
  CustomerServiceMessage,
  CustomerServiceMessageHistoryRequest,
  CustomerServicePage,
  CustomerServiceReadResult,
  CustomerServiceSendMessageRequest,
  CustomerServiceServerEnvelope,
  CustomerServiceUploadImageRequest,
  CustomerServiceWebSocketTicket,
} from '@/common/enterprise/customer-service/contracts';

import type { EnterpriseSessionEvents } from '../enterpriseSessionEvents';
import { enterpriseSessionEvents } from '../enterpriseSessionEvents';
import {
  CustomerServiceApiClient,
  CustomerServiceApiError,
  resolveCustomerServiceApiClientOptions,
} from './customerServiceApiClient';
import { CustomerServiceSocketClient } from './customerServiceSocketClient';

const CREDENTIAL_REFRESH_SKEW_MS = 30_000;
const MAX_TRACKED_STAFF_MESSAGE_IDS = 2_000;
const CONVERSATION_SCOPED_EVENTS = new Set([
  'conversation.snapshot',
  'message.ack',
  'message.created',
  'read.updated',
  'conversation.assigned',
  'conversation.transferred',
  'conversation.closed',
]);

export type CustomerConsultationGatewaySessionStore = {
  loadOpenId: () => Promise<string | null>;
};

/** API surface intentionally excludes every staff-only operation. */
export type CustomerConsultationGatewayApiClient = {
  authenticateCustomer: (openId: string) => Promise<CustomerServiceAuthSession>;
  openConversation: (accessToken: string) => Promise<CustomerServiceConversation>;
  getConversation: (
    accessToken: string,
    request: CustomerServiceConversationIdRequest
  ) => Promise<CustomerServiceConversation>;
  getHistory: (
    accessToken: string,
    request: CustomerServiceMessageHistoryRequest
  ) => Promise<CustomerServicePage<CustomerServiceMessage>>;
  markRead: (accessToken: string, request: CustomerServiceMarkReadRequest) => Promise<CustomerServiceReadResult>;
  uploadImage: (accessToken: string, request: CustomerServiceUploadImageRequest) => Promise<CustomerServiceImage>;
  closeConversation: (
    accessToken: string,
    request: CustomerServiceCloseRequest
  ) => Promise<CustomerServiceConversation>;
  issueWebSocketTicket: (accessToken: string) => Promise<CustomerServiceWebSocketTicket>;
};

export type CustomerConsultationGatewaySocketClient = {
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (request: CustomerServiceSendMessageRequest) => string;
  subscribe: (listener: (event: CustomerServiceServerEnvelope) => void) => () => void;
  subscribeState?: (listener: (snapshot: CustomerServiceConnectionSnapshot) => void) => () => void;
  getSnapshot?: (unreadCount?: number) => CustomerServiceConnectionSnapshot;
};

export type CustomerConsultationGatewayDesktopIntegration = {
  shouldNotify: () => boolean;
  showMessageNotification: (input: { message: CustomerServiceMessage }) => void | Promise<void>;
  setUnreadCount: (count: number) => void;
};

export type CustomerConsultationGatewayOptions = {
  sessionStore: CustomerConsultationGatewaySessionStore;
  apiClient?: CustomerConsultationGatewayApiClient;
  socketClient?: CustomerConsultationGatewaySocketClient;
  sessionEvents?: EnterpriseSessionEvents;
  desktopIntegration?: CustomerConsultationGatewayDesktopIntegration;
  isPackaged?: boolean;
};

/**
 * Main-process customer facade. Authentication secrets and the current
 * conversation boundary never cross into preload or renderer code.
 */
export class CustomerConsultationGateway {
  private readonly sessionStore: CustomerConsultationGatewaySessionStore;
  private readonly apiClient: CustomerConsultationGatewayApiClient;
  private readonly socketClient: CustomerConsultationGatewaySocketClient;
  private readonly desktopIntegration?: CustomerConsultationGatewayDesktopIntegration;
  private readonly listeners = new Set<(event: CustomerServiceServerEnvelope) => void>();
  private readonly trackedStaffMessageIds = new Set<string>();
  private readonly trackedStaffMessageIdOrder: string[] = [];
  private readonly unsubscribeSocket: () => void;
  private readonly unsubscribeSocketState: () => void;
  private readonly unsubscribeSessionCleared: () => void;

  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private authenticationPromise: Promise<string> | null = null;
  private openingPromise: Promise<CustomerServiceConversation> | null = null;
  private currentConversation: CustomerServiceConversation | null = null;
  private credentialRevision = 0;
  /** Changes only when the enterprise identity is cleared, not during a token refresh. */
  private sessionGeneration = 0;
  private unreadCount = 0;
  private staffMessageSequence = 0;
  private nextReadRequestSequence = 0;
  private lastAppliedReadRequestSequence = 0;

  constructor(options: CustomerConsultationGatewayOptions) {
    this.sessionStore = options.sessionStore;
    this.desktopIntegration = options.desktopIntegration;
    const apiOptions = resolveCustomerServiceApiClientOptions(options.isPackaged ?? false);
    this.apiClient = options.apiClient ?? new CustomerServiceApiClient(apiOptions);
    this.socketClient =
      options.socketClient ??
      new CustomerServiceSocketClient({
        baseUrl: apiOptions.baseUrl as string,
        ticketProvider: () => this.withAuthorization((token) => this.apiClient.issueWebSocketTicket(token)),
      });
    const events = options.sessionEvents ?? enterpriseSessionEvents;
    this.unsubscribeSocket = this.socketClient.subscribe((event) => this.handleServerEvent(event));
    this.unsubscribeSocketState =
      this.socketClient.subscribeState?.((snapshot) => {
        this.broadcastEvent({
          event: 'connection.state',
          eventId: randomUUID(),
          conversationId: null,
          serverTime: Date.now(),
          payload: { ...snapshot, unreadCount: this.unreadCount },
        });
      }) ?? (() => undefined);
    this.unsubscribeSessionCleared = events.subscribeCleared(() => this.clearForEnterpriseLogout());
    this.publishUnreadCount();
  }

  async connect(): Promise<CustomerServiceConnectionSnapshot> {
    const generation = this.sessionGeneration;
    await this.requireAccessToken();
    this.assertCurrentSession(generation);
    await this.socketClient.connect();
    if (generation !== this.sessionGeneration) {
      // A slow socket handshake may finish after logout. Tear it back down so
      // it cannot deliver events or reconnect under the next enterprise user.
      this.socketClient.disconnect();
      this.assertCurrentSession(generation);
    }
    return this.currentSnapshot('CONNECTED');
  }

  async disconnect(): Promise<void> {
    this.socketClient.disconnect();
  }

  /** Coalesces duplicate page initialization and resumes an active server-side conversation. */
  openConversation(): Promise<CustomerServiceConversation> {
    // Route re-entry must preserve the last closed transcript. Creating a new
    // conversation is an explicit user action handled by startConversation().
    if (this.currentConversation) return Promise.resolve(this.currentConversation);
    return this.requestConversation();
  }

  /** Creates the next conversation only after the customer explicitly requests it. */
  startConversation(): Promise<CustomerServiceConversation> {
    if (this.currentConversation && this.currentConversation.status !== 'CLOSED') {
      return Promise.resolve(this.currentConversation);
    }
    return this.requestConversation();
  }

  private requestConversation(): Promise<CustomerServiceConversation> {
    if (this.openingPromise) return this.openingPromise;

    const generation = this.sessionGeneration;
    const opening = this.withAuthorization((token) => this.apiClient.openConversation(token)).then((conversation) => {
      this.assertCurrentSession(generation);
      this.currentConversation = conversation;
      return conversation;
    });
    this.openingPromise = opening;
    void opening
      .finally(() => {
        if (this.openingPromise === opening) this.openingPromise = null;
      })
      .catch((): undefined => undefined);
    return opening;
  }

  async getConversation(request: CustomerServiceConversationIdRequest): Promise<CustomerServiceConversation> {
    const generation = this.sessionGeneration;
    this.assertCurrentConversation(request.conversationId);
    const conversation = await this.withAuthorization((token) => this.apiClient.getConversation(token, request));
    this.assertCurrentSession(generation);
    this.currentConversation = conversation;
    return conversation;
  }

  async getHistory(
    request: CustomerServiceMessageHistoryRequest
  ): Promise<CustomerServicePage<CustomerServiceMessage>> {
    this.assertCurrentConversation(request.conversationId);
    return await this.withAuthorization((token) => this.apiClient.getHistory(token, request));
  }

  sendMessage(request: CustomerServiceSendMessageRequest): string {
    this.assertCurrentConversation(request.conversationId);
    return this.socketClient.sendMessage(request);
  }

  async markRead(request: CustomerServiceMarkReadRequest): Promise<CustomerServiceReadResult> {
    const generation = this.sessionGeneration;
    this.assertCurrentConversation(request.conversationId);
    const readRequestSequence = ++this.nextReadRequestSequence;
    const messageSequenceAtStart = this.staffMessageSequence;
    const result = await this.withAuthorization((token) => this.apiClient.markRead(token, request));
    this.assertCurrentSession(generation);
    // Ignore an older response that completes after a newer read request. The
    // message sequence preserves replies that arrived after this request began.
    if (readRequestSequence < this.lastAppliedReadRequestSequence) return result;
    this.lastAppliedReadRequestSequence = readRequestSequence;
    this.unreadCount = Math.max(0, this.staffMessageSequence - messageSequenceAtStart);
    this.publishUnreadCount();
    return result;
  }

  async uploadImage(request: CustomerServiceUploadImageRequest): Promise<CustomerServiceImage> {
    this.assertCurrentConversation(request.conversationId);
    return await this.withAuthorization((token) => this.apiClient.uploadImage(token, request));
  }

  async closeConversation(request: CustomerServiceCloseRequest): Promise<CustomerServiceConversation> {
    const generation = this.sessionGeneration;
    this.assertCurrentConversation(request.conversationId);
    const conversation = await this.withAuthorization((token) => this.apiClient.closeConversation(token, request));
    this.assertCurrentSession(generation);
    this.currentConversation = conversation;
    this.unreadCount = 0;
    this.invalidatePendingReads();
    this.publishUnreadCount();
    return conversation;
  }

  subscribe(listener: (event: CustomerServiceServerEnvelope) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.clearForEnterpriseLogout();
    this.unsubscribeSocket();
    this.unsubscribeSocketState();
    this.unsubscribeSessionCleared();
    this.listeners.clear();
  }

  private async withAuthorization<T>(operation: (accessToken: string) => Promise<T>): Promise<T> {
    const generation = this.sessionGeneration;
    const initialToken = await this.requireAccessToken();
    this.assertCurrentSession(generation);
    try {
      const result = await operation(initialToken);
      this.assertCurrentSession(generation);
      return result;
    } catch (error) {
      this.assertCurrentSession(generation);
      if (!this.isUnauthorized(error)) throw error;
      if (this.accessToken === initialToken) this.invalidateCredentials();
      const refreshedToken = await this.requireAccessToken();
      this.assertCurrentSession(generation);
      const result = await operation(refreshedToken);
      this.assertCurrentSession(generation);
      return result;
    }
  }

  private requireAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() + CREDENTIAL_REFRESH_SKEW_MS < this.accessTokenExpiresAt) {
      return Promise.resolve(this.accessToken);
    }
    if (this.authenticationPromise) return this.authenticationPromise;

    const revision = this.credentialRevision;
    const authentication = (async (): Promise<string> => {
      const openId = await this.sessionStore.loadOpenId();
      if (!openId) throw new CustomerServiceApiError('MISSING_ENTERPRISE_SESSION', 401);
      const session = await this.apiClient.authenticateCustomer(openId);
      if (revision !== this.credentialRevision) throw new CustomerServiceApiError('AUTHENTICATION_CANCELLED', 401);
      if (session.principal.type !== 'CUSTOMER' || !session.principal.userId) {
        throw new CustomerServiceApiError('FORBIDDEN_CUSTOMER', 403);
      }
      this.accessToken = session.accessToken;
      this.accessTokenExpiresAt = Date.now() + session.expiresInSeconds * 1_000;
      return session.accessToken;
    })();
    this.authenticationPromise = authentication;
    void authentication
      .finally(() => {
        if (this.authenticationPromise === authentication) this.authenticationPromise = null;
      })
      .catch((): undefined => undefined);
    return authentication;
  }

  private assertCurrentConversation(conversationId: string): void {
    if (!this.currentConversation || this.currentConversation.conversationId !== conversationId) {
      throw new CustomerServiceApiError('INVALID_REQUEST');
    }
  }

  private handleServerEvent(event: CustomerServiceServerEnvelope): void {
    const eventConversationId = event.conversationId;
    const conversationScoped = CONVERSATION_SCOPED_EVENTS.has(event.event);
    const payloadConversationId = (event.payload as { conversationId?: unknown })?.conversationId;
    if (
      (conversationScoped && !eventConversationId) ||
      (eventConversationId &&
        (!this.currentConversation || eventConversationId !== this.currentConversation.conversationId)) ||
      (typeof payloadConversationId === 'string' && payloadConversationId !== eventConversationId)
    ) {
      // A stale connection or server-side routing mistake must not cross the
      // main-process boundary into another customer's renderer session.
      return;
    }
    if (event.event === 'conversation.snapshot') {
      const snapshot = event.payload as CustomerServiceConversation;
      if (!this.currentConversation || snapshot.conversationId === this.currentConversation.conversationId) {
        this.currentConversation = snapshot;
      }
    } else if (this.currentConversation && eventConversationId === this.currentConversation.conversationId) {
      if (event.event === 'message.created') {
        const message = event.payload as CustomerServiceMessage;
        if (message.senderType === 'STAFF' && this.trackStaffMessage(message.messageId)) {
          this.staffMessageSequence += 1;
          this.unreadCount += 1;
          this.showStaffMessageNotification(message);
        }
      } else if (
        event.event === 'conversation.assigned' ||
        event.event === 'conversation.transferred' ||
        event.event === 'conversation.closed'
      ) {
        this.currentConversation = {
          ...this.currentConversation,
          ...(event.payload as Partial<CustomerServiceConversation>),
        };
        if (event.event === 'conversation.closed') {
          this.unreadCount = 0;
          this.invalidatePendingReads();
        }
      }
    }

    this.publishUnreadCount();
    this.broadcastEvent(event);
  }

  private broadcastEvent(event: CustomerServiceServerEnvelope): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Renderer listeners cannot break the main-process state boundary.
      }
    }
  }

  private trackStaffMessage(messageId: string): boolean {
    if (this.trackedStaffMessageIds.has(messageId)) return false;
    this.trackedStaffMessageIds.add(messageId);
    this.trackedStaffMessageIdOrder.push(messageId);
    if (this.trackedStaffMessageIdOrder.length > MAX_TRACKED_STAFF_MESSAGE_IDS) {
      const oldest = this.trackedStaffMessageIdOrder.shift();
      if (oldest) this.trackedStaffMessageIds.delete(oldest);
    }
    return true;
  }

  private showStaffMessageNotification(message: CustomerServiceMessage): void {
    const integration = this.desktopIntegration;
    if (!integration) return;
    try {
      if (!integration.shouldNotify()) return;
      void Promise.resolve(integration.showMessageNotification({ message })).catch((): undefined => undefined);
    } catch {
      // Native notification failures do not interrupt realtime delivery.
    }
  }

  private publishUnreadCount(): void {
    try {
      this.desktopIntegration?.setUnreadCount(this.unreadCount);
    } catch {
      // Tray rendering is best-effort and cannot own gateway state.
    }
  }

  private currentSnapshot(
    fallbackState: CustomerServiceConnectionSnapshot['state']
  ): CustomerServiceConnectionSnapshot {
    return (
      this.socketClient.getSnapshot?.(this.unreadCount) ?? {
        state: fallbackState,
        reconnectAttempt: 0,
        unreadCount: this.unreadCount,
      }
    );
  }

  private clearForEnterpriseLogout(): void {
    this.sessionGeneration += 1;
    this.invalidateCredentials();
    this.openingPromise = null;
    this.currentConversation = null;
    this.unreadCount = 0;
    this.staffMessageSequence = 0;
    this.nextReadRequestSequence = 0;
    this.lastAppliedReadRequestSequence = 0;
    this.trackedStaffMessageIds.clear();
    this.trackedStaffMessageIdOrder.length = 0;
    this.publishUnreadCount();
    this.socketClient.disconnect();
  }

  private invalidateCredentials(): void {
    this.credentialRevision += 1;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.authenticationPromise = null;
  }

  private assertCurrentSession(expectedGeneration: number): void {
    if (expectedGeneration !== this.sessionGeneration) {
      throw new CustomerServiceApiError('AUTHENTICATION_CANCELLED', 401);
    }
  }

  private invalidatePendingReads(): void {
    this.nextReadRequestSequence += 1;
    this.lastAppliedReadRequestSequence = this.nextReadRequestSequence;
    this.staffMessageSequence = 0;
  }

  private isUnauthorized(error: unknown): boolean {
    return error instanceof CustomerServiceApiError && (error.status === 401 || error.code === 'UNAUTHORIZED');
  }
}
