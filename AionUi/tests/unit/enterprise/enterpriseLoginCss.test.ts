import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOGIN_CSS_PATH = resolve(
  process.cwd(),
  'packages/desktop/src/renderer/pages/enterprise/login/enterprise-login.css'
);
const DEFAULT_THEME_PATH = resolve(
  process.cwd(),
  'packages/desktop/src/renderer/styles/themes/default-color-scheme.css'
);
const ENTERPRISE_THEME_PATH = resolve(process.cwd(), 'packages/desktop/src/renderer/styles/enterprise-theme.css');

const extractVariableNames = (source: string): Set<string> =>
  new Set([...source.matchAll(/var\((--[a-z0-9-]+)/gi)].map((match) => match[1]));

const extractDefinitions = (source: string): Set<string> =>
  new Set([...source.matchAll(/(^|\s)(--[a-z0-9-]+)\s*:/gim)].map((match) => match[2]));

describe('enterprise login theme contract', () => {
  it('uses only tokens defined by the shared themes or the scoped enterprise theme', () => {
    const loginCss = readFileSync(LOGIN_CSS_PATH, 'utf8');
    const themeCss = readFileSync(DEFAULT_THEME_PATH, 'utf8');
    const enterpriseThemeCss = readFileSync(ENTERPRISE_THEME_PATH, 'utf8');
    const [lightTheme = '', darkTheme = ''] = themeCss.split('/* Dark Mode */');
    const lightDefinitions = extractDefinitions(lightTheme);
    const darkDefinitions = extractDefinitions(darkTheme);
    const enterpriseDefinitions = extractDefinitions(enterpriseThemeCss);

    for (const token of extractVariableNames(loginCss)) {
      if (token.startsWith('--enterprise-')) {
        expect(enterpriseDefinitions, `${token} must exist in the enterprise theme`).toContain(token);
        continue;
      }
      expect(lightDefinitions, `${token} must exist in the light theme`).toContain(token);
      expect(darkDefinitions, `${token} must exist in the dark theme`).toContain(token);
    }
  });
});
