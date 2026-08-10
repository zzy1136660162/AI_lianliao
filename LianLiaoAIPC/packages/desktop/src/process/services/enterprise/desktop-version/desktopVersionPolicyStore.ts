import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import { desktopVersionRemoteReleaseSchema, type DesktopVersionRemoteRelease } from './desktopVersionApiClient';

export type DesktopVersionPolicyStore = {
  loadMandatory: () => Promise<DesktopVersionRemoteRelease | null>;
  saveMandatory: (release: DesktopVersionRemoteRelease) => Promise<void>;
  clearMandatory: () => Promise<void>;
};

/** Persists only a previously confirmed mandatory policy for offline enforcement. */
export const createDesktopVersionPolicyStore = (userDataDirectory: string): DesktopVersionPolicyStore => {
  const directory = path.join(userDataDirectory, 'updates');
  const policyPath = path.join(directory, 'mandatory-policy.json');

  return {
    loadMandatory: async () => {
      try {
        const raw = JSON.parse(await readFile(policyPath, 'utf8')) as unknown;
        const parsed = desktopVersionRemoteReleaseSchema.safeParse(raw);
        return parsed.success && parsed.data.version.forceUpdate ? (parsed.data as DesktopVersionRemoteRelease) : null;
      } catch {
        return null;
      }
    },
    saveMandatory: async (release) => {
      const parsed = desktopVersionRemoteReleaseSchema.parse(release);
      if (!parsed.version.forceUpdate) {
        throw new Error('Only mandatory desktop update policies may be persisted.');
      }
      await mkdir(directory, { recursive: true });
      const temporaryPath = `${policyPath}.part-${process.pid}-${Date.now()}`;
      await writeFile(temporaryPath, JSON.stringify(parsed), { encoding: 'utf8', flag: 'wx' });
      try {
        await rename(temporaryPath, policyPath);
      } catch {
        await rm(policyPath, { force: true });
        await rename(temporaryPath, policyPath);
      }
    },
    clearMandatory: () => rm(policyPath, { force: true }),
  };
};
