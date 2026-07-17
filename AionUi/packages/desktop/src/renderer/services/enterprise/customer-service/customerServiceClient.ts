import { z } from 'zod';

import { CUSTOMER_SERVICE_IPC_ERROR_MESSAGES } from '@/common/enterprise/customer-service/constants';
import type {
  CustomerServiceCloseRequest,
  CustomerServiceConnectionSnapshot,
  CustomerServiceConversation,
  CustomerServiceConversationIdRequest,
  CustomerServiceConversationListRequest,
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
  CustomerServiceStaffCandidate,
  CustomerServiceStaffCandidatesRequest,
  CustomerServiceTransferRequest,
  CustomerServiceUploadImageRequest,
} from '@/common/enterprise/customer-service/contracts';
import {
  CUSTOMER_SERVICE_COMMAND_SCHEMAS,
  customerServiceConnectionSnapshotSchema,
  customerServiceConversationSchema,
  customerServiceImageSchema,
  customerServiceIpcResultSchema,
  customerServiceMessageSchema,
  customerServicePageSchema,
  customerServiceReadResultSchema,
  customerServiceServerEnvelopeSchema,
  customerServiceStaffCandidateSchema,
} from '@/common/enterprise/customer-service/schemas';
import type { ElectronBridgeAPI } from '@/common/types/platform/electron';

export type CustomerServiceRawBridge = NonNullable<ElectronBridgeAPI['customerService']>;
export type CustomerServiceRawBridgeProvider = () => CustomerServiceRawBridge | undefined;

export type CustomerServiceClient = {
  connect: () => Promise<CustomerServiceConnectionSnapshot>;
  disconnect: () => Promise<void>;
  listConversations: (
    request: CustomerServiceConversationListRequest
  ) => Promise<CustomerServicePage<CustomerServiceConversation>>;
  getConversation: (request: CustomerServiceConversationIdRequest) => Promise<CustomerServiceConversation>;
  getHistory: (request: CustomerServiceMessageHistoryRequest) => Promise<CustomerServicePage<CustomerServiceMessage>>;
  sendMessage: (request: CustomerServiceSendMessageRequest) => Promise<string>;
  markRead: (request: CustomerServiceMarkReadRequest) => Promise<CustomerServiceReadResult>;
  uploadImage: (request: CustomerServiceUploadImageRequest) => Promise<CustomerServiceImage>;
  listCandidates: (
    request: CustomerServiceStaffCandidatesRequest
  ) => Promise<CustomerServicePage<CustomerServiceStaffCandidate>>;
  transferConversation: (request: CustomerServiceTransferRequest) => Promise<CustomerServiceConversation>;
  closeConversation: (request: CustomerServiceCloseRequest) => Promise<CustomerServiceConversation>;
  onEvent: (listener: (event: CustomerServiceServerEnvelope) => void) => () => void;
};

/** Renderer-safe error reconstructed from a fixed IPC error code. */
export class CustomerServiceRendererError extends Error {
  readonly code: CustomerServiceIpcErrorCode;

  constructor(code: CustomerServiceIpcErrorCode) {
    super(CUSTOMER_SERVICE_IPC_ERROR_MESSAGES[code]);
    this.name = 'CustomerServiceRendererError';
    this.code = code;
  }
}

const rendererError = (code: CustomerServiceIpcErrorCode): CustomerServiceRendererError =>
  new CustomerServiceRendererError(code);

