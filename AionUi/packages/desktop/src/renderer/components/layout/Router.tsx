import React, { Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useEnterpriseAuth } from '@renderer/hooks/context/EnterpriseAuthContext';
import EnterprisePageState from '@renderer/pages/enterprise/layout/EnterprisePageState';
import { isElectronDesktop } from '@renderer/utils/platform';
import { useTranslation } from 'react-i18next';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
import { CUSTOMER_CONSULTATION_NAVIGATE_CHANNEL } from '@/common/enterprise/customer-service/constants';
import { DESKTOP_NOTIFICATION_NAVIGATE_CHANNEL } from '@/common/enterprise/desktop-notification/constants';
import { desktopNotificationNavigationDetailSchema } from '@/common/enterprise/desktop-notification/schemas';
const Conversation = React.lazy(() => import('@renderer/pages/conversation'));
const Guid = React.lazy(() => import('@renderer/pages/guid'));
const AgentSettings = React.lazy(() => import('@renderer/pages/settings/AgentSettings'));
const AgentRepairPage = React.lazy(() => import('@renderer/pages/settings/AgentSettings/AgentRepairPage'));
const AssistantSettings = React.lazy(() => import('@renderer/pages/settings/AssistantSettings'));
const CapabilitiesSettings = React.lazy(() => import('@renderer/pages/settings/CapabilitiesSettings'));
const AppearanceSettings = React.lazy(() => import('@renderer/pages/settings/AppearanceSettings'));
const ModeSettings = React.lazy(() => import('@renderer/pages/settings/ModeSettings'));
const SystemSettings = React.lazy(() => import('@renderer/pages/settings/SystemSettings'));
const WebuiSettings = React.lazy(() => import('@renderer/pages/settings/WebuiSettings'));
const PetSettings = React.lazy(() => import('@renderer/pages/settings/PetSettings'));
const ExtensionSettingsPage = React.lazy(() => import('@renderer/pages/settings/ExtensionSettingsPage'));
const LoginPage = React.lazy(() => import('@renderer/pages/login'));
const ComponentsShowcase = React.lazy(() => import('@renderer/pages/TestShowcase'));
const ScheduledTasksPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage'));
const TaskDetailPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage/TaskDetailPage'));
const TeamIndex = React.lazy(() => import('@renderer/pages/team'));
const EnterpriseLoginPage = React.lazy(() => import('@renderer/pages/enterprise/login/EnterpriseLoginPage'));
const EnterpriseShell = React.lazy(() => import('@renderer/pages/enterprise/layout/EnterpriseShell'));
const CompanyListPage = React.lazy(() => import('@renderer/pages/enterprise/companies/CompanyListPage'));
const CompanyDetailPage = React.lazy(() => import('@renderer/pages/enterprise/companies/CompanyDetailPage'));
const ProductListPage = React.lazy(() => import('@renderer/pages/enterprise/products/ProductListPage'));
const ProductDetailPage = React.lazy(() => import('@renderer/pages/enterprise/products/ProductDetailPage'));
const ProjectPage = React.lazy(() => import('@renderer/pages/enterprise/projects/ProjectPage'));
const ProjectDetailPage = React.lazy(() => import('@renderer/pages/enterprise/projects/ProjectDetailPage'));
const SupplyDemandListPage = React.lazy(() => import('@renderer/pages/enterprise/supplyDemand/SupplyDemandListPage'));
const SupplyDemandDetailPage = React.lazy(
  () => import('@renderer/pages/enterprise/supplyDemand/SupplyDemandDetailPage')
);
const DashboardPage = React.lazy(() => import('@renderer/pages/enterprise/dashboard/DashboardPage'));
const CustomerServiceWorkbench = React.lazy(() => import('@renderer/pages/enterprise/customerService'));
const CustomerConsultationPage = React.lazy(() => import('@renderer/pages/enterprise/customerConsultation'));
const DesktopNotificationCenterPage = React.lazy(
  () => import('@renderer/pages/enterprise/notifications/DesktopNotificationCenterPage')
);
const VersionUpdatePage = React.lazy(() => import('@renderer/pages/enterprise/notifications/VersionUpdatePage'));

const withRouteFallback = (Component: React.LazyExoticComponent<React.ComponentType>) => (
  <Suspense fallback={<AppLoader />}>
    <Component />
  </Suspense>
);

const ProtectedLayout: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();

  if (status === 'checking') {
    return <AppLoader />;
  }

  if (status !== 'authenticated') {
    return <Navigate to='/login' replace />;
  }

  return React.cloneElement(layout);
};

