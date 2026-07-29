import type { DemandAiConversationSnapshot, DemandAiLineCandidate } from '@/common/enterprise/contracts';
import { enterpriseRequestSchema } from '@/common/enterprise/schemas';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

const invalidResponse = (): Error => new Error('Invalid demand AI conversation response');

const requestSnapshot = async (
  client: EnterpriseClient,
  request: Parameters<EnterpriseClient['request']>[0]
): Promise<DemandAiConversationSnapshot> => {
  if (!enterpriseRequestSchema.safeParse(request).success) throw invalidResponse();
  const response = await client.request(request);
  if (response.operation !== request.operation || !response.operation.startsWith('demand.aiConversation.')) {
    throw invalidResponse();
  }
  return response.data as DemandAiConversationSnapshot;
};

export const startDemandAiConversation = (
  client: EnterpriseClient,
  requestId: string,
  initialMessage: string
): Promise<DemandAiConversationSnapshot> =>
  requestSnapshot(client, {
    operation: 'demand.aiConversation.start',
    payload: { requestId, initialMessage },
  });

export const sendDemandAiTurn = (
  client: EnterpriseClient,
  sessionId: string,
  requestId: string,
  version: number,
  message: string
): Promise<DemandAiConversationSnapshot> =>
  requestSnapshot(client, {
    operation: 'demand.aiConversation.turn',
    payload: { sessionId, requestId, version, message },
  });

export const confirmDemandAiLine = (
  client: EnterpriseClient,
  snapshot: DemandAiConversationSnapshot,
  requestId: string,
  candidate: Pick<DemandAiLineCandidate, 'typeId' | 'variantCode'>,
  confirmSwitch = false
): Promise<DemandAiConversationSnapshot> =>
  requestSnapshot(client, {
    operation: 'demand.aiConversation.confirmLine',
    payload: {
      sessionId: snapshot.sessionId,
      requestId,
      version: snapshot.version,
      typeId: candidate.typeId,
      ...(candidate.variantCode ? { variantCode: candidate.variantCode } : {}),
      ...(confirmSwitch ? { confirmSwitch: true } : {}),
    },
  });

export const rejectDemandAiSwitch = (
  client: EnterpriseClient,
  snapshot: DemandAiConversationSnapshot,
  requestId: string
): Promise<DemandAiConversationSnapshot> =>
  requestSnapshot(client, {
    operation: 'demand.aiConversation.confirmLine',
    payload: {
      sessionId: snapshot.sessionId,
      requestId,
      version: snapshot.version,
      typeId: snapshot.lineDecision.typeId ?? 0,
      confirmSwitch: false,
    },
  });

export const patchDemandAiFields = (
  client: EnterpriseClient,
  snapshot: DemandAiConversationSnapshot,
  requestId: string,
  fields: Record<string, string>
): Promise<DemandAiConversationSnapshot> =>
  requestSnapshot(client, {
    operation: 'demand.aiConversation.patch',
    payload: {
      sessionId: snapshot.sessionId,
      requestId,
      version: snapshot.version,
      fields,
    },
  });

export const resumeDemandAiConversation = (
  client: EnterpriseClient,
  sessionId?: string
): Promise<DemandAiConversationSnapshot> =>
  requestSnapshot(client, {
    operation: 'demand.aiConversation.resume',
    payload: sessionId ? { sessionId } : {},
  });

export const cancelDemandAiConversation = (
  client: EnterpriseClient,
  snapshot: DemandAiConversationSnapshot,
  requestId: string
): Promise<DemandAiConversationSnapshot> =>
  requestSnapshot(client, {
    operation: 'demand.aiConversation.cancel',
    payload: {
      sessionId: snapshot.sessionId,
      requestId,
      version: snapshot.version,
    },
  });

export const completeDemandAiConversation = (
  client: EnterpriseClient,
  snapshot: DemandAiConversationSnapshot,
  requestId: string,
  demandId: string
): Promise<DemandAiConversationSnapshot> =>
  requestSnapshot(client, {
    operation: 'demand.aiConversation.complete',
    payload: {
      sessionId: snapshot.sessionId,
      requestId,
      version: snapshot.version,
      demandId,
    },
  });
