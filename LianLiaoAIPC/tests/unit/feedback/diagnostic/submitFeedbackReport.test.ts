import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitFeedbackReport } from '@/renderer/services/feedback/submitFeedbackReport';

const submittedResult = {
  reportNo: 'LAD20260806001',
  status: 'SUBMITTED' as const,
  attachmentCount: 2,
  uploadedCount: 2,
  failedCount: 0,
};

describe('submitFeedbackReport', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits normalized metadata, logs, and screenshots through the desktop cloud bridge', async () => {
    const collectFeedbackLogs = vi.fn().mockResolvedValue({
      filename: 'lianliao-logs.log.gz',
      data: [1, 2, 3],
    });
    const submitReport = vi.fn().mockResolvedValue(submittedResult);
    const logFeedbackEvent = vi.fn();
    vi.stubGlobal('window', {
      electronAPI: {
        collectFeedbackLogs,
        submitFeedbackReport: submitReport,
        logFeedbackEvent,
      },
    });

    const result = await submitFeedbackReport({
      attachments: [
        {
          filename: 'screenshot.png',
          data: new Uint8Array([4, 5, 6]),
          contentType: 'image/png',
        },
      ],
      collectLogs: true,
      description: '  AionCore   cannot start  ',
      extra: {
        installation_integrity: {
          source: 'backend_startup_failure',
        },
      },
      module: 'installation-integrity',
      moduleLabel: '链辽AI 安装不完整',
      reportType: 'STARTUP_FAILURE',
      tags: {
        'aionui.installation_integrity.report_source': 'backend_startup_failure',
      },
    });

    expect(result).toEqual(submittedResult);
    expect(collectFeedbackLogs).toHaveBeenCalledOnce();
    expect(submitReport).toHaveBeenCalledWith({
      reportType: 'STARTUP_FAILURE',
      module: 'installation-integrity',
      description: 'AionCore cannot start',
      diagnostic: {
        moduleLabel: '链辽AI 安装不完整',
        tags: {
          'aionui.installation_integrity.report_source': 'backend_startup_failure',
        },
        extra: {
          installation_integrity: {
            source: 'backend_startup_failure',
          },
        },
        logAttachmentStatus: 'collected',
      },
      attachments: [
        {
          filename: 'lianliao-logs.log.gz',
          data: [1, 2, 3],
          contentType: 'application/gzip',
        },
        {
          filename: 'screenshot.png',
          data: [4, 5, 6],
          contentType: 'image/png',
        },
      ],
    });
    expect(logFeedbackEvent).toHaveBeenCalledWith(expect.objectContaining({ level: 'info', message: 'submitted' }));
  });

  it('continues without a log attachment when no local logs exist', async () => {
    const submitReport = vi.fn().mockResolvedValue({ ...submittedResult, attachmentCount: 0, uploadedCount: 0 });
    vi.stubGlobal('window', {
      electronAPI: {
        collectFeedbackLogs: vi.fn().mockResolvedValue(null),
        submitFeedbackReport: submitReport,
        logFeedbackEvent: vi.fn(),
      },
    });

    await submitFeedbackReport({
      collectLogs: true,
      description: 'No logs available',
      module: 'installation-integrity',
      moduleLabel: '链辽AI 安装不完整',
    });

    expect(submitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [],
        diagnostic: expect.objectContaining({ logAttachmentStatus: 'empty' }),
      })
    );
  });

  it('rejects instead of showing a false success when the cloud bridge is unavailable', async () => {
    const logFeedbackEvent = vi.fn();
    vi.stubGlobal('window', { electronAPI: { logFeedbackEvent } });

    await expect(
      submitFeedbackReport({
        description: 'Bridge unavailable',
        module: 'feedback',
        moduleLabel: '问题反馈',
      })
    ).rejects.toThrow('Desktop diagnostic bridge is unavailable.');
    expect(logFeedbackEvent).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', message: 'failed' }));
  });

  it('propagates a cloud submission failure so the UI can offer a retry', async () => {
    const logFeedbackEvent = vi.fn();
    vi.stubGlobal('window', {
      electronAPI: {
        submitFeedbackReport: vi.fn().mockRejectedValue(new Error('cloud unavailable')),
        logFeedbackEvent,
      },
    });

    await expect(
      submitFeedbackReport({
        description: 'Cloud unavailable',
        module: 'feedback',
        moduleLabel: '问题反馈',
      })
    ).rejects.toThrow('cloud unavailable');
    expect(logFeedbackEvent).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', message: 'failed' }));
  });
});
