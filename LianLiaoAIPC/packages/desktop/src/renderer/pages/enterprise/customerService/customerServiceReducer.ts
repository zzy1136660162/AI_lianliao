import type {
  CustomerServiceConnectionState,
  CustomerServiceConversation,
  CustomerServiceImage,
  CustomerServiceLifecyclePayload,
  CustomerServiceMessage,
  CustomerServiceMessageAckPayload,
  CustomerServiceReadUpdatedPayload,
  CustomerServiceServerEnvelope,
} from '@/common/enterprise/customer-service/contracts';

export type CustomerServiceQueue = 'PENDING' | 'ACTIVE' | 'CLOSED';
export type CustomerServiceDeliveryStatus = 'SENDING' | 'DELIVERED' | 'FAILED';

export type CustomerServiceTimelineMessage = Omit<CustomerServiceMessage, 'messageId' | 'createdAt'> & {
  messageId: string | null;
  createdAt: number;
  deliveryStatus: CustomerServiceDeliveryStatus;
};

export type CustomerServiceTimeline = {
  messages: CustomerServiceTimelineMessage[];
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
};

export type CustomerServiceWorkbenchState = {
  currentStaffUserId: string;
  conversations: Record<string, CustomerServiceConversation>;
  conversationOrder: string[];
  selectedConversationId: string | null;
  timelines: Record<string, CustomerServiceTimeline>;
  processedEventIds: string[];
  connectionState: CustomerServiceConnectionState;
};

export type CustomerServiceWorkbenchAction =
  | { type: 'conversations.loaded'; conversations: CustomerServiceConversation[] }
  | { type: 'conversation.updated'; conversation: CustomerServiceConversation }
  | { type: 'conversation.selected'; conversationId: string }
  | {
      type: 'history.loaded';
      conversationId: string;
      messages: CustomerServiceMessage[];
      hasMore: boolean;
    }
  | {
      type: 'history.prepended';
      conversationId: string;
      messages: CustomerServiceMessage[];
      hasMore: boolean;
    }
  | { type: 'history.newerCleared'; conversationId: string }
  | {
      type: 'message.pending';
      conversationId: string;
      clientMessageId: string;
      messageType: 'TEXT' | 'IMAGE';
      textContent?: string | null;
      image?: CustomerServiceImage | null;
      localCreatedAt: number;
    }
  | { type: 'message.failed'; conversationId: string; clientMessageId: string }
  | {
      type: 'event.received';
      event: CustomerServiceServerEnvelope;
      viewingLatest: boolean;
    }
  | { type: 'read.confirmed'; conversationId: string; messageId: string }
  | { type: 'connection.changed'; state: CustomerServiceConnectionState };

const EMPTY_TIMELINE: CustomerServiceTimeline = {
  messages: [],
  hasOlderMessages: false,
  hasNewerMessages: false,
};

const MAX_PROCESSED_EVENT_IDS = 2_000;

/** Creates deterministic workbench state without coercing Oracle identifiers to numbers. */
export const createInitialCustomerServiceState = (currentStaffUserId: string): CustomerServiceWorkbenchState => ({
  currentStaffUserId,
  conversations: {},
  conversationOrder: [],
  selectedConversationId: null,
  timelines: {},
  processedEventIds: [],
  connectionState: 'IDLE',
});

/** Maps an assigned conversation to the queue shown to the current staff member. */
export const classifyCustomerServiceConversation = (
  conversation: CustomerServiceConversation,
  currentStaffUserId: string
): CustomerServiceQueue | null => {
  if (conversation.status === 'WAITING') return null;
  if (conversation.status === 'CLOSED' || conversation.staffUserId !== currentStaffUserId) return 'CLOSED';
  return conversation.staffFirstReplyAt === null ? 'PENDING' : 'ACTIVE';
};

