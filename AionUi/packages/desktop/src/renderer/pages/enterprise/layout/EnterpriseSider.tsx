import {
  Box,
  BuildingFour,
  DashboardOne,
  EngineeringBrand,
  FollowUpDateSort,
  HeadsetOne,
  Logout,
  Robot,
  SettingTwo,
  Star,
} from '@icon-park/react';
import { Button } from 'antd';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router-dom';

import { useEnterpriseAuth } from '@/renderer/hooks/context/EnterpriseAuthContext';

const navigationGroups = [
  {
    key: 'overview',
    labelKey: 'enterprise.navigationGroups.overview',
    items: [{ path: '/enterprise/dashboard', labelKey: 'enterprise.navigation.dashboard', Icon: DashboardOne }],
  },
  {
    key: 'resources',
    labelKey: 'enterprise.navigationGroups.resources',
    items: [
      { path: '/enterprise/companies', labelKey: 'enterprise.navigation.companies', Icon: BuildingFour },
      { path: '/enterprise/products', labelKey: 'enterprise.navigation.products', Icon: Box },
      { path: '/enterprise/projects', labelKey: 'enterprise.navigation.projects', Icon: EngineeringBrand },
    ],
  },
  {
    key: 'collaboration',
    labelKey: 'enterprise.navigationGroups.collaboration',
    items: [
      { path: '/enterprise/favorites', labelKey: 'enterprise.navigation.favorites', Icon: Star },
      { path: '/enterprise/leads', labelKey: 'enterprise.navigation.leads', Icon: FollowUpDateSort },
      {
        path: '/enterprise/customer-service',
        labelKey: 'enterprise.navigation.customerService',
        Icon: HeadsetOne,
        requiredRoleId: '19',
      },
    ],
  },
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
    let failed = false;
    try {
      const sessionCleared = await logout();
      if (!sessionCleared) {
        failed = true;
        return;
      }
      navigate('/enterprise/login', { replace: true });
    } catch {
      failed = true;
    } finally {
      setLogoutPending(false);
      setLogoutFailed(failed);
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
        {navigationGroups.map(({ key, labelKey: groupLabelKey, items }) => (
          <section key={key} className='enterprise-sider__nav-group' aria-labelledby={`enterprise-nav-${key}`}>
            <p id={`enterprise-nav-${key}`} className='enterprise-sider__nav-group-label'>
              {t(groupLabelKey)}
            </p>
            <div className='enterprise-sider__nav-group-items'>
              {items
                .filter(
                  (item) =>
                    !('requiredRoleId' in item) ||
                    item.requiredRoleId === undefined ||
                    user?.roleId === item.requiredRoleId
                )
                .map(({ path, labelKey, Icon }) => (
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
            </div>
          </section>
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
          aria-label={t('enterprise.shell.actions.logout')}
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
