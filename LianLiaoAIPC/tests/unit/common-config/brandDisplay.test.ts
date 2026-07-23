/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AI_PRODUCT_NAME, AIONUI_TIMESTAMP_SEPARATOR } from '@/common/config/constants';
import { DESKTOP_PRODUCT_NAME } from '@/common/platform/productIdentity';
import { getConfiguredAppClientName } from '@/common/utils/appConfig';
import i18nConfig from '@/common/config/i18n-config.json';

const desktopSourceRoot = path.resolve(process.cwd(), 'packages/desktop/src');
const localeRoot = path.join(desktopSourceRoot, 'renderer/services/i18n/locales');
const EXPECTED_PRODUCT_NAME = '\u94fe\u8fbdAI';
const CORRUPTED_PRODUCT_NAME = '??AI';

const collectStringValues = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStringValues);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(collectStringValues);
  }
  return [];
};

const readLocale = (language: string, moduleName: string): Record<string, unknown> => {
  const localeFile = path.join(localeRoot, language, `${moduleName}.json`);
  return JSON.parse(fs.readFileSync(localeFile, 'utf8')) as Record<string, unknown>;
};

describe('desktop display branding', () => {
  it('exposes the Chain Liao AI display name without changing internal identifiers', () => {
    expect(AI_PRODUCT_NAME).toBe(EXPECTED_PRODUCT_NAME);
    expect(getConfiguredAppClientName()).toBe(AI_PRODUCT_NAME);
    expect(AIONUI_TIMESTAMP_SEPARATOR).toBe('_aionui_');
  });

  it('uses the display name in the renderer document metadata', () => {
    const html = fs.readFileSync(path.join(desktopSourceRoot, 'renderer/index.html'), 'utf8');

    expect(html).toContain(`<meta name="application-name" content="${DESKTOP_PRODUCT_NAME}" />`);
    expect(html).toContain(`<meta name="apple-mobile-web-app-title" content="${DESKTOP_PRODUCT_NAME}" />`);
    expect(html).toContain(`<title>${DESKTOP_PRODUCT_NAME}</title>`);
    expect(html).not.toContain('<title>AionUi</title>');
    expect(html).toContain('__aionui_theme');
  });

  it('removes legacy and corrupted display names from every configured locale string value', () => {
    const offendingValues: string[] = [];

    for (const language of i18nConfig.supportedLanguages) {
      for (const moduleName of i18nConfig.modules) {
        const locale = readLocale(language, moduleName);
        for (const stringValue of collectStringValues(locale)) {
          if (stringValue.includes('AionUi') || stringValue.includes(CORRUPTED_PRODUCT_NAME)) {
            offendingValues.push(`${language}/${moduleName}: ${stringValue}`);
          }
        }
      }
    }

    expect(offendingValues).toEqual([]);
  });

  it('uses the exact product name for every configured language login brand', () => {
    for (const language of i18nConfig.supportedLanguages) {
      const loginLocale = readLocale(language, 'login');
      expect(loginLocale.brand, language).toBe(AI_PRODUCT_NAME);
    }
  });

  it('contains the exact product name in localized display values for every configured language', () => {
    for (const language of i18nConfig.supportedLanguages) {
      const localizedValues = i18nConfig.modules.flatMap((moduleName) =>
        collectStringValues(readLocale(language, moduleName))
      );

      expect(
        localizedValues.some((value) => value.includes(AI_PRODUCT_NAME)),
        language
      ).toBe(true);
    }
  });
});