/** A closed or transferred conversation remains visible but cannot accept new replies. */
export const isCustomerServiceConversationReadOnly = (
  conversation: CustomerServiceConversation,
  currentStaffUserId: string
): boolean => conversation.status !== 'ACTIVE' || conversation.staffUserId !== currentStaffUserId;

const conversationSortTime = (conversation: CustomerServiceConversation): number =>
  conversation.lastMessageAt ?? conversation.updatedAt ?? conversation.createdAt ?? 0;

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

/** Returns a queue-specific, locally filtered view ordered by latest activity. */
export const selectCustomerServiceConversations = (
  state: CustomerServiceWorkbenchState,
  queue: CustomerServiceQueue,
  keyword = ''
): CustomerServiceConversation[] => {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();
  return state.conversationOrder
    .map((conversationId) => state.conversations[conversationId])
    .filter((conversation): conversation is CustomerServiceConversation => Boolean(conversation))
    .filter((conversation) => classifyCustomerServiceConversation(conversation, state.currentStaffUserId) === queue)
    .filter((conversation) => {
      if (!normalizedKeyword) return true;
      return [
        conversation.customerName,
        conversation.customerTel,
        conversation.customerCompanyName,
        conversation.lastMessagePreview,
      ].some((value) => value?.toLocaleLowerCase().includes(normalizedKeyword));
    })
    .toSorted((left, right) => {
      const timeDifference = conversationSortTime(right) - conversationSortTime(left);
      return timeDifference || -compareSignedDecimalIds(left.conversationId, right.conversationId);
    });
};

/** Counts each derived queue while excluding unassigned waiting conversations. */
export const getCustomerServiceQueueCounts = (
  state: CustomerServiceWorkbenchState
): Record<CustomerServiceQueue, number> => {
  const counts: Record<CustomerServiceQueue, number> = { PENDING: 0, ACTIVE: 0, CLOSED: 0 };
  for (const conversation of Object.values(state.conversations)) {
    const queue = classifyCustomerServiceConversation(conversation, state.currentStaffUserId);
    if (queue) counts[queue] += 1;
  }
  return counts;
};

const toTimelineMessage = (message: CustomerServiceMessage): CustomerServiceTimelineMessage => ({
  ...message,
  createdAt: message.createdAt ?? 0,
  deliveryStatus: 'DELIVERED',
});

const sortTimelineMessages = (messages: CustomerServiceTimelineMessage[]): CustomerServiceTimelineMessage[] =>
  messages.toSorted((left, right) => {
    const timeDifference = left.createdAt - right.createdAt;
    if (timeDifference) return timeDifference;
    return compareSignedDecimalIds(left.messageId, right.messageId);
  });

const mergeTimelineMessages = (
  current: CustomerServiceTimelineMessage[],
  incoming: CustomerServiceTimelineMessage[]
): CustomerServiceTimelineMessage[] => {
  const merged = [...current];
  for (const next of incoming) {
    const existingIndex = merged.findIndex(
      (item) =>
        (next.messageId !== null && item.messageId === next.messageId) ||
        (Boolean(next.clientMessageId) && item.clientMessageId === next.clientMessageId)
    );
    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...next,
        deliveryStatus: next.deliveryStatus,
      };
    } else {
      merged.push(next);
    }
  }
  return sortTimelineMessages(merged);
};

const withConversations = (
  state: CustomerServiceWorkbenchState,
  conversations: CustomerServiceConversation[]
): CustomerServiceWorkbenchState => {
  const nextConversations = { ...state.conversations };
  const nextOrder = [...state.conversationOrder];
  for (const conversation of conversations) {
    nextConversations[conversation.conversationId] = {
      ...nextConversations[conversation.conversationId],
      ...conversation,
    };
    if (!nextOrder.includes(conversation.conversationId)) nextOrder.push(conversation.conversationId);
  }
  return { ...state, conversations: nextConversations, conversationOrder: nextOrder };
};

