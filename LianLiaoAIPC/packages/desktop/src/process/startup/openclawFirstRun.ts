/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile as nodeExecFile, spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import type { ILegacyConfigStorageRefer } from '@/common/config/storage';

export const OPENCLAW_FIRST_RUN_CONFIG_KEY = 'openclaw.firstRunPrepare_v1' as const;
export const OPENCLAW_AUTO_PREPARE_ENV = 'AIONUI_OPENCLAW_AUTO_PREPARE';
export const OPENCLAW_PREPARE_COMMAND_ENV = 'AIONUI_OPENCLAW_PREPARE_COMMAND';
export const OPENCLAW_PREPARE_FORCE_ENV = 'AIONUI_OPENCLAW_PREPARE_FORCE';

export type OpenClawFirstRunPrepareState = NonNullable<ILegacyConfigStorageRefer[typeof OPENCLAW_FIRST_RUN_CONFIG_KEY]>;

export type OpenClawFirstRunPrepareStatus =
  | OpenClawFirstRunPrepareState
  | {
      version: 1;
      attempted: false;
      completed: false;
      status: 'not_started';
      updatedAt: 0;
    };

export type OpenClawFirstRunPrepareResult = {
  status: OpenClawFirstRunPrepareStatus['status'] | 'skipped_attempted';
  state?: OpenClawFirstRunPrepareStatus;
};

export type OpenClawCommandSpec = {
  command: string;
  args: string[];
  display: string;
};

type OpenClawFirstRunConfigStore = {
  get(key: typeof OPENCLAW_FIRST_RUN_CONFIG_KEY): Promise<OpenClawFirstRunPrepareState | undefined>;
  set(
    key: typeof OPENCLAW_FIRST_RUN_CONFIG_KEY,
    value: OpenClawFirstRunPrepareState
  ): Promise<OpenClawFirstRunPrepareState | void>;
};

type CommandError = Error & { code?: string | number };

type ExecFileLike = (
  command: string,
  args: string[],
  options: { timeout: number; windowsHide: boolean; env?: NodeJS.ProcessEnv },
  callback: (error: CommandError | null) => void
) => unknown;

type SpawnedChildLike = {
  on?: (event: 'exit' | 'error', listener: (...args: unknown[]) => void) => unknown;
  unref?: () => void;
};

type SpawnLike = (command: string, args: string[], options: SpawnOptions) => SpawnedChildLike;

type OpenClawFirstRunDeps = {
  env?: NodeJS.ProcessEnv;
  execFile?: ExecFileLike;
  force?: boolean;
  logger?: Pick<Console, 'info' | 'warn'>;
  now?: () => number;
  onStatusChange?: (state: OpenClawFirstRunPrepareStatus) => void;
  platform?: NodeJS.Platform;
  probeTimeoutMs?: number;
  spawn?: SpawnLike;
};

const truthy = new Set(['1', 'true', 'yes', 'on']);
const disabledValues = new Set(['0', 'false', 'no', 'off']);

const normalizeEnvFlag = (value: string | undefined): string => value?.trim().toLowerCase() ?? '';

const isAutoPrepareDisabled = (env: NodeJS.ProcessEnv): boolean =>
  disabledValues.has(normalizeEnvFlag(env[OPENCLAW_AUTO_PREPARE_ENV]));

const isForceEnabled = (env: NodeJS.ProcessEnv): boolean =>
  truthy.has(normalizeEnvFlag(env[OPENCLAW_PREPARE_FORCE_ENV]));

const toShellCommand = (platform: NodeJS.Platform, command: string): OpenClawCommandSpec | null => {
  if (platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      display: command,
    };
  }

  if (platform === 'darwin' || platform === 'linux') {
    return {
      command: '/bin/sh',
      args: ['-lc', command],
      display: command,
    };
  }

  return null;
};

