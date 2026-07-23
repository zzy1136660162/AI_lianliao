import * as semver from 'semver';

import type {
  DesktopVersionCheckResult,
  DesktopVersionDownloadResult,
  DesktopVersionOpenDownloadedResult,
  DesktopVersionPlatform,
  DesktopVersionArchitecture,
  DesktopVersionRelease,
} from '@/common/enterprise/desktop-version/contracts';

import {
  DesktopVersionApiClient,
  DesktopVersionApiError,
  resolveDesktopVersionApiClientOptions,
  type DesktopVersionRemoteRelease,
} from './desktopVersionApiClient';
import { downloadDesktopVersionInstaller, type DownloadedDesktopVersionInstaller } from './desktopVersionDownloader';

export type DesktopVersionGatewaySessionStore = { loadOpenId: () => Promise<string | null> };

export type DesktopVersionGatewayApiClient = {
  getLatest: (
    openId: string,
    platform: DesktopVersionPlatform,
    architecture: DesktopVersionArchitecture
  ) => Promise<DesktopVersionRemoteRelease | null>;
};

export type DesktopVersionGatewayRuntime = {
  getVersion: () => string;
  getPath: (name: 'downloads') => string;
  platform: NodeJS.Platform;
  arch: string;
  openPath: (filePath: string) => Promise<string>;
};

export type DesktopVersionGatewayDownloader = (
  input: Parameters<typeof downloadDesktopVersionInstaller>[0]
) => Promise<DownloadedDesktopVersionInstaller>;

export type DesktopVersionGatewayOptions = {
  sessionStore: DesktopVersionGatewaySessionStore;
  runtime: DesktopVersionGatewayRuntime;
  apiClient?: DesktopVersionGatewayApiClient;
  downloader?: DesktopVersionGatewayDownloader;
  isPackaged?: boolean;
};

/** Errors that describe a trusted local decision rather than a cloud-api response. */
export class DesktopVersionGatewayError extends Error {
  constructor(readonly code: 'NO_UPDATE' | 'UNSUPPORTED_RUNTIME' | 'OPEN_FAILED') {
    super(code);
    this.name = 'DesktopVersionGatewayError';
  }
}

/** Main-process release state. The raw URL/hash stays private even after a successful update check. */
export class DesktopVersionGateway {
  private readonly sessionStore: DesktopVersionGatewaySessionStore;
  private readonly runtime: DesktopVersionGatewayRuntime;
  private readonly apiClient: DesktopVersionGatewayApiClient;
  private readonly downloader: DesktopVersionGatewayDownloader;
  private cachedRemoteRelease: DesktopVersionRemoteRelease | null = null;
  private downloadedInstaller: DownloadedDesktopVersionInstaller | null = null;

  constructor(options: DesktopVersionGatewayOptions) {
    this.sessionStore = options.sessionStore;
    this.runtime = options.runtime;
    this.apiClient =
      options.apiClient ??
      new DesktopVersionApiClient(resolveDesktopVersionApiClientOptions(options.isPackaged ?? false));
    this.downloader = options.downloader ?? downloadDesktopVersionInstaller;
  }

  async check(): Promise<DesktopVersionCheckResult> {
    const openId = await this.requireOpenId();
    const { platform, architecture } = this.resolveRuntime();
    const currentVersion = this.runtime.getVersion();
    const remote = await this.apiClient.getLatest(openId, platform, architecture);
    const updateAvailable = remote !== null && isNewerVersion(remote.version.versionName, currentVersion);
    this.cachedRemoteRelease = updateAvailable ? remote : null;
    return {
      currentVersion,
      checkedAt: Date.now(),
      updateAvailable,
      release: updateAvailable && remote ? toRendererRelease(remote) : null,
    };
  }

  async downloadLatest(): Promise<DesktopVersionDownloadResult> {
    if (!this.cachedRemoteRelease) {
      await this.check();
    }
    const release = this.cachedRemoteRelease;
    if (!release) throw new DesktopVersionGatewayError('NO_UPDATE');
    const downloaded = await this.downloader({
      downloadsDirectory: this.runtime.getPath('downloads'),
      release,
    });
    this.downloadedInstaller = downloaded;
    return downloaded;
  }

  async openDownloadedInstaller(): Promise<DesktopVersionOpenDownloadedResult> {
    if (!this.downloadedInstaller) return { opened: false };
    const error = await this.runtime.openPath(this.downloadedInstaller.filePath);
    if (error) throw new DesktopVersionGatewayError('OPEN_FAILED');
    return { opened: true };
  }

  private async requireOpenId(): Promise<string> {
    const openId = await this.sessionStore.loadOpenId();
    if (typeof openId !== 'string') throw new DesktopVersionApiError('MISSING_ENTERPRISE_SESSION', 401);
    const normalized = openId.trim();
    if (!normalized || normalized.length > 256 || /\p{C}/u.test(normalized)) {
      throw new DesktopVersionApiError('MISSING_ENTERPRISE_SESSION', 401);
    }
    return normalized;
  }

  private resolveRuntime(): { platform: DesktopVersionPlatform; architecture: DesktopVersionArchitecture } {
    const platform =
      this.runtime.platform === 'win32' ? 'WINDOWS' : this.runtime.platform === 'darwin' ? 'MACOS' : 'LINUX';
    if (!['win32', 'darwin', 'linux'].includes(this.runtime.platform)) {
      throw new DesktopVersionGatewayError('UNSUPPORTED_RUNTIME');
    }
    if (this.runtime.arch === 'x64') return { platform, architecture: 'X64' };
    if (this.runtime.arch === 'arm64') return { platform, architecture: 'ARM64' };
    throw new DesktopVersionGatewayError('UNSUPPORTED_RUNTIME');
  }
}

const isNewerVersion = (candidate: string, current: string): boolean => {
  const candidateVersion = semver.valid(candidate) ?? semver.coerce(candidate)?.version;
  const currentVersion = semver.valid(current) ?? semver.coerce(current)?.version;
  return Boolean(candidateVersion && currentVersion && semver.gt(candidateVersion, currentVersion));
};

const toRendererRelease = (remote: DesktopVersionRemoteRelease): DesktopVersionRelease => ({
  versionId: remote.version.id,
  versionCode: remote.version.versionCode,
  versionName: remote.version.versionName,
  releaseNotes: remote.version.releaseNotes,
  forceUpdate: remote.version.forceUpdate,
  publishedAt: remote.version.publishedAt,
  platform: remote.packageInfo.platform,
  architecture: remote.packageInfo.architecture,
  packageSizeBytes: remote.packageInfo.sizeBytes,
});
