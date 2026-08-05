import { z } from 'zod';

import { DESKTOP_MANAGED_AI_PROVIDER_ID, type DesktopManagedAiSyncResult } from './contracts';

/** Rejects unknown fields so credentials cannot accidentally leak through future IPC changes. */
export const desktopManagedAiSyncResultSchema: z.ZodType<DesktopManagedAiSyncResult> = z
  .object({
    state: z.enum(['synced', 'cached', 'unavailable']),
    providerId: z.literal(DESKTOP_MANAGED_AI_PROVIDER_ID),
    modelName: z.string().trim().min(1).optional(),
  })
  .strict() as z.ZodType<DesktopManagedAiSyncResult>;