const EnterpriseLoginRoute: React.FC = () => {
  const { status } = useEnterpriseAuth();

  if (!isElectronDesktop()) return <Navigate to='/' replace />;
  if (status === 'checking') return <AppLoader />;
  if (status === 'authenticated') return <Navigate to='/enterprise/dashboard' replace />;
  return withRouteFallback(EnterpriseLoginPage);
};

const EnterpriseProtectedLayout: React.FC = () => {
  const { status } = useEnterpriseAuth();

  if (!isElectronDesktop()) return <Navigate to='/' replace />;
  if (status === 'checking') return <AppLoader />;
  if (status !== 'authenticated') return <Navigate to='/enterprise/login' replace />;
  return withRouteFallback(EnterpriseShell);
};

type EnterpriseConversationRoleRouteProps = React.PropsWithChildren<{
  audience: 'customer' | 'staff';
}>;

/** Keeps customer consultation and staff reception mutually exclusive, including direct URLs. */
const EnterpriseConversationRoleRoute: React.FC<EnterpriseConversationRoleRouteProps> = ({ audience, children }) => {
  const { status, user } = useEnterpriseAuth();
  if (status === 'checking') return <AppLoader />;
  if (status !== 'authenticated') return <Navigate to='/enterprise/login' replace />;

  const isStaff = user?.roleId === '19';
  if (audience === 'staff' && !isStaff) return <Navigate to='/enterprise/consultation' replace />;
  if (audience === 'customer' && isStaff) return <Navigate to='/enterprise/customer-service' replace />;
  return <>{children}</>;
};

const RootRoute: React.FC = () => {
  const { status: appStatus } = useAuth();
  const { status: enterpriseStatus } = useEnterpriseAuth();

  if (isElectronDesktop()) {
    if (enterpriseStatus === 'checking') return <AppLoader />;
    return (
      <Navigate to={enterpriseStatus === 'authenticated' ? '/enterprise/dashboard' : '/enterprise/login'} replace />
    );
  }

  if (appStatus === 'checking') return <AppLoader />;
  return <Navigate to={appStatus === 'authenticated' ? '/guid' : '/login'} replace />;
};

type EnterprisePlaceholderPageProps = {
  titleKey: string;
  descriptionKey: string;
};

const ENTERPRISE_PLACEHOLDER_ROUTES = [
  ['favorites', 'enterprise.routes.favorites.title', 'enterprise.routes.favorites.description'],
  ['leads', 'enterprise.routes.leads.title', 'enterprise.routes.leads.description'],
] as const;

const EnterprisePlaceholderPage: React.FC<EnterprisePlaceholderPageProps> = ({ titleKey, descriptionKey }) => {
  const { t } = useTranslation();

  return (
    <div className='enterprise-route-placeholder'>
      <EnterprisePageState state='empty' title={t(titleKey)} description={t(descriptionKey)} />
    </div>
  );
};

const FallbackRoute: React.FC = () => {
  const { status: appStatus } = useAuth();
  const { status: enterpriseStatus } = useEnterpriseAuth();

  if (isElectronDesktop()) {
    if (enterpriseStatus === 'checking') return <AppLoader />;
    return (
      <Navigate to={enterpriseStatus === 'authenticated' ? '/enterprise/dashboard' : '/enterprise/login'} replace />
    );
  }
  return <Navigate to={appStatus === 'authenticated' ? '/guid' : '/login'} replace />;
};

/** Handles native customer-reply clicks even when EnterpriseShell is unmounted. */
const CustomerConsultationNotificationNavigator: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleNavigation = (): void => {
      void navigate('/enterprise/consultation');
    };
    window.addEventListener(CUSTOMER_CONSULTATION_NAVIGATE_CHANNEL, handleNavigation);
    return () => window.removeEventListener(CUSTOMER_CONSULTATION_NAVIGATE_CHANNEL, handleNavigation);
  }, [navigate]);

  return null;
};

/** Uses the strict route emitted by the Electron main process after a native business-notification click. */
const DesktopNotificationNavigator: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleNavigation = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const detail = desktopNotificationNavigationDetailSchema.safeParse(event.detail);
      if (!detail.success) return;
      void navigate(detail.data.route);
    };
    window.addEventListener(DESKTOP_NOTIFICATION_NAVIGATE_CHANNEL, handleNavigation);
    return () => window.removeEventListener(DESKTOP_NOTIFICATION_NAVIGATE_CHANNEL, handleNavigation);
  }, [navigate]);

  return null;
};

