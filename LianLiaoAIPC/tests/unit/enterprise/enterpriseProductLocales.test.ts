import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES = ['de-DE', 'en-US', 'ja-JP', 'ko-KR', 'pt-BR', 'ru-RU', 'tr-TR', 'uk-UA', 'zh-CN', 'zh-TW'];
const ENGLISH_PRODUCTS = 'Browse verified featured products and open validated product records.';
const ENGLISH_DETAIL = 'Review validated product information, its related company and masked contact details.';
const CHINESE_PRODUCTS = '浏览经过校验的重点产品，并打开完整产品档案。';
const CHINESE_DETAIL = '查看经过校验的产品信息、关联企业与已脱敏的联系方式。';

type EnterpriseLocale = {
  routes: {
    products: { description: string };
    productDetail: { description: string };
  };
};

describe('enterprise product route locale copy', () => {
  it.each(LOCALES)('describes the connected product experience in %s', (locale) => {
    const messages = JSON.parse(
      readFileSync(resolve(`packages/desktop/src/renderer/services/i18n/locales/${locale}/enterprise.json`), 'utf8')
    ) as EnterpriseLocale;
    const expectedProducts = locale === 'zh-CN' ? CHINESE_PRODUCTS : ENGLISH_PRODUCTS;
    const expectedDetail = locale === 'zh-CN' ? CHINESE_DETAIL : ENGLISH_DETAIL;

    expect(messages.routes.products.description).toBe(expectedProducts);
    expect(messages.routes.productDetail.description).toBe(expectedDetail);
    expect(`${messages.routes.products.description} ${messages.routes.productDetail.description}`).not.toMatch(
      /will be connected|after the company experience|development task|将在.*接入|开发任务/i
    );
  });
});
