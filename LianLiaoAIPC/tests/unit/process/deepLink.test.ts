import { describe, expect, it } from 'vitest';
import {
  isSupportedDeepLinkUrl,
  parseDeepLinkUrl,
  PROTOCOL_SCHEME,
  SUPPORTED_PROTOCOL_SCHEMES,
} from '@/process/utils/deepLink';

describe('LianLiao desktop deep links', () => {
  it('uses lianliao as the primary scheme and retains the legacy alias', () => {
    expect(PROTOCOL_SCHEME).toBe('lianliao');
    expect(SUPPORTED_PROTOCOL_SCHEMES).toEqual(['lianliao', 'aionui']);
  });

  it.each(['lianliao://add-provider?x=1', 'aionui://add-provider?x=1'])(
    'accepts current and legacy deep links: %s',
    (url) => {
      expect(isSupportedDeepLinkUrl(url)).toBe(true);
      expect(parseDeepLinkUrl(url)).toEqual({
        action: 'add-provider',
        params: { x: '1' },
      });
    }
  );

  it('decodes the compatible base64 data payload', () => {
    const data = Buffer.from(JSON.stringify({ base_url: 'https://api.example.com', api_key: 'test' })).toString(
      'base64'
    );

    expect(parseDeepLinkUrl(`lianliao://provider/add?v=1&data=${encodeURIComponent(data)}`)).toEqual({
      action: 'provider/add',
      params: {
        v: '1',
        base_url: 'https://api.example.com',
        api_key: 'test',
      },
    });
  });

  it.each(['https://example.com', 'other://add-provider', 'not-a-url'])('rejects unsupported input: %s', (url) => {
    expect(isSupportedDeepLinkUrl(url)).toBe(false);
    expect(parseDeepLinkUrl(url)).toBeNull();
  });
});
