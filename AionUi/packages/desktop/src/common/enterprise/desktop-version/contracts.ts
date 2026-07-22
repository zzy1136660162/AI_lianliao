/** Values exposed to the renderer never include an installer URL, hash, or OpenID. */
export type DesktopVersionPlatform = 'WINDOWS' | 'MACOS' | 'LINUX';
export type DesktopVersionArchitecture = 'X64' | 'ARM64' | 'UNIVERSAL';

export type DesktopVersionRelease = {
  versionId: string;
  versionCode: number;
  versionName: string;
  releaseNotes: string | null;
  forceUpdate: boolean;
  publishedAt: number | null;
  platform: DesktopVersionPlatform;
  architecture: DesktopVersionArchitecture;
  packageSizeBytes: number;
};

export type DesktopVersionCheckResult = {
  currentVersion: string;
  checkedAt: number;
  updateAvailable: boolean;
  release: DesktopVersionRelease | null;
};

export type DesktopVersionDownloadResult = {
  fileName: string;
  filePath: string;
};

export type DesktopVersionOpenDownloadedResult = {
  opened: boolean;
};

export type DesktopVersionIpcErrorCode =
  | 'INVALID_REQUEST'
  | 'MISSING_ENTERPRISE_SESSION'
  | 'UNSUPPORTED_RUNTIME'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'HTTP'
  | 'API_FAILURE'
  | 'INVALID_RESPONSE'
  | 'NO_UPDATE'
  | 'DOWNLOAD_FAILED'
  | 'INTEGRITY_FAILED'
  | 'OPEN_FAILED'
  | 'UNTRUSTED_SENDER'
  | 'IPC_UNAVAILABLE'
  | 'INVALID_IPC_RESPONSE'
  | 'REQUEST_FAILED';

export type DesktopVersionIpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: DesktopVersionIpcErrorCode; message: string } };
