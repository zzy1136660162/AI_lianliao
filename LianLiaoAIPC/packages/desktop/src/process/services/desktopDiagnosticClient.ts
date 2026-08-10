import { net } from 'electron';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { DesktopDiagnosticSubmitRequest, DesktopDiagnosticSubmitResult } from '@/common/types/desktopDiagnostic';
import type { EnterpriseUserContext } from '@/common/enterprise/contracts';

const ENDPOINT_PATH = 'cloud-api/DesktopDiagnosticController/submit';
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_FILES = 6;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const SECRET_KEY_PATTERN = /(?:authorization|password|passwd|secret|token|api[-_]?key|access[-_]?key)/i;

const resultSchema = z.object({
  reportNo: z.string().min(1),
  status: z.enum(['SUBMITTED', 'PARTIAL']),
  attachmentCount: z.number().int().nonnegative(),
  uploadedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
});

const envelopeSchema = z.object({
  code: z.union([z.string(), z.number()]).optional(),
  success: z.boolean().optional(),
  message: z.string().optional(),
  data: z.unknown(),
});

export type DesktopDiagnosticRuntime = {
  appVersion: string;
  coreVersion?: string;
  platform: NodeJS.Platform;
  arch: string;
};

export class DesktopDiagnosticSubmissionError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'NETWORK' | 'HTTP' | 'API_FAILURE' | 'INVALID_RESPONSE') {
    super('Desktop diagnostic submission failed.');
    this.name = 'DesktopDiagnosticSubmissionError';
  }
}

const redactText = (value: string): string =>
  value
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED]')
    .replace(/\b(api[-_]?key|access[-_]?key|token|password|passwd|secret)\s*[:=]\s*["']?[^\s"',;]+/gi, '$1=[REDACTED]');

/** Redacts secret-bearing keys and recognizable credentials before they leave the device. */
export const redactDiagnosticPayload = (value: unknown, depth = 0, budget = { nodes: 512 }): unknown => {
  if (budget.nodes-- <= 0 || depth > 8) return '[TRUNCATED]';
  if (typeof value === 'string') return redactText(value);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactDiagnosticPayload(item, depth + 1, budget));

  const result: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>)
    .slice(0, 200)
    .forEach(([key, child]) => {
      result[key] = SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : redactDiagnosticPayload(child, depth + 1, budget);
    });
  return result;
};

const validateAttachments = (request: DesktopDiagnosticSubmitRequest): void => {
  const files = request.attachments ?? [];
  if (files.length > MAX_FILES) throw new DesktopDiagnosticSubmissionError('INVALID_REQUEST');
  let total = 0;
  files.forEach((file) => {
    if (
      !file.filename.trim() ||
      !file.contentType.trim() ||
      file.data.length === 0 ||
      file.data.length > MAX_FILE_BYTES
    ) {
      throw new DesktopDiagnosticSubmissionError('INVALID_REQUEST');
    }
    total += file.data.length;
  });
  if (total > MAX_TOTAL_BYTES) throw new DesktopDiagnosticSubmissionError('INVALID_REQUEST');
};

export class DesktopDiagnosticClient {
  constructor(private readonly baseUrl: string) {}

  async submit(
    request: DesktopDiagnosticSubmitRequest,
    runtime: DesktopDiagnosticRuntime,
    identity?: EnterpriseUserContext | null
  ): Promise<DesktopDiagnosticSubmitResult> {
    if (!request.module.trim() || !request.description.trim()) {
      throw new DesktopDiagnosticSubmissionError('INVALID_REQUEST');
    }
    validateAttachments(request);

    const clientReportId = randomUUID();
    const metadata = {
      clientReportId,
      reportType: request.reportType ?? 'USER_FEEDBACK',
      module: request.module.trim(),
      description: redactText(request.description.trim()),
      diagnostic: redactDiagnosticPayload(request.diagnostic),
      openId: identity?.openId,
      userId: identity?.userId,
      companyId: identity?.companyId,
      userName: identity?.userName,
      appVersion: runtime.appVersion,
      coreVersion: runtime.coreVersion,
      platform: runtime.platform,
      arch: runtime.arch,
      clientCreatedAt: Date.now(),
    };
    const form = new FormData();
    form.append('metadata', JSON.stringify(metadata));
    (request.attachments ?? []).forEach((attachment) => {
      const bytes = Uint8Array.from(attachment.data);
      form.append('files', new Blob([bytes], { type: attachment.contentType }), attachment.filename);
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await net.fetch(new URL(ENDPOINT_PATH, this.baseUrl).toString(), {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
    } catch {
      throw new DesktopDiagnosticSubmissionError('NETWORK');
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new DesktopDiagnosticSubmissionError('HTTP');

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new DesktopDiagnosticSubmissionError('INVALID_RESPONSE');
    }
    const envelope = envelopeSchema.safeParse(json);
    if (!envelope.success) throw new DesktopDiagnosticSubmissionError('INVALID_RESPONSE');
    if (envelope.data.success === false || String(envelope.data.code ?? '2000') !== '2000') {
      throw new DesktopDiagnosticSubmissionError('API_FAILURE');
    }
    const parsed = resultSchema.safeParse(envelope.data.data);
    if (!parsed.success) throw new DesktopDiagnosticSubmissionError('INVALID_RESPONSE');
    return parsed.data as DesktopDiagnosticSubmitResult;
  }
}
