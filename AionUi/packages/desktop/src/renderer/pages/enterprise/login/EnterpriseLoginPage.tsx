import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Spin } from '@arco-design/web-react';
import { BuildingFour, CheckOne, Refresh, Shield } from '@icon-park/react';
import { useTranslation } from 'react-i18next';

import type { EnterpriseIpcErrorCode } from '@/common/enterprise/contracts';
import { useEnterpriseAuth } from '@/renderer/hooks/context/EnterpriseAuthContext';
import type { I18nKey } from '@/renderer/services/i18n';
import EnterpriseRegistrationPanel from './EnterpriseRegistrationPanel';
import './enterprise-login.css';

export const ENTERPRISE_ERROR_I18N_KEYS = {
  INVALID_BASE_URL: 'enterprise.errors.INVALID_BASE_URL',
  INVALID_REQUEST: 'enterprise.errors.INVALID_REQUEST',
  MISSING_CONTEXT: 'enterprise.errors.MISSING_CONTEXT',
  TIMEOUT: 'enterprise.errors.TIMEOUT',
  NETWORK: 'enterprise.errors.NETWORK',
  HTTP: 'enterprise.errors.HTTP',
  INVALID_JSON: 'enterprise.errors.INVALID_JSON',
  API_FAILURE: 'enterprise.errors.API_FAILURE',
  INVALID_RESPONSE: 'enterprise.errors.INVALID_RESPONSE',
  AUTH_CREATE_FAILED: 'enterprise.errors.AUTH_CREATE_FAILED',
  AUTH_POLL_FAILED: 'enterprise.errors.AUTH_POLL_FAILED',
  INVALID_AUTH_RESULT: 'enterprise.errors.INVALID_AUTH_RESULT',
  REGISTRATION_INCOMPLETE: 'enterprise.errors.REGISTRATION_INCOMPLETE',
  REGISTRATION_FAILED: 'enterprise.errors.REGISTRATION_FAILED',
  SESSION_RESTORE_FAILED: 'enterprise.errors.SESSION_RESTORE_FAILED',
  SESSION_CLEAR_FAILED: 'enterprise.errors.SESSION_CLEAR_FAILED',
  REQUEST_FAILED: 'enterprise.errors.REQUEST_FAILED',
  UNTRUSTED_SENDER: 'enterprise.errors.UNTRUSTED_SENDER',
  IPC_UNAVAILABLE: 'enterprise.errors.IPC_UNAVAILABLE',
  INVALID_IPC_RESPONSE: 'enterprise.errors.INVALID_IPC_RESPONSE',
} as const satisfies Readonly<Record<EnterpriseIpcErrorCode, I18nKey>>;

