import type {
  CustomerServiceConnectionState,
  CustomerServiceConversation,
  CustomerServiceImage,
  CustomerServiceLifecyclePayload,
  CustomerServiceMessage,
  CustomerServiceMessageAckPayload,
  CustomerServiceServerEnvelope,
} from '@/common/enterprise/customer-service/contracts';

export type CustomerConsultationDeliveryStatus = 'SENDING' | 'DELIVERED' | 'FAILED';

export type CustomerConsultationTimelineMessage = Omit<CustomerServiceMessage, 'messageId' | 'createdAt'> & {
  messageId: string | null;
  createdAt: number;
  deliveryStatus: CustomerConsultationDeliveryStatus;
};

export type CustomerConsultationState = {
  conversation: CustomerServiceConversation | null;
  messages: CustomerConsultationTimelineMessage[];
  connectionState: CustomerServiceConnectionState;
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
  processedEventIds: string[];
};

export type CustomerConsultationAction =
  | { type: 'initialized'; conversation: CustomerServiceConversation }
  | { type: 'conversation.updated'; conversation: CustomerServiceConversation }
  | { type: 'history.loaded'; conversationId: string; messages: CustomerServiceMessage[]; hasMore: boolean }
  | { type: 'history.synchronized'; conversationId: string; messages: CustomerServiceMessage[] }
  | { type: 'history.prepended'; conversationId: string; messages: CustomerServiceMessage[]; hasMore: boolean }
  | { type: 'newer.cleared' }
  | { type: 'connection.changed'; state: CustomerServiceConnectionState }
  | {
      type: 'message.pending';
      clientMessageId: string;
      messageType: 'TEXT' | 'IMAGE';
      textContent: string | null;
      image: CustomerServiceImage | null;
      localCreatedAt: number;
    }
  | { type: 'message.failed'; clientMessageId: string }
  | { type: 'event.received'; event: CustomerServiceServerEnvelope; viewingLatest: boolean };

const MAX_PROCESSED_EVENT_IDS = 2_000;

export const createInitialCustomerConsultationState = (): CustomerConsultationState => ({
  conversation: null,
  messages: [],
  connectionState: 'IDLE',
  hasOlderMessages: false,
  hasNewerMessages: false,
  processedEventIds: [],
});

const compareSignedDecimalIds = (left: string | null, right: string | null): number => {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  const leftNegative = left.startsWith('-');
  const rightNegative = right.startsWith('-');
  if (leftNegative !== rightNegative) return leftNegative ? -1 : 1;
  const leftMagnitude = leftNegative ? left.slice(1) : left;
  const rightMagnitude = rightNegative ? right.slice(1) : right;
  const magnitudeResult =
    leftMagnitude.length === rightMagnitude.length
      ? leftMagnitude.localeCompare(rightMagnitude)
      : leftMagnitude.length - rightMagnitude.length;
  return leftNegative ? -magnitudeResult : magnitudeResult;
};

const toTimelineMessage = (message: CustomerServiceMessage): CustomerConsultationTimelineMessage => ({
  ...message,
  createdAt: message.createdAt ?? 0,
  deliveryStatus: 'DELIVERED',
});

const mergeMessages = (
  current: CustomerConsultationTimelineMessage[],
  incoming: CustomerConsultationTimelineMessage[]
): CustomerConsultationTimelineMessage[] => {
  const merged = [...current];
  for (const next of incoming) {
    const existingIndex = merged.findIndex(
      (item) =>
        (next.messageId !== null && item.messageId === next.messageId) ||
        (next.clientMessageId !== '' && item.clientMessageId === next.clientMessageId)
    );
    if (existingIndex >= 0) merged[existingIndex] = { ...merged[existingIndex], ...next };
    else merged.push(next);
  }
  return merged.toSorted((left, right) => {
    const timeDifference = left.createdAt - right.createdAt;
    return timeDifference || compareSignedDecimalIds(left.messageId, right.messageId);
  });
};

const applyLifecycle = (
  conversation: CustomerServiceConversation | null,
  payload: CustomerServiceLifecyclePayload
): CustomerServiceConversation | null => {
  if (!conversation || conversation.conversationId !== payload.conversationId) return conversation;
  return {
    ...conversation,
    status: payload.status ?? conversation.status,
    staffUserId: payload.staffUserId,
    staffName: payload.staffName,
    assignmentVersion: payload.assignmentVersion,
    version: payload.version,
    lastMessageId: payload.lastMessageId,
    lastMessageAt: payload.lastMessageAt,
    closedReason: payload.closedReason,
    closedAt: payload.closedAt,
    assignedAt: payload.assignedAt,
  };
};

