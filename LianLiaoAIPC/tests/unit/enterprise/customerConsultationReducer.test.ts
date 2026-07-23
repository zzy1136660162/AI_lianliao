import { describe, expect, it } from 'vitest';

import type {
  CustomerServiceConversation,
  CustomerServiceMessage,
} from '@/common/enterprise/customer-service/contracts';
import {
  createInitialCustomerConsultationState,
  customerConsultationReducer,
} from '@/renderer/pages/enterprise/customerConsultation/customerConsultationReducer';

const conversation: CustomerServiceConversation = {
  conversationId: '-8',
  status: 'ACTIVE',
  customerUserId: '-7',
  customerName: '企业用户',
  customerTel: null,
  customerCompanyId: '-18',
  customerCompanyName: '沈阳航燃科技有限公司',
  staffUserId: '-19',
  staffName: '链辽客服',
  allocationSource: '推广登记',
  staffFirstReplyAt: null,
  lastMessageId: null,
  lastMessageAt: null,
  staffUnreadCount: 0,
  lastMessageType: null,
  lastMessagePreview: null,
  customerLastReadId: null,
  staffLastReadId: null,
  assignmentVersion: 0,
  version: 0,
  closedByType: null,
  closedById: null,
  closedReason: null,
  closedAt: null,
  assignedAt: null,
  createdAt: null,
  updatedAt: null,
};

const serverMessage: CustomerServiceMessage = {
  messageId: '-20',
  conversationId: '-8',
  clientMessageId: '11111111-1111-4111-8111-111111111111',
  senderType: 'CUSTOMER',
  senderUserId: '-7',
  senderName: '企业用户',
  messageType: 'TEXT',
  textContent: '您好',
  image: null,
  assignmentVersion: 0,
  createdAt: 1_700_000_000_000,
};

describe('customerConsultationReducer', () => {
  it('merges an optimistic customer message with its server event without duplication', () => {
    let state = customerConsultationReducer(createInitialCustomerConsultationState(), {
      type: 'initialized',
      conversation,
    });
    state = customerConsultationReducer(state, {
      type: 'message.pending',
      clientMessageId: serverMessage.clientMessageId,
      messageType: 'TEXT',
      textContent: '您好',
      image: null,
      localCreatedAt: 1_699_999_999_999,
    });
    state = customerConsultationReducer(state, {
      type: 'event.received',
      viewingLatest: true,
      event: {
        event: 'message.created',
        eventId: 'event-1',
        conversationId: '-8',
        serverTime: 1_700_000_000_000,
        payload: serverMessage,
      },
    });

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({ messageId: '-20', deliveryStatus: 'DELIVERED' });
  });

  it('deduplicates repeated events and flags staff replies when the user is reading older messages', () => {
    const staffMessage = { ...serverMessage, messageId: '-21', senderType: 'STAFF' as const, senderUserId: '-19' };
    const event = {
      event: 'message.created' as const,
      eventId: 'event-2',
      conversationId: '-8',
      serverTime: 1_700_000_000_001,
      payload: staffMessage,
    };
    let state = customerConsultationReducer(createInitialCustomerConsultationState(), {
      type: 'initialized',
      conversation,
    });
    state = customerConsultationReducer(state, { type: 'event.received', event, viewingLatest: false });
    state = customerConsultationReducer(state, { type: 'event.received', event, viewingLatest: false });

    expect(state.messages).toHaveLength(1);
    expect(state.hasNewerMessages).toBe(true);
  });

  it('applies closed lifecycle snapshots and disables the active conversation state', () => {
    let state = customerConsultationReducer(createInitialCustomerConsultationState(), {
      type: 'initialized',
      conversation,
    });
    state = customerConsultationReducer(state, {
      type: 'event.received',
      viewingLatest: true,
      event: {
        event: 'conversation.closed',
        eventId: 'event-3',
        conversationId: '-8',
        serverTime: 1_700_000_000_002,
        payload: {
          conversationId: '-8',
          status: 'CLOSED',
          staffUserId: '-19',
          staffName: '链辽客服',
          assignmentVersion: 0,
          version: 1,
          lastMessageId: '-21',
          lastMessageAt: 1_700_000_000_001,
          closedReason: null,
          closedAt: 1_700_000_000_002,
          assignedAt: null,
        },
      },
    });

    expect(state.conversation).toMatchObject({ status: 'CLOSED', version: 1 });
  });

  it('merges initial history with realtime messages received while history was loading', () => {
    const realtimeMessage = {
      ...serverMessage,
      messageId: '-21',
      clientMessageId: '22222222-2222-4222-8222-222222222222',
      senderType: 'STAFF' as const,
      senderUserId: '-19',
    };
    let state = customerConsultationReducer(createInitialCustomerConsultationState(), {
      type: 'initialized',
      conversation,
    });
    state = customerConsultationReducer(state, {
      type: 'event.received',
      viewingLatest: true,
      event: {
        event: 'message.created',
        eventId: 'event-before-history',
        conversationId: '-8',
        serverTime: realtimeMessage.createdAt,
        payload: realtimeMessage,
      },
    });

    state = customerConsultationReducer(state, {
      type: 'history.loaded',
      conversationId: '-8',
      messages: [serverMessage],
      hasMore: false,
    });

    expect(state.messages.map((message) => message.messageId)).toEqual(expect.arrayContaining(['-20', '-21']));
    expect(state.messages).toHaveLength(2);
  });

  it('clears the previous transcript when an explicitly started conversation has a new ID', () => {
    let state = customerConsultationReducer(createInitialCustomerConsultationState(), {
      type: 'initialized',
      conversation,
    });
    state = customerConsultationReducer(state, {
      type: 'history.loaded',
      conversationId: '-8',
      messages: [serverMessage],
      hasMore: false,
    });

    state = customerConsultationReducer(state, {
      type: 'initialized',
      conversation: { ...conversation, conversationId: '-88', status: 'WAITING' },
    });

    expect(state.conversation?.conversationId).toBe('-88');
    expect(state.messages).toEqual([]);
    expect(state.processedEventIds).toEqual([]);
  });

  it('ignores every late history response from the previous conversation', () => {
    const newConversation = { ...conversation, conversationId: '-88', status: 'WAITING' as const };
    let state = customerConsultationReducer(createInitialCustomerConsultationState(), {
      type: 'initialized',
      conversation: newConversation,
    });

    state = customerConsultationReducer(state, {
      type: 'history.synchronized',
      conversationId: '-8',
      messages: [serverMessage],
    });
    state = customerConsultationReducer(state, {
      type: 'history.loaded',
      conversationId: '-8',
      messages: [serverMessage],
      hasMore: false,
    });
    state = customerConsultationReducer(state, {
      type: 'history.prepended',
      conversationId: '-8',
      messages: [serverMessage],
      hasMore: false,
    });

    expect(state.conversation?.conversationId).toBe('-88');
    expect(state.messages).toEqual([]);
  });
});
