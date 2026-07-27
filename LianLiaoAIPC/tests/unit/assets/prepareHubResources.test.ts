import { afterEach, describe, expect, it } from 'vitest';

const originalEnvironment = {
  ALL_PROXY: process.env.ALL_PROXY,
  HTTPS_PROXY: process.env.HTTPS_PROXY,
  HTTP_PROXY: process.env.HTTP_PROXY,
  all_proxy: process.env.all_proxy,
  https_proxy: process.env.https_proxy,
  http_proxy: process.env.http_proxy,
};

const { resolveProxyUrl } = require('../../../scripts/prepareHubResources');

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('prepareHubResources', () => {
  it('uses the HTTPS proxy environment variable for GitHub downloads', () => {
    delete process.env.ALL_PROXY;
    delete process.env.all_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    process.env.HTTPS_PROXY = 'http://127.0.0.1:7897';

    expect(resolveProxyUrl('https://raw.githubusercontent.com/iOfficeAI/AionHub/dist-latest/index.json')).toBe(
      'http://127.0.0.1:7897'
    );
  });

  it('does not configure an agent when no proxy is set', () => {
    for (const key of Object.keys(originalEnvironment)) {
      delete process.env[key];
    }

    expect(resolveProxyUrl('https://cdn.jsdelivr.net/gh/iOfficeAI/AionHub@dist-latest/index.json')).toBeNull();
  });
});
