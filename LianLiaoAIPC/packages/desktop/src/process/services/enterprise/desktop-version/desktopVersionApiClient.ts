import { z } from 'zod';

import {
  DESKTOP_VERSION_API_BASE_URLS,
  DESKTOP_VERSION_CONTROLLER_PATH,
} from '@/common/enterprise/desktop-version/constants';
import type { DesktopVersionArchitecture, DesktopVersionPlatform } from '@/common/enterprise/desktop-version/contracts';

const REQUEST_TIMEOUT_MS = 15_000;

export type DesktopVersionApiTransport = (url: string, init: RequestInit) => Promise<Response>;

const defaultTransport: DesktopVersionApiTransport = async (url, init) => {
  const { net } = await import('electron');
  return net.fetch(url, init);
};

const apiPackageSchema = z
  .object({
    id: z.string().regex(/^-?[1-9][0-9]{0,18}$/),
    platform: z.enum(['WINDOWS', 'MACOS', 'LINUX']),
    architecture: z.enum(['X64', 'ARM64', 'UNIVERSAL']),
    downloadUrl: z.string().url().max(2_048),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    sizeBytes: z.number().int().positive().safe(),
  })
  .strict();

const apiVersionSchema = z
  .object({
    id: z.string().regex(/^-?[1-9][0-9]{0,18}$/),
    versionCode: z.number().int().positive().safe(),
    versionName: z.string().min(1).max(64),
    releaseNotes: z.string().max(20_000).nullable(),
    forceUpdate: z.boolean(),
    // The release endpoint includes the persisted status even though it is not exposed to the renderer.
    status: z.literal('PUBLISHED').optional(),
    publishedAt: z.number().int().nonnegative().safe().nullable(),
  })
  .strict();

const apiResultSchema = z
  .object({
    code: z.number(),
    message: z.string(),
    success: z.boolean(),
    data: z
      .object({
        available: z.boolean(),
        version: apiVersionSchema.optional(),
        package: apiPackageSchema.optional(),
      })
      .strict(),
  })
  .passthrough();

export type DesktopVersionRemoteRelease = {
  version: z.infer<typeof apiVersionSchema>;
  packageInfo: z.infer<typeof apiPackageSchema>;
};

export type DesktopVersionApiClientOptions = {
  baseUrl: string;
  fetchImpl?: DesktopVersionApiTransport;
};

/** Typed error keeps transport details inside the main process IPC boundary. */
export class DesktopVersionApiError extends Error {
  constructor(
    readonly code: 'TIMEOUT' | 'NETWORK' | 'HTTP' | 'API_FAILURE' | 'INVALID_RESPONSE' | 'MISSING_ENTERPRISE_SESSION',
    readonly status = 0
  ) {
    super(code);
    this.name = 'DesktopVersionApiError';
  }
}

/** Resolves the production or localhost API without letting a renderer override the target. */
export const resolveDesktopVersionApiClientOptions = (isPackaged: boolean): DesktopVersionApiClientOptions => ({
  baseUrl: isPackaged ? DESKTOP_VERSION_API_BASE_URLS.production : DESKTOP_VERSION_API_BASE_URLS.development,
});

/** Main-process HTTP client for a single platform-specific release lookup. */
export class DesktopVersionApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: DesktopVersionApiTransport;

  constructor(options: DesktopVersionApiClientOptions) {
    this.baseUrl = new URL(options.baseUrl).toString();
    this.fetchImpl = options.fetchImpl ?? defaultTransport;
  }

  async getLatest(
    openId: string,
    platform: DesktopVersionPlatform,
    architecture: DesktopVersionArchitecture
  ): Promise<DesktopVersionRemoteRelease | null> {
    const payload = await this.post('getLatest', { openId, platform, architecture });
    if (!payload.available) return null;
    if (!payload.version || !payload.package) throw new DesktopVersionApiError('INVALID_RESPONSE');
    return { version: payload.version, packageInfo: payload.package };
  }

  private async post(action: string, body: Record<string, string>): Promise<z.infer<typeof apiResultSchema>['data']> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const startedAt = Date.now();
    const url = new URL(`${DESKTOP_VERSION_CONTROLLER_PATH}${action}`, this.baseUrl).toString();
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw new DesktopVersionApiError('TIMEOUT');
        throw new DesktopVersionApiError('NETWORK');
      }
      if (!response.ok) throw new DesktopVersionApiError('HTTP', response.status);
      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new DesktopVersionApiError('INVALID_RESPONSE', response.status);
      }
      const parsed = apiResultSchema.safeParse(raw);
      if (!parsed.success) throw new DesktopVersionApiError('INVALID_RESPONSE', response.status);
      if (!parsed.data.success) throw new DesktopVersionApiError('API_FAILURE', response.status);
      return parsed.data.data;
    } catch (error) {
      const code = error instanceof DesktopVersionApiError ? error.code : 'NETWORK';
      const status = error instanceof DesktopVersionApiError ? error.status : 0;
      // Log only routing and failure metadata; OpenID and response bodies must never reach diagnostics.
      console.error('[desktop-version] request failed', {
        operation: action,
        endpoint: new URL(url).pathname,
        code,
        status,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
