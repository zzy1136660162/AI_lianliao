import React, { type PropsWithChildren } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EnterpriseAntdProvider from '@/renderer/pages/enterprise/layout/EnterpriseAntdProvider';

const configProviderProps = vi.hoisted(() => vi.fn());

vi.mock('antd', () => ({
  App: ({ children }: PropsWithChildren) => <>{children}</>,
  ConfigProvider: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => {
    configProviderProps(props);
    return <>{children}</>;
  },
}));

describe('EnterpriseAntdProvider', () => {
  beforeEach(() => {
    configProviderProps.mockClear();
  });

  it('isolates the enterprise theme, locale, and popup boundary', () => {
    render(
      <div className='enterprise-shell'>
        <EnterpriseAntdProvider>
          <button type='button'>child</button>
        </EnterpriseAntdProvider>
      </div>
    );

    expect(screen.getByRole('button', { name: 'child' })).toBeVisible();
    expect(configProviderProps).toHaveBeenCalledTimes(1);
    expect(configProviderProps).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: expect.any(Object),
        prefixCls: 'll-ant',
        theme: expect.objectContaining({
          cssVar: { prefix: 'll-ant' },
          token: expect.objectContaining({
            fontFamily: expect.stringContaining('Microsoft YaHei'),
          }),
        }),
      })
    );

    const props = configProviderProps.mock.lastCall?.[0] as {
      getPopupContainer?: (trigger?: HTMLElement) => HTMLElement;
    };
    const trigger = screen.getByRole('button', { name: 'child' });
    expect(props.getPopupContainer?.(trigger)).toBe(trigger.closest('.enterprise-shell'));
  });
});
