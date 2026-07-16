import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const LOCALES = ['de-DE', 'en-US', 'ja-JP', 'ko-KR', 'pt-BR', 'ru-RU', 'tr-TR', 'uk-UA', 'zh-CN', 'zh-TW'];

type QuickViewCopy = {
  label: string;
  index?: string;
  title: string;
  hint: string;
  action?: string;
};

type EnterpriseLocale = {
  companies: { quickView: QuickViewCopy };
  products: { quickView: QuickViewCopy };
  projects: { quickView: QuickViewCopy };
};

const CHINESE_COPY = {
  companies: {
    label: '企业概览',
    title: '企业概览',
    hint: '查看完整企业档案，了解企业介绍、关联产品及可用联系方式。',
    action: '查看企业档案',
  },
  products: {
    label: '产品概览',
    title: '产品概览',
    hint: '查看完整产品档案，了解产品信息、所属企业及可用联系方式。',
    action: '查看产品档案',
  },
  projects: {
    label: '项目概览',
    title: '项目概览',
    hint: '查看完整项目档案，了解建设单位、采购需求及联系方式开放状态。',
    action: '查看项目档案',
  },
} as const;

const ENGLISH_COPY = {
  companies: {
    label: 'Company overview',
    title: 'Company overview',
    hint: 'Open the full company profile to learn more about the business, related products, and available contact details.',
    action: 'Open company profile',
  },
  products: {
    label: 'Product overview',
    title: 'Product overview',
    hint: 'Open the full product profile to review product information, its company, and available contact details.',
    action: 'Open product profile',
  },
  projects: {
    label: 'Project overview',
    title: 'Project overview',
    hint: 'Open the full project profile to review the construction unit, procurement needs, and contact-access status.',
    action: 'Open project profile',
  },
} as const;

describe('enterprise quick-view locale copy', () => {
  it.each(LOCALES)('provides clear overview and profile copy in %s', (locale) => {
    const messages = JSON.parse(
      readFileSync(resolve(`packages/desktop/src/renderer/services/i18n/locales/${locale}/enterprise.json`), 'utf8')
    ) as EnterpriseLocale;
    const expected = locale === 'zh-CN' ? CHINESE_COPY : ENGLISH_COPY;

    expect(messages.companies.quickView).toMatchObject(expected.companies);
    expect(messages.products.quickView).toMatchObject(expected.products);
    expect(messages.projects.quickView).toMatchObject(expected.projects);
  });
});
