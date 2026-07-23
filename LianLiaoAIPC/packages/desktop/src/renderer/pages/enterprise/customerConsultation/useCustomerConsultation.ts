import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import type {
  CustomerServiceConnectionSnapshot,
  CustomerServiceImage,
  CustomerServiceMessage,
  CustomerServiceServerEnvelope,
} from '@/common/enterprise/customer-service/contracts';
import {
  customerConsultationClient,
  type CustomerConsultationClient,
} from '@/renderer/services/enterprise/customer-consultation';

import {
  createInitialCustomerConsultationState,
  customerConsultationReducer,
  type CustomerConsultationTimelineMessage,
} from './customerConsultationReducer';

const PAGE_SIZE = 50;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);

const canAcknowledgeVisibleMessages = (): boolean =>
  typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus());

/** Coordinates customer commands and realtime events while keeping UI components protocol-free. */
export const useCustomerConsultation = (injectedClient?: CustomerConsultationClient) => {
  const client = injectedClient ?? customerConsultationClient;
  const [state, dispatch] = useReducer(customerConsultationReducer, undefined, createInitialCustomerConsultationState);
  const [initialLoading, setInitialLoading] = useState(true);
  const [olderLoading, setOlderLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [operationPending, setOperationPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const stateRef = useRef(state);
  const mountedRef = useRef(false);
  const viewingLatestRef = useRef(true);
  const initializationRef = useRef<Promise<void> | null>(null);
  const latestSyncsRef = useRef(new Map<string, { trailingRequested: boolean; promise: Promise<void> }>());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const markLatestStaffMessageRead = useCallback(
    async (
      messages: readonly Pick<CustomerConsultationTimelineMessage, 'messageId' | 'senderType'>[],
      explicitConversationId?: string
    ): Promise<void> => {
      const conversationId = explicitConversationId ?? stateRef.current.conversation?.conversationId;
      if (!conversationId) return;
      const latest = messages.findLast((message) => message.senderType === 'STAFF' && message.messageId !== null);
      if (!latest?.messageId) return;
      try {
        await client.markRead({ conversationId, messageId: latest.messageId });
      } catch {
        // Read acknowledgement is retried on the next bottom-view transition.
      }
    },
    [client]
  );

  /** Merges the latest server page after every socket-ready boundary. */
  const synchronizeLatestHistory = useCallback(
    (explicitConversationId?: string): Promise<void> => {
      const conversationId = explicitConversationId ?? stateRef.current.conversation?.conversationId;
      if (!conversationId) return Promise.resolve();
      const existing = latestSyncsRef.current.get(conversationId);
      if (existing) {
        // A ready event that lands during an earlier REST request requires a
        // trailing request; sharing the old snapshot alone leaves a gap.
        existing.trailingRequested = true;
        return existing.promise;
      }
      const entry = { trailingRequested: false, promise: Promise.resolve() };
      const operation = (async () => {
        do {
          entry.trailingRequested = false;
          try {
            // A trailing synchronization depends on the previous request's ready-event state.
            // eslint-disable-next-line no-await-in-loop
            const latest = await client.getHistory({ conversationId, limit: PAGE_SIZE });
            if (!mountedRef.current) return;
            dispatch({ type: 'history.synchronized', conversationId, messages: latest.items });
            if (
              stateRef.current.conversation?.conversationId === conversationId &&
              viewingLatestRef.current &&
              canAcknowledgeVisibleMessages()
            ) {
              // The next synchronization must not start before the current visible messages are acknowledged.
              // eslint-disable-next-line no-await-in-loop
              await markLatestStaffMessageRead(latest.items, conversationId);
            }
          } catch {
            // If ready arrived during a failed request, trailingRequested is
            // true and the loop immediately retries with a fresh snapshot.
          }
        } while (entry.trailingRequested && mountedRef.current);
      })();
      entry.promise = operation;
      latestSyncsRef.current.set(conversationId, entry);
      void operation
        .finally(() => {
          if (latestSyncsRef.current.get(conversationId) === entry) {
            latestSyncsRef.current.delete(conversationId);
          }
        })
        .catch((): undefined => undefined);
      return operation;
    },
    [client, markLatestStaffMessageRead]
  );

  const initialize = useCallback(async (): Promise<void> => {
    if (initializationRef.current) return initializationRef.current;
    const operation = (async () => {
      if (mountedRef.current) {
        setInitialLoading(true);
        setErrorKey(null);
      }
      try {
        const conversation = await client.openConversation();
        dispatch({ type: 'initialized', conversation });
        const history = await client.getHistory({ conversationId: conversation.conversationId, limit: PAGE_SIZE });
        dispatch({
          type: 'history.loaded',
          conversationId: conversation.conversationId,
          messages: history.items,
          hasMore: history.hasMore,
        });
        // Match the established H5 order: create/resume and load history before
        // opening realtime delivery, then let socket recovery fill any gap.
        const snapshot = await client.connect();
        dispatch({ type: 'connection.changed', state: snapshot.state });
        await synchronizeLatestHistory(conversation.conversationId);
      } catch {
        if (mountedRef.current) setErrorKey('enterprise.consultation.errors.initialize');
      } finally {
        if (mountedRef.current) setInitialLoading(false);
      }
    })();
    initializationRef.current = operation;
    try {
      await operation;
    } finally {
      if (initializationRef.current === operation) initializationRef.current = null;
    }
  }, [client, synchronizeLatestHistory]);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = client.onEvent((event: CustomerServiceServerEnvelope) => {
      const currentConversationId = stateRef.current.conversation?.conversationId;
      if (event.conversationId && currentConversationId && event.conversationId !== currentConversationId) return;
      dispatch({ type: 'event.received', event, viewingLatest: viewingLatestRef.current });
      if (event.event === 'connection.ready') {
        dispatch({ type: 'connection.changed', state: 'CONNECTED' });
        void synchronizeLatestHistory();
      }
      if (event.event === 'connection.state') {
        dispatch({
          type: 'connection.changed',
          state: (event.payload as { state: CustomerServiceConnectionSnapshot['state'] }).state,
        });
      }
      if (event.event === 'error') dispatch({ type: 'connection.changed', state: 'RECONNECTING' });
      if (event.event === 'message.created' && viewingLatestRef.current && canAcknowledgeVisibleMessages()) {
        const message = event.payload as CustomerServiceMessage;
        if (message.senderType === 'STAFF') {
          void client
            .markRead({ conversationId: message.conversationId, messageId: message.messageId })
            .catch((): undefined => undefined);
        }
      }
    });
    void initialize();
    return () => {
      mountedRef.current = false;
      unsubscribe();
      // Do not disconnect the main-process gateway on route changes: it owns
      // background reply notifications while the user works elsewhere. The
      // enterprise-session cleared event performs the credential/socket cleanup.
    };
  }, [client, initialize, synchronizeLatestHistory]);

  useEffect(() => {
    const acknowledgeWhenVisible = (): void => {
      if (!mountedRef.current || !viewingLatestRef.current || !canAcknowledgeVisibleMessages()) return;
      void markLatestStaffMessageRead(stateRef.current.messages);
    };
    document.addEventListener('visibilitychange', acknowledgeWhenVisible);
    window.addEventListener('focus', acknowledgeWhenVisible);
    return () => {
      document.removeEventListener('visibilitychange', acknowledgeWhenVisible);
      window.removeEventListener('focus', acknowledgeWhenVisible);
    };
  }, [markLatestStaffMessageRead]);

  const loadOlder = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const conversationId = current.conversation?.conversationId;
    const beforeMessageId = current.messages.find((message) => message.messageId !== null)?.messageId;
    if (!conversationId || !beforeMessageId || !current.hasOlderMessages || olderLoading) return;
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
      if (mountedRef.current) setErrorKey('enterprise.consultation.errors.history');
    } finally {
      if (mountedRef.current) setOlderLoading(false);
    }
  }, [client, olderLoading]);

  const sendPendingMessage = useCallback(
    async (
      clientMessageId: string,
      messageType: 'TEXT' | 'IMAGE',
      textContent: string | null,
      image: CustomerServiceImage | null
    ): Promise<boolean> => {
      const conversation = stateRef.current.conversation;
      if (!conversation || conversation.status === 'CLOSED') return false;
      dispatch({
        type: 'message.pending',
        clientMessageId,
        messageType,
        textContent,
        image,
        localCreatedAt: Date.now(),
      });
      try {
        await client.sendMessage(
          messageType === 'TEXT'
            ? {
                conversationId: conversation.conversationId,
                clientMessageId,
                messageType,
                textContent: textContent ?? '',
              }
            : { conversationId: conversation.conversationId, clientMessageId, messageType, image: image! }
        );
        return true;
      } catch {
        if (mountedRef.current) dispatch({ type: 'message.failed', clientMessageId });
        return false;
      }
    },
    [client]
  );

  const sendText = useCallback(
    async (text: string): Promise<boolean> => {
      const content = text.trim();
      if (!content || content.length > 2_000) return false;
      viewingLatestRef.current = true;
      return sendPendingMessage(crypto.randomUUID(), 'TEXT', content, null);
    },
    [sendPendingMessage]
  );

  const sendImage = useCallback(
    async (file: File): Promise<boolean> => {
      const conversation = stateRef.current.conversation;
      if (!conversation || conversation.status === 'CLOSED') return false;
      if (!ALLOWED_IMAGE_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) return false;
      setImageUploading(true);
      try {
        const image = await client.uploadImage({
          conversationId: conversation.conversationId,
          fileName: file.name,
          mimeType: file.type as 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp',
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
        if (!mountedRef.current) return false;
        viewingLatestRef.current = true;
        return await sendPendingMessage(crypto.randomUUID(), 'IMAGE', null, image);
      } catch {
        if (mountedRef.current) setErrorKey('enterprise.consultation.errors.upload');
        return false;
      } finally {
        if (mountedRef.current) setImageUploading(false);
      }
    },
    [client, sendPendingMessage]
  );

  const retryMessage = useCallback(
    (message: CustomerConsultationTimelineMessage) =>
      sendPendingMessage(
        message.clientMessageId,
        message.messageType === 'IMAGE' ? 'IMAGE' : 'TEXT',
        message.textContent,
        message.image
      ),
    [sendPendingMessage]
  );

  const setViewingLatest = useCallback((value: boolean): void => {
    viewingLatestRef.current = value;
  }, []);

  const acknowledgeLatest = useCallback(async (): Promise<void> => {
    viewingLatestRef.current = true;
    dispatch({ type: 'newer.cleared' });
    await markLatestStaffMessageRead(stateRef.current.messages);
  }, [markLatestStaffMessageRead]);

  const closeConversation = useCallback(async (): Promise<boolean> => {
    const conversation = stateRef.current.conversation;
    if (!conversation || conversation.status === 'CLOSED') return false;
    setOperationPending(true);
    try {
      const updated = await client.closeConversation({
        conversationId: conversation.conversationId,
        expectedVersion: conversation.version,
      });
      if (mountedRef.current) dispatch({ type: 'conversation.updated', conversation: updated });
      return true;
    } catch {
      // The staff side may have closed or versioned the conversation first.
      // Refresh the server snapshot so the customer never remains on stale UI.
      try {
        const latest = await client.getConversation({ conversationId: conversation.conversationId });
        if (mountedRef.current) {
          dispatch({ type: 'conversation.updated', conversation: latest });
          if (latest.status === 'CLOSED') {
            setErrorKey(null);
            return true;
          }
        }
      } catch {
        // Keep the fixed localized close error if snapshot recovery also fails.
      }
      if (mountedRef.current) setErrorKey('enterprise.consultation.errors.close');
      return false;
    } finally {
      if (mountedRef.current) setOperationPending(false);
    }
  }, [client]);

  const startNewConversation = useCallback(async (): Promise<void> => {
    setOperationPending(true);
    setErrorKey(null);
    try {
      const conversation = await client.startConversation();
      dispatch({ type: 'initialized', conversation });
      const history = await client.getHistory({ conversationId: conversation.conversationId, limit: PAGE_SIZE });
      dispatch({
        type: 'history.loaded',
        conversationId: conversation.conversationId,
        messages: history.items,
        hasMore: history.hasMore,
      });
      viewingLatestRef.current = true;
      await synchronizeLatestHistory(conversation.conversationId);
    } catch {
      if (mountedRef.current) setErrorKey('enterprise.consultation.errors.initialize');
    } finally {
      if (mountedRef.current) setOperationPending(false);
    }
  }, [client, synchronizeLatestHistory]);

  return useMemo(
    () => ({
      state,
      initialLoading,
      olderLoading,
      imageUploading,
      operationPending,
      errorKey,
      clearError: () => setErrorKey(null),
      retry: initialize,
      loadOlder,
      sendText,
      sendImage,
      retryMessage,
      setViewingLatest,
      acknowledgeLatest,
      closeConversation,
      startNewConversation,
    }),
    [
      acknowledgeLatest,
      closeConversation,
      errorKey,
      imageUploading,
      initialLoading,
      initialize,
      loadOlder,
      olderLoading,
      operationPending,
      retryMessage,
      sendImage,
      sendText,
      setViewingLatest,
      startNewConversation,
      state,
    ]
  );
};
