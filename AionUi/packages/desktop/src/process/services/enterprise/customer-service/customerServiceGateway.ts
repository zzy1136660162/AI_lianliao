import type {
  CustomerServiceAuthSession,
  CustomerServiceCloseRequest,
  CustomerServiceConnectionSnapshot,
  CustomerServiceConversation,
  CustomerServiceConversationIdRequest,
  CustomerServiceConversationListRequest,
  CustomerServiceImage,
  CustomerServiceMarkReadRequest,
  CustomerServiceMessage,
  CustomerServiceMessageHistoryRequest,
  CustomerServicePage,
  CustomerServiceReadResult,
  CustomerServiceSendMessageRequest,
  CustomerServiceServerEnvelope,
  CustomerServiceStaffCandidate,
  CustomerServiceStaffCandidatesRequest,
  CustomerServiceTransferRequest,
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
const MAX_TRACKED_CUSTOMER_MESSAGE_IDS = 2_000;
const MAX_UNREAD_SYNC_PAGES = 1_000;

export type CustomerServiceGatewaySessionStore = {
  loadOpenId: () => Promise<string | null>;
};

export type CustomerServiceGatewayApiClient = {
  authenticateStaff: (openId: string) => Promise<CustomerServiceAuthSession>;
  listConversations: (
    accessToken: string,
    request: CustomerServiceConversationListRequest
  ) => Promise<CustomerServicePage<CustomerServiceConversation>>;
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
  listCandidates: (
    accessToken: string,
    request: CustomerServiceStaffCandidatesRequest
  ) => Promise<CustomerServicePage<CustomerServiceStaffCandidate>>;
  transferConversation: (
    accessToken: string,
    request: CustomerServiceTransferRequest
  ) => Promise<CustomerServiceConversation>;
  closeConversation: (
    accessToken: string,
    request: CustomerServiceCloseRequest
  ) => Promise<CustomerServiceConversation>;
  issueWebSocketTicket: (accessToken: string) => Promise<CustomerServiceWebSocketTicket>;
};

export type CustomerServiceGatewaySocketClient = {
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (request: CustomerServiceSendMessageRequest) => string;
  subscribe: (listener: (event: CustomerServiceServerEnvelope) => void) => () => void;
  getSnapshot?: (unreadCount?: number) => CustomerServiceConnectionSnapshot;
};

export type CustomerServiceGatewayOptions = {
  sessionStore: CustomerServiceGatewaySessionStore;
  apiClient?: CustomerServiceGatewayApiClient;
  socketClient?: CustomerServiceGatewaySocketClient;
  sessionEvents?: EnterpriseSessionEvents;
  desktopIntegration?: CustomerServiceGatewayDesktopIntegration;
  isPackaged?: boolean;
};

export type CustomerServiceGatewayDesktopIntegration = {
  /** Returns true only when a native notification should interrupt the staff member. */
  shouldNotify: () => boolean;
  /** Displays a native notification without exposing credentials to the renderer. */
  showMessageNotification: (input: { conversationId: string; message: CustomerServiceMessage }) => void | Promise<void>;
  /** Keeps the operating-system tray badge derived from the gateway unread source of truth. */
  setUnreadCount: (count: number) => void;
};

export type CustomerServiceGatewayEventListener = (event: CustomerServiceServerEnvelope) => void;

/**
 * Trusted main-process facade. It owns openId reads, the access token, WebSocket,
 * and retry state so renderer code can never observe authentication secrets.
 */
export class CustomerServiceGateway {
  private readonly sessionStore: CustomerServiceGatewaySessionStore;
  private readonly apiClient: CustomerServiceGatewayApiClient;
  private readonly socketClient: CustomerServiceGatewaySocketClient;
  private readonly desktopIntegration?: CustomerServiceGatewayDesktopIntegration;
  private readonly listeners = new Set<CustomerServiceGatewayEventListener>();
  private readonly unreadByConversation = new Map<string, number>();
  private readonly unreadRevisionByConversation = new Map<string, number>();
  private readonly unreadQueryScopeByConversation = new Map<
    string,
    CustomerServiceConversationListRequest['status'] | 'ALL'
  >();
  private readonly customerMessageSequenceByConversation = new Map<string, number>();
  private readonly nextReadRequestSequenceByConversation = new Map<string, number>();
  private readonly lastAppliedReadRequestSequenceByConversation = new Map<string, number>();
  private readonly trackedCustomerMessageIds = new Set<string>();
  private readonly trackedCustomerMessageIdOrder: string[] = [];
  private readonly unsubscribeSocket: () => void;
  private readonly unsubscribeSessionCleared: () => void;

  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private authenticationPromise: Promise<string> | null = null;
  private credentialRevision = 0;

  constructor(options: CustomerServiceGatewayOptions) {
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
    this.unsubscribeSessionCleared = events.subscribeCleared(() => this.clearForEnterpriseLogout());
    this.publishUnreadCount();
  }

  async connect(): Promise<CustomerServiceConnectionSnapshot> {
    await this.requireAccessToken();
    await this.socketClient.connect();
    return this.currentSnapshot('CONNECTED');
  }

  async disconnect(): Promise<void> {
    this.socketClient.disconnect();
  }

  async listConversations(
    request: CustomerServiceConversationListRequest
  ): Promise<CustomerServicePage<CustomerServiceConversation>> {
    return this.withAuthorization(async (token) => {
      const credentialRevisionAtStart = this.credentialRevision;
      const unreadRevisionAtStart = new Map(this.unreadRevisionByConversation);
      const page = await this.apiClient.listConversations(token, request);
      await this.synchronizeConversationUnreadPages(
        token,
        request,
        page,
        unreadRevisionAtStart,
        credentialRevisionAtStart
      );
      this.publishUnreadCount();
      return page;
    });
  }

  getConversation(request: CustomerServiceConversationIdRequest): Promise<CustomerServiceConversation> {
    return this.withAuthorization((token) => this.apiClient.getConversation(token, request));
  }

  getHistory(request: CustomerServiceMessageHistoryRequest): Promise<CustomerServicePage<CustomerServiceMessage>> {
    return this.withAuthorization((token) => this.apiClient.getHistory(token, request));
  }

  sendMessage(request: CustomerServiceSendMessageRequest): string {
    return this.socketClient.sendMessage(request);
  }

  markRead(request: CustomerServiceMarkReadRequest): Promise<CustomerServiceReadResult> {
    return this.withAuthorization(async (token) => {
      const readRequestSequence = (this.nextReadRequestSequenceByConversation.get(request.conversationId) ?? 0) + 1;
      this.nextReadRequestSequenceByConversation.set(request.conversationId, readRequestSequence);
      const messageSequenceAtStart = this.customerMessageSequenceByConversation.get(request.conversationId) ?? 0;
      const result = await this.apiClient.markRead(token, request);
      const lastAppliedReadRequestSequence =
        this.lastAppliedReadRequestSequenceByConversation.get(request.conversationId) ?? 0;
      if (readRequestSequence < lastAppliedReadRequestSequence) return result;
      this.lastAppliedReadRequestSequenceByConversation.set(request.conversationId, readRequestSequence);
      const currentMessageSequence = this.customerMessageSequenceByConversation.get(request.conversationId) ?? 0;
      const messagesReceivedDuringRead = Math.max(0, currentMessageSequence - messageSequenceAtStart);
      this.unreadByConversation.set(request.conversationId, messagesReceivedDuringRead);
      this.advanceUnreadRevision(request.conversationId);
      this.publishUnreadCount();
      return result;
    });
  }

  uploadImage(request: CustomerServiceUploadImageRequest): Promise<CustomerServiceImage> {
    return this.withAuthorization((token) => this.apiClient.uploadImage(token, request));
  }

  listCandidates(
    request: CustomerServiceStaffCandidatesRequest
  ): Promise<CustomerServicePage<CustomerServiceStaffCandidate>> {
    return this.withAuthorization((token) => this.apiClient.listCandidates(token, request));
  }

  transferConversation(request: CustomerServiceTransferRequest): Promise<CustomerServiceConversation> {
    return this.withAuthorization((token) => this.apiClient.transferConversation(token, request));
  }

  closeConversation(request: CustomerServiceCloseRequest): Promise<CustomerServiceConversation> {
    return this.withAuthorization((token) => this.apiClient.closeConversation(token, request));
  }

  subscribe(listener: CustomerServiceGatewayEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.clearForEnterpriseLogout();
    this.unsubscribeSocket();
    this.unsubscribeSessionCleared();
    this.listeners.clear();
  }

  private async withAuthorization<T>(operation: (accessToken: string) => Promise<T>): Promise<T> {
    const initialToken = await this.requireAccessToken();
    try {
      return await operation(initialToken);
    } catch (error) {
      if (!this.isUnauthorized(error)) throw error;
      if (this.accessToken === initialToken) this.invalidateCredentials();
      const refreshedToken = await this.requireAccessToken();
      return operation(refreshedToken);
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
      const session = await this.apiClient.authenticateStaff(openId);
      if (revision !== this.credentialRevision) throw new CustomerServiceApiError('AUTHENTICATION_CANCELLED', 401);
      if (session.principal.type !== 'STAFF' || !session.principal.userId) {
        throw new CustomerServiceApiError('FORBIDDEN_STAFF', 403);
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

  private handleServerEvent(event: CustomerServiceServerEnvelope): void {
    const conversationId = event.conversationId;
    if (event.event === 'conversation.snapshot') {
      const conversation = event.payload as CustomerServiceConversation;
      this.unreadByConversation.set(conversation.conversationId, conversation.staffUnreadCount);
      this.unreadQueryScopeByConversation.set(conversation.conversationId, conversation.status);
      this.advanceUnreadRevision(conversation.conversationId);
    } else if (event.event === 'message.created' && conversationId) {
      const message = event.payload as CustomerServiceMessage;
      if (message.senderType === 'CUSTOMER') {
        if (!this.trackCustomerMessage(message.messageId)) return;
        this.customerMessageSequenceByConversation.set(
          conversationId,
          (this.customerMessageSequenceByConversation.get(conversationId) ?? 0) + 1
        );
        if (!this.unreadQueryScopeByConversation.has(conversationId)) {
          this.unreadQueryScopeByConversation.set(conversationId, 'ACTIVE');
        }
        this.unreadByConversation.set(conversationId, (this.unreadByConversation.get(conversationId) ?? 0) + 1);
        this.advanceUnreadRevision(conversationId);
        this.showCustomerMessageNotification(conversationId, message);
      }
    } else if (event.event === 'read.updated' && conversationId) {
      const readerType = (event.payload as { readerType?: unknown }).readerType;
      if (readerType === 'STAFF') {
        this.unreadByConversation.set(conversationId, 0);
        this.lastAppliedReadRequestSequenceByConversation.set(
          conversationId,
          this.nextReadRequestSequenceByConversation.get(conversationId) ?? 0
        );
        this.advanceUnreadRevision(conversationId);
      }
    }

    this.publishUnreadCount();

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A renderer event handler cannot break credential or socket ownership.
      }
    }
  }

  private currentSnapshot(
    fallbackState: CustomerServiceConnectionSnapshot['state']
  ): CustomerServiceConnectionSnapshot {
    const unreadCount = [...this.unreadByConversation.values()].reduce((total, count) => total + count, 0);
    return (
      this.socketClient.getSnapshot?.(unreadCount) ?? {
        state: fallbackState,
        reconnectAttempt: 0,
        unreadCount,
      }
    );
  }

  private clearForEnterpriseLogout(): void {
    this.invalidateCredentials();
    this.unreadByConversation.clear();
    this.unreadRevisionByConversation.clear();
    this.unreadQueryScopeByConversation.clear();
    this.customerMessageSequenceByConversation.clear();
    this.nextReadRequestSequenceByConversation.clear();
    this.lastAppliedReadRequestSequenceByConversation.clear();
    this.trackedCustomerMessageIds.clear();
    this.trackedCustomerMessageIdOrder.length = 0;
    this.publishUnreadCount();
    this.socketClient.disconnect();
  }

  /**
   * Consumes every page for an unfiltered status refresh so the tray reflects
   * all conversations, while the renderer still receives its requested page.
   */
  private async synchronizeConversationUnreadPages(
    accessToken: string,
    request: CustomerServiceConversationListRequest,
    firstPage: CustomerServicePage<CustomerServiceConversation>,
    unreadRevisionAtStart: ReadonlyMap<string, number>,
    credentialRevisionAtStart: number
  ): Promise<void> {
    const scope = request.status ?? 'ALL';
    const conversations = [...firstPage.items];
    const visitedCursors = new Set<string>();
    let page = firstPage;
    let pageCount = 1;
    let completeRefresh = request.beforeConversationId === undefined && request.keyword === undefined;

    while (completeRefresh && page.hasMore) {
      this.assertCredentialRevision(credentialRevisionAtStart);
      const cursor = page.nextCursor;
      if (!cursor || visitedCursors.has(cursor) || pageCount >= MAX_UNREAD_SYNC_PAGES) {
        completeRefresh = false;
        break;
      }
      visitedCursors.add(cursor);
      // eslint-disable-next-line no-await-in-loop -- The next cursor is returned by the preceding page.
      page = await this.apiClient.listConversations(accessToken, {
        ...request,
        beforeConversationId: cursor,
      });
      conversations.push(...page.items);
      pageCount += 1;
    }

    this.assertCredentialRevision(credentialRevisionAtStart);

    const refreshedConversationIds = new Set<string>();
    for (const conversation of conversations) {
      refreshedConversationIds.add(conversation.conversationId);
      if (this.hasUnreadChangedSince(conversation.conversationId, unreadRevisionAtStart)) continue;
      this.unreadByConversation.set(conversation.conversationId, conversation.staffUnreadCount);
      this.unreadQueryScopeByConversation.set(conversation.conversationId, scope);
      this.advanceUnreadRevision(conversation.conversationId);
    }

    if (!completeRefresh) return;
    for (const [conversationId, knownScope] of this.unreadQueryScopeByConversation) {
      const belongsToRefresh = scope === 'ALL' || knownScope === scope;
      if (
        belongsToRefresh &&
        !refreshedConversationIds.has(conversationId) &&
        !this.hasUnreadChangedSince(conversationId, unreadRevisionAtStart)
      ) {
        this.unreadByConversation.delete(conversationId);
        this.unreadQueryScopeByConversation.delete(conversationId);
        this.customerMessageSequenceByConversation.delete(conversationId);
        this.nextReadRequestSequenceByConversation.delete(conversationId);
        this.lastAppliedReadRequestSequenceByConversation.delete(conversationId);
        this.advanceUnreadRevision(conversationId);
      }
    }
  }

  private hasUnreadChangedSince(conversationId: string, revisionAtStart: ReadonlyMap<string, number>): boolean {
    return (this.unreadRevisionByConversation.get(conversationId) ?? 0) !== (revisionAtStart.get(conversationId) ?? 0);
  }

  private advanceUnreadRevision(conversationId: string): void {
    this.unreadRevisionByConversation.set(
      conversationId,
      (this.unreadRevisionByConversation.get(conversationId) ?? 0) + 1
    );
  }

  private assertCredentialRevision(expectedRevision: number): void {
    if (expectedRevision !== this.credentialRevision) {
      throw new CustomerServiceApiError('AUTHENTICATION_CANCELLED', 401);
    }
  }

  /** Bounds duplicate tracking so a long-running desktop session cannot grow indefinitely. */
  private trackCustomerMessage(messageId: string): boolean {
    if (this.trackedCustomerMessageIds.has(messageId)) return false;
    this.trackedCustomerMessageIds.add(messageId);
    this.trackedCustomerMessageIdOrder.push(messageId);
    if (this.trackedCustomerMessageIdOrder.length > MAX_TRACKED_CUSTOMER_MESSAGE_IDS) {
      const oldestMessageId = this.trackedCustomerMessageIdOrder.shift();
      if (oldestMessageId) this.trackedCustomerMessageIds.delete(oldestMessageId);
    }
    return true;
  }

  private showCustomerMessageNotification(conversationId: string, message: CustomerServiceMessage): void {
    const integration = this.desktopIntegration;
    if (!integration) return;
    try {
      if (!integration.shouldNotify()) return;
      void Promise.resolve(integration.showMessageNotification({ conversationId, message })).catch(
        (): undefined => undefined
      );
    } catch {
      // Native notification failures must not interrupt WebSocket event delivery.
    }
  }

  private publishUnreadCount(): void {
    if (!this.desktopIntegration) return;
    const unreadCount = [...this.unreadByConversation.values()].reduce((total, count) => total + count, 0);
    try {
      this.desktopIntegration.setUnreadCount(unreadCount);
    } catch {
      // Tray availability is optional and must not affect customer-service state.
    }
  }

  private invalidateCredentials(): void {
    this.credentialRevision += 1;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.authenticationPromise = null;
  }

  private isUnauthorized(error: unknown): boolean {
    if (!(error instanceof CustomerServiceApiError)) return false;
    if (error.code === 'AUTHENTICATION_CANCELLED' || error.code === 'MISSING_ENTERPRISE_SESSION') return false;
    return error.status === 401 || error.code === 'UNAUTHORIZED';
  }
}
