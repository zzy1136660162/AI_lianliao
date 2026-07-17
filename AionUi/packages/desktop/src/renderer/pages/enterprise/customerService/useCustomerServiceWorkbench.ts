import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type {
  CustomerServiceConversation,
  CustomerServiceMessage,
  CustomerServiceServerEnvelope,
  CustomerServiceStaffCandidate,
} from '@/common/enterprise/customer-service/contracts';
import { customerServiceClient, type CustomerServiceClient } from '@/renderer/services/enterprise/customer-service';

import {
  classifyCustomerServiceConversation,
  createInitialCustomerServiceState,
  customerServiceReducer,
  getCustomerServiceQueueCounts,
  isCustomerServiceConversationReadOnly,
  selectCustomerServiceConversations,
  type CustomerServiceQueue,
  type CustomerServiceTimelineMessage,
} from './customerServiceReducer';

const PAGE_SIZE = 50;
const ALLOWED_IMAGE_TYPES = ['image/gif', 'image/jpeg', 'image/png', 'image/webp'] as const;
const SIGNED_BUSINESS_ID = /^-?[1-9]\d*$/;

type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
type ReadableCustomerMessage = { messageId: string | null; senderType: CustomerServiceMessage['senderType'] };

const isAllowedImageType = (value: string): value is AllowedImageType =>
  ALLOWED_IMAGE_TYPES.some((type) => type === value);

const latestReadableMessage = (messages: ReadableCustomerMessage[]): ReadableCustomerMessage | null =>
  messages.toReversed().find((message) => message.messageId !== null && message.senderType === 'CUSTOMER') ?? null;

export type CustomerServiceWorkbenchController = {
  state: ReturnType<typeof createInitialCustomerServiceState>;
  queue: CustomerServiceQueue;
  setQueue: (queue: CustomerServiceQueue) => void;
  keyword: string;
  setKeyword: (keyword: string) => void;
  queueCounts: Record<CustomerServiceQueue, number>;
  visibleConversations: CustomerServiceConversation[];
  selectedConversation: CustomerServiceConversation | null;
  messages: CustomerServiceTimelineMessage[];
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
  initialLoading: boolean;
  historyLoading: boolean;
  olderLoading: boolean;
  imageUploading: boolean;
  operationPending: boolean;
  errorKey: string | null;
  selectConversation: (conversationId: string) => Promise<void>;
  refresh: () => Promise<void>;
  loadOlder: () => Promise<void>;
  sendText: (text: string) => Promise<boolean>;
  sendImage: (file: File) => Promise<boolean>;
  retryMessage: (message: CustomerServiceTimelineMessage) => Promise<boolean>;
  setViewingLatest: (viewingLatest: boolean) => void;
  acknowledgeLatestView: () => Promise<void>;
  loadCandidates: (keyword?: string) => Promise<CustomerServiceStaffCandidate[]>;
  transferConversation: (targetStaffUserId: string, reason?: string) => Promise<boolean>;
  closeConversation: (reason?: string) => Promise<boolean>;
};