const invoke = async <T>(
  getBridge: CustomerServiceRawBridgeProvider,
  responseSchema: z.ZodTypeAny,
  operation: (bridge: CustomerServiceRawBridge) => Promise<CustomerServiceIpcResult<T>>
): Promise<T> => {
  let untrustedResult: unknown;
  try {
    const bridge = getBridge();
    if (!bridge) throw rendererError('IPC_UNAVAILABLE');
    untrustedResult = await operation(bridge);
  } catch {
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

/** Creates an injectable renderer client; UI components never access window.electronAPI directly. */
export const createCustomerServiceClient = (getBridge: CustomerServiceRawBridgeProvider): CustomerServiceClient => ({
  connect: () =>
    invoke<CustomerServiceConnectionSnapshot>(getBridge, customerServiceConnectionSnapshotSchema, (bridge) =>
      bridge.connect()
    ),
  disconnect: () => invoke<void>(getBridge, z.void(), (bridge) => bridge.disconnect()),
  listConversations: (request) => {
    const parsed = CUSTOMER_SERVICE_COMMAND_SCHEMAS.listConversations.parse(
      request
    ) as CustomerServiceConversationListRequest;
    return invoke<CustomerServicePage<CustomerServiceConversation>>(
      getBridge,
      customerServicePageSchema(customerServiceConversationSchema),
      (bridge) => bridge.listConversations(parsed)
    );
  },
  getConversation: (request) => {
    const parsed = CUSTOMER_SERVICE_COMMAND_SCHEMAS.getConversation.parse(
      request
    ) as CustomerServiceConversationIdRequest;
    return invoke<CustomerServiceConversation>(getBridge, customerServiceConversationSchema, (bridge) =>
      bridge.getConversation(parsed)
    );
  },
  getHistory: (request) => {
    const parsed = CUSTOMER_SERVICE_COMMAND_SCHEMAS.getHistory.parse(request) as CustomerServiceMessageHistoryRequest;
    return invoke<CustomerServicePage<CustomerServiceMessage>>(
      getBridge,
      customerServicePageSchema(customerServiceMessageSchema),
      (bridge) => bridge.getHistory(parsed)
    );
  },
  sendMessage: (request) => {
    const parsed = CUSTOMER_SERVICE_COMMAND_SCHEMAS.sendMessage.parse(request) as CustomerServiceSendMessageRequest;
    return invoke<string>(getBridge, z.string().uuid(), (bridge) => bridge.sendMessage(parsed));
  },
  markRead: (request) => {
    const parsed = CUSTOMER_SERVICE_COMMAND_SCHEMAS.markRead.parse(request) as CustomerServiceMarkReadRequest;
    return invoke<CustomerServiceReadResult>(getBridge, customerServiceReadResultSchema, (bridge) =>
      bridge.markRead(parsed)
    );
  },
  uploadImage: (request) => {
    const parsed = CUSTOMER_SERVICE_COMMAND_SCHEMAS.uploadImage.parse(request) as CustomerServiceUploadImageRequest;
    return invoke<CustomerServiceImage>(getBridge, customerServiceImageSchema, (bridge) => bridge.uploadImage(parsed));
  },
  listCandidates: (request) => {
    const parsed = CUSTOMER_SERVICE_COMMAND_SCHEMAS.listCandidates.parse(
      request
    ) as CustomerServiceStaffCandidatesRequest;
    return invoke<CustomerServicePage<CustomerServiceStaffCandidate>>(
      getBridge,
      customerServicePageSchema(customerServiceStaffCandidateSchema),
      (bridge) => bridge.listCandidates(parsed)
    );
  },
  transferConversation: (request) => {
    const parsed = CUSTOMER_SERVICE_COMMAND_SCHEMAS.transferConversation.parse(
      request
    ) as CustomerServiceTransferRequest;
    return invoke<CustomerServiceConversation>(getBridge, customerServiceConversationSchema, (bridge) =>
      bridge.transferConversation(parsed)
    );
  },
  closeConversation: (request) => {
    const parsed = CUSTOMER_SERVICE_COMMAND_SCHEMAS.closeConversation.parse(request) as CustomerServiceCloseRequest;
    return invoke<CustomerServiceConversation>(getBridge, customerServiceConversationSchema, (bridge) =>
      bridge.closeConversation(parsed)
    );
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

const getWindowCustomerServiceBridge = (): CustomerServiceRawBridge | undefined =>
  typeof window === 'undefined' ? undefined : window.electronAPI?.customerService;

export const customerServiceClient = createCustomerServiceClient(getWindowCustomerServiceBridge);
