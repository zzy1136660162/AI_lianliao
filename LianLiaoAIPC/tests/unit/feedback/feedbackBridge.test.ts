/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Node-environment tests for feedbackBridge's IPC handlers.
 * Covers the new feedback:capture-screenshot handler (main-process side).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { app } from 'electron';
import { DESKTOP_PRODUCT_NAME } from '@/common/platform/productIdentity';
import { collectFeedbackLogAttachment } from '@/process/feedback/logs';

// Table of handlers registered via ipcMain.handle during module import.
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();

type FakeWebContents = {
  capturePage?: () => Promise<{ toPNG: () => Buffer }>;
};

type FakeWindow = {
  isDestroyed: () => boolean;
  webContents: FakeWebContents;
};

let currentWindow: FakeWindow | null = null;

const diagnosticMocks = vi.hoisted(() => ({
  loadOpenId: vi.fn<() => Promise<string | null>>(),
  submit: vi.fn(),
  trustedSender: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
    on: vi.fn(),
  },
  app: {
    isPackaged: true,
    getName: vi.fn(() => 'Chain Liaoning Desktop'),
    getPath: vi.fn(() => '/tmp/aionui-test-logs-nonexistent'),
    getVersion: vi.fn(() => '0.0.0'),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => currentWindow),
  },
}));

vi.mock('@/process/bridge/enterpriseBridge', () => ({
  isTrustedEnterpriseSender: diagnosticMocks.trustedSender,
}));

vi.mock('@process/services/desktopDiagnosticClient', () => ({
  DesktopDiagnosticClient: class {
    submit = diagnosticMocks.submit;
  },
}));

vi.mock('@process/services/enterprise/enterpriseSessionStore', () => ({
  EnterpriseSessionStore: class {
    loadOpenId = diagnosticMocks.loadOpenId;
  },
}));

