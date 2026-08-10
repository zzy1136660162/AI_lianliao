import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('electron', () => ({ net: { fetch: fetchMock } }));

import { DesktopDiagnosticClient, redactDiagnosticPayload } from '@process/services/desktopDiagnosticClient';
import type { DesktopDiagnosticSubmissionError } from '@process/services/desktopDiagnosticClient';

describe('DesktopDiagnosticClient', () => {
  beforeEach(() => fetchMock.mockReset());

  it('submits multipart metadata and returns the persisted report number', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 2000,
          success: true,
          data: {
            reportNo: 'LAD20260806001',
            status: 'SUBMITTED',
            attachmentCount: 1,
            uploadedCount: 1,
            failedCount: 0,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const client = new DesktopDiagnosticClient('http://127.0.0.1:12580/');

    const result = await client.submit(
      {
        module: 'feedback',
        description: 'The window stopped responding',
        attachments: [{ filename: 'screen.png', contentType: 'image/png', data: [1, 2, 3] }],
      },
      { appVersion: '2.1.29', coreVersion: 'v0.1.48', platform: 'win32', arch: 'x64' }
    );

    expect(result.reportNo).toBe('LAD20260806001');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    const metadata = JSON.parse(String(form.get('metadata'))) as Record<string, unknown>;
    expect(metadata).toMatchObject({ module: 'feedback', platform: 'win32', appVersion: '2.1.29' });
    expect(form.getAll('files')).toHaveLength(1);
  });

  it('rejects an oversized attachment before network access', async () => {
    const client = new DesktopDiagnosticClient('http://127.0.0.1:12580/');

    await expect(
      client.submit(
        {
          module: 'feedback',
          description: 'issue',
          attachments: [
            {
              filename: 'large.log',
              contentType: 'text/plain',
              data: Array.from({ length: 8 * 1024 * 1024 + 1 }, () => 1),
            },
          ],
        },
        { appVersion: '2.1.29', platform: 'win32', arch: 'x64' }
      )
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' } satisfies Partial<DesktopDiagnosticSubmissionError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redacts credentials from nested diagnostic data', () => {
    expect(
      redactDiagnosticPayload({
        apiKey: 'plain-secret',
        request: { authorization: 'Bearer secret-token', note: 'token=visible-secret' },
      })
    ).toEqual({
      apiKey: '[REDACTED]',
      request: { authorization: '[REDACTED]', note: 'token=[REDACTED]' },
    });
  });

  it('does not treat a cloud business failure as a successful report', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 500, success: false, message: 'failed', data: null }), { status: 200 })
    );
    const client = new DesktopDiagnosticClient('http://127.0.0.1:12580/');

    await expect(
      client.submit(
        { module: 'feedback', description: 'issue' },
        { appVersion: '2.1.29', platform: 'win32', arch: 'x64' }
      )
    ).rejects.toMatchObject({ code: 'API_FAILURE' });
  });
});
