import { describe, expect, it } from 'vitest';

import {
  sanitizeProductDescriptionHtml,
  toPlainProductText,
} from '@/renderer/pages/enterprise/products/productDescription';

const parseSanitizedHtml = (html: string): HTMLTemplateElement => {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template;
};

describe('product description presentation', () => {
  it('turns rich product introductions into clean list-card text', () => {
    expect(
      toPlainProductText(
        '<p><span style="font-size: 16px">High&nbsp;<strong>pressure</strong></span></p><script>secret()</script>'
      )
    ).toBe('High pressure');
  });

  it('preserves safe structure while removing executable markup and untrusted images', () => {
    const sanitized = sanitizeProductDescriptionHtml(`
      <div id="clobber" style="position: fixed" onclick="secret()">
        <p>Safe <strong>description</strong></p>
        <script>secret()</script>
        <form><input name="token" /></form>
        <img src="https://evil.example/secret.png" onerror="secret()" />
        <img src="http://www.gytaobao.cn:9328//upload/NFSImgFile/appl/product.png" />
        <a href="javascript:secret()">unsafe link</a>
        <a href="https://example.com/product">safe link</a>
      </div>
    `);
    const template = parseSanitizedHtml(sanitized);

    expect(template.content.querySelector('strong')?.textContent).toBe('description');
    expect(template.content.querySelector('script, form, input')).toBeNull();
    expect(sanitized).not.toMatch(/onclick|onerror|style=|javascript:|evil\.example|secret\(\)/i);

    const images = template.content.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute('src')).toBe('https://www.lslnii.com/upload/NFSImgFile/appl/product.png');
    expect(images[0]?.getAttribute('loading')).toBe('lazy');

    const unsafeLink = Array.from(template.content.querySelectorAll('a')).find(
      (link) => link.textContent === 'unsafe link'
    );
    const safeLink = Array.from(template.content.querySelectorAll('a')).find(
      (link) => link.textContent === 'safe link'
    );
    expect(unsafeLink?.hasAttribute('href')).toBe(false);
    expect(safeLink?.getAttribute('href')).toBe('https://example.com/product');
    expect(safeLink?.getAttribute('target')).toBe('_blank');
    expect(safeLink?.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
