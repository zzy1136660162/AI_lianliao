import { z } from 'zod';

const safeIntegerSchema = z.number().int().nonnegative().safe();
const signedIdSchema = z.string().regex(/^-?[1-9][0-9]{0,18}$/);

export const desktopVersionReleaseSchema = z
  .object({
    versionId: signedIdSchema,
    versionCode: z.number().int().positive().safe(),
    versionName: z.string().min(1).max(64),
    releaseNotes: z.string().max(20_000).nullable(),
    forceUpdate: z.boolean(),
    publishedAt: safeIntegerSchema.nullable(),
    platform: z.enum(['WINDOWS', 'MACOS', 'LINUX']),
    architecture: z.enum(['X64', 'ARM64', 'UNIVERSAL']),
    packageSizeBytes: z.number().int().positive().safe(),
  })
  .strict();

export const desktopVersionCheckResultSchema = z
  .object({
    currentVersion: z.string().min(1).max(128),
    checkedAt: safeIntegerSchema,
    updateAvailable: z.boolean(),
    release: desktopVersionReleaseSchema.nullable(),
  })
  .strict();

export const desktopVersionDownloadResultSchema = z
  .object({ fileName: z.string().min(1).max(255), filePath: z.string().min(1).max(4_096) })
  .strict();

export const desktopVersionOpenDownloadedResultSchema = z.object({ opened: z.boolean() }).strict();

export const desktopVersionIpcErrorSchema = z
  .object({
    code: z.enum([
      'INVALID_REQUEST',
      'MISSING_ENTERPRISE_SESSION',
      'UNSUPPORTED_RUNTIME',
      'TIMEOUT',
      'NETWORK',
      'HTTP',
      'API_FAILURE',
      'INVALID_RESPONSE',
      'NO_UPDATE',
      'DOWNLOAD_FAILED',
      'INTEGRITY_FAILED',
      'OPEN_FAILED',
      'UNTRUSTED_SENDER',
      'IPC_UNAVAILABLE',
      'INVALID_IPC_RESPONSE',
      'REQUEST_FAILED',
    ]),
    message: z.string(),
  })
  .strict();

export const desktopVersionIpcResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data: dataSchema }).strict(),
    z.object({ ok: z.literal(false), error: desktopVersionIpcErrorSchema }).strict(),
  ]);
