import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EnterpriseSessionStore } from '@/process/services/enterprise/enterpriseSessionStore';

const OPEN_ID = 'wx-open-id-sensitive-value';

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
    const writeFile = vi.fn(fs.writeFile);
    const rename = vi.fn(fs.rename);
    const store = new EnterpriseSessionStore(userDataPath, {
      fileSystem: { ...fs, writeFile, rename },
      randomUUID: () => '11111111-1111-4111-8111-111111111111',
    });

    await store.saveOpenId(OPEN_ID);

    const sessionPath = path.join(userDataPath, 'enterprise-session.json');
    const temporaryPath = `${sessionPath}.11111111-1111-4111-8111-111111111111.tmp`;
    expect(writeFile).toHaveBeenCalledWith(temporaryPath, `{"version":1,"openId":"${OPEN_ID}"}`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    expect(rename).toHaveBeenCalledWith(temporaryPath, sessionPath);
    expect(writeFile.mock.invocationCallOrder[0]).toBeLessThan(rename.mock.invocationCallOrder[0]);
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
    const readFile = vi.fn(fs.readFile);
    const lstat = vi.fn(async () => ({
      isFile: () => true,
      isSymbolicLink: () => true,
      size: 20,
    }));
    const store = new EnterpriseSessionStore(userDataPath, { fileSystem: { ...fs, lstat, readFile } });

    await expect(store.loadOpenId()).resolves.toBeNull();
    expect(readFile).not.toHaveBeenCalled();
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
    const readFile = vi.fn(async () => {
      throw Object.assign(new Error(`${userDataPath}/${OPEN_ID}`), { code: 'EACCES' });
    });
    const store = new EnterpriseSessionStore(userDataPath, {
      fileSystem: {
        ...fs,
        lstat: vi.fn(async () => ({ isFile: () => true, isSymbolicLink: () => false, size: 20 })),
        readFile,
      },
    });

    const error = await store.loadOpenId().catch((reason: unknown) => reason);

    expect(String(error)).toBe('EnterpriseSessionStoreError: Enterprise session storage failed.');
    expect(String(error)).not.toContain(userDataPath);
    expect(String(error)).not.toContain(OPEN_ID);
  });

  it('treats an ENOENT read race as a missing session', async () => {
    const readFile = vi.fn(async () => {
      throw Object.assign(new Error('file disappeared'), { code: 'ENOENT' });
    });
    const store = new EnterpriseSessionStore(userDataPath, {
      fileSystem: {
        ...fs,
        lstat: vi.fn(async () => ({ isFile: () => true, isSymbolicLink: () => false, size: 20 })),
        readFile,
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
});
