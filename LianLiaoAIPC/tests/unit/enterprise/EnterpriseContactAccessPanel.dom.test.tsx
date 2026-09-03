import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EnterpriseResponse } from '@/common/enterprise/contracts';
import EnterpriseAntdProvider from '@/renderer/pages/enterprise/layout/EnterpriseAntdProvider';
import EnterpriseContactAccessPanel from '@/renderer/pages/enterprise/contact/EnterpriseContactAccessPanel';
import { buildTelephoneUrl, copyEnterprisePhone } from '@/renderer/pages/enterprise/contact/contactActions';
import { EnterpriseRendererError, type EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

const createClient = (request: EnterpriseClient['request']): Pick<EnterpriseClient, 'request'> => ({ request });

describe('enterprise contact actions', () => {
  it('normalizes a safe telephone number and rejects executable or ambiguous input', () => {
    expect(buildTelephoneUrl('+86 (138) 0000-0000')).toBe('tel:+8613800000000');
    expect(buildTelephoneUrl('13800000000,13900000000')).toBeNull();
    expect(buildTelephoneUrl('javascript:alert(1)')).toBeNull();
    expect(buildTelephoneUrl('1380000****')).toBeNull();
  });

  it('routes packaged phone copies through the trusted main-process writer', async () => {
    const copyInMainProcess = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, '__isPackaged', { configurable: true, value: true });

    await expect(copyEnterprisePhone('13800000000', copyInMainProcess)).resolves.toBeUndefined();

    expect(copyInMainProcess).toHaveBeenCalledExactlyOnceWith('13800000000');
    Reflect.deleteProperty(window, '__isPackaged');
  });
});

describe('EnterpriseContactAccessPanel', () => {
  afterEach(cleanup);

  it('keeps the masked phone until access and removes the dial action from company contacts', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'contact.acquire',
      data: {
        allowed: true,
        errType: 0,
        message: '',
        action: 'NONE',
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
    await user.click(screen.getByRole('button', { name: '解锁联系方式' }));

    expect(await screen.findByText('13800000000')).toBeVisible();
    expect(screen.getByRole('button', { name: '复制电话' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '拨打电话' })).toBeNull();
    expect(request).toHaveBeenCalledWith({
      operation: 'contact.acquire',
      payload: { resourceType: 'COMPANY', resourceId: '1807' },
    });
  });

  it('keeps copy available but removes the dial action from project contacts', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'contact.acquire',
      data: {
        allowed: true,
        errType: 0,
        message: '',
        action: 'NONE',
        phone: '13800000000',
      },
    } satisfies Extract<EnterpriseResponse, { operation: 'contact.acquire' }>);
    const user = userEvent.setup();

    render(
      <EnterpriseAntdProvider>
        <EnterpriseContactAccessPanel client={createClient(request)} resourceType='PROJECT' resourceId='2026' />
      </EnterpriseAntdProvider>
    );

    await user.click(screen.getByRole('button', { name: '解锁联系方式' }));

    expect(await screen.findByRole('button', { name: '复制电话' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '拨打电话' })).toBeNull();
  });

  it('offers the membership QR flow for the H5 membership limit error types', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'contact.acquire',
      data: {
        allowed: false,
        errType: 5,
        message: '请升级会员后查看',
        action: 'UPGRADE',
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

    await user.click(screen.getByRole('button', { name: '解锁联系方式' }));
    expect(await screen.findByRole('dialog', { name: '扫码升级企业会员' })).toBeInTheDocument();
    expect(screen.getAllByText('请升级会员后查看')).toHaveLength(2);
    expect(screen.getByText('支付完成后可在本页面刷新会员权限，无需重新登录。')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('svg')).not.toBeNull());
  });

  it('reports an unavailable cloud contact route as a service failure instead of a permission denial', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockRejectedValue(new EnterpriseRendererError('HTTP'));
    const user = userEvent.setup();

    render(
      <EnterpriseAntdProvider>
        <EnterpriseContactAccessPanel
          client={createClient(request)}
          resourceType='PRODUCT'
          resourceId='521634568053'
          maskedPhone='185********'
        />
      </EnterpriseAntdProvider>
    );

    await user.click(screen.getByRole('button', { name: '解锁联系方式' }));
    expect(await screen.findByText('联系方式服务暂不可用，请稍后重试。')).toBeVisible();
    expect(screen.queryByText('联系方式权限校验失败，请稍后重试。')).toBeNull();
  });
});
