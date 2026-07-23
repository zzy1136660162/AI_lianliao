import { z } from 'zod';

import { CUSTOMER_SERVICE_IPC_ERROR_MESSAGES } from '@/common/enterprise/customer-service/constants';
import type {
  CustomerServiceCloseRequest,
  CustomerServiceConnectionSnapshot,
  CustomerServiceConversation,
  CustomerServiceConversationIdRequest,
  CustomerServiceImage,
  CustomerServiceIpcErrorCode,
  CustomerServiceIpcResult,
  CustomerServiceMarkReadRequest,
  CustomerServiceMessage,
  CustomerServiceMessageHistoryRequest,
  CustomerServicePage,
  CustomerServiceReadResult,
  CustomerServiceSendMessageRequest,
  CustomerServiceServerEnvelope,
  CustomerServiceUploadImageRequest,
} from '@/common/enterprise/customer-service/contracts';
import {
  CUSTOMER_CONSULTATION_COMMAND_SCHEMAS,
  customerServiceConnectionSnapshotSchema,
  customerServiceConversationSchema,
  customerServiceImageSchema,
  customerServiceIpcResultSchema,
  customerServiceMessageSchema,
  customerServicePageSchema,
  customerServiceReadResultSchema,
  customerServiceServerEnvelopeSchema,
} from '@/common/enterprise/customer-service/schemas';
import type { ElectronBridgeAPI } from '@/common/types/platform/electron';

export type CustomerConsultationRawBridge = NonNullable<ElectronBridgeAPI['customerConsultation']>;
export type CustomerConsultationRawBridgeProvider = () => CustomerConsultationRawBridge | undefined;

export type CustomerConsultationClient = {
  connect: () => Promise<CustomerServiceConnectionSnapshot>;
  disconnect: () => Promise<void>;
  openConversation: () => Promise<CustomerServiceConversation>;
  startConversation: () => Promise<CustomerServiceConversation>;
  getConversation: (request: CustomerServiceConversationIdRequest) => Promise<CustomerServiceConversation>;
  getHistory: (request: CustomerServiceMessageHistoryRequest) => Promise<CustomerServicePage<CustomerServiceMessage>>;
  sendMessage: (request: CustomerServiceSendMessageRequest) => Promise<string>;
  markRead: (request: CustomerServiceMarkReadRequest) => Promise<CustomerServiceReadResult>;
  uploadImage: (request: CustomerServiceUploadImageRequest) => Promise<CustomerServiceImage>;
  closeConversation: (request: CustomerServiceCloseRequest) => Promise<CustomerServiceConversation>;
  onEvent: (listener: (event: CustomerServiceServerEnvelope) => void) => () => void;
};

/** Renderer-safe error rebuilt solely from the fixed shared error map. */
export class CustomerConsultationRendererError extends Error {
  readonly code: CustomerServiceIpcErrorCode;

  constructor(code: CustomerServiceIpcErrorCode) {
    super(CUSTOMER_SERVICE_IPC_ERROR_MESSAGES[code]);
    this.name = 'CustomerConsultationRendererError';
    this.code = code;
  }
}

const rendererError = (code: CustomerServiceIpcErrorCode): CustomerConsultationRendererError =>
  new CustomerConsultationRendererError(code);

const invoke = async <T>(
  getBridge: CustomerConsultationRawBridgeProvider,
  responseSchema: z.ZodTypeAny,
  operation: (bridge: CustomerConsultationRawBridge) => Promise<CustomerServiceIpcResult<T>>
): Promise<T> => {
  let untrustedResult: unknown;
  try {
    const bridge = getBridge();
    if (!bridge) throw rendererError('IPC_UNAVAILABLE');
    untrustedResult = await operation(bridge);
  } catch (error) {
    if (error instanceof CustomerConsultationRendererError) throw error;
    throw rendererError('IPC_UNAVAILABLE');
  }

  const parsed = customerServiceIpcResultSchema(responseSchema).safeParse(untrustedResult);
  if (!parsed.success) throw rendererError('INVALID_IPC_RESPONSE');
  const result = parsed.data as CustomerServiceIpcResult<T>;
  if (result.ok === false) {
    if (result.error.message !== CUSTOMER_SERVICE_IPC_ERROR_MESSAGES[result.error.code]) {
      throw rendererError('INVALID_IPC_RESPONSE');
    }
    throw rendererError(result.error.code);
  }
  return result.data;
};

/** Creates the customer client; React components never access electronAPI directly. */
export const createCustomerConsultationClient = (
  getBridge: CustomerConsultationRawBridgeProvider
): CustomerConsultationClient => ({
  connect: () => invoke(getBridge, customerServiceConnectionSnapshotSchema, (bridge) => bridge.connect()),
  disconnect: () => invoke(getBridge, z.void(), (bridge) => bridge.disconnect()),
  openConversation: () => invoke(getBridge, customerServiceConversationSchema, (bridge) => bridge.openConversation()),
  startConversation: () => invoke(getBridge, customerServiceConversationSchema, (bridge) => bridge.startConversation()),
  getConversation: (request) => {
    const parsed = CUSTOMER_CONSULTATION_COMMAND_SCHEMAS.getConversation.parse(
      request
    ) as CustomerServiceConversationIdRequest;
    return invoke(getBridge, customerServiceConversationSchema, (bridge) => bridge.getConversation(parsed));
  },
  getHistory: (request) => {
    const parsed = CUSTOMER_CONSULTATION_COMMAND_SCHEMAS.getHistory.parse(
      request
    ) as CustomerServiceMessageHistoryRequest;
    return invoke(getBridge, customerServicePageSchema(customerServiceMessageSchema), (bridge) =>
      bridge.getHistory(parsed)
    );
  },
  sendMessage: (request) => {
    const parsed = CUSTOMER_CONSULTATION_COMMAND_SCHEMAS.sendMessage.parse(
      request
    ) as CustomerServiceSendMessageRequest;
    return invoke(getBridge, z.string().uuid(), (bridge) => bridge.sendMessage(parsed));
  },
  markRead: (request) => {
    const parsed = CUSTOMER_CONSULTATION_COMMAND_SCHEMAS.markRead.parse(request) as CustomerServiceMarkReadRequest;
    return invoke(getBridge, customerServiceReadResultSchema, (bridge) => bridge.markRead(parsed));
  },
  uploadImage: (request) => {
    const parsed = CUSTOMER_CONSULTATION_COMMAND_SCHEMAS.uploadImage.parse(
      request
    ) as CustomerServiceUploadImageRequest;
    return invoke(getBridge, customerServiceImageSchema, (bridge) => bridge.uploadImage(parsed));
  },
  closeConversation: (request) => {
    const parsed = CUSTOMER_CONSULTATION_COMMAND_SCHEMAS.closeConversation.parse(
      request
    ) as CustomerServiceCloseRequest;
    return invoke(getBridge, customerServiceConversationSchema, (bridge) => bridge.closeConversation(parsed));
  },
  onEvent: (listener) => {
    const bridge = getBridge();
    if (!bridge) return () => undefined;
    return bridge.onEvent((untrustedEvent) => {
      const parsed = customerServiceServerEnvelopeSchema.safeParse(untrustedEvent);
      if (parsed.success) listener(parsed.data as CustomerServiceServerEnvelope);
    });
  },
});

const getWindowBridge = (): CustomerConsultationRawBridge | undefined =>
  typeof window === 'undefined' ? undefined : window.electronAPI?.customerConsultation;

export const customerConsultationClient = createCustomerConsultationClient(getWindowBridge);