/** Deterministically combines REST history, optimistic sends, and realtime events. */
export const customerConsultationReducer = (
  state: CustomerConsultationState,
  action: CustomerConsultationAction
): CustomerConsultationState => {
  switch (action.type) {
    case 'initialized':
      if (state.conversation?.conversationId !== action.conversation.conversationId) {
        return {
          ...state,
          conversation: action.conversation,
          messages: [],
          hasOlderMessages: false,
          hasNewerMessages: false,
          processedEventIds: [],
        };
      }
      return { ...state, conversation: action.conversation };
    case 'conversation.updated':
      return { ...state, conversation: action.conversation };
    case 'history.loaded':
      if (state.conversation?.conversationId !== action.conversationId) return state;
      return {
        ...state,
        // Realtime events can arrive while the first REST page is in flight.
        // Merge instead of replacing so those messages are never discarded.
        messages: mergeMessages(state.messages, action.messages.map(toTimelineMessage)),
        hasOlderMessages: action.hasMore,
        hasNewerMessages: false,
      };
    case 'history.synchronized':
      if (state.conversation?.conversationId !== action.conversationId) return state;
      return {
        ...state,
        messages: mergeMessages(state.messages, action.messages.map(toTimelineMessage)),
      };
    case 'history.prepended':
      if (state.conversation?.conversationId !== action.conversationId) return state;
      return {
        ...state,
        messages: mergeMessages(action.messages.map(toTimelineMessage), state.messages),
        hasOlderMessages: action.hasMore,
      };
    case 'newer.cleared':
      return { ...state, hasNewerMessages: false };
    case 'connection.changed':
      return { ...state, connectionState: action.state };
    case 'message.pending': {
      if (!state.conversation) return state;
      const pending: CustomerConsultationTimelineMessage = {
        messageId: null,
        conversationId: state.conversation.conversationId,
        clientMessageId: action.clientMessageId,
        senderType: 'CUSTOMER',
        senderUserId: state.conversation.customerUserId,
        senderName: state.conversation.customerName,
        messageType: action.messageType,
        textContent: action.textContent,
        image: action.image,
        assignmentVersion: state.conversation.assignmentVersion,
        createdAt: action.localCreatedAt,
        deliveryStatus: 'SENDING',
      };
      return { ...state, messages: mergeMessages(state.messages, [pending]) };
    }
    case 'message.failed':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.clientMessageId === action.clientMessageId
            ? { ...message, deliveryStatus: 'FAILED' as const }
            : message
        ),
      };
    case 'event.received': {
      const { event } = action;
      if (state.processedEventIds.includes(event.eventId)) return state;
      let next: CustomerConsultationState = {
        ...state,
        processedEventIds: [...state.processedEventIds, event.eventId].slice(-MAX_PROCESSED_EVENT_IDS),
      };
      if (event.event === 'conversation.snapshot') {
        const snapshot = event.payload as CustomerServiceConversation;
        return !next.conversation || snapshot.conversationId === next.conversation.conversationId
          ? { ...next, conversation: snapshot }
          : next;
      }
      if (event.event === 'message.ack') {
        const payload = event.payload as CustomerServiceMessageAckPayload;
        return {
          ...next,
          messages: next.messages.map((message) =>
            message.clientMessageId === payload.clientMessageId
              ? {
                  ...message,
                  messageId: payload.messageId,
                  createdAt: payload.createdAt ?? message.createdAt,
                  deliveryStatus: 'DELIVERED' as const,
                }
              : message
          ),
        };
      }
      if (event.event === 'message.created') {
        const message = event.payload as CustomerServiceMessage;
        if (next.conversation && message.conversationId !== next.conversation.conversationId) return next;
        return {
          ...next,
          messages: mergeMessages(next.messages, [toTimelineMessage(message)]),
          hasNewerMessages: next.hasNewerMessages || (message.senderType === 'STAFF' && !action.viewingLatest),
        };
      }
      if (
        event.event === 'conversation.assigned' ||
        event.event === 'conversation.transferred' ||
        event.event === 'conversation.closed'
      ) {
        const payload = event.payload as CustomerServiceLifecyclePayload;
        next = { ...next, conversation: applyLifecycle(next.conversation, payload) };
        if (payload.systemMessage) {
          next = { ...next, messages: mergeMessages(next.messages, [toTimelineMessage(payload.systemMessage)]) };
        }
      }
      return next;
    }
  }
};
