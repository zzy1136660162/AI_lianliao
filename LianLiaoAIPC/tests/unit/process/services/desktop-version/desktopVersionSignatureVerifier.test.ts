import { describe, expect, it, vi } from 'vitest';

import { inspectWindowsInstallerSignature } from '@process/services/enterprise/desktop-version/desktopVersionSignatureVerifier';

describe('inspectWindowsInstallerSignature', () => {
  it.each([
    ['Valid', 'VALID'],
    ['NotSigned', 'UNSIGNED'],
    ['HashMismatch', 'INVALID'],
    ['NotTrusted', 'INVALID'],
    ['UnknownError', 'INVALID'],
  ] as const)('maps PowerShell status %s to %s', async (powershellStatus, expected) => {
    const runCommand = vi.fn(async () => ({ stdout: powershellStatus }));

    await expect(inspectWindowsInstallerSignature('C:\\cache\\installer.exe', runCommand)).resolves.toBe(expected);
    expect(runCommand).toHaveBeenCalledWith(
      'powershell.exe',
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({ LIANLIAO_UPDATE_INSTALLER: 'C:\\cache\\installer.exe' }),
        windowsHide: true,
      })
    );
  });

  it('fails closed when Windows signature inspection cannot run', async () => {
    const runCommand = vi.fn(async () => {
      throw new Error('powershell unavailable');
    });

    await expect(inspectWindowsInstallerSignature('C:\\cache\\installer.exe', runCommand)).resolves.toBe('INVALID');
  });
});
