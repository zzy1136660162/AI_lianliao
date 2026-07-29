import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EnterpriseResponse } from '@/common/enterprise/contracts';
import EnterpriseAntdProvider from '@/renderer/pages/enterprise/layout/EnterpriseAntdProvider';
import EnterpriseContactAccessPanel from '@/renderer/pages/enterprise/contact/EnterpriseContactAccessPanel';
import { buildTelephoneUrl } from '@/renderer/pages/enterprise/contact/contactActions';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

const createClient = (request: EnterpriseClient['request']): Pick<EnterpriseClient, 'request'> => ({ request });

describe('enterprise contact actions', () => {
  it('normalizes a safe telephone number and rejects executable or ambiguous input', () => {
    expect(buildTelephoneUrl('+86 (138) 0000-0000')).toBe('tel:+8613800000000');
    expect(buildTelephoneUrl('13800000000,13900000000')).toBeNull();
    expect(buildTelephoneUrl('javascript:alert(1)')).toBeNull();
    expect(buildTelephoneUrl('1380000****')).toBeNull();
  });
});

describe('EnterpriseContactAccessPanel', () => {
  afterEach(cleanup);

  it('keeps the masked phone until the backend grants access and then exposes copy and dial actions', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'contact.acquire',
      data: {
        allowed: true,
        errType: 0,
        message: '',
        actionUrl: '',
        phone: '13800000000',
      },
    } satisfies Extract<EnterpriseResponse, { operation: 'contact.acquire' }>);
    const user = userEvent.setup();

    render(
      <EnterpriseAntdProvider>
        <EnterpriseContactAccessPanel
          client={createClient(request)}
          resourceType='COMPANY'
          resourceId='1807'
          maskedPhone='1380000****'
        />
      </EnterpriseAntdProvider>
    );

    expect(screen.getByText('1380000****')).toBeVisible();
    expect(screen.queryByText('13800000000')).toBeNull();
    await user.click(screen.getByRole('button', { name: '获取联系方式' }));

    expect(await screen.findByText('13800000000')).toBeVisible();
    expect(screen.getByRole('button', { name: '复制电话' })).toBeVisible();
    expect(screen.getByRole('button', { name: '拨打电话' })).toBeVisible();
    expect(request).toHaveBeenCalledWith({
      operation: 'contact.acquire',
      payload: { resourceType: 'COMPANY', resourceId: '1807' },
    });
  });

  it('offers the membership QR flow for the H5 membership limit error types', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'contact.acquire',
      data: {
        allowed: false,
        errType: 5,
        message: '请升级会员后查看',
        actionUrl: '',
      },
    } satisfies Extract<EnterpriseResponse, { operation: 'contact.acquire' }>);
    const user = userEvent.setup();

    render(
      <EnterpriseAntdProvider>
        <EnterpriseContactAccessPanel
          client={createClient(request)}
          resourceType='PRODUCT'
          resourceId='9'
          maskedPhone='1380000****'
        />
      </EnterpriseAntdProvider>
    );

    await user.click(screen.getByRole('button', { name: '获取联系方式' }));
    expect(await screen.findByRole('dialog', { name: '扫码升级企业会员' })).toBeInTheDocument();
    expect(screen.getAllByText('请升级会员后查看')).toHaveLength(2);
    expect(screen.getByText('支付完成后可在本页面刷新会员权限，无需重新登录。')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('svg')).not.toBeNull());
  });
});
