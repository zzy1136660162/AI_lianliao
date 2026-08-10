import type { z } from 'zod';

import { DESKTOP_VERSION_IPC_ERROR_MESSAGES } from '@/common/enterprise/desktop-version/constants';
import type {
  DesktopVersionCheckResult,
  DesktopVersionDownloadResult,
  DesktopVersionInstallResult,
  DesktopVersionIpcErrorCode,
  DesktopVersionIpcResult,
  DesktopVersionOpenDownloadedResult,
} from '@/common/enterprise/desktop-version/contracts';
import {
  desktopVersionCheckResultSchema,
  desktopVersionDownloadResultSchema,
  desktopVersionInstallResultSchema,
  desktopVersionIpcResultSchema,
  desktopVersionOpenDownloadedResultSchema,
} from '@/common/enterprise/desktop-version/schemas';
import type { ElectronBridgeAPI } from '@/common/types/platform/electron';

export type DesktopVersionRawBridge = NonNullable<ElectronBridgeAPI['desktopVersion']>;
export type DesktopVersionRawBridgeProvider = () => DesktopVersionRawBridge | undefined;

export type DesktopVersionClient = {
  check: () => Promise<DesktopVersionCheckResult>;
  download: () => Promise<DesktopVersionDownloadResult>;
  openDownloaded: () => Promise<DesktopVersionOpenDownloadedResult>;
  installRequired: () => Promise<DesktopVersionInstallResult>;
};

export class DesktopVersionRendererError extends Error {
  readonly code: DesktopVersionIpcErrorCode;

  constructor(code: DesktopVersionIpcErrorCode) {
    super(DESKTOP_VERSION_IPC_ERROR_MESSAGES[code]);
    this.name = 'DesktopVersionRendererError';
    this.code = code;
  }
}

const rendererError = (code: DesktopVersionIpcErrorCode): DesktopVersionRendererError =>
  new DesktopVersionRendererError(code);

const invoke = async <T>(
  getBridge: DesktopVersionRawBridgeProvider,
  responseSchema: z.ZodTypeAny,
  operation: (bridge: DesktopVersionRawBridge) => Promise<DesktopVersionIpcResult<T>>
): Promise<T> => {
  let untrustedResult: unknown;
  try {
    const bridge = getBridge();
    if (!bridge) throw rendererError('IPC_UNAVAILABLE');
    untrustedResult = await operation(bridge);
  } catch (error) {
    if (error instanceof DesktopVersionRendererError) throw error;
    throw rendererError('IPC_UNAVAILABLE');
  }
  const parsed = desktopVersionIpcResultSchema(responseSchema).safeParse(untrustedResult);
  if (!parsed.success) throw rendererError('INVALID_IPC_RESPONSE');
  const result = parsed.data as DesktopVersionIpcResult<T>;
  if (result.ok === false) {
    if (result.error.message !== DESKTOP_VERSION_IPC_ERROR_MESSAGES[result.error.code]) {
      throw rendererError('INVALID_IPC_RESPONSE');
    }
    throw rendererError(result.error.code);
  }
  return result.data;
};

/** Renderer facade has no access to installer URLs, hash values, or persisted OpenID. */
export const createDesktopVersionClient = (getBridge: DesktopVersionRawBridgeProvider): DesktopVersionClient => ({
  check: () => invoke(getBridge, desktopVersionCheckResultSchema, (bridge) => bridge.check()),
  download: () => invoke(getBridge, desktopVersionDownloadResultSchema, (bridge) => bridge.download()),
  openDownloaded: () =>
    invoke(getBridge, desktopVersionOpenDownloadedResultSchema, (bridge) => bridge.openDownloaded()),
  installRequired: () => invoke(getBridge, desktopVersionInstallResultSchema, (bridge) => bridge.installRequired()),
});

const getWindowDesktopVersionBridge = (): DesktopVersionRawBridge | undefined =>
  typeof window === 'undefined' ? undefined : window.electronAPI?.desktopVersion;

export const desktopVersionClient = createDesktopVersionClient(getWindowDesktopVersionBridge);
