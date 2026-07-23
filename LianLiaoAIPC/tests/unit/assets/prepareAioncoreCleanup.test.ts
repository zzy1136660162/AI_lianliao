import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const { moveExistingDirectoryAside } = require('../../../packages/shared-scripts/src/prepare-aioncore');
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('prepareAioncore cleanup', () => {
  it('moves an existing runtime directory aside before a replacement build', () => {
    const root = mkdtempSync(join(tmpdir(), 'aionui-aioncore-cleanup-'));
    temporaryRoots.push(root);
    const runtimeDir = join(root, 'win32-x64');
    mkdirSync(runtimeDir);

    const backupDir = moveExistingDirectoryAside(runtimeDir);

    expect(existsSync(runtimeDir)).toBe(false);
    expect(backupDir).not.toBeNull();
    expect(existsSync(backupDir!)).toBe(true);
  });
});
