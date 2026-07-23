import { describe, expect, it, vi } from 'vitest';
import {
  DESKTOP_APP_ID,
  DESKTOP_PACKAGE_NAME,
  DESKTOP_PRODUCT_NAME,
  PRIMARY_PROTOCOL_SCHEME,
  SUPPORTED_PROTOCOL_SCHEMES,
} from '@/common/platform/productIdentity';
import { configureDesktopIdentity } from '@/process/utils/configureDesktopIdentity';

describe('desktop product identity', () => {
  it('uses the approved LianLiao desktop values', () => {
    expect(DESKTOP_PRODUCT_NAME).toBe('链上辽宁·产业云城 AI桌面平台');
    expect(DESKTOP_PACKAGE_NAME).toBe('lianliao-ai-pc');
    expect(DESKTOP_APP_ID).toBe('com.lianliao.app');
    expect(PRIMARY_PROTOCOL_SCHEME).toBe('lianliao');
    expect(SUPPORTED_PROTOCOL_SCHEMES).toEqual(['lianliao', 'aionui']);
  });

  it('sets the display name and configures the Windows AUMID before startup', () => {
    const setName = vi.fn();
    const setAppUserModelId = vi.fn();

    configureDesktopIdentity({ setName, setAppUserModelId });

    expect(setName).toHaveBeenCalledWith(DESKTOP_PRODUCT_NAME);
    if (process.platform === 'win32') {
      expect(setAppUserModelId).toHaveBeenCalledWith(DESKTOP_APP_ID);
    } else {
      expect(setAppUserModelId).not.toHaveBeenCalled();
    }
  });
});
