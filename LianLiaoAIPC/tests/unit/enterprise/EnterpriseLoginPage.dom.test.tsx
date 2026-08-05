import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ENTERPRISE_IPC_ERROR_MESSAGES, ENTERPRISE_REGISTRATION_URL } from '@/common/enterprise/constants';
import type { EnterpriseAuthContextValue } from '@/renderer/hooks/context/EnterpriseAuthContext';
import EnterpriseLoginPage, { ENTERPRISE_ERROR_I18N_KEYS } from '@/renderer/pages/enterprise/login/EnterpriseLoginPage';
import EnterpriseRegistrationPanel from '@/renderer/pages/enterprise/login/EnterpriseRegistrationPanel';

const translations: Record<string, string> = {
  'enterprise.brand.logoAlt': '链上辽宁·产业云城',
  'enterprise.brand.eyebrow': '辽宁产业资源连接平台',
  'enterprise.brand.title': '让辽宁企业，更快找到订单、伙伴与增长机会',
  'enterprise.brand.description': '连接企业、产品、项目与供需资源，让每一次扫码都通向真实产业机会。',
  'enterprise.brand.security': '微信扫码登录 · 企业身份识别 · 数据仅用于业务服务',
  'enterprise.brand.capabilities.companyCode': '企业码',
  'enterprise.brand.capabilities.keyProducts': '重点产品',
  'enterprise.brand.capabilities.projects': '在建项目',
  'enterprise.brand.capabilities.demand': '供需对接',
  'enterprise.login.qrAlt': '企业码微信登录二维码',
  'enterprise.login.scanTitle': '请使用微信扫码登录',
  'enterprise.login.autoChecking': '正在自动检测登录状态',
  'enterprise.login.imageError': '二维码图片加载失败',
  'enterprise.login.expiredTitle': '二维码已过期',
  'enterprise.login.authenticatedTitle': '身份验证完成',
  'enterprise.actions.retry': '重试',
  'enterprise.actions.refreshQr': '刷新二维码',
  'enterprise.registration.qrAlt': '企业码注册二维码',
  'enterprise.registration.title': '请在手机上完成企业注册',
  'enterprise.registration.autoChecking': '注册完成后将自动检测',
  'enterprise.registration.manualCheck': '我已完成注册',
  'enterprise.registration.restartLogin': '重新扫码登录',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => translations[key] ?? key }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  isMacOS: () => false,
}));

vi.mock('@/renderer/components/layout/WindowControls', () => ({
  default: () => <div data-testid='shared-window-controls'>shared controls</div>,
}));

const startLogin = vi.fn(async () => undefined);
const retry = vi.fn(async () => undefined);
const checkRegistration = vi.fn(async () => undefined);

let auth: EnterpriseAuthContextValue;

vi.mock('@/renderer/hooks/context/EnterpriseAuthContext', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/renderer/hooks/context/EnterpriseAuthContext')>();
  return { ...original, useEnterpriseAuth: () => auth };
});

const makeAuth = (overrides: Partial<EnterpriseAuthContextValue> = {}): EnterpriseAuthContextValue => ({
  status: 'checking',
  user: null,
  loginSession: null,
  registrationOpenId: null,
  errorCode: null,
  startLogin,
  retry,
  logout: vi.fn(async () => true),
  checkRegistration,
  isExpired: false,
  remainingSeconds: 0,
  ...overrides,
});

