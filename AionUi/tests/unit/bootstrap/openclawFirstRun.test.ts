import { describe, expect, it, vi } from 'vitest';
import {
  getOpenClawFirstRunPrepareStatus,
  OPENCLAW_FIRST_RUN_CONFIG_KEY,
  prepareOpenClawFirstRun,
  resolveOpenClawInstallerCommand,
  type OpenClawFirstRunPrepareState,
} from '@/process/startup/openclawFirstRun';

const createConfigStore = (initial?: OpenClawFirstRunPrepareState) => {
  const store = new Map<string, OpenClawFirstRunPrepareState | undefined>();
  if (initial) store.set(OPENCLAW_FIRST_RUN_CONFIG_KEY, initial);

  return {
    get: vi.fn(async (key: typeof OPENCLAW_FIRST_RUN_CONFIG_KEY) => store.get(key)),
    set: vi.fn(async (key: typeof OPENCLAW_FIRST_RUN_CONFIG_KEY, value: OpenClawFirstRunPrepareState) => {
      store.set(key, value);
      return value;
    }),
    read: () => store.get(OPENCLAW_FIRST_RUN_CONFIG_KEY),
  };
};

const createChild = () => ({ unref: vi.fn() });

const createObservableChild = () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const child = {
    emitExit: (code: number | null) => listeners.get('exit')?.(code),
    on: vi.fn((event: 'exit' | 'error', listener: (...args: unknown[]) => void) => {
      listeners.set(event, listener);
      return child;
    }),
    unref: vi.fn(),
  };

  return child;
};

const flushAsyncWork = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const createExecFile = (error: NodeJS.ErrnoException | null) =>
  vi.fn(
    (command: string, args: string[], options: unknown, callback: (error: NodeJS.ErrnoException | null) => void) => {
      callback(error);
      return {};
    }
  );

const createExecFileHandler = (handler: (command: string, args: string[]) => NodeJS.ErrnoException | null) =>
  vi.fn(
    (command: string, args: string[], options: unknown, callback: (error: NodeJS.ErrnoException | null) => void) => {
      callback(handler(command, args));
      return {};
    }
  );

