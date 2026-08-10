import * as semver from 'semver';
import * as path from 'node:path';

import type {
  DesktopVersionCheckResult,
  DesktopVersionDownloadResult,
  DesktopVersionOpenDownloadedResult,
  DesktopVersionInstallResult,
  DesktopVersionPlatform,
  DesktopVersionArchitecture,
  DesktopVersionRelease,
} from '@/common/enterprise/desktop-version/contracts';

import {
  DesktopVersionApiClient,
  resolveDesktopVersionApiClientOptions,
  type DesktopVersionRemoteRelease,
} from './desktopVersionApiClient';
import { downloadDesktopVersionInstaller, type DownloadedDesktopVersionInstaller } from './desktopVersionDownloader';
import { createDesktopVersionPolicyStore, type DesktopVersionPolicyStore } from './desktopVersionPolicyStore';
import {
  inspectWindowsInstallerSignature,
  type WindowsInstallerSignatureStatus,
} from './desktopVersionSignatureVerifier';

export type DesktopVersionGatewayApiClient = {
  getPolicy: (
    currentVersion: string,
    platform: DesktopVersionPlatform,
    architecture: DesktopVersionArchitecture
  ) => Promise<DesktopVersionRemoteRelease | null>;
};

export type DesktopVersionGatewayRuntime = {
  getVersion: () => string;
  getPath: (name: 'downloads' | 'userData') => string;
  platform: NodeJS.Platform;
  arch: string;
  openPath: (filePath: string) => Promise<string>;
  quit: () => void;
};

export type DesktopVersionGatewayDownloader = (
  input: Parameters<typeof downloadDesktopVersionInstaller>[0]
) => Promise<DownloadedDesktopVersionInstaller>;

export type DesktopVersionGatewayOptions = {
  runtime: DesktopVersionGatewayRuntime;
  apiClient?: DesktopVersionGatewayApiClient;
  downloader?: DesktopVersionGatewayDownloader;
  policyStore?: DesktopVersionPolicyStore;
  signatureVerifier?: (filePath: string) => Promise<WindowsInstallerSignatureStatus>;
  isPackaged?: boolean;
};

/** Errors that describe a trusted local decision rather than a cloud-api response. */
export class DesktopVersionGatewayError extends Error {
  constructor(
    readonly code: 'NO_UPDATE' | 'UNSUPPORTED_RUNTIME' | 'SIGNATURE_INVALID' | 'OPEN_FAILED' | 'INSTALL_FAILED'
  ) {
    super(code);
    this.name = 'DesktopVersionGatewayError';
  }
}

/** Main-process release state. The raw URL/hash stays private even after a successful update check. */
export class DesktopVersionGateway {
  private readonly runtime: DesktopVersionGatewayRuntime;
  private readonly apiClient: DesktopVersionGatewayApiClient;
  private readonly downloader: DesktopVersionGatewayDownloader;
  private readonly policyStore: DesktopVersionPolicyStore;
  private readonly signatureVerifier: (filePath: string) => Promise<WindowsInstallerSignatureStatus>;
  private readonly isPackaged: boolean;
  private cachedRemoteRelease: DesktopVersionRemoteRelease | null = null;
  private downloadedInstaller: DownloadedDesktopVersionInstaller | null = null;

  constructor(options: DesktopVersionGatewayOptions) {
    this.runtime = options.runtime;
    this.apiClient =
      options.apiClient ??
      new DesktopVersionApiClient(resolveDesktopVersionApiClientOptions(options.isPackaged ?? false));
    this.downloader = options.downloader ?? downloadDesktopVersionInstaller;
    this.policyStore = options.policyStore ?? createDesktopVersionPolicyStore(options.runtime.getPath('userData'));
    this.signatureVerifier = options.signatureVerifier ?? inspectWindowsInstallerSignature;
    this.isPackaged = options.isPackaged ?? false;
  }

  async check(): Promise<DesktopVersionCheckResult> {
    const { platform, architecture } = this.resolveRuntime();
    const currentVersion = this.runtime.getVersion();
    let remote: DesktopVersionRemoteRelease | null;
    try {
      remote = await this.apiClient.getPolicy(currentVersion, platform, architecture);
      if (remote?.version.forceUpdate && isNewerVersion(remote.version.versionName, currentVersion)) {
        await this.policyStore.saveMandatory(remote).catch((): undefined => undefined);
      } else {
        await this.policyStore.clearMandatory().catch((): undefined => undefined);
      }
    } catch (error) {
      const cachedMandatory = await this.policyStore.loadMandatory();
      if (!cachedMandatory || !isNewerVersion(cachedMandatory.version.versionName, currentVersion)) {
        throw error;
      }
      remote = cachedMandatory;
    }
    const updateAvailable = remote !== null && isNewerVersion(remote.version.versionName, currentVersion);
    this.cachedRemoteRelease = updateAvailable ? remote : null;
    if (!updateAvailable) this.downloadedInstaller = null;
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
      downloadsDirectory: path.join(this.runtime.getPath('userData'), 'updates'),
      release,
    });
    this.downloadedInstaller = downloaded;
    return downloaded;
  }

  async openDownloadedInstaller(): Promise<DesktopVersionOpenDownloadedResult> {
    if (!this.downloadedInstaller) return { opened: false };
    await this.verifyDownloadedInstaller();
    const error = await this.runtime.openPath(this.downloadedInstaller.filePath);
    if (error) throw new DesktopVersionGatewayError('OPEN_FAILED');
    return { opened: true };
  }

  async installRequiredUpdate(): Promise<DesktopVersionInstallResult> {
    if (!this.cachedRemoteRelease?.version.forceUpdate || !this.downloadedInstaller) {
      throw new DesktopVersionGatewayError('NO_UPDATE');
    }
    await this.verifyDownloadedInstaller();
    const error = await this.runtime.openPath(this.downloadedInstaller.filePath);
    if (error) throw new DesktopVersionGatewayError('INSTALL_FAILED');
    this.runtime.quit();
    return { launched: true };
  }

  private async verifyDownloadedInstaller(): Promise<void> {
    if (!this.downloadedInstaller || !this.isPackaged || this.runtime.platform !== 'win32') return;
    const signatureStatus = await this.signatureVerifier(this.downloadedInstaller.filePath);
    if (signatureStatus === 'INVALID') throw new DesktopVersionGatewayError('SIGNATURE_INVALID');
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
