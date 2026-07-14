import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EnterpriseSessionStore } from '@/process/services/enterprise/enterpriseSessionStore';

const OPEN_ID = 'wx-open-id-sensitive-value';

type RealFileHandle = Awaited<ReturnType<typeof fs.open>>;

const adaptRealHandle = (handle: RealFileHandle) => ({
  stat: (options: { bigint: true }) => handle.stat(options),
  read: (buffer: Uint8Array, offset: number, length: number, position: number) =>
    handle.read(buffer, offset, length, position),
  writeFile: (data: string) => handle.writeFile(data, { encoding: 'utf8' }),
  sync: () => handle.sync(),
  close: () => handle.close(),
});

const makeStat = (
  overrides: Partial<{
    dev: number | bigint;
    ino: number | bigint;
    size: number | bigint;
    file: boolean;
    symbolicLink: boolean;
  }> = {}
) => ({
  dev: BigInt(overrides.dev ?? 1),
  ino: BigInt(overrides.ino ?? 2),
  size: BigInt(overrides.size ?? 64),
  isFile: () => overrides.file ?? true,
  isSymbolicLink: () => overrides.symbolicLink ?? false,
});

describe('EnterpriseSessionStore', () => {
  let userDataPath: string;

  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'aion-enterprise-session-'));
  });

  afterEach(async () => {
    await fs.rm(userDataPath, { recursive: true, force: true });
  });

  it('stores only a normalized openId in the exact versioned file', async () => {
    const store = new EnterpriseSessionStore(userDataPath);

    await store.saveOpenId(`\u3000${OPEN_ID}\u00a0`);

    const sessionPath = path.join(userDataPath, 'enterprise-session.json');
    expect(await fs.readFile(sessionPath, 'utf8')).toBe(`{"version":1,"openId":"${OPEN_ID}"}`);
    await expect(store.loadOpenId()).resolves.toBe(OPEN_ID);
  });

  it('writes an exclusive same-directory temporary file before the atomic rename', async () => {
    const writeFile = vi.fn<(data: string) => Promise<void>>();
    const sync = vi.fn<() => Promise<void>>();
    const close = vi.fn<() => Promise<void>>();
    const open = vi.fn(async (filePath: string, flags: string, mode?: number) => {
      const handle = await fs.open(filePath, flags, mode);
      const adapted = adaptRealHandle(handle);
      writeFile.mockImplementation(adapted.writeFile);
      sync.mockImplementation(adapted.sync);
      close.mockImplementation(adapted.close);
      return { ...adapted, writeFile, sync, close };
    });
    const rename = vi.fn(fs.rename);
    const store = new EnterpriseSessionStore(userDataPath, {
      fileSystem: { ...fs, open, rename },
      randomUUID: () => '11111111-1111-4111-8111-111111111111',
    });

    await store.saveOpenId(OPEN_ID);

    const sessionPath = path.join(userDataPath, 'enterprise-session.json');
    const temporaryPath = `${sessionPath}.11111111-1111-4111-8111-111111111111.tmp`;
    expect(open).toHaveBeenCalledWith(temporaryPath, 'wx', 0o600);
    expect(writeFile).toHaveBeenCalledWith(`{"version":1,"openId":"${OPEN_ID}"}`);
    expect(sync).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(rename).toHaveBeenCalledWith(temporaryPath, sessionPath);
    expect(open.mock.invocationCallOrder[0]).toBeLessThan(writeFile.mock.invocationCallOrder[0]);
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(rename.mock.invocationCallOrder[0]);
  });

  it.each([
    ['', 'empty file'],
    ['not-json', 'invalid JSON'],
    ['{"version":2,"openId":"valid"}', 'wrong version'],
    ['{"version":1,"openId":""}', 'empty openId'],
    ['{"version":1,"openId":"valid","phone":"secret"}', 'extra field'],
    ['{"version":1,"openId":123}', 'non-string openId'],
    ['{"version":1,"openId":"has\\u0000control"}', 'control character'],
  ])('isolates a %s session as signed-out (%s)', async (contents) => {
    await fs.writeFile(path.join(userDataPath, 'enterprise-session.json'), contents);

    await expect(new EnterpriseSessionStore(userDataPath).loadOpenId()).resolves.toBeNull();
  });

  it('treats missing, oversized, and non-regular session paths as signed-out', async () => {
    const store = new EnterpriseSessionStore(userDataPath);
    await expect(store.loadOpenId()).resolves.toBeNull();

    const sessionPath = path.join(userDataPath, 'enterprise-session.json');
    await fs.writeFile(sessionPath, 'x'.repeat(8192));
    await expect(store.loadOpenId()).resolves.toBeNull();

    await fs.rm(sessionPath);
    await fs.mkdir(sessionPath);
    await expect(store.loadOpenId()).resolves.toBeNull();
  });

  it('does not read through a symbolic-link session path', async () => {
    const open = vi.fn(fs.open);
    const lstat = vi.fn(async () => makeStat({ symbolicLink: true }));
    const store = new EnterpriseSessionStore(userDataPath, { fileSystem: { ...fs, lstat, open } });

    await expect(store.loadOpenId()).resolves.toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

  it('does not read an actual symbolic-link session path when the platform permits creating it', async () => {
    const targetPath = path.join(userDataPath, 'target.json');
    const sessionPath = path.join(userDataPath, 'enterprise-session.json');
    await fs.writeFile(targetPath, `{"version":1,"openId":"${OPEN_ID}"}`);
    try {
      await fs.symlink(targetPath, sessionPath, 'file');
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EPERM') return;
      throw error;
    }

    await expect(new EnterpriseSessionStore(userDataPath).loadOpenId()).resolves.toBeNull();
  });

  it('rejects invalid save input without exposing it in the error', async () => {
    const invalidOpenId = `${OPEN_ID}\u0000`;
    const store = new EnterpriseSessionStore(userDataPath);

    const error = await store.saveOpenId(invalidOpenId).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toBe('EnterpriseSessionStoreError: Enterprise session storage failed.');
    expect(String(error)).not.toContain(OPEN_ID);
  });

  it('sanitizes real I/O failures without exposing paths or identifiers', async () => {
    const open = vi.fn(async () => {
      throw Object.assign(new Error(`${userDataPath}/${OPEN_ID}`), { code: 'EACCES' });
    });
    const store = new EnterpriseSessionStore(userDataPath, {
      fileSystem: {
        ...fs,
        lstat: vi.fn(async () => makeStat()),
        open,
      },
    });

    const error = await store.loadOpenId().catch((reason: unknown) => reason);

    expect(String(error)).toBe('EnterpriseSessionStoreError: Enterprise session storage failed.');
    expect(String(error)).not.toContain(userDataPath);
    expect(String(error)).not.toContain(OPEN_ID);
  });

  it('treats an ENOENT open race as a missing session', async () => {
    const open = vi.fn(async () => {
      throw Object.assign(new Error('file disappeared'), { code: 'ENOENT' });
    });
    const store = new EnterpriseSessionStore(userDataPath, {
      fileSystem: {
        ...fs,
        lstat: vi.fn(async () => makeStat()),
        open,
      },
    });

    await expect(store.loadOpenId()).resolves.toBeNull();
  });

  it('sanitizes temporary-name generation failures before exposing them', async () => {
    const store = new EnterpriseSessionStore(userDataPath, {
      randomUUID: () => {
        throw new Error(`${userDataPath}/${OPEN_ID}`);
      },
    });

    const error = await store.saveOpenId(OPEN_ID).catch((reason: unknown) => reason);

    expect(String(error)).toBe('EnterpriseSessionStoreError: Enterprise session storage failed.');
    expect(String(error)).not.toContain(userDataPath);
    expect(String(error)).not.toContain(OPEN_ID);
  });

  it('does not delete a pre-existing exclusive temporary file on collision', async () => {
    const temporaryName = '33333333-3333-4333-8333-333333333333';
    const temporaryPath = path.join(userDataPath, `enterprise-session.json.${temporaryName}.tmp`);
    await fs.writeFile(temporaryPath, 'owned-by-another-writer');
    const store = new EnterpriseSessionStore(userDataPath, { randomUUID: () => temporaryName });

    await expect(store.saveOpenId(OPEN_ID)).rejects.toThrow('Enterprise session storage failed.');
    await expect(fs.readFile(temporaryPath, 'utf8')).resolves.toBe('owned-by-another-writer');
  });

  it('removes an owned temporary file containing partial sensitive data when writing fails', async () => {
    const temporaryName = '44444444-4444-4444-8444-444444444444';
    const temporaryPath = path.join(userDataPath, `enterprise-session.json.${temporaryName}.tmp`);
    const open = vi.fn(async (filePath: string, flags: string, mode?: number) => {
      const handle = await fs.open(filePath, flags, mode);
      const adapted = adaptRealHandle(handle);
      return {
        ...adapted,
        writeFile: async (data: string) => {
          await handle.writeFile(data.slice(0, data.indexOf(OPEN_ID) + OPEN_ID.length), { encoding: 'utf8' });
          throw new Error(`${OPEN_ID} partial write failed`);
        },
      };
    });
    const store = new EnterpriseSessionStore(userDataPath, {
      fileSystem: { ...fs, open },
      randomUUID: () => temporaryName,
    });

    const error = await store.saveOpenId(OPEN_ID).catch((reason: unknown) => reason);

    expect(String(error)).toBe('EnterpriseSessionStoreError: Enterprise session storage failed.');
    await expect(fs.stat(temporaryPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(String(error)).not.toContain(OPEN_ID);
  });

  it('removes an owned temporary file when close fails after a successful sync', async () => {
    const temporaryName = '55555555-5555-4555-8555-555555555555';
    const temporaryPath = path.join(userDataPath, `enterprise-session.json.${temporaryName}.tmp`);
    const open = vi.fn(async (filePath: string, flags: string, mode?: number) => {
      const handle = await fs.open(filePath, flags, mode);
      const adapted = adaptRealHandle(handle);
      let firstClose = true;
      return {
        ...adapted,
        close: async () => {
          if (firstClose) {
            firstClose = false;
            await handle.close();
            throw new Error(`${OPEN_ID} close failed`);
          }
          await handle.close();
        },
      };
    });
    const store = new EnterpriseSessionStore(userDataPath, {
      fileSystem: { ...fs, open },
      randomUUID: () => temporaryName,
    });

    const error = await store.saveOpenId(OPEN_ID).catch((reason: unknown) => reason);

    expect(String(error)).toBe('EnterpriseSessionStoreError: Enterprise session storage failed.');
    await expect(fs.stat(temporaryPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes an owned temporary file when sync fails after writing sensitive data', async () => {
    const temporaryName = '66666666-6666-4666-8666-666666666666';
    const temporaryPath = path.join(userDataPath, `enterprise-session.json.${temporaryName}.tmp`);
    const open = vi.fn(async (filePath: string, flags: string, mode?: number) => {
      const handle = await fs.open(filePath, flags, mode);
      return {
        ...adaptRealHandle(handle),
        sync: async () => {
          throw new Error(`${OPEN_ID} sync failed`);
        },
      };
    });
    const store = new EnterpriseSessionStore(userDataPath, {
      fileSystem: { ...fs, open },
      randomUUID: () => temporaryName,
    });

    const error = await store.saveOpenId(OPEN_ID).catch((reason: unknown) => reason);

    expect(String(error)).toBe('EnterpriseSessionStoreError: Enterprise session storage failed.');
    await expect(fs.stat(temporaryPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(String(error)).not.toContain(OPEN_ID);
  });

  it('rejects a swapped path identity before reading from the verified handle', async () => {
    const read = vi.fn();
    const close = vi.fn().mockResolvedValue(undefined);
    const lstat = vi
      .fn()
      .mockResolvedValueOnce(makeStat({ dev: 1, ino: 10 }))
      .mockResolvedValueOnce(makeStat({ dev: 1, ino: 11 }));
    const open = vi.fn().mockResolvedValue({
      stat: vi.fn().mockResolvedValue(makeStat({ dev: 1, ino: 10 })),
      read,
      close,
      writeFile: vi.fn(),
      sync: vi.fn(),
    });
    const store = new EnterpriseSessionStore(userDataPath, { fileSystem: { ...fs, lstat, open } });

    await expect(store.loadOpenId()).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects a symlink swap detected by the second path stat before reading', async () => {
    const read = vi.fn();
    const close = vi.fn().mockResolvedValue(undefined);
    const lstat = vi
      .fn()
      .mockResolvedValueOnce(makeStat({ dev: 1, ino: 10 }))
      .mockResolvedValueOnce(makeStat({ dev: 1, ino: 10, symbolicLink: true }));
    const open = vi.fn().mockResolvedValue({
      stat: vi.fn().mockResolvedValue(makeStat({ dev: 1, ino: 10 })),
      read,
      close,
      writeFile: vi.fn(),
      sync: vi.fn(),
    });
    const store = new EnterpriseSessionStore(userDataPath, { fileSystem: { ...fs, lstat, open } });

    await expect(store.loadOpenId()).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('reads at most MAX+1 bytes from a verified handle when the file grows after stat', async () => {
    const requestedLengths: number[] = [];
    const read = vi.fn(async (buffer: Uint8Array, offset: number, length: number) => {
      requestedLengths.push(length);
      buffer.fill(120, offset, offset + length);
      return { bytesRead: length, buffer };
    });
    const close = vi.fn().mockResolvedValue(undefined);
    const stableStat = makeStat({ dev: 1, ino: 10, size: 64 });
    const open = vi.fn().mockResolvedValue({
      stat: vi.fn().mockResolvedValue(stableStat),
      read,
      close,
      writeFile: vi.fn(),
      sync: vi.fn(),
    });
    const lstat = vi.fn().mockResolvedValue(stableStat);
    const store = new EnterpriseSessionStore(userDataPath, { fileSystem: { ...fs, lstat, open } });

    await expect(store.loadOpenId()).resolves.toBeNull();
    expect(requestedLengths.reduce((total, length) => total + length, 0)).toBe(4097);
    expect(read).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps the old session and removes the temporary file when rename fails', async () => {
    const sessionPath = path.join(userDataPath, 'enterprise-session.json');
    await fs.writeFile(sessionPath, '{"version":1,"openId":"old-open-id"}');
    const rename = vi.fn(async () => {
      throw new Error(`${userDataPath}/${OPEN_ID}`);
    });
    const store = new EnterpriseSessionStore(userDataPath, {
      fileSystem: { ...fs, rename },
      randomUUID: () => '22222222-2222-4222-8222-222222222222',
    });

    const error = await store.saveOpenId(OPEN_ID).catch((reason: unknown) => reason);

    expect(String(error)).toBe('EnterpriseSessionStoreError: Enterprise session storage failed.');
    expect(await fs.readFile(sessionPath, 'utf8')).toBe('{"version":1,"openId":"old-open-id"}');
    expect(await fs.readdir(userDataPath)).toEqual(['enterprise-session.json']);
  });

  it('clears an existing session and treats a missing file as an idempotent success', async () => {
    const store = new EnterpriseSessionStore(userDataPath);
    await store.saveOpenId(OPEN_ID);

    await store.clear();
    await expect(store.loadOpenId()).resolves.toBeNull();
    await expect(store.clear()).resolves.toBeUndefined();
  });

  it('serializes saves and clear operations to avoid stale-file races', async () => {
    const store = new EnterpriseSessionStore(userDataPath);

    const firstSave = store.saveOpenId('first-open-id');
    const clear = store.clear();
    const secondSave = store.saveOpenId('second-open-id');
    await Promise.all([firstSave, clear, secondSave]);

    await expect(store.loadOpenId()).resolves.toBe('second-open-id');
  });

  it('continues serialized operations after a prior operation fails', async () => {
    let openAttempt = 0;
    const open = vi.fn(async (filePath: string, flags: string, mode?: number) => {
      openAttempt += 1;
      if (openAttempt === 1) throw Object.assign(new Error(`${OPEN_ID} denied`), { code: 'EACCES' });
      return adaptRealHandle(await fs.open(filePath, flags, mode));
    });
    const store = new EnterpriseSessionStore(userDataPath, { fileSystem: { ...fs, open } });

    await expect(store.saveOpenId('first-open-id')).rejects.toThrow('Enterprise session storage failed.');
    await expect(store.saveOpenId('second-open-id')).resolves.toBeUndefined();

    await expect(store.loadOpenId()).resolves.toBe('second-open-id');
  });
});