export const resolveOpenClawInstallerCommand = (
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env
): OpenClawCommandSpec | null => {
  const overrideCommand = env[OPENCLAW_PREPARE_COMMAND_ENV]?.trim();
  if (overrideCommand) {
    return toShellCommand(platform, overrideCommand);
  }

  if (platform === 'win32') {
    return toShellCommand(
      platform,
      "$env:OPENCLAW_NO_ONBOARD='1'; & ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -NoOnboard; if ($LASTEXITCODE) { exit $LASTEXITCODE }; openclaw gateway start"
    );
  }

  if (platform === 'darwin' || platform === 'linux') {
    return toShellCommand(
      platform,
      "curl -fsSL --proto '=https' --tlsv1.2 https://openclaw.ai/install.sh | OPENCLAW_NO_ONBOARD=1 OPENCLAW_NO_PROMPT=1 bash -s -- --no-onboard --no-prompt && openclaw gateway start"
    );
  }

  return null;
};

const buildGatewayCommand = (platform: NodeJS.Platform = process.platform): OpenClawCommandSpec => {
  const display = 'openclaw gateway start';

  if (platform === 'win32') {
    return (
      toShellCommand(platform, display) ?? {
        args: ['/d', '/s', '/c', display],
        command: 'cmd.exe',
        display,
      }
    );
  }

  return {
    command: 'openclaw',
    args: ['gateway', 'start'],
    display,
  };
};

const isMissingCommandError = (error: CommandError): boolean =>
  error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'UNKNOWN';

const hasOpenClawCli = async (
  deps: Required<Pick<OpenClawFirstRunDeps, 'env' | 'execFile' | 'platform' | 'probeTimeoutMs'>>
) => {
  return new Promise<boolean>((resolve) => {
    const command = deps.platform === 'win32' ? 'where.exe' : 'openclaw';
    const args = deps.platform === 'win32' ? ['openclaw'] : ['--version'];

    try {
      deps.execFile(command, args, { env: deps.env, timeout: deps.probeTimeoutMs, windowsHide: true }, (error) => {
        if (!error) {
          resolve(true);
          return;
        }

        resolve(deps.platform === 'win32' ? false : !isMissingCommandError(error));
      });
    } catch {
      resolve(false);
    }
  });
};