/** Shared production route tree; the desktop entry wraps it in HashRouter while tests may provide an in-memory router. */
export const PanelRoutes: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();

  return (
    <>
      <CustomerConsultationNotificationNavigator />
      <DesktopNotificationNavigator />
      <Routes>
        <Route index element={<RootRoute />} />
        <Route path='/enterprise/login' element={<EnterpriseLoginRoute />} />
        <Route path='/enterprise' element={<EnterpriseProtectedLayout />}>
          <Route index element={<Navigate to='/enterprise/dashboard' replace />} />
          <Route path='dashboard' element={withRouteFallback(DashboardPage)} />
          <Route path='companies' element={withRouteFallback(CompanyListPage)} />
          <Route path='companies/:companyId' element={withRouteFallback(CompanyDetailPage)} />
          <Route path='products' element={withRouteFallback(ProductListPage)} />
          <Route path='products/:productId' element={withRouteFallback(ProductDetailPage)} />
          <Route path='projects' element={withRouteFallback(ProjectPage)} />
          <Route path='projects/:hpInfoId' element={withRouteFallback(ProjectDetailPage)} />
          <Route path='supply-demand' element={withRouteFallback(SupplyDemandListPage)} />
          <Route path='supply-demand/:typeId/:demandId' element={withRouteFallback(SupplyDemandDetailPage)} />
          <Route path='notifications' element={withRouteFallback(DesktopNotificationCenterPage)} />
          <Route path='version-update' element={withRouteFallback(VersionUpdatePage)} />
          <Route
            path='consultation'
            element={
              <EnterpriseConversationRoleRoute audience='customer'>
                {withRouteFallback(CustomerConsultationPage)}
              </EnterpriseConversationRoleRoute>
            }
          />
          <Route
            path='customer-service'
            element={
              <EnterpriseConversationRoleRoute audience='staff'>
                {withRouteFallback(CustomerServiceWorkbench)}
              </EnterpriseConversationRoleRoute>
            }
          />
          {ENTERPRISE_PLACEHOLDER_ROUTES.map(([path, titleKey, descriptionKey]) => (
            <Route
              key={path}
              path={path}
              element={<EnterprisePlaceholderPage titleKey={titleKey} descriptionKey={descriptionKey} />}
            />
          ))}
          <Route path='*' element={<Navigate to='/enterprise/dashboard' replace />} />
        </Route>
        <Route
          path='/login'
          element={status === 'authenticated' ? <Navigate to='/guid' replace /> : withRouteFallback(LoginPage)}
        />
        <Route element={<ProtectedLayout layout={layout} />}>
          <Route path='/guid' element={withRouteFallback(Guid)} />
          <Route path='/conversation/:id' element={withRouteFallback(Conversation)} />
          <Route
            path='/team/:id'
            element={TEAM_MODE_ENABLED ? withRouteFallback(TeamIndex) : <Navigate to='/guid' replace />}
          />
          <Route path='/settings/model' element={withRouteFallback(ModeSettings)} />
          <Route path='/settings/assistants' element={withRouteFallback(AssistantSettings)} />
          <Route path='/settings/agent' element={withRouteFallback(AgentSettings)} />
          <Route path='/settings/agent/:id/repair' element={withRouteFallback(AgentRepairPage)} />
          <Route path='/settings/capabilities' element={withRouteFallback(CapabilitiesSettings)} />
          <Route
            path='/settings/capabilities/skills/import-history'
            element={withRouteFallback(CapabilitiesSettings)}
          />
          {/* Legacy routes — redirect to the merged /settings/capabilities page */}
          <Route path='/settings/skills-hub' element={<Navigate to='/settings/capabilities?tab=skills' replace />} />
          <Route path='/settings/tools' element={<Navigate to='/settings/capabilities?tab=tools' replace />} />
          <Route path='/settings/appearance' element={withRouteFallback(AppearanceSettings)} />
          <Route path='/settings/display' element={<Navigate to='/settings/appearance' replace />} />
          <Route path='/settings/webui' element={withRouteFallback(WebuiSettings)} />
          <Route path='/settings/pet' element={withRouteFallback(PetSettings)} />
          <Route path='/settings/system' element={withRouteFallback(SystemSettings)} />
          <Route path='/settings/about' element={withRouteFallback(SystemSettings)} />
          <Route path='/settings/ext/:tabId' element={withRouteFallback(ExtensionSettingsPage)} />
          <Route path='/settings' element={<Navigate to='/settings/model' replace />} />
          <Route path='/test/components' element={withRouteFallback(ComponentsShowcase)} />
          <Route path='/scheduled' element={withRouteFallback(ScheduledTasksPage)} />
          <Route path='/scheduled/:job_id' element={withRouteFallback(TaskDetailPage)} />
        </Route>
        <Route path='*' element={<FallbackRoute />} />
      </Routes>
    </>
  );
};

const PanelRoute: React.FC<{ layout: React.ReactElement }> = ({ layout }) => (
  <HashRouter>
    <PanelRoutes layout={layout} />
  </HashRouter>
);

export default PanelRoute;
