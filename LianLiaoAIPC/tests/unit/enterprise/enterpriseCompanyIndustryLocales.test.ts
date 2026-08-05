import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES = ['de-DE', 'en-US', 'ja-JP', 'ko-KR', 'pt-BR', 'ru-RU', 'tr-TR', 'uk-UA', 'zh-CN', 'zh-TW'];

type EnterpriseLocale = {
  companies: {
    actions: { viewDetails: string };
    filters: {
      industryOption: string;
      industryPlaceholder: string;
    };
  };
};

const readLocale = (locale: string): EnterpriseLocale =>
  JSON.parse(
    readFileSync(resolve(`packages/desktop/src/renderer/services/i18n/locales/${locale}/enterprise.json`), 'utf8')
  ) as EnterpriseLocale;

describe('enterprise company industry locale copy', () => {
  it.each(LOCALES)('provides dropdown and view-more copy in %s', (locale) => {
    const messages = readLocale(locale);

    expect(messages.companies.filters.industryPlaceholder.trim()).not.toBe('');
    expect(messages.companies.filters.industryOption).toContain('{{industry}}');
    expect(messages.companies.filters.industryOption).toContain('{{count}}');
    expect(messages.companies.actions.viewDetails.trim()).not.toBe('');
  });

  it('uses the confirmed Simplified Chinese labels', () => {
    const messages = readLocale('zh-CN');

    expect(messages.companies.filters.industryPlaceholder).toBe('请选择行业');
    expect(messages.companies.actions.viewDetails).toBe('查看更多');
  });
});
