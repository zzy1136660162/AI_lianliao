import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import EnterpriseAntdProvider from '@/renderer/pages/enterprise/layout/EnterpriseAntdProvider';
import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('EnterprisePageState', () => {
  it('announces loading without inventing content', () => {
    const { container } = render(
      <EnterpriseAntdProvider>
        <EnterprisePageState state='loading' title='Loading companies' />
      </EnterpriseAntdProvider>
    );

    expect(screen.getByRole('status', { name: 'Loading companies' })).toBeVisible();
    expect(container.querySelector('.ll-ant-spin')).toBeInTheDocument();
    expect(container.querySelector('.arco-spin')).not.toBeInTheDocument();
  });

  it('renders an accessible empty state', () => {
    render(
      <EnterpriseAntdProvider>
        <EnterprisePageState state='empty' title='No companies' description='Try another filter.' />
      </EnterpriseAntdProvider>
    );

    expect(screen.getByRole('heading', { name: 'No companies' })).toBeVisible();
    expect(screen.getByText('Try another filter.')).toBeVisible();
  });

  it('shows only safe translated error copy and retries explicitly', async () => {
    const retry = vi.fn();
    const { container } = render(
      <EnterpriseAntdProvider>
        <EnterprisePageState
          state='error'
          title='enterprise.pageState.errorTitle'
          description='enterprise.pageState.errorDescription'
          onRetry={retry}
        />
      </EnterpriseAntdProvider>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('enterprise.pageState.errorDescription');
    expect(container.querySelector('.ll-ant-alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.actions.retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(container).not.toHaveTextContent('stack');
  });
});
