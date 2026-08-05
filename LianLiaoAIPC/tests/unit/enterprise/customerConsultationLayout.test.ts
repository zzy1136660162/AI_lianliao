import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  resolve('packages/desktop/src/renderer/pages/enterprise/customerConsultation/customer-consultation.module.css'),
  'utf8'
);

describe('customer consultation layout CSS contract', () => {
  it('keeps the composer visible while the timeline owns the remaining scrollable height', () => {
    const cardBodyRule = css.match(/\.chatCard\s+:global\(\.ant-card-body\)\s*\{([^}]*)\}/s)?.[1] ?? '';
    const headerRule = css.match(/\.chatHeader\s*\{([^}]*)\}/s)?.[1] ?? '';
    const timelineRegionRule = css.match(/\.timelineRegion\s*\{([^}]*)\}/s)?.[1] ?? '';
    const composerRule = css.match(/\.composer\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(cardBodyRule).toMatch(/display:\s*flex/);
    expect(cardBodyRule).toMatch(/flex-direction:\s*column/);
    expect(cardBodyRule).toMatch(/overflow:\s*hidden/);
    expect(headerRule).toMatch(/flex:\s*0\s+0\s+auto/);
    expect(timelineRegionRule).toMatch(/flex:\s*1\s+1\s+0/);
    expect(timelineRegionRule).toMatch(/min-height:\s*0/);
    expect(timelineRegionRule).toMatch(/overflow:\s*hidden/);
    expect(composerRule).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it('lets the loading state shrink inside short application windows', () => {
    const loadingRule = css.match(/\.loadingState\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(loadingRule).toMatch(/flex:\s*1\s+1\s+0/);
    expect(loadingRule).toMatch(/min-height:\s*0/);
    expect(loadingRule).toMatch(/overflow:\s*hidden/);
  });
});
