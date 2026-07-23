import React from 'react';
import { useTranslation } from 'react-i18next';

import WindowControls from '@/renderer/components/layout/WindowControls';
import '@/renderer/components/layout/Titlebar/titlebar.css';
import { isElectronDesktop, isMacOS } from '@/renderer/utils/platform';
import './enterprise-window-chrome.css';

type EnterpriseWindowChromeProps = {
  title: string;
};

/**
 * Supplies the draggable region required by the frameless desktop window.
 * Windows and Linux reuse the application's shared IPC-backed controls, while
 * macOS keeps its native traffic lights and reserves space for them on the left.
 */
const EnterpriseWindowChrome: React.FC<EnterpriseWindowChromeProps> = ({ title }) => {
  const { t } = useTranslation();
  if (!isElectronDesktop()) return null;

  const macOS = isMacOS();
  const platformClass = macOS ? 'enterprise-window-chrome--mac' : 'enterprise-window-chrome--desktop';

  return (
    <div className={`enterprise-window-chrome ${platformClass}`} aria-label={title}>
      <span className='enterprise-window-chrome__title'>{title}</span>
      {macOS ? null : (
        <WindowControls
          labels={{
            minimize: t('enterprise.windowControls.minimize'),
            maximize: t('enterprise.windowControls.maximize'),
            restore: t('enterprise.windowControls.restore'),
            close: t('enterprise.windowControls.close'),
          }}
        />
      )}
    </div>
  );
};

export default EnterpriseWindowChrome;