const spawnDetached = (command: OpenClawCommandSpec, deps: Required<Pick<OpenClawFirstRunDeps, 'env' | 'spawn'>>) => {
  const child = deps.spawn(command.command, command.args, {
    detached: true,
    env: deps.env,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref?.();
  return child;
};

const buildState = (
  state: Omit<OpenClawFirstRunPrepareState, 'updatedAt' | 'version'>,
  now: number
): OpenClawFirstRunPrepareState => ({
  version: 1,
  updatedAt: now,
  ...state,
});

const writeState = async (
  config: OpenClawFirstRunConfigStore,
  state: OpenClawFirstRunPrepareState,
  onStatusChange?: (state: OpenClawFirstRunPrepareStatus) => void
) => {
  await config.set(OPENCLAW_FIRST_RUN_CONFIG_KEY, state);
  onStatusChange?.(state);
  return state;
};

export const getOpenClawFirstRunPrepareStatus = async (
  config: OpenClawFirstRunConfigStore
): Promise<OpenClawFirstRunPrepareStatus> => {
  return (
    (await config.get(OPENCLAW_FIRST_RUN_CONFIG_KEY)) ?? {
      attempted: false,
      completed: false,
      status: 'not_started',
      updatedAt: 0,
      version: 1,
    }
  );
};

export const prepareOpenClawFirstRun = async (
  config: OpenClawFirstRunConfigStore,
  deps: OpenClawFirstRunDeps = {}
): Promise<OpenClawFirstRunPrepareResult> => {
  const env = deps.env ?? process.env;
  const now = deps.now?.() ?? Date.now();
  const platform = deps.platform ?? process.platform;
  const execFile: ExecFileLike =
    deps.execFile ??
    ((command, args, options, callback) => {
      return nodeExecFile(command, args, options, (error) => callback(error));
    });
  const spawn = deps.spawn ?? nodeSpawn;
  const probeTimeoutMs = deps.probeTimeoutMs ?? 5000;
  const existingState = await config.get(OPENCLAW_FIRST_RUN_CONFIG_KEY);
  const commandDeps = { env, execFile, platform, probeTimeoutMs };
  const spawnDeps = { env, spawn };

  if (isAutoPrepareDisabled(env)) {
    const state = buildState(
      {
        attempted: false,
        completed: false,
        status: 'skipped_disabled',
      },
      now
    );
    await writeState(config, state, deps.onStatusChange);
    return { status: 'skipped_disabled', state };
  }

  if (existingState?.attempted && !deps.force && !isForceEnabled(env)) {
    const shouldRetryReadyState = existingState.status === 'ready' && !(await hasOpenClawCli(commandDeps));
    if (!shouldRetryReadyState) {
      return { status: 'skipped_attempted', state: existingState };
    }
  }

  const checkingState = buildState(
    {
      attempted: true,
      completed: false,
      status: 'checking',
    },
    now
  );
  await writeState(config, checkingState, deps.onStatusChange);

  const installed = await hasOpenClawCli(commandDeps);

  if (installed) {
    const gatewayCommand = buildGatewayCommand(platform);
    spawnDetached(gatewayCommand, spawnDeps);
    const state = buildState(
      {
        attempted: true,
        completed: true,
        gatewayCommand: gatewayCommand.display,
        status: 'ready',
      },
      now
    );
    await writeState(config, state, deps.onStatusChange);
    return { status: 'ready', state };
  }

  const installerCommand = resolveOpenClawInstallerCommand(platform, env);
  if (!installerCommand) {
    const state = buildState(
      {
        attempted: true,
        completed: false,
        error: `OpenClaw auto-prepare is not supported on ${platform}.`,
        status: 'needs_manual_install',
      },
      now
    );
    await writeState(config, state, deps.onStatusChange);
    return { status: 'needs_manual_install', state };
  }

  try {
    const child = spawnDetached(installerCommand, spawnDeps);
    const state = buildState(
      {
        attempted: true,
        completed: false,
        installCommand: installerCommand.display,
        status: 'installing',
      },
      now
    );
    await writeState(config, state, deps.onStatusChange);
    child.on?.('exit', (code) => {
      void (async () => {
        const exitCode = typeof code === 'number' ? code : null;
        const exitedAt = deps.now?.() ?? Date.now();

        if (exitCode === 0 && (await hasOpenClawCli(commandDeps))) {
          const gatewayCommand = buildGatewayCommand(platform);
          spawnDetached(gatewayCommand, spawnDeps);
          const nextState = buildState(
            {
              attempted: true,
              completed: true,
              completedAt: exitedAt,
              exitCode,
              gatewayCommand: gatewayCommand.display,
              installCommand: installerCommand.display,
              status: 'ready',
            },
            deps.now?.() ?? Date.now()
          );
          await writeState(config, nextState, deps.onStatusChange);
          return;
        }

        const nextState = buildState(
          {
            attempted: true,
            completed: false,
            error:
              exitCode === null
                ? 'OpenClaw installer exited without a code.'
                : exitCode === 0
                  ? 'OpenClaw installer exited successfully, but the openclaw command is still unavailable on PATH.'
                  : `OpenClaw installer exited with code ${exitCode}.`,
            exitCode,
            installCommand: installerCommand.display,
            status: 'failed',
          },
          deps.now?.() ?? Date.now()
        );
        await writeState(config, nextState, deps.onStatusChange);
      })();
    });
    child.on?.('error', (error) => {
      const nextState = buildState(
        {
          attempted: true,
          completed: false,
          error: error instanceof Error ? error.message : String(error),
          installCommand: installerCommand.display,
          status: 'failed',
        },
        deps.now?.() ?? Date.now()
      );
      void writeState(config, nextState, deps.onStatusChange);
    });
    return { status: 'installing', state };
  } catch (error) {
    const state = buildState(
      {
        attempted: true,
        completed: false,
        error: error instanceof Error ? error.message : String(error),
        installCommand: installerCommand.display,
        status: 'failed',
      },
      now
    );
    await writeState(config, state, deps.onStatusChange);
    return { status: 'failed', state };
  }
};

export const scheduleOpenClawFirstRunPrepare = (
  config: OpenClawFirstRunConfigStore,
  deps: OpenClawFirstRunDeps = {}
) => {
  const logger = deps.logger ?? console;

  void prepareOpenClawFirstRun(config, deps)
    .then((result) => {
      if (result.status === 'ready' || result.status === 'installing') {
        logger.info(`[AionUi] OpenClaw first-run preparation: ${result.status}`);
      }
    })
    .catch((error) => {
      logger.warn('[AionUi] OpenClaw first-run preparation failed:', error);
    });
};
