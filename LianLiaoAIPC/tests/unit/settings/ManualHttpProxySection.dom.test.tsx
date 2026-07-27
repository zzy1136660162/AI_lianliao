/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { ManualHttpProxyFailureReason } from '@/common/networkProxy/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from '@arco-design/web-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getManualHttpProxy: vi.fn(),
  saveManualHttpProxy: vi.fn(),
  restart: vi.fn(),
  notifyManualRestartRequired: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
  confirm: vi.fn(),
  contextConfirm: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      getManualHttpProxy: { invoke: mocks.getManualHttpProxy },
      saveManualHttpProxy: { invoke: mocks.saveManualHttpProxy },
      restart: { invoke: mocks.restart },
    },
  },
}));

vi.mock('@/renderer/utils/appRestart', () => ({
  notifyManualRestartRequired: mocks.notifyManualRestartRequired,
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      success: mocks.messageSuccess,
      error: mocks.messageError,
    },
    Modal: {
      ...actual.Modal,
      confirm: mocks.confirm,
      useModal: () => [{ confirm: mocks.contextConfirm }, null],
    },
  };
});

import ManualHttpProxySection from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/ManualHttpProxySection';

type ConfirmOptions = {
  onOk?: () => void | Promise<void>;
  onCancel?: () => void;
};

const renderSection = () =>
  render(
    <ConfigProvider>
      <ManualHttpProxySection />
    </ConfigProvider>
  );

const getAddressInput = () => screen.getByPlaceholderText('http://127.0.0.1:7897');
const getProxySwitch = () => screen.getByRole('switch', { name: 'settings.manualHttpProxyEnabled' });

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
};

const saveProxy = async (url: string) => {
  const user = userEvent.setup();
  const addressInput = await screen.findByPlaceholderText('http://127.0.0.1:7897');
  await user.clear(addressInput);
  await user.type(addressInput, url);
  await user.click(screen.getByRole('button', { name: 'settings.saveManualHttpProxy' }));
};

const validationErrorCases = [
  ['URL_REQUIRED', 'settings.manualHttpProxyUrlRequired'],
  ['UNSUPPORTED_PROTOCOL', 'settings.manualHttpProxyProtocolError'],
  ['AUTHENTICATION_UNSUPPORTED', 'settings.manualHttpProxyAuthUnsupported'],
  ['PATH_UNSUPPORTED', 'settings.manualHttpProxyComponentsUnsupported'],
  ['QUERY_UNSUPPORTED', 'settings.manualHttpProxyComponentsUnsupported'],
  ['FRAGMENT_UNSUPPORTED', 'settings.manualHttpProxyComponentsUnsupported'],
  ['PORT_REQUIRED', 'settings.manualHttpProxyPortError'],
  ['PORT_OUT_OF_RANGE', 'settings.manualHttpProxyPortError'],
  ['INVALID_CONFIG', 'settings.manualHttpProxyInvalidUrl'],
  ['INVALID_URL', 'settings.manualHttpProxyInvalidUrl'],
  ['HOST_REQUIRED', 'settings.manualHttpProxyInvalidUrl'],
  ['INVALID_WEBSOCKET_TARGET_URL', 'settings.manualHttpProxyInvalidUrl'],
  ['UNSUPPORTED_WEBSOCKET_TARGET_PROTOCOL', 'settings.manualHttpProxyInvalidUrl'],
] as const satisfies ReadonlyArray<readonly [ManualHttpProxyFailureReason, string]>;

