import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type WindowsInstallerSignatureStatus = 'VALID' | 'UNSIGNED' | 'INVALID';

type SignatureCommandRunner = (
  file: string,
  args: string[],
  options: {
    env: NodeJS.ProcessEnv;
    timeout: number;
    windowsHide: boolean;
  }
) => Promise<{ stdout: string | Buffer }>;

/**
 * Uses Windows trust validation without interpolating the installer path into a shell command.
 * Unsigned packages remain distinguishable from damaged, untrusted, or unreadable signatures so
 * current releases can stay compatible until the Windows signing certificate is configured.
 */
export const inspectWindowsInstallerSignature = async (
  installerPath: string,
  runCommand: SignatureCommandRunner = execFileAsync
): Promise<WindowsInstallerSignatureStatus> => {
  try {
    const { stdout } = await runCommand(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$signature = Get-AuthenticodeSignature -LiteralPath $env:LIANLIAO_UPDATE_INSTALLER; [Console]::Out.Write($signature.Status.ToString())',
      ],
      {
        env: { ...process.env, LIANLIAO_UPDATE_INSTALLER: installerPath },
        timeout: 15_000,
        windowsHide: true,
      }
    );
    const status = stdout.toString().trim();
    if (status === 'Valid') return 'VALID';
    if (status === 'NotSigned') return 'UNSIGNED';
    return 'INVALID';
  } catch {
    return 'INVALID';
  }
};
