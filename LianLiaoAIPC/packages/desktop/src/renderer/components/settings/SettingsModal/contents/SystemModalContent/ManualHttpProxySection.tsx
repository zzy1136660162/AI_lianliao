/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ManualHttpProxyFailureReason } from '@/common/networkProxy/contracts';
import { notifyManualRestartRequired } from '@/renderer/utils/appRestart';
import { Alert, Button, Card, Input, Message, Modal, Switch } from '@arco-design/web-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PreferenceRow from './PreferenceRow';

type ProxyErrorTranslationKey =
  | 'settings.manualHttpProxyUrlRequired'
  | 'settings.manualHttpProxyProtocolError'
  | 'settings.manualHttpProxyInvalidUrl'
  | 'settings.manualHttpProxyAuthUnsupported'
  | 'settings.manualHttpProxyComponentsUnsupported'
  | 'settings.manualHttpProxyPortError';

const PROXY_ERROR_TRANSLATION_KEYS: Record<ManualHttpProxyFailureReason, ProxyErrorTranslationKey> = {
  INVALID_CONFIG: 'settings.manualHttpProxyInvalidUrl',
  URL_REQUIRED: 'settings.manualHttpProxyUrlRequired',
  UNSUPPORTED_PROTOCOL: 'settings.manualHttpProxyProtocolError',
  INVALID_URL: 'settings.manualHttpProxyInvalidUrl',
  HOST_REQUIRED: 'settings.manualHttpProxyInvalidUrl',
  AUTHENTICATION_UNSUPPORTED: 'settings.manualHttpProxyAuthUnsupported',
  PATH_UNSUPPORTED: 'settings.manualHttpProxyComponentsUnsupported',
  QUERY_UNSUPPORTED: 'settings.manualHttpProxyComponentsUnsupported',
  FRAGMENT_UNSUPPORTED: 'settings.manualHttpProxyComponentsUnsupported',
  PORT_REQUIRED: 'settings.manualHttpProxyPortError',
  PORT_OUT_OF_RANGE: 'settings.manualHttpProxyPortError',
  INVALID_WEBSOCKET_TARGET_URL: 'settings.manualHttpProxyInvalidUrl',
  UNSUPPORTED_WEBSOCKET_TARGET_PROTOCOL: 'settings.manualHttpProxyInvalidUrl',
};

const ManualHttpProxySection: React.FC = () => {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    mountedRef.current = true;

    ipcBridge.application.getManualHttpProxy
      .invoke()
      .then((config) => {
        if (!cancelled) {
          setEnabled(config.enabled);
          setUrl(config.url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  const restartApplication = async () => {
    try {
      const restartResult = await ipcBridge.application.restart.invoke();
      notifyManualRestartRequired(restartResult, t);
    } catch {
      Message.error(t('common.error'));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await ipcBridge.application.saveManualHttpProxy.invoke({ enabled, url });
      if (result.success === false) {
        if (!mountedRef.current) {
          return;
        }
        const errorKey =
          result.code === 'PERSISTENCE_FAILED'
            ? 'settings.manualHttpProxySaveFailed'
            : PROXY_ERROR_TRANSLATION_KEYS[result.reason];
        Message.error(t(errorKey));
        return;
      }

      if (mountedRef.current) {
        setEnabled(result.config.enabled);
        setUrl(result.config.url);
        setLoadFailed(false);
      }
      Message.success(t('settings.manualHttpProxySaved'));
      Modal.confirm({
        title: t('settings.manualHttpProxyRestartTitle'),
        content: t('settings.manualHttpProxyRestartContent'),
        onOk: restartApplication,
      });
    } catch {
      if (mountedRef.current) {
        Message.error(t('settings.manualHttpProxySaveFailed'));
      }
    } finally {
      if (mountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  const controlsLocked = isLoading || isSaving;

  return (
    <Card bordered={false} className='bg-2 rd-16px [&_.arco-card-body]:!p-0'>
      <div className='px-[12px] md:px-[32px] py-16px space-y-12px'>
        <div className='text-14px font-medium text-t-primary'>{t('settings.networkProxy')}</div>
        <PreferenceRow label={t('settings.manualHttpProxyEnabled')} description={t('settings.manualHttpProxyDesc')}>
          <Switch
            aria-label={t('settings.manualHttpProxyEnabled')}
            checked={enabled}
            loading={controlsLocked}
            disabled={controlsLocked}
            onChange={setEnabled}
          />
        </PreferenceRow>
        <div className='space-y-8px'>
          <label className='block text-13px text-t-secondary' htmlFor='manual-http-proxy-address'>
            {t('settings.manualHttpProxyAddress')}
          </label>
          <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-8px'>
            <div className='min-w-0 flex-1'>
              <Input
                id='manual-http-proxy-address'
                className='w-full'
                value={url}
                placeholder='http://127.0.0.1:7897'
                disabled={controlsLocked || !enabled}
                onChange={setUrl}
              />
            </div>
            <Button
              type='primary'
              className='w-full sm:w-auto sm:shrink-0 max-w-full whitespace-normal h-auto'
              loading={isSaving}
              disabled={controlsLocked}
              onClick={handleSave}
            >
              {t('settings.saveManualHttpProxy')}
            </Button>
          </div>
        </div>
        {loadFailed && <Alert type='error' content={t('settings.manualHttpProxyLoadFailed')} />}
      </div>
    </Card>
  );
};

export default ManualHttpProxySection;
