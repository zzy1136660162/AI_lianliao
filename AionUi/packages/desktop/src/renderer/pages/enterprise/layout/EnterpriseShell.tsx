import { Robot } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router-dom';

import EnterpriseAntdProvider from './EnterpriseAntdProvider';
import EnterpriseHeader from './EnterpriseHeader';
import EnterpriseSider from './EnterpriseSider';
import EnterpriseWindowChrome from './EnterpriseWindowChrome';
import './enterprise-shell.css';

/** Three-column enterprise workspace with a separately collapsible assistant slot. */
const EnterpriseShell: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const isCustomerServiceRoute = location.pathname.startsWith('/enterprise/customer-service');
  const effectiveAssistantOpen = assistantOpen && !isCustomerServiceRoute;

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [location.pathname]);

  return (
    <EnterpriseAntdProvider>
      <div
        className={`enterprise-shell${effectiveAssistantOpen ? '' : ' enterprise-shell--assistant-closed'}${
          isCustomerServiceRoute ? ' enterprise-shell--customer-service' : ''
        }`}
      >
        <EnterpriseWindowChrome title={t('enterprise.shell.brand')} />
        <EnterpriseSider />
        <div className='enterprise-shell__workspace'>
          <EnterpriseHeader
            assistantOpen={effectiveAssistantOpen}
            assistantAvailable={!isCustomerServiceRoute}
            onToggleAssistant={() => setAssistantOpen((current) => !current)}
          />
          <div className='enterprise-shell__work-area'>
            <main
              ref={mainRef}
              className={`enterprise-shell__main${
                isCustomerServiceRoute ? ' enterprise-shell__main--customer-service' : ''
              }`}
              aria-label={t('enterprise.accessibility.workspace')}
            >
              <Outlet />
            </main>
            <aside
              id='enterprise-assistant-panel'
              className='enterprise-assistant'
              aria-label={t('enterprise.accessibility.assistant')}
              aria-hidden={!effectiveAssistantOpen}
            >
              <div className='enterprise-assistant__index'>{t('enterprise.assistant.index')}</div>
              <Robot size={24} />
              <h2>{t('enterprise.assistant.title')}</h2>
              <p>{t('enterprise.assistant.description')}</p>
            </aside>
          </div>
        </div>
      </div>
    </EnterpriseAntdProvider>
  );
};

export default EnterpriseShell;
