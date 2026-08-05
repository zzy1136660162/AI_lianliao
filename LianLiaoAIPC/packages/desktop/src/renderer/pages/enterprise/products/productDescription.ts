import DOMPurify from 'dompurify';

import { parseSafeEnterpriseImageUrl } from '@/renderer/services/enterprise/enterpriseDataValidation';

const FORBIDDEN_TAGS = [
  'base',
  'embed',
  'form',
  'iframe',
  'input',
  'link',
  'math',
  'meta',
  'object',
  'script',
  'style',
  'svg',
] as const;

const FORBIDDEN_ATTRIBUTES = ['class', 'id', 'name', 'slot', 'srcset', 'style'] as const;
const forbiddenAttributeNames = new Set<string>(FORBIDDEN_ATTRIBUTES);

const sanitizeMarkup = (value: string): string =>
  String(
    DOMPurify.sanitize(value, {
      FORBID_ATTR: [...FORBIDDEN_ATTRIBUTES],
      FORBID_TAGS: [...FORBIDDEN_TAGS],
      RETURN_TRUSTED_TYPE: false,
      USE_PROFILES: { html: true },
    })
  );

const isSafeLinkUrl = (value: string): boolean => {
  try {
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const hardenSanitizedMarkup = (markup: string): string => {
  const template = document.createElement('template');
  template.innerHTML = markup;

  for (const element of template.content.querySelectorAll<HTMLElement>('*')) {
    for (const attribute of Array.from(element.attributes)) {
      const attributeName = attribute.name.toLowerCase();
      if (attributeName.startsWith('on') || forbiddenAttributeNames.has(attributeName)) {
        element.removeAttribute(attribute.name);
      }
    }

    if (element instanceof HTMLAnchorElement) {
      const href = element.getAttribute('href');
      if (!href || !isSafeLinkUrl(href)) {
        element.removeAttribute('href');
      } else {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    }

    if (element instanceof HTMLImageElement) {
      const safeImageUrl = parseSafeEnterpriseImageUrl(element.getAttribute('src'));
      if (!safeImageUrl) {
        element.remove();
      } else {
        element.src = safeImageUrl;
        element.removeAttribute('srcset');
        element.setAttribute('loading', 'lazy');
        element.setAttribute('decoding', 'async');
      }
    }
  }

  return template.innerHTML.trim();
};

export const sanitizeProductDescriptionHtml = (value: string | null | undefined): string => {
  const source = value?.trim();
  if (!source) return '';
  return hardenSanitizedMarkup(sanitizeMarkup(source));
};

export const toPlainProductText = (value: string | null | undefined): string => {
  const sanitized = sanitizeProductDescriptionHtml(value);
  if (!sanitized) return '';

  const template = document.createElement('template');
  template.innerHTML = sanitized;
  return (template.content.textContent ?? '').replace(/\s+/g, ' ').trim();
};