describe('EnterpriseLoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth = makeAuth();
  });

  it('starts QR login once after session restoration finds no user', async () => {
    auth = makeAuth({ status: 'unauthenticated' });
    render(
      <React.StrictMode>
        <EnterpriseLoginPage />
      </React.StrictMode>
    );

    await waitFor(() => expect(startLogin).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('shared-window-controls')).toBeVisible();
  });

  it('presents the Chain Liaoning brand and industrial capabilities before sign-in', () => {
    render(<EnterpriseLoginPage />);

    const logo = screen.getByRole('img', { name: translations['enterprise.brand.logoAlt'] });
    expect(logo.getAttribute('src')).toContain('lianliao-logo');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(translations['enterprise.brand.title']);
    expect(screen.getByText(translations['enterprise.brand.description'])).toBeVisible();
    expect(
      [
        'enterprise.brand.capabilities.companyCode',
        'enterprise.brand.capabilities.keyProducts',
        'enterprise.brand.capabilities.projects',
        'enterprise.brand.capabilities.demand',
      ].map((key) => screen.getByText(translations[key]))
    ).toHaveLength(4);
  });

  it('renders the main-process QR image, accessible countdown, and automatic status', () => {
    auth = makeAuth({
      status: 'waiting',
      loginSession: {
        loginKey: 'login-key',
        qrDataUrl: 'data:image/png;base64,AA==',
        expiresAt: '2026-07-15T01:01:00.000Z',
        pollIntervalMs: 3000,
      },
      remainingSeconds: 65,
    });
    const { container } = render(<EnterpriseLoginPage />);

    expect(screen.getByRole('img', { name: translations['enterprise.login.qrAlt'] })).toHaveAttribute(
      'src',
      'data:image/png;base64,AA=='
    );
    expect(screen.getByText('01:05')).toBeVisible();
    expect(screen.getByText('01:05').closest('[aria-live]')).toBeNull();
    expect(screen.getByText(translations['enterprise.login.autoChecking'])).toBeVisible();
    expect(container.querySelector('.enterprise-login .ll-ant-card')).toBeInTheDocument();
    expect(container.querySelector('.enterprise-login .ll-ant-spin')).toBeInTheDocument();
    expect(container.querySelector('.enterprise-login [class*="arco-"]')).not.toBeInTheDocument();
    expect(container.querySelector('.enterprise-login__blueprint')).not.toBeInTheDocument();
  });

  it('maps every stable IPC error code to an explicit translation key', () => {
    const errorCodes = Object.keys(ENTERPRISE_IPC_ERROR_MESSAGES).toSorted();

    expect(Object.keys(ENTERPRISE_ERROR_I18N_KEYS).toSorted()).toEqual(errorCodes);
    expect(Object.entries(ENTERPRISE_ERROR_I18N_KEYS)).toEqual(
      expect.arrayContaining(errorCodes.map((code) => [code, `enterprise.errors.${code}`]))
    );
  });

  it('shows a safe retry action when the QR image cannot render', async () => {
    auth = makeAuth({
      status: 'waiting',
      loginSession: {
        loginKey: 'login-key',
        qrDataUrl: 'data:image/png;base64,broken',
        expiresAt: '2026-07-15T01:01:00.000Z',
        pollIntervalMs: 3000,
      },
      remainingSeconds: 20,
    });
    render(<EnterpriseLoginPage />);

    fireEvent.error(screen.getByRole('img', { name: translations['enterprise.login.qrAlt'] }));
    expect(screen.getByText(translations['enterprise.login.imageError'])).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: translations['enterprise.actions.retry'] }));
    expect(startLogin).toHaveBeenCalledTimes(1);
  });

  it('offers an explicit refresh after expiry', async () => {
    auth = makeAuth({ status: 'unauthenticated', isExpired: true });
    render(<EnterpriseLoginPage />);

    expect(screen.getByText(translations['enterprise.login.expiredTitle'])).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: translations['enterprise.actions.refreshQr'] }));
    expect(startLogin).toHaveBeenCalledTimes(1);
  });

  it('uses translated stable errors and never renders raw identity data', () => {
    translations['enterprise.errors.NETWORK'] = '网络连接失败，请稍后重试';
    auth = makeAuth({ status: 'error', errorCode: 'NETWORK', registrationOpenId: 'wx-secret-open-id' });
    const { container } = render(<EnterpriseLoginPage />);

    expect(screen.getByText('网络连接失败，请稍后重试')).toBeVisible();
    expect(container).not.toHaveTextContent('wx-secret-open-id');
  });

  it('shows an accessible completion state after authentication', () => {
    auth = makeAuth({ status: 'authenticated' });
    render(<EnterpriseLoginPage />);

    expect(screen.getByText(translations['enterprise.login.authenticatedTitle'])).toBeVisible();
  });
});

describe('EnterpriseRegistrationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth = makeAuth({ status: 'registerRequired', registrationOpenId: 'wx-secret-open-id' });
  });

  it('renders the fixed registration QR and automatic checking instructions without the openid', () => {
    const { container } = render(<EnterpriseRegistrationPanel />);

    expect(screen.getByRole('img', { name: translations['enterprise.registration.qrAlt'] })).toHaveAttribute(
      'data-registration-url',
      ENTERPRISE_REGISTRATION_URL
    );
    expect(screen.getByText(translations['enterprise.registration.autoChecking'])).toBeVisible();
    expect(container).not.toHaveTextContent('wx-secret-open-id');
  });

  it('supports a manual registration check without creating a second login session', async () => {
    render(<EnterpriseRegistrationPanel />);

    await userEvent.click(screen.getByRole('button', { name: translations['enterprise.registration.manualCheck'] }));

    expect(checkRegistration).toHaveBeenCalledTimes(1);
    expect(startLogin).not.toHaveBeenCalled();
  });

  it('lets the user abandon registration and restart QR login', async () => {
    render(<EnterpriseRegistrationPanel />);

    await userEvent.click(screen.getByRole('button', { name: translations['enterprise.registration.restartLogin'] }));
    expect(startLogin).toHaveBeenCalledTimes(1);
  });
});
