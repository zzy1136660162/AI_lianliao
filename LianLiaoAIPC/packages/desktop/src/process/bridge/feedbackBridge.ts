/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IPC handler for collecting and compressing recent log files
 * for the bug report feature.
 */

import { ipcMain, app, BrowserWindow } from 'electron';
import * as path from 'path';
import packageJson from '../../../../../package.json';
import type { DesktopDiagnosticSubmitRequest } from '@/common/types/desktopDiagnostic';
import { collectFeedbackLogAttachment } from '../feedback/logs';
import { EnterpriseApiClient } from '@process/services/enterprise/enterpriseApiClient';
import { resolveEnterpriseApiClientOptions } from '@process/services/enterprise/enterpriseRuntimeConfig';
import { EnterpriseSessionStore } from '@process/services/enterprise/enterpriseSessionStore';
import { DesktopDiagnosticClient } from '@process/services/desktopDiagnosticClient';

type RendererFeedbackLogPayload = {
  details?: unknown;
  level?: unknown;
  message?: unknown;
};

function normalizeRendererFeedbackLogPayload(payload: RendererFeedbackLogPayload): {
  details?: unknown;
  level: 'info' | 'warn' | 'error';
  message: string;
} {
  const level = payload.level === 'warn' || payload.level === 'error' ? payload.level : 'info';
  const message = typeof payload.message === 'string' && payload.message.trim() ? payload.message : 'feedback log';
  return {
    level,
    message,
    details: payload.details,
  };
}

ipcMain.on('feedback:renderer-log', (_event, payload: RendererFeedbackLogPayload) => {
  const log = normalizeRendererFeedbackLogPayload(payload ?? {});
  const args = [`[FeedbackReport:renderer] ${log.message}`];
  if (log.details !== undefined) {
    args.push(log.details as string);
  }

  if (log.level === 'error') {
    console.error(...args);
  } else if (log.level === 'warn') {
    console.warn(...args);
  } else {
    console.info(...args);
  }
});

ipcMain.handle('feedback:collect-logs', async () => {
  try {
    let logsDir: string;
    try {
      logsDir = app.getPath('logs');
    } catch {
      logsDir = path.join(app.getPath('userData'), 'logs');
    }

    const logDirs = [logsDir, path.join(logsDir, 'logs')];
    const attachment = collectFeedbackLogAttachment(logDirs);
    if (!attachment) return null;

    // Return as number array for IPC serialization (Buffer is not serializable)
    return {
      filename: attachment.filename,
      data: Array.from(attachment.data),
    };
  } catch (error) {
    console.error('[feedbackBridge] Failed to collect logs:', error);
    return null;
  }
});

ipcMain.handle('feedback:capture-screenshot', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      return null;
    }

    const image = await win.webContents.capturePage();
    const png = image.toPNG();
    if (!png || png.length === 0) {
      return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      filename: `screenshot-${timestamp}.png`,
      data: Array.from(png),
    };
  } catch (error) {
    console.error('[feedbackBridge] Failed to capture screenshot:', error);
    return null;
  }
});

const diagnosticClient = new DesktopDiagnosticClient(
  resolveEnterpriseApiClientOptions(app.isPackaged).baseUrl ?? 'https://cloud.lslnii.com/'
);

const loadDiagnosticIdentity = async () => {
  try {
    const openId = await new EnterpriseSessionStore(app.getPath('userData')).loadOpenId();
    if (!openId) return null;
    return await new EnterpriseApiClient(resolveEnterpriseApiClientOptions(app.isPackaged)).getUserContext(openId);
  } catch {
    // Startup diagnostics remain available before login and during enterprise API failures.
    return null;
  }
};

ipcMain.handle('feedback:submit-report', async (event, request: DesktopDiagnosticSubmitRequest) => {
  // Keep the large enterprise bridge out of the startup/screenshot path. It is
  // loaded only when a report is submitted, while still reusing the canonical
  // renderer trust check instead of maintaining a second security boundary.
  const { isTrustedEnterpriseSender } = await import('./enterpriseBridge');
  if (!isTrustedEnterpriseSender(event)) {
    throw new Error('Untrusted feedback sender.');
  }
  const identity = await loadDiagnosticIdentity();
  const startedAt = Date.now();
  try {
    const result = await diagnosticClient.submit(
      request,
      {
        appVersion: app.getVersion(),
        coreVersion: packageJson.aioncoreVersion,
        platform: process.platform,
        arch: process.arch,
      },
      identity
    );
    console.info('[feedbackBridge] Diagnostic report submitted', {
      reportNo: result.reportNo,
      status: result.status,
      attachmentCount: result.attachmentCount,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    console.error('[feedbackBridge] Diagnostic report submission failed', {
      code: error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN',
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
});
