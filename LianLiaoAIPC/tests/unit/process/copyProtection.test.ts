import { beforeEach, describe, expect, it, vi } from 'vitest';

const defaultSessionMock = vi.hoisted(() => ({
  setPermissionCheckHandler: vi.fn(),
  setPermissionRequestHandler: vi.fn(),
}));

vi.mock('electron', () => ({
  session: {
    defaultSession: defaultSessionMock,
  },
}));

import { installMainCopyProtection } from '@process/startup/copyProtection';

describe('main copy protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps native editing shortcuts available while denying programmatic clipboard writes', async () => {
    const application = {
      on: vi.fn(),
      whenReady: vi.fn().mockResolvedValue(undefined),
    };

    installMainCopyProtection(application as never, true);

    expect(application.on).not.toHaveBeenCalled();
    await application.whenReady();
    expect(defaultSessionMock.setPermissionCheckHandler).toHaveBeenCalledOnce();
    expect(defaultSessionMock.setPermissionRequestHandler).toHaveBeenCalledOnce();
  });

  it('does not install listeners or permission handlers in development', () => {
    const application = {
      on: vi.fn(),
      whenReady: vi.fn().mockResolvedValue(undefined),
    };

    installMainCopyProtection(application as never, false);

    expect(application.on).not.toHaveBeenCalled();
    expect(application.whenReady).not.toHaveBeenCalled();
    expect(defaultSessionMock.setPermissionCheckHandler).not.toHaveBeenCalled();
    expect(defaultSessionMock.setPermissionRequestHandler).not.toHaveBeenCalled();
  });
});
