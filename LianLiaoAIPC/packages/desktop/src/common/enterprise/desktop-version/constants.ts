import type { DesktopVersionIpcErrorCode } from './contracts';

/** Fixed origins keep release discovery in the trusted Electron main process. */
export const DESKTOP_VERSION_API_BASE_URLS = Object.freeze({
  development: 'http://127.0.0.1:12580/',
  production: 'https://cloud.lslnii.com/',
} as const);

export const DESKTOP_VERSION_CONTROLLER_PATH = 'cloud-api/DesktopVersionController/';

/** Renderer commands intentionally carry no URL, OpenID, path, or release identifier. */
export const DESKTOP_VERSION_IPC_CHANNELS = Object.freeze({
  CHECK: 'enterprise:desktop-version:check',
  DOWNLOAD: 'enterprise:desktop-version:download',
  OPEN_DOWNLOADED: 'enterprise:desktop-version:open-downloaded',
  INSTALL_REQUIRED: 'enterprise:desktop-version:install-required',
} as const);

/** Stable failure descriptions reconstructed by preload instead of trusting IPC error text. */
export const DESKTOP_VERSION_IPC_ERROR_MESSAGES: Readonly<Record<DesktopVersionIpcErrorCode, string>> = Object.freeze({
  INVALID_REQUEST: 'Desktop version request is invalid.',
  MISSING_ENTERPRISE_SESSION: 'Enterprise login is required to check desktop updates.',
  UNSUPPORTED_RUNTIME: 'This operating system or CPU architecture is not supported by the release service.',
  TIMEOUT: 'Desktop version request timed out.',
  NETWORK: 'Desktop version network request failed.',
  HTTP: 'Desktop version API returned an unsuccessful HTTP status.',
  API_FAILURE: 'Desktop version API rejected the request.',
  INVALID_RESPONSE: 'Desktop version API returned an invalid response.',
  NO_UPDATE: 'No compatible desktop update is available.',
  DOWNLOAD_FAILED: 'Desktop installer download failed.',
  INTEGRITY_FAILED: 'Downloaded desktop installer failed integrity verification.',
  SIGNATURE_INVALID: 'Downloaded desktop installer has an invalid code signature.',
  OPEN_FAILED: 'The downloaded installer could not be opened.',
  INSTALL_FAILED: 'The required desktop installer could not be launched.',
  UNTRUSTED_SENDER: 'Desktop version IPC sender is not trusted.',
  IPC_UNAVAILABLE: 'Desktop version IPC is unavailable.',
  INVALID_IPC_RESPONSE: 'Desktop version IPC returned an invalid response.',
  REQUEST_FAILED: 'Desktop version request failed.',
});
