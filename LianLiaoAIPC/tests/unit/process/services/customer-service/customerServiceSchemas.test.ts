import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import {
  CUSTOMER_CONSULTATION_IPC_CHANNELS,
  CUSTOMER_SERVICE_ENDPOINTS,
} from '@/common/enterprise/customer-service/constants';
import {
  CUSTOMER_CONSULTATION_COMMAND_SCHEMAS,
  CUSTOMER_SERVICE_COMMAND_SCHEMAS,
  customerServiceConversationSchema,
  customerServiceServerEnvelopeSchema,
  signedBusinessIdSchema,
} from '@/common/enterprise/customer-service/schemas';

const conversationFixture = {
  conversationId: '-8',
  status: 'ACTIVE',
  customerUserId: '9223372036854775808',
  customerName: '测试客户',
  customerTel: null,
  customerCompanyId: '-18',
  customerCompanyName: '沈阳航燃科技有限公司',
  staffUserId: '-19',
  staffName: '客服人员',
  allocationSource: '推广登记',
  staffFirstReplyAt: null,
  lastMessageId: '9223372036854775808',
  lastMessageAt: 1_700_000_000_000,
  staffUnreadCount: 1,
  lastMessageType: 'TEXT',
  lastMessagePreview: '您好',
  customerLastReadId: null,
  staffLastReadId: null,
  assignmentVersion: 0,
  version: 0,
  closedByType: null,
  closedById: null,
  closedReason: null,
  closedAt: null,
  assignedAt: 1_700_000_000_000,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
} as const;

describe('customer-service schemas', () => {
  it('keeps customer authentication and conversation opening on fixed endpoints', () => {
    expect(CUSTOMER_SERVICE_ENDPOINTS.customerAuth).toBe('customer/auth');
    expect(CUSTOMER_SERVICE_ENDPOINTS.conversationOpen).toBe('conversation/open');
    expect(CUSTOMER_CONSULTATION_IPC_CHANNELS.OPEN_CONVERSATION).toBe(
      'enterprise:customer-consultation:open-conversation'
    );
  });

  it('exposes a customer-only command allowlist', () => {
    expect(Object.keys(CUSTOMER_CONSULTATION_COMMAND_SCHEMAS).toSorted()).toEqual(
      [
        'closeConversation',
        'getConversation',
        'getHistory',
        'markRead',
        'openConversation',
        'startConversation',
        'sendMessage',
        'uploadImage',
      ].toSorted()
    );
    expect(CUSTOMER_CONSULTATION_COMMAND_SCHEMAS.openConversation.parse({})).toEqual({});
    expect(CUSTOMER_CONSULTATION_COMMAND_SCHEMAS.startConversation.parse({})).toEqual({});
    expect(CUSTOMER_CONSULTATION_COMMAND_SCHEMAS.openConversation.safeParse({ accessToken: 'secret' }).success).toBe(
      false
    );
  });

  it('keeps negative and 19-digit business identifiers as strings', () => {
    expect(signedBusinessIdSchema.parse('-19')).toBe('-19');
    expect(signedBusinessIdSchema.parse('9223372036854775808')).toBe('9223372036854775808');
    expect(customerServiceConversationSchema.parse(conversationFixture).customerUserId).toBe('9223372036854775808');
  });

  it.each([0, '0', 1, 1.5, '1.5', ' 1', '+1', '12345678901234567890'])(
    'rejects an invalid business identifier: %s',
    (value) => {
      expect(signedBusinessIdSchema.safeParse(value).success).toBe(false);
    }
  );

  it('rejects extra command properties before they cross IPC', () => {
    const result = CUSTOMER_SERVICE_COMMAND_SCHEMAS.getConversation.safeParse({
      conversationId: '-8',
      accessToken: 'must-never-cross-ipc',
    });

    expect(result.success).toBe(false);
  });

  it('accepts image bytes created in another Electron context', () => {
    const crossContextBytes: unknown = vm.runInNewContext('new Uint8Array([1, 2, 3])');
    const result = CUSTOMER_SERVICE_COMMAND_SCHEMAS.uploadImage.safeParse({
      conversationId: '-8',
      fileName: 'evidence.png',
      mimeType: 'image/png',
      bytes: crossContextBytes,
    });

    expect(result.success).toBe(true);
  });

  it('rejects dangerous or unexpected keys in server events', () => {
    const event = JSON.parse(`{
      "event":"message.created",
      "eventId":"event-1",
      "requestId":null,
      "conversationId":"-8",
      "serverTime":1700000000000,
      "payload":{
        "messageId":"9223372036854775808",
        "conversationId":"-8",
        "clientMessageId":"11111111-1111-4111-8111-111111111111",
        "senderType":"CUSTOMER",
        "senderUserId":"-7",
        "senderName":"客户",
        "messageType":"TEXT",
        "textContent":"您好",
        "image":null,
        "assignmentVersion":0,
        "createdAt":1700000000000,
        "constructor":{"prototype":{"polluted":true}}
      }
    }`);

    expect(customerServiceServerEnvelopeSchema.safeParse(event).success).toBe(false);
  });

  it('accepts the connection identifier returned by a heartbeat pong', () => {
    const event = {
      event: 'pong',
      eventId: 'heartbeat-event-1',
      requestId: '11111111-1111-4111-8111-111111111111',
      conversationId: null,
      serverTime: 1_700_000_000_000,
      payload: { connectionId: 'customer-connection-1' },
    };

    expect(customerServiceServerEnvelopeSchema.safeParse(event).success).toBe(true);
  });
});