const withProcessedEvent = (state: CustomerServiceWorkbenchState, eventId: string): CustomerServiceWorkbenchState => ({
  ...state,
  processedEventIds: [...state.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENT_IDS),
});

const reduceMessageAcknowledgement = (
  state: CustomerServiceWorkbenchState,
  conversationId: string,
  payload: CustomerServiceMessageAckPayload
): CustomerServiceWorkbenchState => {
  const timeline = state.timelines[conversationId] ?? EMPTY_TIMELINE;
  const messages = timeline.messages.map((item) =>
    item.clientMessageId === payload.clientMessageId
      ? {
          ...item,
          messageId: payload.messageId,
          createdAt: payload.createdAt ?? item.createdAt,
          deliveryStatus: 'DELIVERED' as const,
        }
      : item
  );
  return {
    ...state,
    timelines: {
      ...state.timelines,
      [conversationId]: { ...timeline, messages: sortTimelineMessages(messages) },
    },
  };
};

const reduceCreatedMessage = (
  state: CustomerServiceWorkbenchState,
  message: CustomerServiceMessage,
  viewingLatest: boolean
): CustomerServiceWorkbenchState => {
  const conversation = state.conversations[message.conversationId];
  const timeline = state.timelines[message.conversationId] ?? EMPTY_TIMELINE;
  const messages = mergeTimelineMessages(timeline.messages, [toTimelineMessage(message)]);
  const nextConversation = conversation
    ? {
        ...conversation,
        lastMessageId: message.messageId,
        lastMessageAt: message.createdAt,
        lastMessageType: message.messageType,
        lastMessagePreview: message.textContent,
        staffUnreadCount:
          message.senderType === 'CUSTOMER' ? conversation.staffUnreadCount + 1 : conversation.staffUnreadCount,
        staffFirstReplyAt:
          message.senderType === 'STAFF' && conversation.staffFirstReplyAt === null
            ? message.createdAt
            : conversation.staffFirstReplyAt,
      }
    : null;
  const nextState = {
    ...state,
    timelines: {
      ...state.timelines,
      [message.conversationId]: {
        ...timeline,
        messages,
        hasNewerMessages: timeline.hasNewerMessages || !viewingLatest,
      },
    },
  };
  return nextConversation ? withConversations(nextState, [nextConversation]) : nextState;
};

const reduceLifecycleEvent = (
  state: CustomerServiceWorkbenchState,
  conversationId: string,
  payload: CustomerServiceLifecyclePayload
): CustomerServiceWorkbenchState => {
  const conversation = state.conversations[conversationId];
  if (!conversation) return state;
  let nextState = withConversations(state, [
    {
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
    },
  ]);
  if (payload.systemMessage) nextState = reduceCreatedMessage(nextState, payload.systemMessage, true);
  return nextState;
};

const reduceServerEvent = (
  state: CustomerServiceWorkbenchState,
  event: CustomerServiceServerEnvelope,
  viewingLatest: boolean
): CustomerServiceWorkbenchState => {
  if (state.processedEventIds.includes(event.eventId)) return state;
  let nextState = withProcessedEvent(state, event.eventId);
  const conversationId = event.conversationId ?? null;

  if (event.event === 'conversation.snapshot') {
    return withConversations(nextState, [event.payload as CustomerServiceConversation]);
  }
  if (event.event === 'message.created') {
    return reduceCreatedMessage(nextState, event.payload as CustomerServiceMessage, viewingLatest);
  }
  if (event.event === 'message.ack' && conversationId) {
    return reduceMessageAcknowledgement(nextState, conversationId, event.payload as CustomerServiceMessageAckPayload);
  }
  if (
    (event.event === 'conversation.assigned' ||
      event.event === 'conversation.transferred' ||
      event.event === 'conversation.closed') &&
    conversationId
  ) {
    return reduceLifecycleEvent(nextState, conversationId, event.payload as CustomerServiceLifecyclePayload);
  }
  if (event.event === 'read.updated' && conversationId) {
    const payload = event.payload as CustomerServiceReadUpdatedPayload;
    if (payload.readerType === 'STAFF') {
      const conversation = nextState.conversations[conversationId];
      if (conversation) {
        nextState = withConversations(nextState, [
          { ...conversation, staffUnreadCount: 0, staffLastReadId: payload.lastReadMessageId },
        ]);
      }
    }
  }
  return nextState;
};

