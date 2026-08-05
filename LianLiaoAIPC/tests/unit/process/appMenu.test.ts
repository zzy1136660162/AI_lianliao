import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: { update: { open: { emit: vi.fn() } } },
}));

vi.mock('electron', () => ({
  app: { isPackaged: false, name: 'AionUi' },
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
}));

import { buildEditMenuItems, buildViewMenuItems } from '@process/utils/appMenu';

describe('application View menu', () => {
  beforeEach(() => vi.clearAllMocks());

  it('contains toggleDevTools in development', () => {
    expect(buildViewMenuItems(false).map((item) => item.role)).toContain('toggleDevTools');
  });

  it('omits toggleDevTools in a packaged build', () => {
    expect(buildViewMenuItems(true).map((item) => item.role)).not.toContain('toggleDevTools');
  });
});

describe('application Edit menu', () => {
  it('keeps copy and cut in development', () => {
    const roles = buildEditMenuItems(false, false).map((item) => item.role);

    expect(roles).toContain('copy');
    expect(roles).toContain('cut');
  });

  it('omits copy and cut from packaged builds while keeping paste', () => {
    const roles = buildEditMenuItems(true, false).map((item) => item.role);

    expect(roles).not.toContain('copy');
    expect(roles).not.toContain('cut');
    expect(roles).toContain('paste');
  });
});