/** Owns REST snapshots, WebSocket events, optimistic messages, and deep-link selection. */
export const useCustomerServiceWorkbench = (
  currentStaffUserId: string,
  client: CustomerServiceClient = customerServiceClient
): CustomerServiceWorkbenchController => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialConversationIdRef = useRef(searchParams.get('conversationId'));
  const [state, dispatch] = useReducer(customerServiceReducer, currentStaffUserId, createInitialCustomerServiceState);
  const [queue, setQueue] = useState<CustomerServiceQueue>('PENDING');
  const [keyword, setKeyword] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [operationPending, setOperationPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const stateRef = useRef(state);
  const viewingLatestRef = useRef(true);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const updateDeepLink = useCallback(
    (conversationId: string) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('conversationId', conversationId);
        return next;
      });
    },
    [setSearchParams]
  );

  const markConversationRead = useCallback(
    async (conversationId: string, messages: ReadableCustomerMessage[]) => {
      const latest = latestReadableMessage(messages);
      if (!latest?.messageId) return;
      try {
        await client.markRead({ conversationId, messageId: latest.messageId });
        if (mountedRef.current) {
          dispatch({ type: 'read.confirmed', conversationId, messageId: latest.messageId });
        }
      } catch {
        // Read receipts are retried the next time the timeline reaches the bottom.
      }
    },
    [client]
  );

  const loadConversation = useCallback(
    async (conversationId: string, updateUrl = true): Promise<void> => {
      if (!SIGNED_BUSINESS_ID.test(conversationId)) return;
      dispatch({ type: 'conversation.selected', conversationId });
      if (updateUrl) updateDeepLink(conversationId);
      viewingLatestRef.current = true;
      setHistoryLoading(true);
      setErrorKey(null);
      try {
        const [conversation, history] = await Promise.all([
          client.getConversation({ conversationId }),
          client.getHistory({ conversationId, limit: PAGE_SIZE }),
        ]);
        if (!mountedRef.current) return;
        dispatch({ type: 'conversation.updated', conversation });
        dispatch({
          type: 'history.loaded',
          conversationId,
          messages: history.items,
          hasMore: history.hasMore,
        });
        const latestCustomerMessage = history.items
          .toReversed()
          .find((message) => message.senderType === 'CUSTOMER' && message.messageId !== conversation.staffLastReadId);
        if (latestCustomerMessage) {
          await markConversationRead(conversationId, history.items);
        }
      } catch {
        if (mountedRef.current) setErrorKey('enterprise.customerService.errors.loadConversation');
      } finally {
        if (mountedRef.current) setHistoryLoading(false);
      }
    },
    [client, markConversationRead, updateDeepLink]
  );

  const initialize = useCallback(async (): Promise<void> => {
    setInitialLoading(true);
    setErrorKey(null);
    dispatch({ type: 'connection.changed', state: 'CONNECTING' });
    try {
      const snapshot = await client.connect();
      if (!mountedRef.current) return;
      dispatch({ type: 'connection.changed', state: snapshot.state });
      const [activePage, closedPage] = await Promise.all([
        client.listConversations({ status: 'ACTIVE', limit: PAGE_SIZE }),
        client.listConversations({ status: 'CLOSED', limit: PAGE_SIZE }),
      ]);
      if (!mountedRef.current) return;
      const conversations = [...activePage.items, ...closedPage.items];
      dispatch({ type: 'conversations.loaded', conversations });

      const deepLinkId = stateRef.current.selectedConversationId ?? initialConversationIdRef.current;
      if (deepLinkId && SIGNED_BUSINESS_ID.test(deepLinkId)) {
        await loadConversation(deepLinkId, false);
        return;
      }
      const firstConversation =
        conversations.find(
          (conversation) => classifyCustomerServiceConversation(conversation, currentStaffUserId) === 'PENDING'
        ) ?? conversations.find((conversation) => conversation.status === 'ACTIVE');
      if (firstConversation) await loadConversation(firstConversation.conversationId);
    } catch {
      if (!mountedRef.current) return;
      dispatch({ type: 'connection.changed', state: 'DISCONNECTED' });
      setErrorKey('enterprise.customerService.errors.load');
    } finally {
      if (mountedRef.current) setInitialLoading(false);
    }
  }, [client, currentStaffUserId, loadConversation]);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = client.onEvent((event: CustomerServiceServerEnvelope) => {
      const currentState = stateRef.current;
      const selectedConversationId = currentState.selectedConversationId;
      const viewingLatest = viewingLatestRef.current && event.conversationId === selectedConversationId;
      dispatch({ type: 'event.received', event, viewingLatest });
      if (event.event === 'connection.ready') dispatch({ type: 'connection.changed', state: 'CONNECTED' });

      if (event.event === 'message.created') {
        const message = event.payload as CustomerServiceMessage;
        if (!currentState.conversations[message.conversationId]) {
          void client
            .getConversation({ conversationId: message.conversationId })
            .then((conversation) => {
              if (mountedRef.current) dispatch({ type: 'conversation.updated', conversation });
            })
            .catch((): undefined => undefined);
        }
        if (viewingLatest && message.senderType === 'CUSTOMER') {
          void client
            .markRead({ conversationId: message.conversationId, messageId: message.messageId })
            .then(() => {
              if (mountedRef.current) {
                dispatch({
                  type: 'read.confirmed',
                  conversationId: message.conversationId,
                  messageId: message.messageId,
                });
              }
            })
            .catch((): undefined => undefined);
        }
      }
    });
    void initialize();
    return () => {
      mountedRef.current = false;
      unsubscribe();
      void client.disconnect().catch((): undefined => undefined);
    };
  }, [client, initialize]);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      await client.disconnect();
    } catch {
      // Reconnect still proceeds when the previous socket was already gone.
    }
    if (mountedRef.current) await initialize();
  }, [client, initialize]);

  const loadOlder = useCallback(async (): Promise<void> => {
    const currentState = stateRef.current;
    const conversationId = currentState.selectedConversationId;
    if (!conversationId || olderLoading) return;
    const timeline = currentState.timelines[conversationId];
    const beforeMessageId = timeline?.messages.find((message) => message.messageId !== null)?.messageId;
    if (!beforeMessageId || !timeline.hasOlderMessages) return;
    setOlderLoading(true);
    try {
      const page = await client.getHistory({ conversationId, beforeMessageId, limit: PAGE_SIZE });
      if (mountedRef.current) {
        dispatch({
          type: 'history.prepended',
          conversationId,
          messages: page.items,
          hasMore: page.hasMore,
        });
      }
    } catch {
      if (mountedRef.current) setErrorKey('enterprise.customerService.errors.loadHistory');
    } finally {
      if (mountedRef.current) setOlderLoading(false);
    }
  }, [client, olderLoading]);

  const sendPendingMessage = useCallback(
    async (
      conversationId: string,
      clientMessageId: string,
      messageType: 'TEXT' | 'IMAGE',
      textContent: string | null,
      image: CustomerServiceTimelineMessage['image']
    ): Promise<boolean> => {
      dispatch({
        type: 'message.pending',
        conversationId,
        clientMessageId,
        messageType,
        textContent,
        image,
        localCreatedAt: Date.now(),
      });
      try {
        await client.sendMessage(
          messageType === 'TEXT'
            ? { conversationId, clientMessageId, messageType, textContent: textContent ?? '' }
            : { conversationId, clientMessageId, messageType, image: image! }
        );
        return true;
      } catch {
        if (mountedRef.current) dispatch({ type: 'message.failed', conversationId, clientMessageId });
        return false;
      }
    },
    [client]
  );

  const sendText = useCallback(
    async (text: string): Promise<boolean> => {
      const currentState = stateRef.current;
      const conversationId = currentState.selectedConversationId;
      const conversation = conversationId ? currentState.conversations[conversationId] : null;
      const content = text.trim();
      if (!conversationId || !conversation || !content) return false;
      if (isCustomerServiceConversationReadOnly(conversation, currentStaffUserId)) return false;
      viewingLatestRef.current = true;
      return sendPendingMessage(conversationId, crypto.randomUUID(), 'TEXT', content, null);
    },
    [currentStaffUserId, sendPendingMessage]
  );

  const sendImage = useCallback(
    async (file: File): Promise<boolean> => {
      const currentState = stateRef.current;
      const conversationId = currentState.selectedConversationId;
      const conversation = conversationId ? currentState.conversations[conversationId] : null;
      if (!conversationId || !conversation || !isAllowedImageType(file.type)) return false;
      if (isCustomerServiceConversationReadOnly(conversation, currentStaffUserId)) return false;
      setImageUploading(true);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const image = await client.uploadImage({
          conversationId,
          fileName: file.name,
          mimeType: file.type,
          bytes,
        });
        if (!mountedRef.current) return false;
        viewingLatestRef.current = true;
        return await sendPendingMessage(conversationId, crypto.randomUUID(), 'IMAGE', null, image);
      } catch {
        return false;
      } finally {
        if (mountedRef.current) setImageUploading(false);
      }
    },
    [client, currentStaffUserId, sendPendingMessage]
  );

  const retryMessage = useCallback(
    async (message: CustomerServiceTimelineMessage): Promise<boolean> =>
      sendPendingMessage(
        message.conversationId,
        message.clientMessageId,
        message.messageType === 'IMAGE' ? 'IMAGE' : 'TEXT',
        message.textContent,
        message.image
      ),
    [sendPendingMessage]
  );

  const setViewingLatest = useCallback((viewingLatest: boolean): void => {
    viewingLatestRef.current = viewingLatest;
  }, []);

  const acknowledgeLatestView = useCallback(async (): Promise<void> => {
    viewingLatestRef.current = true;
    const currentState = stateRef.current;
    const conversationId = currentState.selectedConversationId;
    if (!conversationId) return;
    dispatch({ type: 'history.newerCleared', conversationId });
    await markConversationRead(conversationId, currentState.timelines[conversationId]?.messages ?? []);
  }, [markConversationRead]);

  const loadCandidates = useCallback(
    async (candidateKeyword = ''): Promise<CustomerServiceStaffCandidate[]> => {
      const conversationId = stateRef.current.selectedConversationId;
      if (!conversationId) return [];
      const page = await client.listCandidates({
        conversationId,
        keyword: candidateKeyword.trim() || undefined,
        limit: PAGE_SIZE,
      });
      return page.items;
    },
    [client]
  );

  const transferConversation = useCallback(
    async (targetStaffUserId: string, reason?: string): Promise<boolean> => {
      const conversationId = stateRef.current.selectedConversationId;
      if (!conversationId || !SIGNED_BUSINESS_ID.test(targetStaffUserId)) return false;
      setOperationPending(true);
      try {
        const latest = await client.getConversation({ conversationId });
        const updated = await client.transferConversation({
          conversationId,
          targetStaffUserId,
          expectedAssignmentVersion: latest.assignmentVersion,
          expectedVersion: latest.version,
          reason: reason?.trim() || undefined,
        });
        if (mountedRef.current) dispatch({ type: 'conversation.updated', conversation: updated });
        return true;
      } catch {
        return false;
      } finally {
        if (mountedRef.current) setOperationPending(false);
      }
    },
    [client]
  );

  const closeConversation = useCallback(
    async (reason?: string): Promise<boolean> => {
      const conversationId = stateRef.current.selectedConversationId;
      if (!conversationId) return false;
      setOperationPending(true);
      try {
        const latest = await client.getConversation({ conversationId });
        const updated = await client.closeConversation({
          conversationId,
          expectedVersion: latest.version,
          reason: reason?.trim() || undefined,
        });
        if (mountedRef.current) dispatch({ type: 'conversation.updated', conversation: updated });
        return true;
      } catch {
        return false;
      } finally {
        if (mountedRef.current) setOperationPending(false);
      }
    },
    [client]
  );

  const queueCounts = useMemo(() => getCustomerServiceQueueCounts(state), [state]);
  const visibleConversations = useMemo(
    () => selectCustomerServiceConversations(state, queue, keyword),
    [keyword, queue, state]
  );
  const selectedConversation = state.selectedConversationId
    ? (state.conversations[state.selectedConversationId] ?? null)
    : null;
  const timeline = state.selectedConversationId ? state.timelines[state.selectedConversationId] : null;

  return {
    state,
    queue,
    setQueue,
    keyword,
    setKeyword,
    queueCounts,
    visibleConversations,
    selectedConversation,
    messages: timeline?.messages ?? [],
    hasOlderMessages: timeline?.hasOlderMessages ?? false,
    hasNewerMessages: timeline?.hasNewerMessages ?? false,
    initialLoading,
    historyLoading,
    olderLoading,
    imageUploading,
    operationPending,
    errorKey,
    selectConversation: loadConversation,
    refresh,
    loadOlder,
    sendText,
    sendImage,
    retryMessage,
    setViewingLatest,
    acknowledgeLatestView,
    loadCandidates,
    transferConversation,
    closeConversation,
  };
};