/** Applies REST snapshots, optimistic sends, and validated server events to the workbench. */
export const customerServiceReducer = (
  state: CustomerServiceWorkbenchState,
  action: CustomerServiceWorkbenchAction
): CustomerServiceWorkbenchState => {
  switch (action.type) {
    case 'conversations.loaded':
      return withConversations(state, action.conversations);
    case 'conversation.updated':
      return withConversations(state, [action.conversation]);
    case 'conversation.selected':
      return { ...state, selectedConversationId: action.conversationId };
    case 'history.loaded': {
      const timeline = state.timelines[action.conversationId] ?? EMPTY_TIMELINE;
      return {
        ...state,
        timelines: {
          ...state.timelines,
          [action.conversationId]: {
            ...timeline,
            messages: mergeTimelineMessages([], action.messages.map(toTimelineMessage)),
            hasOlderMessages: action.hasMore,
            hasNewerMessages: false,
          },
        },
      };
    }
    case 'history.prepended': {
      const timeline = state.timelines[action.conversationId] ?? EMPTY_TIMELINE;
      return {
        ...state,
        timelines: {
          ...state.timelines,
          [action.conversationId]: {
            ...timeline,
            messages: mergeTimelineMessages(action.messages.map(toTimelineMessage), timeline.messages),
            hasOlderMessages: action.hasMore,
          },
        },
      };
    }
    case 'history.newerCleared': {
      const timeline = state.timelines[action.conversationId];
      if (!timeline) return state;
      return {
        ...state,
        timelines: {
          ...state.timelines,
          [action.conversationId]: { ...timeline, hasNewerMessages: false },
        },
      };
    }
    case 'message.pending': {
      const conversation = state.conversations[action.conversationId];
      const timeline = state.timelines[action.conversationId] ?? EMPTY_TIMELINE;
      const pending: CustomerServiceTimelineMessage = {
        messageId: null,
        conversationId: action.conversationId,
        clientMessageId: action.clientMessageId,
        senderType: 'STAFF',
        senderUserId: state.currentStaffUserId,
        senderName: conversation?.staffName ?? null,
        messageType: action.messageType,
        textContent: action.textContent ?? null,
        image: action.image ?? null,
        assignmentVersion: conversation?.assignmentVersion ?? 0,
        createdAt: action.localCreatedAt,
        deliveryStatus: 'SENDING',
      };
      return {
        ...state,
        timelines: {
          ...state.timelines,
          [action.conversationId]: {
            ...timeline,
            messages: mergeTimelineMessages(timeline.messages, [pending]),
          },
        },
      };
    }
    case 'message.failed': {
      const timeline = state.timelines[action.conversationId];
      if (!timeline) return state;
      return {
        ...state,
        timelines: {
          ...state.timelines,
          [action.conversationId]: {
            ...timeline,
            messages: timeline.messages.map((item) =>
              item.clientMessageId === action.clientMessageId
                ? Object.assign({}, item, { deliveryStatus: 'FAILED' as const })
                : item
            ),
          },
        },
      };
    }
    case 'event.received':
      return reduceServerEvent(state, action.event, action.viewingLatest);
    case 'read.confirmed': {
      const conversation = state.conversations[action.conversationId];
      if (!conversation) return state;
      return withConversations(state, [{ ...conversation, staffUnreadCount: 0, staffLastReadId: action.messageId }]);
    }
    case 'connection.changed':
      return { ...state, connectionState: action.state };
  }
};
