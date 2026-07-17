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
  isPackaged?: boolean;
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
  private readonly listeners = new Set<CustomerServiceGatewayEventListener>();
  private readonly unreadByConversation = new Map<string, number>();
  private readonly unsubscribeSocket: () => void;
  private readonly unsubscribeSessionCleared: () => void;

  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private authenticationPromise: Promise<string> | null = null;
  private credentialRevision = 0;

  constructor(options: CustomerServiceGatewayOptions) {
    this.sessionStore = options.sessionStore;
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
  }

  async connect(): Promise<CustomerServiceConnectionSnapshot> {
    await this.requireAccessToken();
    await this.socketClient.connect();
    return this.currentSnapshot('CONNECTED');
  }

  async disconnect(): Promise<void> {
    this.socketClient.disconnect();
  }

  listConversations(
    request: CustomerServiceConversationListRequest
  ): Promise<CustomerServicePage<CustomerServiceConversation>> {
    return this.withAuthorization((token) => this.apiClient.listConversations(token, request));
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
      const result = await this.apiClient.markRead(token, request);
      this.unreadByConversation.set(request.conversationId, 0);
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
    } else if (event.event === 'message.created' && conversationId) {
      const message = event.payload as CustomerServiceMessage;
      if (message.senderType === 'CUSTOMER') {
        this.unreadByConversation.set(conversationId, (this.unreadByConversation.get(conversationId) ?? 0) + 1);
      }
    } else if (event.event === 'read.updated' && conversationId) {
      const readerType = (event.payload as { readerType?: unknown }).readerType;
      if (readerType === 'STAFF') this.unreadByConversation.set(conversationId, 0);
    }

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
    this.socketClient.disconnect();
  }

  private invalidateCredentials(): void {
    this.credentialRevision += 1;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.authenticationPromise = null;
  }

  private isUnauthorized(error: unknown): boolean {
    return error instanceof CustomerServiceApiError && (error.status === 401 || error.code === 'UNAUTHORIZED');
  }
}
