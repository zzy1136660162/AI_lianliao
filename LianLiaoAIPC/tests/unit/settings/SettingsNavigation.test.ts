import { describe, expect, it } from 'vitest';

import { getBuiltinSettingsNavItems } from '@/renderer/pages/settings/components/SettingsPageWrapper';
import { BUILTIN_TAB_IDS } from '@/renderer/pages/settings/components/SettingsSider';

const translate = (key: string, options?: { defaultValue?: string }): string => options?.defaultValue ?? key;

describe('settings navigation', () => {
  it('keeps Agent runtime support out of the user-facing settings menu', () => {
    const items = getBuiltinSettingsNavItems(true, translate);

    expect(BUILTIN_TAB_IDS).not.toContain('agent');
    expect(items.map((item) => item.id)).not.toContain('agent');
    expect(items[0]?.id).toBe('model');
  });
});
