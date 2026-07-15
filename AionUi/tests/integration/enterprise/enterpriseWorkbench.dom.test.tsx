import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Outlet, useLocation } from 'react-router-dom';

import type {
  EnterpriseIpcResult,
  EnterpriseLoginPollResult,
  EnterpriseLoginSession,
  EnterpriseRequest,
  EnterpriseResponse,
  EnterpriseUserContext,
} from '@/common/enterprise/contracts';
import type { ElectronBridgeAPI } from '@/common/types/platform/electron';
import type { EnterpriseRawBridge } from '@/renderer/services/enterprise/enterpriseClient';

const AUTHENTICATED_USER: EnterpriseUserContext = {
  registered: true,
  openId: 'openid-private-integration-value',
  userId: 'user-71',
  userName: 'Integration User',
  companyId: 'company-71',
  companyName: 'Authenticated Holdings',
  companyLevel: 3,
  roleId: 'role-9',
};

const LOGIN_SESSION: EnterpriseLoginSession = {
  loginKey: 'login-key-after-logout',
  qrDataUrl: 'data:image/png;base64,cXItZml4dHVyZQ==',
  expiresAt: '2099-07-15T08:00:00.000Z',
  pollIntervalMs: 3000,
};

const COMPANY_NAME = 'Integration Precision Equipment';
const PRODUCT_NAME = 'Integration Industrial Pump';
const PRIVATE_PROJECT_NAME = 'Private Alpha Expansion Project';
const PRIVATE_PROJECT_OWNER = 'Private Project Owner';
const PRIVATE_PROJECT_PHONE = '138********';
const PROJECT_ID = '93001';

const success = <T,>(data: T): EnterpriseIpcResult<T> => ({ ok: true, data });

const page = <T,>(list: T[], pageNum: number, pageSize: number) => ({
  list,
  pageNum,
  pageSize,
  pages: list.length ? 1 : 0,
  total: list.length,
});

const companySummary = {
  companyId: '101',
  name: COMPANY_NAME,
  shortName: 'IPE',
  industry: 'Industrial equipment',
  province: 'Liaoning',
  city: 'Shenyang',
  district: 'Hunnan',
  address: 'Innovation Road',
  businessSummary: 'Precision equipment integration',
  updatedAt: '2026-07-15',
  legalRepresentative: 'Representative Chen',
  companyType: 'Manufacturing',
  companyLevel: 4,
  vip: true,
  establishedAt: '2012-03-08',
  collected: false,
} as const;

const productSummary = {
  productId: '202',
  name: PRODUCT_NAME,
  companyId: companySummary.companyId,
  summary: 'High-efficiency circulation pump',
  industry: 'Industrial equipment',
  companyName: COMPANY_NAME,
  companyIndustry: 'Equipment manufacturing',
  province: 'Liaoning',
  city: 'Shenyang',
  district: 'Hunnan',
  address: 'Innovation Road',
  contactName: 'Product Contact',
  phone: '024-8***9999',
  collected: false,
} as const;

const projectSummary = {
  hpInfoId: PROJECT_ID,
  projectName: PRIVATE_PROJECT_NAME,
  constructionUnit: 'Private Construction Unit',
  province: 'Liaoning',
  city: 'Dalian',
  totalInvestment: 56000,
  constructionNature: 'New build',
  investmentType: 'Enterprise investment',
  projectNature: 'Industrial upgrade',
  publishedAt: '2026-06-18',
  constructionPeriod: '2026-2028',
  materialMatch: 'Pump and valve demand',
  procurementSummary: 'Industrial pumps and control valves',
} as const;

const responseFor = (request: EnterpriseRequest): EnterpriseResponse => {
  switch (request.operation) {
    case 'company.list':
      return {
        operation: request.operation,
        data: page([companySummary], request.payload.pageNum, request.payload.pageSize),
      };
    case 'company.detail':
      return {
        operation: request.operation,
        data: {
          ...companySummary,
          description: 'A verified integration fixture company.',
          unifiedSocialCreditCode: '91210100TESTFIXTURE',
          contactName: 'Company Contact',
          contactTitle: 'Sales Director',
          phone: '024-8***8888',
        },
      };
    case 'product.list':
      return {
        operation: request.operation,
        data: page([productSummary], request.payload.pageNum, request.payload.pageSize),
      };
    case 'product.detail':
      return { operation: request.operation, data: productSummary };
    case 'project.dashboard':
      return {
        operation: request.operation,
        data: {
          runId: 'run-integration-1',
          updatedAt: '2026-07-15T08:00:00.000Z',
          projectCount: 12,
          categoryL1Count: 3,
          categoryL2Count: 7,
          materialShortNameCount: 9,
          materialNameCount: 18,
          investmentTotalYi: 8.6,
          regionDistribution: [{ label: 'Dalian', value: 7, projectCount: 7 }],
          budgetDistribution: [],
          categoryDistribution: [],
          materialTop: [{ label: 'Industrial pumps', value: 5, projectCount: 5 }],
        },
      };
    case 'project.drill':
      return {
        operation: request.operation,
        data: [{ label: 'Equipment', dimension: 'l1', categoryL1: 'Equipment', projectCount: 12 }],
      };
    case 'project.list':
      return {
        operation: request.operation,
        data: page([projectSummary], request.payload.pageNum, request.payload.pageSize),
      };
    case 'project.detail':
      return {
        operation: request.operation,
        data: {
          ...projectSummary,
          contactName: PRIVATE_PROJECT_OWNER,
          phone: PRIVATE_PROJECT_PHONE,
          email: 'private-project@example.invalid',
          address: 'Private project address',
          industry: 'Advanced manufacturing',
          landArea: '120000 square metres',
          buildingArea: '80000 square metres',
          greenArea: '12000 square metres',
          constructionScale: 'Three production workshops',
          equipment: 'Automated production equipment',
          materials: 'Industrial pumps and valves',
          projectComposition: 'Production and supporting facilities',
          sourceUrl: 'https://example.invalid/project/93001',
          collected: false,
          followStatus: 'NONE',
          purchased: false,
        },
      };
  }
};