describe('OpenClaw first-run preparation', () => {
  it('starts the gateway and marks preparation complete when OpenClaw is already installed', async () => {
    const config = createConfigStore();
    const child = createChild();
    const spawn = vi.fn(() => child);
    const execFile = createExecFile(null);

    const result = await prepareOpenClawFirstRun(config, {
      execFile,
      spawn,
      env: {},
      now: () => 12345,
      platform: 'win32',
    });

    expect(result.status).toBe('ready');
    expect(execFile).toHaveBeenCalledWith(
      'where.exe',
      ['openclaw'],
      expect.objectContaining({ timeout: 5000, windowsHide: true }),
      expect.any(Function)
    );
    expect(spawn).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'openclaw gateway start']),
      expect.objectContaining({ detached: true, stdio: 'ignore', windowsHide: true })
    );
    expect(child.unref).toHaveBeenCalled();
    expect(config.read()).toEqual(
      expect.objectContaining({
        attempted: true,
        completed: true,
        gatewayCommand: 'openclaw gateway start',
        status: 'ready',
        updatedAt: 12345,
        version: 1,
      })
    );
  });

  it('detects a Windows npm cmd shim and starts the gateway through a shell command', async () => {
    const config = createConfigStore();
    const child = createChild();
    const spawn = vi.fn(() => child);
    const execFile = createExecFileHandler((command, args) => {
      if (command === 'where.exe' && args[0] === 'openclaw') return null;
      return Object.assign(new Error('not found'), { code: 'ENOENT' });
    });

    const result = await prepareOpenClawFirstRun(config, {
      execFile,
      spawn,
      env: {},
      now: () => 23456,
      platform: 'win32',
    });

    expect(result.status).toBe('ready');
    expect(execFile).toHaveBeenCalledWith(
      'where.exe',
      ['openclaw'],
      expect.objectContaining({ timeout: 5000, windowsHide: true }),
      expect.any(Function)
    );
    expect(spawn).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'openclaw gateway start']),
      expect.objectContaining({ detached: true, stdio: 'ignore', windowsHide: true })
    );
    expect(config.read()).toEqual(
      expect.objectContaining({
        attempted: true,
        completed: true,
        gatewayCommand: 'openclaw gateway start',
        status: 'ready',
        updatedAt: 23456,
      })
    );
  });

  it('launches the official non-interactive installer once when OpenClaw is missing', async () => {
    const config = createConfigStore();
    const child = createChild();
    const spawn = vi.fn(() => child);
    const missingError = Object.assign(new Error('not found'), { code: 'ENOENT' });
    const execFile = createExecFile(missingError);

    const result = await prepareOpenClawFirstRun(config, {
      execFile,
      spawn,
      env: {},
      now: () => 67890,
      platform: 'win32',
    });

    expect(result.status).toBe('installing');
    expect(spawn).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-NoProfile', '-ExecutionPolicy', 'Bypass']),
      expect.objectContaining({ detached: true, stdio: 'ignore', windowsHide: true })
    );
    const [, args] = spawn.mock.calls[0];
    expect(args.join(' ')).toContain('https://openclaw.ai/install.ps1');
    expect(args.join(' ')).toContain('-NoOnboard');
    expect(config.read()).toEqual(
      expect.objectContaining({
        attempted: true,
        completed: false,
        installCommand: expect.stringContaining('install.ps1'),
        status: 'installing',
        updatedAt: 67890,
        version: 1,
      })
    );
  });

  it('does not retry after a first-run attempt unless forced', async () => {
    const config = createConfigStore({
      attempted: true,
      completed: false,
      installCommand: 'previous install',
      status: 'installing',
      updatedAt: 111,
      version: 1,
    });
    const spawn = vi.fn(() => createChild());
    const execFile = createExecFile(Object.assign(new Error('not found'), { code: 'ENOENT' }));

    const result = await prepareOpenClawFirstRun(config, {
      execFile,
      spawn,
      env: {},
      platform: 'win32',
    });

    expect(result.status).toBe('skipped_attempted');
    expect(execFile).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(config.set).not.toHaveBeenCalled();
  });

  it('rechecks a recorded ready state and retries when the OpenClaw CLI is no longer available', async () => {
    const config = createConfigStore({
      attempted: true,
      completed: true,
      completedAt: 111,
      gatewayCommand: 'openclaw gateway start',
      status: 'ready',
      updatedAt: 111,
      version: 1,
    });
    const child = createChild();
    const spawn = vi.fn(() => child);
    const missingError = Object.assign(new Error('not found'), { code: 'ENOENT' });
    const execFile = createExecFile(missingError);

    const result = await prepareOpenClawFirstRun(config, {
      execFile,
      spawn,
      env: {},
      now: () => 333,
      platform: 'win32',
    });

    expect(result.status).toBe('installing');
    expect(execFile).toHaveBeenCalledWith(
      'where.exe',
      ['openclaw'],
      expect.objectContaining({ timeout: 5000, windowsHide: true }),
      expect.any(Function)
    );
    expect(spawn).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-NoProfile', '-ExecutionPolicy', 'Bypass']),
      expect.any(Object)
    );
    expect(config.read()).toEqual(
      expect.objectContaining({
        attempted: true,
        completed: false,
        status: 'installing',
        updatedAt: 333,
      })
    );
  });

  it('marks installation failed when the installer exits successfully but OpenClaw is still unavailable', async () => {
    const config = createConfigStore();
    const child = createObservableChild();
    const spawn = vi.fn(() => child);
    const missingError = Object.assign(new Error('not found'), { code: 'ENOENT' });
    const execFile = createExecFile(missingError);

    const result = await prepareOpenClawFirstRun(config, {
      execFile,
      spawn,
      env: {},
      now: () => 444,
      platform: 'win32',
    });

    expect(result.status).toBe('installing');

    child.emitExit(0);
    await flushAsyncWork();

    expect(execFile).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(config.read()).toEqual(
      expect.objectContaining({
        attempted: true,
        completed: false,
        error: expect.stringContaining('still unavailable'),
        exitCode: 0,
        installCommand: expect.stringContaining('install.ps1'),
        status: 'failed',
        updatedAt: 444,
      })
    );
  });

  it('marks installation ready when the Windows installer adds OpenClaw as an npm cmd shim', async () => {
    const config = createConfigStore();
    const child = createObservableChild();
    const spawn = vi.fn(() => child);
    let whereAttempts = 0;
    const missingError = Object.assign(new Error('not found'), { code: 'ENOENT' });
    const execFile = createExecFileHandler((command, args) => {
      if (command === 'where.exe' && args[0] === 'openclaw') {
        whereAttempts += 1;
        return whereAttempts === 1 ? missingError : null;
      }
      return missingError;
    });

    const result = await prepareOpenClawFirstRun(config, {
      execFile,
      spawn,
      env: {},
      now: () => 555,
      platform: 'win32',
    });

    expect(result.status).toBe('installing');

    child.emitExit(0);
    await flushAsyncWork();

    expect(whereAttempts).toBe(2);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenLastCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-Command', 'openclaw gateway start']),
      expect.objectContaining({ detached: true, stdio: 'ignore', windowsHide: true })
    );
    expect(config.read()).toEqual(
      expect.objectContaining({
        attempted: true,
        completed: true,
        completedAt: 555,
        exitCode: 0,
        gatewayCommand: 'openclaw gateway start',
        status: 'ready',
        updatedAt: 555,
      })
    );
  });

  it('uses AIONUI_OPENCLAW_PREPARE_COMMAND as an installer override', () => {
    const command = resolveOpenClawInstallerCommand('linux', {
      AIONUI_OPENCLAW_PREPARE_COMMAND: 'npm install -g openclaw@latest',
    });

    expect(command).toEqual(
      expect.objectContaining({
        args: ['-lc', 'npm install -g openclaw@latest'],
        command: '/bin/sh',
        display: 'npm install -g openclaw@latest',
      })
    );
  });

  it('returns a user-facing not_started status before the first prepare attempt', async () => {
    const config = createConfigStore();

    await expect(getOpenClawFirstRunPrepareStatus(config)).resolves.toEqual(
      expect.objectContaining({
        attempted: false,
        completed: false,
        status: 'not_started',
        version: 1,
      })
    );
  });

  it('allows a manual retry after the first-run attempt has already been recorded', async () => {
    const config = createConfigStore({
      attempted: true,
      completed: false,
      installCommand: 'previous install',
      status: 'failed',
      updatedAt: 111,
      version: 1,
    });
    const child = createChild();
    const spawn = vi.fn(() => child);
    const execFile = createExecFile(null);

    const result = await prepareOpenClawFirstRun(config, {
      execFile,
      force: true,
      now: () => 222,
      platform: 'win32',
      spawn,
    });

    expect(result.status).toBe('ready');
    expect(execFile).toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-Command', 'openclaw gateway start']),
      expect.any(Object)
    );
    expect(config.read()).toEqual(
      expect.objectContaining({
        attempted: true,
        completed: true,
        status: 'ready',
        updatedAt: 222,
      })
    );
  });
});
