import { randomUUID as nodeRandomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { z } from 'zod';

const SESSION_FILE_NAME = 'enterprise-session.json';
const MAX_SESSION_FILE_BYTES = 4096;
const MAX_OPEN_ID_LENGTH = 256;

type SessionFileStat = {
  dev: bigint;
  ino: bigint;
  size: bigint;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
};

export type EnterpriseSessionFileHandle = {
  stat: (options: { bigint: true }) => Promise<SessionFileStat>;
  read: (
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number
  ) => Promise<{ bytesRead: number; buffer: Uint8Array }>;
  writeFile: (data: string) => Promise<void>;
  sync: () => Promise<void>;
  close: () => Promise<void>;
};

export type EnterpriseSessionFileSystem = {
  mkdir: (directoryPath: string, options: { recursive: true }) => Promise<string | undefined>;
  lstat: (filePath: string, options: { bigint: true }) => Promise<SessionFileStat>;
  open: (filePath: string, flags: string, mode?: number) => Promise<EnterpriseSessionFileHandle>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  unlink: (filePath: string) => Promise<void>;
};

export type EnterpriseSessionStoreOptions = {
  fileSystem?: Partial<EnterpriseSessionFileSystem>;
  randomUUID?: () => string;
};

const defaultFileSystem: EnterpriseSessionFileSystem = {
  mkdir: (directoryPath, options) => fs.mkdir(directoryPath, options),
  lstat: (filePath, options) => fs.lstat(filePath, options),
  open: async (filePath, flags, mode) => {
    const handle = await fs.open(filePath, flags, mode);
    return {
      stat: (options) => handle.stat(options),
      read: (buffer, offset, length, position) => handle.read(buffer, offset, length, position),
      writeFile: (data) => handle.writeFile(data, { encoding: 'utf8' }),
      sync: () => handle.sync(),
      close: () => handle.close(),
    };
  },
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

const isValidIdentityPart = (value: bigint): boolean => value >= BigInt(0);

const isUsableSessionStat = (stat: SessionFileStat): boolean =>
  isValidIdentityPart(stat.dev) &&
  isValidIdentityPart(stat.ino) &&
  stat.size > BigInt(0) &&
  stat.size <= BigInt(MAX_SESSION_FILE_BYTES) &&
  stat.isFile() &&
  !stat.isSymbolicLink();

const hasSameFileIdentity = (left: SessionFileStat, right: SessionFileStat): boolean =>
  left.dev === right.dev && left.ino === right.ino;

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
      let handle: EnterpriseSessionFileHandle | undefined;
      try {
        const pathStatBeforeOpen = await this.fileSystem.lstat(this.sessionPath, { bigint: true });
        if (!isUsableSessionStat(pathStatBeforeOpen)) return null;

        handle = await this.fileSystem.open(this.sessionPath, 'r');
        const handleStat = await handle.stat({ bigint: true });
        const pathStatAfterOpen = await this.fileSystem.lstat(this.sessionPath, { bigint: true });
        const isStableRegularFile =
          isUsableSessionStat(handleStat) &&
          isUsableSessionStat(pathStatAfterOpen) &&
          hasSameFileIdentity(pathStatBeforeOpen, handleStat) &&
          hasSameFileIdentity(handleStat, pathStatAfterOpen);
        if (!isStableRegularFile) return null;

        const contents = await this.readBounded(handle);
        if (contents === null) return null;

        try {
          const parsedJson: unknown = JSON.parse(contents);
          const parsedSession = sessionSchema.safeParse(parsedJson);
          return parsedSession.success ? parsedSession.data.openId : null;
        } catch {
          return null;
        }
      } catch (error) {
        if (getErrorCode(error) === 'ENOENT') return null;
        throw new EnterpriseSessionStoreError();
      } finally {
        if (handle) await this.closeReadHandle(handle);
      }
    });
  }

  /** Atomically replaces the session with a normalized, openId-only record. */
  saveOpenId(openId: unknown): Promise<void> {
    const parsedOpenId = normalizedOpenIdSchema.safeParse(openId);
    if (!parsedOpenId.success) return Promise.reject(new EnterpriseSessionStoreError());

    return this.runSerialized(async () => {
      let temporaryPath: string | undefined;
      let handle: EnterpriseSessionFileHandle | undefined;
      let ownsTemporaryFile = false;
      try {
        temporaryPath = `${this.sessionPath}.${this.randomUUID()}.tmp`;
        const contents = JSON.stringify({ version: 1, openId: parsedOpenId.data });
        await this.fileSystem.mkdir(path.dirname(this.sessionPath), { recursive: true });
        handle = await this.fileSystem.open(temporaryPath, 'wx', 0o600);
        ownsTemporaryFile = true;
        await handle.writeFile(contents);
        await handle.sync();
        await handle.close();
        handle = undefined;
        await this.fileSystem.rename(temporaryPath, this.sessionPath);
        ownsTemporaryFile = false;
      } catch {
        if (handle) await this.closeWriteHandleBestEffort(handle);
        if (ownsTemporaryFile && temporaryPath) await this.removeTemporaryFile(temporaryPath);
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

  private async readBounded(handle: EnterpriseSessionFileHandle): Promise<string | null> {
    const buffer = Buffer.alloc(MAX_SESSION_FILE_BYTES + 1);
    let totalBytes = 0;
    while (totalBytes < buffer.byteLength) {
      const remainingBytes = buffer.byteLength - totalBytes;
      // eslint-disable-next-line no-await-in-loop -- Reads are sequential and capped at MAX+1 bytes.
      const result = await handle.read(buffer, totalBytes, remainingBytes, totalBytes);
      if (!Number.isSafeInteger(result.bytesRead) || result.bytesRead < 0 || result.bytesRead > remainingBytes) {
        throw new EnterpriseSessionStoreError();
      }
      if (result.bytesRead === 0) break;
      totalBytes += result.bytesRead;
    }
    if (totalBytes > MAX_SESSION_FILE_BYTES) return null;
    return buffer.subarray(0, totalBytes).toString('utf8');
  }

  private async closeReadHandle(handle: EnterpriseSessionFileHandle): Promise<void> {
    try {
      await handle.close();
    } catch {
      throw new EnterpriseSessionStoreError();
    }
  }

  private async closeWriteHandleBestEffort(handle: EnterpriseSessionFileHandle): Promise<void> {
    try {
      await handle.close();
    } catch {
      // The owned temporary path is still unlinked after a close failure.
    }
  }
}
