import { Robot } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';

import EnterpriseHeader from './EnterpriseHeader';
import EnterpriseSider from './EnterpriseSider';
import EnterpriseWindowChrome from './EnterpriseWindowChrome';
import './enterprise-shell.css';

/** Three-column enterprise workspace with a separately collapsible assistant slot. */
const EnterpriseShell: React.FC = () => {
  const { t } = useTranslation();
  const [assistantOpen, setAssistantOpen] = useState(true);

  return (
    <div className={`enterprise-shell${assistantOpen ? '' : ' enterprise-shell--assistant-closed'}`}>
      <div className='enterprise-shell__blueprint' aria-hidden='true' />
      <EnterpriseWindowChrome title={t('enterprise.shell.brand')} />
      <EnterpriseSider />
      <div className='enterprise-shell__workspace'>
        <EnterpriseHeader
          assistantOpen={assistantOpen}
          onToggleAssistant={() => setAssistantOpen((current) => !current)}
        />
        <div className='enterprise-shell__work-area'>
          <main className='enterprise-shell__main' aria-label={t('enterprise.accessibility.workspace')}>
            <Outlet />
          </main>
          <aside
            id='enterprise-assistant-panel'
            className='enterprise-assistant'
            aria-label={t('enterprise.accessibility.assistant')}
            aria-hidden={!assistantOpen}
          >
            <div className='enterprise-assistant__index'>{t('enterprise.assistant.index')}</div>
            <Robot size={24} />
            <h2>{t('enterprise.assistant.title')}</h2>
            <p>{t('enterprise.assistant.description')}</p>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default EnterpriseShell;
