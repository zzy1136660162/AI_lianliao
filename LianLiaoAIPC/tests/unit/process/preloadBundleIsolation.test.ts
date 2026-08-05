import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const preloadRoot = resolve(process.cwd(), 'packages/desktop/src/preload');
const auxiliaryPreloads = ['petPreload.ts', 'petHitPreload.ts', 'petConfirmPreload.ts'] as const;

describe('sandboxed preload bundle isolation', () => {
  it('keeps the shared runtime helper exclusive to the main preload entry', () => {
    const mainSource = readFileSync(resolve(preloadRoot, 'main.ts'), 'utf8');
    expect(mainSource).toContain("from './runtimeEnvironment'");

    for (const fileName of auxiliaryPreloads) {
      const source = readFileSync(resolve(preloadRoot, fileName), 'utf8');
      expect(source).not.toContain("from './runtimeEnvironment'");
    }
  });

  it('exposes the packaged flag directly in each auxiliary preload', () => {
    for (const fileName of auxiliaryPreloads) {
      const source = readFileSync(resolve(preloadRoot, fileName), 'utf8');
      expect(source).toContain("contextBridge.exposeInMainWorld('__isPackaged'");
    }
  });
});
