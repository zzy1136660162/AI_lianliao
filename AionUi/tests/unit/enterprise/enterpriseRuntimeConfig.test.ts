import { describe, expect, it } from 'vitest';

import { resolveEnterpriseApiClientOptions } from '@process/services/enterprise/enterpriseRuntimeConfig';

describe('enterprise runtime configuration', () => {
  it('uses the local cloud-api host in an Electron development build', () => {
    expect(resolveEnterpriseApiClientOptions(false)).toEqual({
      baseUrl: 'http://127.0.0.1:12580/',
      environment: 'development',
    });
  });

  it('pins a packaged build to the production cloud host', () => {
    expect(resolveEnterpriseApiClientOptions(true)).toEqual({
      baseUrl: 'https://cloud.lslnii.com/',
      environment: 'production',
    });
  });
});
