import {
  Box,
  BuildingFour,
  DashboardOne,
  EngineeringBrand,
  FollowUpDateSort,
  Logout,
  Robot,
  SettingTwo,
  Star,
} from '@icon-park/react';
import { Button } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router-dom';

import { useEnterpriseAuth } from '@/renderer/hooks/context/EnterpriseAuthContext';

const primaryItems = [
  { path: '/enterprise/dashboard', labelKey: 'enterprise.navigation.dashboard', Icon: DashboardOne },
  { path: '/enterprise/companies', labelKey: 'enterprise.navigation.companies', Icon: BuildingFour },
  { path: '/enterprise/products', labelKey: 'enterprise.navigation.products', Icon: Box },
  { path: '/enterprise/projects', labelKey: 'enterprise.navigation.projects', Icon: EngineeringBrand },
  { path: '/enterprise/favorites', labelKey: 'enterprise.navigation.favorites', Icon: Star },
  { path: '/enterprise/leads', labelKey: 'enterprise.navigation.leads', Icon: FollowUpDateSort },
] as const;

/** Enterprise-only navigation, isolated from conversation history and chat state. */
const EnterpriseSider: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout, user } = useEnterpriseAuth();
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);

  const handleLogout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutFailed(false);
    try {
      await logout();
      navigate('/enterprise/login', { replace: true });
    } catch {
      setLogoutFailed(true);
    } finally {
      setLogoutPending(false);
    }
  };

  return (
    <aside className='enterprise-sider'>
      <div className='enterprise-sider__brand' aria-label={t('enterprise.shell.brand')}>
        <span className='enterprise-sider__brand-mark' aria-hidden='true'>
          {t('enterprise.shell.brandMark')}
        </span>
        <span>
          <strong>{t('enterprise.shell.brand')}</strong>
          <small className='enterprise-sider__brand-caption'>{t('enterprise.shell.brandCaption')}</small>
        </span>
      </div>

      <nav className='enterprise-sider__navigation' aria-label={t('enterprise.accessibility.primaryNavigation')}>
        {primaryItems.map(({ path, labelKey, Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `enterprise-sider__nav-item${isActive ? ' enterprise-sider__nav-item--active' : ''}`
            }
          >
            <Icon size={18} />
            <span>{t(labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      <div className='enterprise-sider__footer'>
        <div className='enterprise-sider__identity' aria-label={t('enterprise.accessibility.userIdentity')}>
          <span className='enterprise-sider__identity-mark' aria-hidden='true'>
            <BuildingFour size={17} />
          </span>
          <span>
            <strong>{user?.companyName || t('enterprise.shell.unknownCompany')}</strong>
            <small>{user?.userName || t('enterprise.shell.unknownUser')}</small>
          </span>
        </div>

        <NavLink className='enterprise-sider__utility' to='/guid'>
          <Robot size={17} />
          <span>{t('enterprise.shell.actions.ai')}</span>
        </NavLink>
        <NavLink className='enterprise-sider__utility' to='/settings/model'>
          <SettingTwo size={17} />
          <span>{t('enterprise.shell.actions.settings')}</span>
        </NavLink>
        <Button
          className='enterprise-sider__utility enterprise-sider__utility--button'
          type='text'
          htmlType='button'
          loading={logoutPending}
          icon={logoutPending ? undefined : <Logout size={17} />}
          onClick={() => void handleLogout()}
        >
          <span>{logoutPending ? t('enterprise.shell.loggingOut') : t('enterprise.shell.actions.logout')}</span>
        </Button>
        {logoutFailed ? (
          <p className='enterprise-sider__logout-error' role='alert'>
            {t('enterprise.shell.logoutError')}
          </p>
        ) : null}
      </div>
    </aside>
  );
};

export default EnterpriseSider;
