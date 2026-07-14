import { randomUUID as nodeRandomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { z } from 'zod';

const SESSION_FILE_NAME = 'enterprise-session.json';
const MAX_SESSION_FILE_BYTES = 4096;
const MAX_OPEN_ID_LENGTH = 256;

type SessionFileStat = {
  size: number;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
};

export type EnterpriseSessionFileSystem = {
  mkdir: (directoryPath: string, options: { recursive: true }) => Promise<string | undefined>;
  lstat: (filePath: string) => Promise<SessionFileStat>;
  readFile: (filePath: string, options: { encoding: 'utf8' }) => Promise<string>;
  writeFile: (filePath: string, data: string, options: { encoding: 'utf8'; flag: 'wx'; mode: number }) => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  unlink: (filePath: string) => Promise<void>;
};

export type EnterpriseSessionStoreOptions = {
  fileSystem?: Partial<EnterpriseSessionFileSystem>;
  randomUUID?: () => string;
};

const defaultFileSystem: EnterpriseSessionFileSystem = {
  mkdir: (directoryPath, options) => fs.mkdir(directoryPath, options),
  lstat: (filePath) => fs.lstat(filePath),
  readFile: (filePath, options) => fs.readFile(filePath, options),
  writeFile: (filePath, data, options) => fs.writeFile(filePath, data, options),
  rename: (oldPath, newPath) => fs.rename(oldPath, newPath),
  unlink: (filePath) => fs.unlink(filePath),
};

const normalizedOpenIdSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(MAX_OPEN_ID_LENGTH)
      .refine((value) => !/\p{C}/u.test(value), 'Control characters are not allowed')
  );

const sessionSchema = z
  .object({
    version: z.literal(1),
    openId: normalizedOpenIdSchema,
  })
  .strict();

const getErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    return typeof descriptor?.value === 'string' ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
};

/** A fixed, non-sensitive failure from the enterprise session persistence boundary. */
export class EnterpriseSessionStoreError extends Error {
  constructor() {
    super('Enterprise session storage failed.');
    this.name = 'EnterpriseSessionStoreError';
  }
}

/** Persists only a versioned openId session record under Electron's userData directory. */
export class EnterpriseSessionStore {
  private readonly fileSystem: EnterpriseSessionFileSystem;
  private readonly randomUUID: () => string;
  private readonly sessionPath: string;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(userDataPath: string, options: EnterpriseSessionStoreOptions = {}) {
    this.fileSystem = { ...defaultFileSystem, ...options.fileSystem };
    this.randomUUID = options.randomUUID ?? nodeRandomUUID;
    this.sessionPath = path.join(userDataPath, SESSION_FILE_NAME);
  }

  /** Loads a valid openId, returning null for absent or isolated corrupt session data. */
  loadOpenId(): Promise<string | null> {
    return this.runSerialized(async () => {
      let stat: SessionFileStat;
      try {
        stat = await this.fileSystem.lstat(this.sessionPath);
      } catch (error) {
        if (getErrorCode(error) === 'ENOENT') return null;
        throw new EnterpriseSessionStoreError();
      }

      if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_SESSION_FILE_BYTES) {
        return null;
      }

      let contents: string;
      try {
        contents = await this.fileSystem.readFile(this.sessionPath, { encoding: 'utf8' });
      } catch (error) {
        if (getErrorCode(error) === 'ENOENT') return null;
        throw new EnterpriseSessionStoreError();
      }
      if (Buffer.byteLength(contents, 'utf8') > MAX_SESSION_FILE_BYTES) return null;

      try {
        const parsedJson: unknown = JSON.parse(contents);
        const parsedSession = sessionSchema.safeParse(parsedJson);
        return parsedSession.success ? parsedSession.data.openId : null;
      } catch {
        return null;
      }
    });
  }

  /** Atomically replaces the session with a normalized, openId-only record. */
  saveOpenId(openId: unknown): Promise<void> {
    const parsedOpenId = normalizedOpenIdSchema.safeParse(openId);
    if (!parsedOpenId.success) return Promise.reject(new EnterpriseSessionStoreError());

    return this.runSerialized(async () => {
      let temporaryPath: string | undefined;
      let temporaryFileCreated = false;
      try {
        temporaryPath = `${this.sessionPath}.${this.randomUUID()}.tmp`;
        const contents = JSON.stringify({ version: 1, openId: parsedOpenId.data });
        await this.fileSystem.mkdir(path.dirname(this.sessionPath), { recursive: true });
        await this.fileSystem.writeFile(temporaryPath, contents, {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        });
        temporaryFileCreated = true;
        await this.fileSystem.rename(temporaryPath, this.sessionPath);
        temporaryFileCreated = false;
      } catch {
        if (temporaryFileCreated && temporaryPath) await this.removeTemporaryFile(temporaryPath);
        throw new EnterpriseSessionStoreError();
      }
    });
  }

  /** Removes the persisted session; an already-missing file is a successful clear. */
  clear(): Promise<void> {
    return this.runSerialized(async () => {
      try {
        await this.fileSystem.unlink(this.sessionPath);
      } catch (error) {
        if (getErrorCode(error) === 'ENOENT') return;
        throw new EnterpriseSessionStoreError();
      }
    });
  }

  private runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.operationQueue.then(operation, operation);
    this.operationQueue = current.then(
      (): undefined => undefined,
      (): undefined => undefined
    );
    return current;
  }

  private async removeTemporaryFile(temporaryPath: string): Promise<void> {
    try {
      await this.fileSystem.unlink(temporaryPath);
    } catch {
      // Cleanup is best-effort and must never replace the original sanitized failure.
    }
  }
}
