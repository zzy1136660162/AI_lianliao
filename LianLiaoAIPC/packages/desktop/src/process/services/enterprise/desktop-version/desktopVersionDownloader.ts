import { createHash } from 'node:crypto';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import * as path from 'node:path';

import type { DesktopVersionRemoteRelease } from './desktopVersionApiClient';

const MAX_REDIRECTS = 5;

export class DesktopVersionDownloadError extends Error {
  constructor(readonly code: 'DOWNLOAD_FAILED' | 'INTEGRITY_FAILED') {
    super(code);
    this.name = 'DesktopVersionDownloadError';
  }
}

const assertHttpsDownloadUrl = (rawUrl: string): URL => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new DesktopVersionDownloadError('DOWNLOAD_FAILED');
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) {
    throw new DesktopVersionDownloadError('DOWNLOAD_FAILED');
  }
  return url;
};

/** Revalidates every redirect so an admin-configured HTTPS URL cannot pivot to another protocol. */
const fetchInstaller = async (rawUrl: string): Promise<Response> => {
  let current = assertHttpsDownloadUrl(rawUrl).toString();
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    let response: Response;
    try {
      // Redirect validation is sequential because every URL comes from the previous response.
      // eslint-disable-next-line no-await-in-loop
      response = await fetch(current, { redirect: 'manual' });
    } catch {
      throw new DesktopVersionDownloadError('DOWNLOAD_FAILED');
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new DesktopVersionDownloadError('DOWNLOAD_FAILED');
      current = assertHttpsDownloadUrl(new URL(location, current).toString()).toString();
      continue;
    }
    if (!response.ok || !response.body) throw new DesktopVersionDownloadError('DOWNLOAD_FAILED');
    return response;
  }
  throw new DesktopVersionDownloadError('DOWNLOAD_FAILED');
};

const sanitizeFileName = (downloadUrl: string, versionName: string): string => {
  const rawName = path.basename(new URL(downloadUrl).pathname).trim();
  const safeName = rawName.replace(/[^a-zA-Z0-9._() -]/g, '_').slice(0, 180);
  return safeName || `lianliao-ai-${versionName.replace(/[^a-zA-Z0-9._-]/g, '_')}-installer`;
};

const reserveUniquePath = async (directory: string, fileName: string): Promise<string> => {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  for (let index = 0; index < 1_000; index += 1) {
    const suffix = index === 0 ? '' : ` (${index})`;
    const candidate = path.join(directory, `${baseName}${suffix}${extension}`);
    try {
      // Candidate names must be checked in order to reserve the first available path.
      // eslint-disable-next-line no-await-in-loop
      await stat(candidate);
    } catch {
      return candidate;
    }
  }
  return path.join(directory, `${baseName}-${Date.now()}${extension}`);
};

export type DesktopVersionDownloaderInput = {
  downloadsDirectory: string;
  release: DesktopVersionRemoteRelease;
};

export type DownloadedDesktopVersionInstaller = { fileName: string; filePath: string };

/** Downloads the backend-selected package into Downloads and verifies exact size plus SHA-256 before exposure. */
export const downloadDesktopVersionInstaller = async (
  input: DesktopVersionDownloaderInput
): Promise<DownloadedDesktopVersionInstaller> => {
  const { packageInfo, version } = input.release;
  const fileName = sanitizeFileName(packageInfo.downloadUrl, version.versionName);
  await mkdir(input.downloadsDirectory, { recursive: true });
  const targetPath = await reserveUniquePath(input.downloadsDirectory, fileName);
  const temporaryPath = `${targetPath}.part-${process.pid}-${Date.now()}`;
  const fileHandle = await open(temporaryPath, 'wx');
  const hash = createHash('sha256');
  let receivedBytes = 0;

  try {
    const response = await fetchInstaller(packageInfo.downloadUrl);
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      if (!(chunk instanceof Uint8Array)) throw new DesktopVersionDownloadError('DOWNLOAD_FAILED');
      receivedBytes += chunk.byteLength;
      if (receivedBytes > packageInfo.sizeBytes) throw new DesktopVersionDownloadError('INTEGRITY_FAILED');
      hash.update(chunk);
      await fileHandle.write(chunk);
    }
    await fileHandle.close();
    if (
      receivedBytes !== packageInfo.sizeBytes ||
      hash.digest('hex').toLowerCase() !== packageInfo.sha256.toLowerCase()
    ) {
      throw new DesktopVersionDownloadError('INTEGRITY_FAILED');
    }
    await rename(temporaryPath, targetPath);
    return { fileName, filePath: targetPath };
  } catch (error) {
    await fileHandle.close().catch((): undefined => undefined);
    await rm(temporaryPath, { force: true }).catch((): undefined => undefined);
    if (error instanceof DesktopVersionDownloadError) throw error;
    throw new DesktopVersionDownloadError('DOWNLOAD_FAILED');
  }
};
