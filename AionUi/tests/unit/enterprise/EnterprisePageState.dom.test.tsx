import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import EnterprisePageState from '@/renderer/pages/enterprise/layout/EnterprisePageState';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('EnterprisePageState', () => {
  it('announces loading without inventing content', () => {
    render(<EnterprisePageState state='loading' title='Loading companies' />);

    expect(screen.getByRole('status', { name: 'Loading companies' })).toBeVisible();
  });

  it('renders an accessible empty state', () => {
    render(<EnterprisePageState state='empty' title='No companies' description='Try another filter.' />);

    expect(screen.getByRole('heading', { name: 'No companies' })).toBeVisible();
    expect(screen.getByText('Try another filter.')).toBeVisible();
  });

  it('shows only safe translated error copy and retries explicitly', async () => {
    const retry = vi.fn();
    const { container } = render(
      <EnterprisePageState
        state='error'
        title='enterprise.pageState.errorTitle'
        description='enterprise.pageState.errorDescription'
        onRetry={retry}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('enterprise.pageState.errorDescription');
    await userEvent.click(screen.getByRole('button', { name: 'enterprise.actions.retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(container).not.toHaveTextContent('stack');
  });
});