describe('ManualHttpProxySection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getManualHttpProxy.mockResolvedValue({
      enabled: true,
      url: 'http://127.0.0.1:7897',
    });
    mocks.restart.mockResolvedValue({
      restarted: true,
      manualRestartRequired: false,
    });
    mocks.confirm.mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('loads and displays the persisted proxy configuration', async () => {
    const { container } = renderSection();

    expect(await screen.findByDisplayValue('http://127.0.0.1:7897')).toBeEnabled();
    expect(getProxySwitch()).toBeChecked();
    expect(mocks.getManualHttpProxy).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.arco-card')).not.toBeNull();
  });

  it('keeps all proxy controls unavailable until the persisted config loads', async () => {
    const deferredConfig = createDeferred<{ enabled: boolean; url: string }>();
    mocks.getManualHttpProxy.mockReturnValueOnce(deferredConfig.promise);
    renderSection();

    expect(getProxySwitch()).toBeDisabled();
    expect(getAddressInput()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'settings.saveManualHttpProxy' })).toBeDisabled();

    deferredConfig.resolve({
      enabled: true,
      url: 'http://localhost:7897',
    });

    expect(await screen.findByDisplayValue('http://localhost:7897')).toBeEnabled();
    expect(getProxySwitch()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'settings.saveManualHttpProxy' })).toBeEnabled();
  });

  it('keeps the last proxy URL when manual proxy is disabled', async () => {
    const user = userEvent.setup();
    renderSection();

    const addressInput = await screen.findByDisplayValue('http://127.0.0.1:7897');
    await user.click(getProxySwitch());

    expect(addressInput).toBeDisabled();
    expect(addressInput).toHaveValue('http://127.0.0.1:7897');
  });

  it('uses the normalized saved config and restarts only after confirmation', async () => {
    mocks.saveManualHttpProxy.mockResolvedValue({
      success: true,
      config: {
        enabled: true,
        url: 'http://localhost:7897',
      },
      restartRequired: true,
    });
    renderSection();

    await saveProxy('HTTP://LOCALHOST:7897');

    await waitFor(() => {
      expect(mocks.saveManualHttpProxy).toHaveBeenCalledWith({
        enabled: true,
        url: 'HTTP://LOCALHOST:7897',
      });
    });
    expect(getAddressInput()).toHaveValue('http://localhost:7897');
    expect(mocks.messageSuccess).toHaveBeenCalledWith('settings.manualHttpProxySaved');
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'settings.manualHttpProxyRestartTitle',
        content: 'settings.manualHttpProxyRestartContent',
      })
    );
    expect(mocks.restart).not.toHaveBeenCalled();

    const confirmOptions = mocks.confirm.mock.calls[0]?.[0] as ConfirmOptions;
    await confirmOptions.onOk?.();

    expect(mocks.restart).toHaveBeenCalledTimes(1);
    expect(mocks.notifyManualRestartRequired).toHaveBeenCalledWith(
      { restarted: true, manualRestartRequired: false },
      expect.any(Function)
    );
  });

  it('keeps the saved normalized config without restarting when confirmation is cancelled', async () => {
    mocks.saveManualHttpProxy.mockResolvedValue({
      success: true,
      config: {
        enabled: true,
        url: 'http://localhost:7897',
      },
      restartRequired: true,
    });
    renderSection();

    await saveProxy('HTTP://LOCALHOST:7897');
    const confirmOptions = mocks.confirm.mock.calls[0]?.[0] as ConfirmOptions;
    confirmOptions.onCancel?.();

    expect(getAddressInput()).toHaveValue('http://localhost:7897');
    expect(mocks.restart).not.toHaveBeenCalled();
    expect(mocks.notifyManualRestartRequired).not.toHaveBeenCalled();
  });

  it.each(validationErrorCases)(
    'maps %s to a localized validation error without exposing diagnostics',
    async (reason, expectedKey) => {
      const diagnosticMessage = `diagnostic:${reason}`;
      mocks.saveManualHttpProxy.mockResolvedValue({
        success: false,
        code: 'INVALID_PROXY_URL',
        reason,
        message: diagnosticMessage,
      });
      renderSection();

      await saveProxy('http://localhost:7897');

      await waitFor(() => {
        expect(mocks.messageError).toHaveBeenCalledWith(expectedKey);
      });
      expect(screen.queryByText(diagnosticMessage)).not.toBeInTheDocument();
      expect(mocks.messageError).not.toHaveBeenCalledWith(diagnosticMessage);
      expect(mocks.confirm).not.toHaveBeenCalled();
    }
  );

  it('shows the localized persistence error without exposing diagnostics', async () => {
    const diagnosticMessage = 'disk write failed at a private path';
    mocks.saveManualHttpProxy.mockResolvedValue({
      success: false,
      code: 'PERSISTENCE_FAILED',
      reason: 'PERSISTENCE_FAILED',
      message: diagnosticMessage,
    });
    renderSection();

    await saveProxy('http://localhost:7897');

    await waitFor(() => {
      expect(mocks.messageError).toHaveBeenCalledWith('settings.manualHttpProxySaveFailed');
    });
    expect(screen.queryByText(diagnosticMessage)).not.toBeInTheDocument();
    expect(mocks.messageError).not.toHaveBeenCalledWith(diagnosticMessage);
  });

  it('shows a localized load error when reading the proxy config fails', async () => {
    mocks.getManualHttpProxy.mockRejectedValueOnce(new Error('private read diagnostic'));
    renderSection();

    expect(await screen.findByText('settings.manualHttpProxyLoadFailed')).toBeInTheDocument();
    expect(screen.queryByText('private read diagnostic')).not.toBeInTheDocument();
  });

  it('shows a localized save error when invoking the save operation fails', async () => {
    mocks.saveManualHttpProxy.mockRejectedValueOnce(new Error('private save diagnostic'));
    renderSection();

    await saveProxy('http://localhost:7897');

    await waitFor(() => {
      expect(mocks.messageError).toHaveBeenCalledWith('settings.manualHttpProxySaveFailed');
    });
    expect(screen.queryByText('private save diagnostic')).not.toBeInTheDocument();
    expect(mocks.messageError).not.toHaveBeenCalledWith('private save diagnostic');
  });

  it('submits the retained URL while disabled', async () => {
    mocks.saveManualHttpProxy.mockResolvedValue({
      success: true,
      config: {
        enabled: false,
        url: 'http://127.0.0.1:7897',
      },
      restartRequired: true,
    });
    renderSection();

    const user = userEvent.setup();
    await screen.findByDisplayValue('http://127.0.0.1:7897');
    await user.click(getProxySwitch());
    fireEvent.click(screen.getByRole('button', { name: 'settings.saveManualHttpProxy' }));

    await waitFor(() => {
      expect(mocks.saveManualHttpProxy).toHaveBeenCalledWith({
        enabled: false,
        url: 'http://127.0.0.1:7897',
      });
    });
  });

  it('locks all proxy controls while a save request is pending', async () => {
    const deferredSave = createDeferred<{
      success: true;
      config: { enabled: boolean; url: string };
      restartRequired: true;
    }>();
    mocks.saveManualHttpProxy.mockReturnValueOnce(deferredSave.promise);
    renderSection();

    await saveProxy('http://localhost:7897');

    expect(getProxySwitch()).toBeDisabled();
    expect(getAddressInput()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'settings.saveManualHttpProxy' })).toBeDisabled();

    deferredSave.resolve({
      success: true,
      config: { enabled: true, url: 'http://localhost:7897' },
      restartRequired: true,
    });

    await waitFor(() => {
      expect(getProxySwitch()).toBeEnabled();
      expect(getAddressInput()).toBeEnabled();
      expect(screen.getByRole('button', { name: 'settings.saveManualHttpProxy' })).toBeEnabled();
    });
  });

  it('shows global success feedback and restart confirmation when save resolves after unmount', async () => {
    const deferredSave = createDeferred<{
      success: true;
      config: { enabled: boolean; url: string };
      restartRequired: true;
    }>();
    mocks.saveManualHttpProxy.mockReturnValueOnce(deferredSave.promise);
    const { unmount } = renderSection();

    await saveProxy('http://localhost:7897');
    unmount();
    deferredSave.resolve({
      success: true,
      config: { enabled: true, url: 'http://localhost:7897' },
      restartRequired: true,
    });

    await waitFor(() => {
      expect(mocks.messageSuccess).toHaveBeenCalledWith('settings.manualHttpProxySaved');
      expect(mocks.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'settings.manualHttpProxyRestartTitle',
          content: 'settings.manualHttpProxyRestartContent',
        })
      );
    });
    expect(mocks.contextConfirm).not.toHaveBeenCalled();
  });

  it('does not show failure UI when save resolves after unmount', async () => {
    const deferredSave = createDeferred<{
      success: false;
      code: 'INVALID_PROXY_URL';
      reason: 'INVALID_URL';
      message: string;
    }>();
    mocks.saveManualHttpProxy.mockReturnValueOnce(deferredSave.promise);
    const { unmount } = renderSection();

    await saveProxy('http://localhost:7897');
    unmount();
    deferredSave.resolve({
      success: false,
      code: 'INVALID_PROXY_URL',
      reason: 'INVALID_URL',
      message: 'private diagnostic',
    });

    await waitFor(() => {
      expect(mocks.saveManualHttpProxy).toHaveBeenCalledTimes(1);
    });
    expect(mocks.messageError).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('clears a prior load failure after saving successfully', async () => {
    mocks.getManualHttpProxy.mockRejectedValueOnce(new Error('read failed'));
    mocks.saveManualHttpProxy.mockResolvedValueOnce({
      success: true,
      config: { enabled: true, url: 'http://localhost:7897' },
      restartRequired: true,
    });
    renderSection();

    expect(await screen.findByText('settings.manualHttpProxyLoadFailed')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(getProxySwitch());
    await user.type(getAddressInput(), 'http://localhost:7897');
    await user.click(screen.getByRole('button', { name: 'settings.saveManualHttpProxy' }));

    await waitFor(() => {
      expect(screen.queryByText('settings.manualHttpProxyLoadFailed')).not.toBeInTheDocument();
    });
  });

  it('uses a responsive layout that lets the address field and localized button shrink', async () => {
    renderSection();

    await screen.findByDisplayValue('http://127.0.0.1:7897');
    const addressInput = getAddressInput();
    expect(addressInput.parentElement).toHaveClass('min-w-0');
    expect(addressInput.parentElement?.parentElement).toHaveClass('flex-col', 'sm:flex-row');
    expect(screen.getByRole('button', { name: 'settings.saveManualHttpProxy' })).toHaveClass(
      'w-full',
      'sm:w-auto',
      'whitespace-normal'
    );
  });
});
