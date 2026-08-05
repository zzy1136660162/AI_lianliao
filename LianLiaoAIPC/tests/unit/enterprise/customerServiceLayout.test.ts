import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  resolve('packages/desktop/src/renderer/pages/enterprise/customerService/customer-service-workbench.module.css'),
  'utf8'
);

describe('customer-service workbench layout CSS contract', () => {
  it('keeps the composer visible while the message timeline owns the remaining scrollable height', () => {
    const chatPanelRule = css.match(/\.chatPanel\s*\{([^}]*)\}/s)?.[1] ?? '';
    const timelineRegionRule = css.match(/\.timelineRegion\s*\{([^}]*)\}/s)?.[1] ?? '';
    const composerRule = css.match(/\.composer\s*\{([^}]*)\}/s)?.[1] ?? '';

    // The alert between the header and timeline is optional, so a fixed-row grid would
    // assign the timeline to a content-sized row whenever that alert is absent.
    expect(chatPanelRule).toMatch(/display:\s*flex/);
    expect(chatPanelRule).toMatch(/flex-direction:\s*column/);
    expect(chatPanelRule).toMatch(/overflow:\s*hidden/);
    expect(timelineRegionRule).toMatch(/flex:\s*1\s+1\s+0/);
    expect(timelineRegionRule).toMatch(/min-height:\s*0/);
    expect(timelineRegionRule).toMatch(/overflow:\s*hidden/);
    expect(composerRule).toMatch(/flex:\s*0\s+0\s+auto/);
  });
});