const rawBridge: EnterpriseRawBridge = {
  createLoginSession: vi.fn(async () => success<EnterpriseLoginSession>(LOGIN_SESSION)),
  pollLoginSession: vi.fn(async () => success<EnterpriseLoginPollResult>({ status: 'WAITING' })),
  completeRegistration: vi.fn(async () => success<EnterpriseUserContext>(AUTHENTICATED_USER)),
  restoreSession: vi.fn(async () => success<EnterpriseUserContext | null>(AUTHENTICATED_USER)),
  clearSession: vi.fn(async () => success<void>(undefined)),
  request: vi.fn(async (request) => success<EnterpriseResponse>(responseFor(request))),
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${Object.values(values).join(',')}` : key),
  }),
}));

vi.mock('@/renderer/components/layout/WindowControls', () => ({ default: () => null }));

// The legacy guide owns a separate, deeply integrated AI workspace. This test verifies
// that the production route remains reachable without re-testing the guide itself.
vi.mock('@/renderer/pages/guid', () => ({
  default: () => <h1>legacy-guid-route</h1>,
}));

type AuthProviderComponent = (typeof import('@/renderer/hooks/context/AuthContext'))['AuthProvider'];
type EnterpriseAuthProviderComponent =
  (typeof import('@/renderer/hooks/context/EnterpriseAuthContext'))['EnterpriseAuthProvider'];
type PanelRoutesComponent = (typeof import('@/renderer/components/layout/Router'))['PanelRoutes'];

let AuthProvider: AuthProviderComponent;
let EnterpriseAuthProvider: EnterpriseAuthProviderComponent;
let PanelRoutes: PanelRoutesComponent;

const RouteProbe: React.FC = () => {
  const location = useLocation();
  return (
    <aside aria-label='integration route probe'>
      <output aria-label='current route'>{location.pathname}</output>
      <Link to='/guid'>open legacy guid</Link>
    </aside>
  );
};

describe('enterprise desktop core workbench', () => {
  beforeAll(async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: { enterprise: rawBridge } as unknown as ElectronBridgeAPI,
    });
    const [authModule, enterpriseAuthModule, routerModule] = await Promise.all([
      import('@/renderer/hooks/context/AuthContext'),
      import('@/renderer/hooks/context/EnterpriseAuthContext'),
      import('@/renderer/components/layout/Router'),
    ]);
    AuthProvider = authModule.AuthProvider;
    EnterpriseAuthProvider = enterpriseAuthModule.EnterpriseAuthProvider;
    PanelRoutes = routerModule.PanelRoutes;
  });

  beforeEach(() => {
    vi.mocked(rawBridge.createLoginSession).mockClear();
    vi.mocked(rawBridge.pollLoginSession).mockClear();
    vi.mocked(rawBridge.completeRegistration).mockClear();
    vi.mocked(rawBridge.restoreSession).mockClear();
    vi.mocked(rawBridge.clearSession).mockClear();
    vi.mocked(rawBridge.request).mockClear();
  });

  afterEach(() => cleanup());

  afterAll(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  it('restores the session and completes the protected cross-page workflow before logout', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <EnterpriseAuthProvider>
            <RouteProbe />
            <PanelRoutes layout={<Outlet />} />
          </EnterpriseAuthProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', { name: 'enterprise.routes.dashboard.title' }, { timeout: 5000 })
    ).toBeVisible();
    expect(rawBridge.restoreSession).toHaveBeenCalledTimes(1);

    await user.type(screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' }), 'Integration');
    const searchResults = await screen.findByRole('listbox', {
      name: 'enterprise.dashboard.search.resultsLabel',
    });
    const companyGroup = within(searchResults).getByRole('group', {
      name: 'enterprise.dashboard.search.groups.companies',
    });
    await user.click(within(companyGroup).getByRole('option', { name: new RegExp(`^${COMPANY_NAME}`) }));

    expect(await screen.findByRole('heading', { name: COMPANY_NAME }, { timeout: 5000 })).toBeVisible();
    await user.click(screen.getByRole('link', { name: new RegExp(PRODUCT_NAME) }));
    expect(await screen.findByRole('heading', { name: PRODUCT_NAME }, { timeout: 5000 })).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'enterprise.navigation.projects' }));
    await user.click(
      await screen.findByRole('button', { name: 'enterprise.projects.actions.viewDetails' }, { timeout: 5000 })
    );
    await waitFor(
      () =>
        expect(screen.getByRole('heading', { name: /^enterprise\.projectDetail\.lockedProjectTitle/ })).toBeVisible(),
      { timeout: 5000 }
    );

    expect(container).not.toHaveTextContent(PRIVATE_PROJECT_NAME);
    expect(container).not.toHaveTextContent(PRIVATE_PROJECT_OWNER);
    expect(container).not.toHaveTextContent(PRIVATE_PROJECT_PHONE);
    expect(container).not.toHaveTextContent(AUTHENTICATED_USER.openId);

    await user.click(screen.getByRole('button', { name: 'enterprise.shell.actions.logout' }));
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'current route' })).toHaveTextContent('/enterprise/login')
    );
    expect(rawBridge.clearSession).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('link', { name: 'open legacy guid' }));
    expect(await screen.findByRole('heading', { name: 'legacy-guid-route' }, { timeout: 5000 })).toBeVisible();
    expect(screen.getByRole('status', { name: 'current route' })).toHaveTextContent('/guid');
  }, 30_000);
});
