import { describe, expect, it } from 'vitest';

import type {
  CustomerServiceConversation,
  CustomerServiceMessage,
  CustomerServiceServerEnvelope,
} from '@/common/enterprise/customer-service/contracts';
import {
  classifyCustomerServiceConversation,
  createInitialCustomerServiceState,
  customerServiceReducer,
  getCustomerServiceQueueCounts,
  isCustomerServiceConversationReadOnly,
  selectCustomerServiceConversations,
} from '@/renderer/pages/enterprise/customerService/customerServiceReducer';

const STAFF_ID = '-19';

const conversation = (
  conversationId: string,
  overrides: Partial<CustomerServiceConversation> = {}
): CustomerServiceConversation => ({
  conversationId,
  status: 'ACTIVE',
  customerUserId: '-7',
  customerName: `客户 ${conversationId}`,
  customerTel: '138****2587',
  customerCompanyId: '-18',
  customerCompanyName: '沈阳航燃科技有限公司',
  staffUserId: STAFF_ID,
  staffName: '客服人员',
  allocationSource: '推广登记',
  staffFirstReplyAt: null,
  lastMessageId: null,
  lastMessageAt: 1_700_000_000_000,
  staffUnreadCount: 0,
  lastMessageType: null,
  lastMessagePreview: null,
  customerLastReadId: null,
  staffLastReadId: null,
  assignmentVersion: 1,
  version: 1,
  closedByType: null,
  closedById: null,
  closedReason: null,
  closedAt: null,
  assignedAt: 1_700_000_000_000,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...overrides,
});

const message = (
  messageId: string,
  conversationId: string,
  createdAt: number,
  overrides: Partial<CustomerServiceMessage> = {}
): CustomerServiceMessage => ({
  messageId,
  conversationId,
  clientMessageId: `11111111-1111-4111-8111-${messageId.replace('-', '').padStart(12, '0')}`,
  senderType: 'CUSTOMER',
  senderUserId: '-7',
  senderName: '客户',
  messageType: 'TEXT',
  textContent: `消息 ${messageId}`,
  image: null,
  assignmentVersion: 1,
  createdAt,
  ...overrides,
});

const serverEvent = <TPayload>(
  event: CustomerServiceServerEnvelope['event'],
  conversationId: string,
  payload: TPayload,
  eventId: string
): CustomerServiceServerEnvelope<TPayload> => ({
  event,
  eventId,
  conversationId,
  serverTime: 1_700_000_000_000,
  payload,
});

describe('customer-service workbench reducer', () => {
  it('derives the three staff queues and filters by customer or company text', () => {
    const items = [
      conversation('-8', { customerName: '张先生' }),
      conversation('-9', { staffFirstReplyAt: 1_700_000_000_100 }),
      conversation('-10', { status: 'CLOSED' }),
      conversation('-11', { staffUserId: '-20' }),
      conversation('-12', { status: 'WAITING', staffUserId: null }),
    ];
    let state = createInitialCustomerServiceState(STAFF_ID);
    state = customerServiceReducer(state, { type: 'conversations.loaded', conversations: items });

    expect(classifyCustomerServiceConversation(items[0], STAFF_ID)).toBe('PENDING');
    expect(classifyCustomerServiceConversation(items[1], STAFF_ID)).toBe('ACTIVE');
    expect(classifyCustomerServiceConversation(items[2], STAFF_ID)).toBe('CLOSED');
    expect(classifyCustomerServiceConversation(items[3], STAFF_ID)).toBe('CLOSED');
    expect(classifyCustomerServiceConversation(items[4], STAFF_ID)).toBeNull();
    expect(getCustomerServiceQueueCounts(state)).toEqual({ PENDING: 1, ACTIVE: 1, CLOSED: 2 });
    expect(selectCustomerServiceConversations(state, 'PENDING', '航燃').map((item) => item.conversationId)).toEqual([
      '-8',
    ]);
  });

  it('keeps signed string IDs while deduplicating and ordering history', () => {
    let state = createInitialCustomerServiceState(STAFF_ID);
    state = customerServiceReducer(state, {
      type: 'conversations.loaded',
      conversations: [conversation('-8')],
    });
    state = customerServiceReducer(state, { type: 'conversation.selected', conversationId: '-8' });
    state = customerServiceReducer(state, {
      type: 'history.loaded',
      conversationId: '-8',
      messages: [message('-9', '-8', 200), message('-10', '-8', 100), message('-9', '-8', 200)],
      hasMore: false,
    });

    expect(state.selectedConversationId).toBe('-8');
    expect(state.timelines['-8']?.messages.map((item) => item.messageId)).toEqual(['-10', '-9']);
  });

  it('moves an optimistic message from sending to delivered without duplicating the server event', () => {
    const clientMessageId = '22222222-2222-4222-8222-222222222222';
    let state = createInitialCustomerServiceState(STAFF_ID);
    state = customerServiceReducer(state, {
      type: 'conversations.loaded',
      conversations: [conversation('-8')],
    });
    state = customerServiceReducer(state, {
      type: 'message.pending',
      conversationId: '-8',
      clientMessageId,
      messageType: 'TEXT',
      textContent: '您好，请问需要什么帮助？',
      localCreatedAt: 100,
    });
    state = customerServiceReducer(state, {
      type: 'event.received',
      event: serverEvent('message.ack', '-8', { messageId: '-20', clientMessageId, createdAt: 200 }, 'event-ack'),
      viewingLatest: true,
    });
    const delivered = message('-20', '-8', 200, {
      clientMessageId,
      senderType: 'STAFF',
      senderUserId: STAFF_ID,
      senderName: '客服人员',
      textContent: '您好，请问需要什么帮助？',
    });
    state = customerServiceReducer(state, {
      type: 'event.received',
      event: serverEvent('message.created', '-8', delivered, 'event-created'),
      viewingLatest: true,
    });

    expect(state.timelines['-8']?.messages).toHaveLength(1);
    expect(state.timelines['-8']?.messages[0]).toMatchObject({
      messageId: '-20',
      clientMessageId,
      deliveryStatus: 'DELIVERED',
    });
  });

  it('increments unread and exposes a newer-message marker while older history is being viewed', () => {
    let state = createInitialCustomerServiceState(STAFF_ID);
    state = customerServiceReducer(state, {
      type: 'conversations.loaded',
      conversations: [conversation('-8', { staffUnreadCount: 2 })],
    });
    state = customerServiceReducer(state, { type: 'conversation.selected', conversationId: '-8' });
    const incoming = message('-30', '-8', 300);
    const event = serverEvent('message.created', '-8', incoming, 'event-customer-message');

    state = customerServiceReducer(state, { type: 'event.received', event, viewingLatest: false });
    state = customerServiceReducer(state, { type: 'event.received', event, viewingLatest: false });

    expect(state.conversations['-8']?.staffUnreadCount).toBe(3);
    expect(state.timelines['-8']?.hasNewerMessages).toBe(true);
  });

  it('makes transferred and closed conversations read-only', () => {
    expect(isCustomerServiceConversationReadOnly(conversation('-8', { staffUserId: '-20' }), STAFF_ID)).toBe(true);
    expect(isCustomerServiceConversationReadOnly(conversation('-9', { status: 'CLOSED' }), STAFF_ID)).toBe(true);
    expect(isCustomerServiceConversationReadOnly(conversation('-10'), STAFF_ID)).toBe(false);
  });
});