const formatCountdown = (remainingSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(remainingSeconds));
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const EnterpriseLoginPage: React.FC = () => {
  const { t } = useTranslation();
  const auth = useEnterpriseAuth();
  const autoStartRef = useRef(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (auth.status !== 'unauthenticated' || auth.isExpired || autoStartRef.current) return;
    autoStartRef.current = true;
    void auth.startLogin();
  }, [auth.isExpired, auth.startLogin, auth.status]);

  useEffect(() => {
    setImageError(false);
  }, [auth.loginSession?.loginKey]);

  const renderStage = () => {
    if (auth.status === 'registerRequired') return <EnterpriseRegistrationPanel />;

    if (auth.status === 'checking' || (auth.status === 'unauthenticated' && !auth.isExpired)) {
      return (
        <div className='enterprise-login__center-state' role='status' aria-live='polite'>
          <Spin size={34} />
          <h2>{t('enterprise.login.checkingTitle')}</h2>
          <p>{t('enterprise.login.checkingDescription')}</p>
        </div>
      );
    }

    if (auth.status === 'authenticated') {
      return (
        <div className='enterprise-login__center-state enterprise-login__center-state--success' role='status'>
          <CheckOne size={38} />
          <h2>{t('enterprise.login.authenticatedTitle')}</h2>
          <p>{t('enterprise.login.authenticatedDescription')}</p>
        </div>
      );
    }

    if (auth.status === 'error') {
      const errorKey = auth.errorCode ? ENTERPRISE_ERROR_I18N_KEYS[auth.errorCode] : 'enterprise.errors.UNKNOWN';
      return (
        <div className='enterprise-login__error-state' role='alert'>
          <Alert type='error' showIcon title={t('enterprise.login.errorTitle')} content={t(errorKey)} />
          <Button type='primary' icon={<Refresh />} onClick={() => void auth.retry()}>
            {t('enterprise.actions.retry')}
          </Button>
        </div>
      );
    }

    if (auth.isExpired) {
      return (
        <div className='enterprise-login__center-state' role='status'>
          <Refresh size={36} />
          <h2>{t('enterprise.login.expiredTitle')}</h2>
          <p>{t('enterprise.login.expiredDescription')}</p>
          <Button type='primary' icon={<Refresh />} onClick={() => void auth.startLogin()}>
            {t('enterprise.actions.refreshQr')}
          </Button>
        </div>
      );
    }

    if (auth.status === 'waiting' && auth.loginSession) {
      return (
        <section className='enterprise-login__qr-stage' aria-labelledby='enterprise-login-scan-title'>
          <p className='enterprise-login__overline'>{t('enterprise.login.scanEyebrow')}</p>
          <h2 id='enterprise-login-scan-title'>{t('enterprise.login.scanTitle')}</h2>
          <p className='enterprise-login__stage-description'>{t('enterprise.login.scanDescription')}</p>

          {imageError ? (
            <div className='enterprise-login__image-error'>
              <Alert type='error' showIcon content={t('enterprise.login.imageError')} />
              <Button icon={<Refresh />} onClick={() => void auth.startLogin()}>
                {t('enterprise.actions.retry')}
              </Button>
            </div>
          ) : (
            <div className='enterprise-login__qr-frame'>
              <img
                src={auth.loginSession.qrDataUrl}
                alt={t('enterprise.login.qrAlt')}
                onError={() => setImageError(true)}
              />
              <span className='enterprise-login__scan-corners' aria-hidden='true' />
            </div>
          )}

          <div className='enterprise-login__qr-meta'>
            <span className='enterprise-login__countdown'>{formatCountdown(auth.remainingSeconds)}</span>
            <span>{t('enterprise.login.remainingLabel')}</span>
          </div>
          <div className='enterprise-login__auto-status' role='status'>
            <Spin size={14} />
            <span>{t('enterprise.login.autoChecking')}</span>
          </div>
        </section>
      );
    }

    return null;
  };

  return (
    <main className='enterprise-login'>
      <div className='enterprise-login__blueprint' aria-hidden='true' />
      <section className='enterprise-login__story' aria-labelledby='enterprise-login-brand-title'>
        <div className='enterprise-login__brand-mark' aria-hidden='true'>
          <BuildingFour size={29} />
        </div>
        <p className='enterprise-login__brand-eyebrow'>{t('enterprise.brand.eyebrow')}</p>
        <h1 id='enterprise-login-brand-title'>{t('enterprise.brand.title')}</h1>
        <p className='enterprise-login__brand-description'>{t('enterprise.brand.description')}</p>

        <ol className='enterprise-login__steps'>
          {(['scan', 'identify', 'work'] as const).map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{t(`enterprise.steps.${step}.title`)}</strong>
                <p>{t(`enterprise.steps.${step}.description`)}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className='enterprise-login__security-note'>
          <Shield size={18} />
          <span>{t('enterprise.brand.security')}</span>
        </div>
      </section>

      <Card className='enterprise-login__stage-card' bordered>
        {renderStage()}
      </Card>
    </main>
  );
};

export default EnterpriseLoginPage;
