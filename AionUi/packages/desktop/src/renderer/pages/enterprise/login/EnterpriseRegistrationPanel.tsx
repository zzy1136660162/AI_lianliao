import React from 'react';
import { Alert, Button, Spin } from '@arco-design/web-react';
import { Iphone, Refresh, WeixinScan } from '@icon-park/react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';

import { ENTERPRISE_REGISTRATION_URL } from '@/common/enterprise/constants';
import { useEnterpriseAuth } from '@/renderer/hooks/context/EnterpriseAuthContext';

const EnterpriseRegistrationPanel: React.FC = () => {
  const { t } = useTranslation();
  const { checkRegistration, startLogin } = useEnterpriseAuth();

  return (
    <section className='enterprise-login__registration' aria-labelledby='enterprise-registration-title'>
      <div className='enterprise-login__stage-index' aria-hidden='true'>
        <Iphone size={18} />
      </div>
      <div className='enterprise-login__registration-copy'>
        <p className='enterprise-login__overline'>{t('enterprise.registration.eyebrow')}</p>
        <h2 id='enterprise-registration-title'>{t('enterprise.registration.title')}</h2>
        <p>{t('enterprise.registration.description')}</p>
      </div>

      <div className='enterprise-login__registration-qr'>
        <QRCodeSVG
          value={ENTERPRISE_REGISTRATION_URL}
          size={220}
          level='M'
          role='img'
          aria-label={t('enterprise.registration.qrAlt')}
          data-registration-url={ENTERPRISE_REGISTRATION_URL}
        />
        <span className='enterprise-login__scan-corners' aria-hidden='true' />
      </div>

      <Alert
        type='info'
        showIcon
        content={
          <span className='enterprise-login__auto-status' aria-live='polite'>
            <Spin size={14} icon={<WeixinScan />} />
            {t('enterprise.registration.autoChecking')}
          </span>
        }
      />

      <div className='enterprise-login__actions'>
        <Button type='primary' icon={<WeixinScan />} onClick={() => void checkRegistration()}>
          {t('enterprise.registration.manualCheck')}
        </Button>
        <Button icon={<Refresh />} onClick={() => void startLogin()}>
          {t('enterprise.registration.restartLogin')}
        </Button>
      </div>
      <p className='enterprise-login__privacy-note'>{t('enterprise.registration.privacy')}</p>
    </section>
  );
};

export default EnterpriseRegistrationPanel;