beforeEach(async () => {
  handlers.clear();
  currentWindow = null;
  diagnosticMocks.loadOpenId.mockReset();
  diagnosticMocks.loadOpenId.mockResolvedValue(null);
  diagnosticMocks.submit.mockReset();
  diagnosticMocks.trustedSender.mockReset();
  diagnosticMocks.trustedSender.mockReturnValue(true);
  vi.resetModules();
  // Importing registers the ipcMain.handle callbacks into our map.
  await import('@/process/bridge/feedbackBridge');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('feedbackBridge — capture-screenshot', () => {
  it('registers the feedback:capture-screenshot channel on import', () => {
    expect(handlers.has('feedback:capture-screenshot')).toBe(true);
  });

  it('returns png bytes and a timestamped filename on success', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03]);
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        capturePage: vi.fn(async () => ({ toPNG: () => pngBytes })),
      },
    };

    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = (await handler({ sender: {} })) as { filename: string; data: number[] } | null;

    expect(result).not.toBeNull();
    expect(result!.filename).toMatch(/^screenshot-.*\.png$/);
    expect(result!.data).toEqual(Array.from(pngBytes));
  });

  it('returns null when no owning BrowserWindow is resolved', async () => {
    currentWindow = null;
    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
  });

  it('returns null when the owning BrowserWindow is destroyed', async () => {
    currentWindow = {
      isDestroyed: () => true,
      webContents: {
        capturePage: vi.fn(),
      },
    };
    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
    expect(currentWindow.webContents.capturePage).not.toHaveBeenCalled();
  });

  it('returns null when capturePage yields an empty buffer', async () => {
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        capturePage: vi.fn(async () => ({ toPNG: () => Buffer.alloc(0) })),
      },
    };

    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
  });

  it('returns null and does not throw when capturePage rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        capturePage: vi.fn(async () => {
          throw new Error('capture refused');
        }),
      },
    };

    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('feedback logs', () => {
  it('includes logs from the current product-name directory and the legacy AionUi directory', async () => {
    const appDataDir = mkdtempSync(path.join(tmpdir(), 'lianliao-feedback-compat-'));
    try {
      const currentLogsDir = path.join(appDataDir, 'LianLiaoAIPC', 'logs');
      const productLogsDir = path.join(appDataDir, DESKTOP_PRODUCT_NAME, 'logs');
      const legacyLogsDir = path.join(appDataDir, 'AionUi', 'logs');
      mkdirSync(currentLogsDir, { recursive: true });
      mkdirSync(productLogsDir, { recursive: true });
      mkdirSync(legacyLogsDir, { recursive: true });
      writeFileSync(path.join(currentLogsDir, '2026-09-02.log'), 'stable current log\n');
      writeFileSync(path.join(productLogsDir, 'main.log'), 'product-name compatibility log\n');
      writeFileSync(path.join(legacyLogsDir, '2026-09-02.aioncore.log'), 'legacy compatibility log\n');

      vi.mocked(app.getName).mockReturnValue(DESKTOP_PRODUCT_NAME);
      vi.mocked(app.getPath).mockImplementation((name: string) => {
        if (name === 'logs') return currentLogsDir;
        if (name === 'appData') return appDataDir;
        return path.join(appDataDir, 'LianLiaoAIPC');
      });

      const handler = handlers.get('feedback:collect-logs')!;
      const result = (await handler({})) as { filename: string; data: number[] } | null;

      expect(result).not.toBeNull();
      const content = gunzipSync(Buffer.from(result!.data)).toString('utf8');
      expect(content).toContain('stable current log');
      expect(content).toContain('product-name compatibility log');
      expect(content).toContain('legacy compatibility log');
    } finally {
      rmSync(appDataDir, { recursive: true, force: true });
    }
  });

  it('collects top-level frontend logs and nested backend logs through the IPC handler', async () => {
    const logsDir = mkdtempSync(path.join(tmpdir(), 'aionui-feedback-bridge-'));
    try {
      const backendLogsDir = path.join(logsDir, 'logs');
      mkdirSync(backendLogsDir);
      writeFileSync(path.join(logsDir, '2026-05-25.log'), 'frontend renderer log\n');
      writeFileSync(path.join(backendLogsDir, '2026-05-25.log'), 'backend process log\n');
      writeFileSync(path.join(backendLogsDir, '2026-05-24.log'), 'second day backend log\n');
      writeFileSync(path.join(backendLogsDir, '2026-05-23.log'), 'third day backend log\n');
      writeFileSync(path.join(backendLogsDir, '2026-05-22.log'), 'too old backend log\n');

      vi.mocked(app.getPath).mockImplementation((name: string) => {
        if (name === 'logs') return logsDir;
        return path.join(logsDir, 'userData');
      });

      const handler = handlers.get('feedback:collect-logs')!;
      const result = (await handler({})) as { filename: string; data: number[] } | null;

      expect(result).not.toBeNull();
      const content = gunzipSync(Buffer.from(result!.data)).toString('utf8');
      expect(content).toContain('frontend renderer log');
      expect(content).toContain('backend process log');
      expect(content).toContain('second day backend log');
      expect(content).toContain('third day backend log');
      expect(content).not.toContain('too old backend log');
    } finally {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });

  it('collects the same recent three log days used by user feedback reports', () => {
    const logsDir = mkdtempSync(path.join(tmpdir(), 'aionui-feedback-logs-'));
    try {
      writeFileSync(path.join(logsDir, '2026-05-25.log'), 'today frontend token=my-secret\n');
      writeFileSync(path.join(logsDir, '2026-05-25.aioncore.log'), 'today backend\n');
      writeFileSync(path.join(logsDir, '2026-05-24.aionrs.log'), 'yesterday rust\n');
      writeFileSync(path.join(logsDir, '2026-05-23.log'), 'third day frontend\n');
      writeFileSync(path.join(logsDir, '2026-05-22.log'), 'too old frontend\n');
      writeFileSync(path.join(logsDir, '2026-05-25.txt'), 'not a log\n');

      const attachment = collectFeedbackLogAttachment(logsDir);

      expect(attachment).not.toBeNull();
      expect(attachment!.filename).toBe('logs.gz');
      expect(attachment!.contentType).toBe('application/gzip');
      const content = gunzipSync(attachment!.data).toString('utf8');
      expect(content).toContain('today frontend');
      expect(content).toContain('token=[REDACTED]');
      expect(content).not.toContain('my-secret');
      expect(content).toContain('today backend');
      expect(content).toContain('yesterday rust');
      expect(content).toContain('third day frontend');
      expect(content).not.toContain('too old frontend');
      expect(content).not.toContain('not a log');
    } finally {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });
});

describe('feedback cloud submission', () => {
  it('registers and forwards a trusted report with main-process runtime metadata', async () => {
    diagnosticMocks.submit.mockResolvedValue({
      reportNo: 'LAD20260806001',
      status: 'SUBMITTED',
      attachmentCount: 0,
      uploadedCount: 0,
      failedCount: 0,
    });
    const request = {
      reportType: 'STARTUP_FAILURE' as const,
      module: 'installation-integrity',
      description: 'startup failed',
    };

    const handler = handlers.get('feedback:submit-report')!;
    const event = { sender: {} };
    const result = await handler(event, request);

    expect(diagnosticMocks.trustedSender).toHaveBeenCalledWith(event);
    expect(diagnosticMocks.submit).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ appVersion: '0.0.0', platform: process.platform, arch: process.arch }),
      null
    );
    expect(result).toEqual(expect.objectContaining({ reportNo: 'LAD20260806001', status: 'SUBMITTED' }));
  });

  it('rejects an untrusted renderer before any network submission', async () => {
    diagnosticMocks.trustedSender.mockReturnValue(false);
    const handler = handlers.get('feedback:submit-report')!;

    await expect(
      handler({ sender: {} }, { reportType: 'USER_FEEDBACK', module: 'feedback', description: 'untrusted' })
    ).rejects.toThrow('Untrusted feedback sender.');
    expect(diagnosticMocks.submit).not.toHaveBeenCalled();
  });
});
