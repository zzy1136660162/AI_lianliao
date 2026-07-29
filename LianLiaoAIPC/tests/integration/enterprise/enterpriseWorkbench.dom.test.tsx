import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
import { loadProjectDetail } from '@/renderer/pages/enterprise/projects/projectData';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import type { EnterpriseRawBridge } from '@/renderer/services/enterprise/enterpriseClient';

const chartMocks = vi.hoisted(() => ({
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() })),
  use: vi.fn(),
}));

vi.mock('echarts/core', () => ({ init: chartMocks.init, use: chartMocks.use }));
vi.mock('echarts/charts', () => ({ BarChart: {} }));
vi.mock('echarts/components', () => ({ GridComponent: {}, LegendComponent: {}, TooltipComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

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
const RAW_PRIVATE_PROJECT_PHONE = '13800000000';
const PROJECT_ID = '93001';

const success = <T,>(data: T): EnterpriseIpcResult<T> => ({ ok: true, data });

const page = <T,>(list: T[], pageNum: number, pageSize: number) => ({
  list,
  pageNum,
  pageSize,
  pages: list.length ? 1 : 0,
  total: list.length,
});

// This workbench fake intentionally supports only routes exercised by the integration flow.
const throwUnsupportedRequest = (_request: EnterpriseRequest): never => {
  throw new Error('Unsupported enterprise fake operation');
};

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
  constructionUnit: PRIVATE_PROJECT_OWNER,
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

const demandSummary = {
  demandId: '-88001',
  typeId: 6,
  typeName: 'Packaging service',
  title: 'Integration packaging requirement',
  city: 'Shenyang',
  district: 'Hunnan',
  budget: 'Negotiable',
  summary: 'Public packaging cooperation requirement',
  publishedAt: '2026-07-20',
  status: 0,
  grabCount: 0,
  remainingGrabCount: 10,
  primaryTags: ['Carton', 'Printing'],
};

const responseFor = (request: EnterpriseRequest): EnterpriseResponse => {
  switch (request.operation) {
    case 'company.list': {
      expect(request.payload).toEqual({ keyword: 'Integration', pageNum: 1, pageSize: 5 });
      return {
        operation: request.operation,
        data: page([companySummary], request.payload.pageNum, request.payload.pageSize),
      };
    }
    case 'company.detail':
      expect(request.payload).toEqual({ companyId: companySummary.companyId });
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
    case 'product.list': {
      expect(request.payload).toEqual(
        request.payload.companyId
          ? { companyId: companySummary.companyId, pageNum: 1, pageSize: 12 }
          : { keyword: 'Integration', pageNum: 1, pageSize: 5 }
      );
      return {
        operation: request.operation,
        data: page([productSummary], request.payload.pageNum, request.payload.pageSize),
      };
    }
    case 'product.detail':
      expect(request.payload).toEqual({ productId: productSummary.productId });
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
    case 'project.list': {
      expect(request.payload).toEqual(
        request.payload.keyword ? { keyword: 'Integration', pageNum: 1, pageSize: 5 } : { pageNum: 1, pageSize: 20 }
      );
      return {
        operation: request.operation,
        data: page([projectSummary], request.payload.pageNum, request.payload.pageSize),
      };
    }
    case 'project.detail':
      expect(request.payload).toEqual({ hpInfoId: PROJECT_ID });
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
    case 'project.contactUnlock':
      return { operation: request.operation, data: { purchased: true, inserted: true } };
    case 'contact.acquire':
      return {
        operation: request.operation,
        data: {
          allowed: false,
          errType: 6,
          message: 'Integration quota exhausted',
          actionUrl: '',
        },
      };
    case 'demand.types':
      return {
        operation: request.operation,
        data: [{ typeId: demandSummary.typeId, typeName: demandSummary.typeName }],
      };
    case 'demand.list':
      return {
        operation: request.operation,
        data: page([demandSummary], request.payload.pageNum, request.payload.pageSize),
      };
    case 'demand.detail':
      return {
        operation: request.operation,
        data: {
          ...demandSummary,
          fields: [{ key: 'packingType', label: 'Packaging type', value: 'Carton', valueType: 'TEXT' }],
        },
      };
    case 'demand.contactStatus':
      return {
        operation: request.operation,
        data: {
          state: 'PAYMENT_REQUIRED',
          canAcquire: false,
          canUpgrade: true,
          contact: null,
        },
      };
    case 'demand.contactAcquire':
      return {
        operation: request.operation,
        data: {
          state: 'UNLOCKED',
          canAcquire: false,
          canUpgrade: false,
          contact: { contactPhone: PRIVATE_PROJECT_PHONE },
        },
      };
    case 'unified.suggest':
      return { operation: request.operation, data: ['Integration'] };
    case 'unified.search':
      return {
        operation: request.operation,
        data: {
          total: 2,
          pageNum: request.payload.pageNum,
          pageSize: request.payload.pageSize,
          items: [
            {
              resourceType: 'COMPANY',
              businessId: companySummary.companyId,
              title: companySummary.name,
              summary: companySummary.businessSummary,
              city: companySummary.city,
              district: companySummary.district,
              tags: [companySummary.industry],
            },
            {
              resourceType: 'PRODUCT',
              businessId: productSummary.productId,
              title: productSummary.name,
              summary: productSummary.summary,
              city: productSummary.city,
              district: productSummary.district,
              tags: [productSummary.industry],
            },
          ],
        },
      };
  }
  return throwUnsupportedRequest(request);
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

vi.mock('@/renderer/components/layout/WindowControls', () => ({ default: (): null => null }));

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
let originalElectronApiDescriptor: PropertyDescriptor | undefined;
let originalMatchMediaDescriptor: PropertyDescriptor | undefined;

const restoreWindowOwnProperty = (
  property: 'electronAPI' | 'matchMedia',
  descriptor: PropertyDescriptor | undefined
): void => {
  if (descriptor) {
    Object.defineProperty(window, property, descriptor);
    return;
  }
  Reflect.deleteProperty(window, property);
};

const activeSensitiveObservers = new Set<MutationObserver>();

const beginSensitiveDomAudit = (sensitiveValues: readonly string[]) => {
  const matchedSensitiveValues = new Set<string>();
  const scanValue = (value: string | null): void => {
    if (!value) return;
    for (const sensitiveValue of sensitiveValues) {
      if (value.includes(sensitiveValue)) matchedSensitiveValues.add(sensitiveValue);
    }
  };
  const scanNode = (node: Node): void => {
    scanValue(node instanceof Element ? node.outerHTML : node.textContent);
  };
  const captureRecords = (records: readonly MutationRecord[]): void => {
    for (const record of records) {
      if (record.type === 'characterData') {
        scanValue(record.oldValue);
        scanValue(record.target.textContent);
        continue;
      }
      if (record.type === 'attributes') {
        scanValue(record.oldValue);
        if (record.target instanceof Element) {
          scanValue(record.attributeName ? record.target.getAttribute(record.attributeName) : null);
          scanValue(record.target.outerHTML);
        }
        continue;
      }
      record.addedNodes.forEach(scanNode);
      record.removedNodes.forEach(scanNode);
    }
  };
  const observer = new MutationObserver(captureRecords);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    characterDataOldValue: true,
    attributes: true,
    attributeOldValue: true,
  });
  activeSensitiveObservers.add(observer);

  const assertNeverObserved = (container: HTMLElement): void => {
    captureRecords(observer.takeRecords());
    scanValue(container.outerHTML);
    for (const sensitiveValue of sensitiveValues) expect(matchedSensitiveValues).not.toContain(sensitiveValue);
  };

  return {
    assertNeverObserved,
    stop(container: HTMLElement): void {
      const pendingRecords = observer.takeRecords();
      observer.disconnect();
      activeSensitiveObservers.delete(observer);
      captureRecords(pendingRecords);
      scanValue(container.outerHTML);
      for (const sensitiveValue of sensitiveValues) expect(matchedSensitiveValues).not.toContain(sensitiveValue);
    },
  };
};

const expectSensitiveMutationDetected = (mutate: (host: HTMLElement, sensitiveValue: string) => void): void => {
  const sensitiveValue = 'transient-sensitive-value';
  const host = document.createElement('div');
  document.body.append(host);
  const audit = beginSensitiveDomAudit([sensitiveValue]);
  try {
    mutate(host, sensitiveValue);
    expect(() => audit.stop(host)).toThrow();
  } finally {
    activeSensitiveObservers.forEach((observer) => observer.disconnect());
    activeSensitiveObservers.clear();
    host.remove();
  }
};

describe('sensitive DOM audit helper', () => {
  it('detects text appended and synchronously cleared before the observer callback', () => {
    expectSensitiveMutationDetected((host, sensitiveValue) => {
      const transient = document.createElement('span');
      transient.textContent = sensitiveValue;
      host.append(transient);
      transient.textContent = '';
    });
  });

  it('detects a sensitive node appended and removed before the observer callback', () => {
    expectSensitiveMutationDetected((host, sensitiveValue) => {
      const transient = document.createElement('span');
      transient.textContent = sensitiveValue;
      host.append(transient);
      transient.remove();
    });
  });

  it('detects transient title, aria, and data attributes after they are deleted', () => {
    expectSensitiveMutationDetected((host, sensitiveValue) => {
      host.setAttribute('title', sensitiveValue);
      host.removeAttribute('title');
      host.setAttribute('aria-label', sensitiveValue);
      host.removeAttribute('aria-label');
      host.setAttribute('data-private-value', sensitiveValue);
      host.removeAttribute('data-private-value');
    });
  });
});

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
    originalElectronApiDescriptor = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as typeof window.matchMedia,
    });
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

  afterEach(() => {
    activeSensitiveObservers.forEach((observer) => observer.disconnect());
    activeSensitiveObservers.clear();
    cleanup();
  });

  afterAll(() => {
    restoreWindowOwnProperty('electronAPI', originalElectronApiDescriptor);
    restoreWindowOwnProperty('matchMedia', originalMatchMediaDescriptor);
    expect(Object.getOwnPropertyDescriptor(window, 'electronAPI')).toEqual(originalElectronApiDescriptor);
    expect(Object.getOwnPropertyDescriptor(window, 'matchMedia')).toEqual(originalMatchMediaDescriptor);
  });

  it('restores the session and completes the protected cross-page workflow before logout', async () => {
    const user = userEvent.setup();
    const sensitiveAudit = beginSensitiveDomAudit([
      AUTHENTICATED_USER.openId,
      PRIVATE_PROJECT_NAME,
      PRIVATE_PROJECT_OWNER,
      PRIVATE_PROJECT_PHONE,
      RAW_PRIVATE_PROJECT_PHONE,
    ]);
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
    sensitiveAudit.assertNeverObserved(container);

    await user.type(screen.getByRole('combobox', { name: 'enterprise.dashboard.search.ariaLabel' }), 'Integration');
    const companyOption = await screen.findByRole('option', { name: new RegExp(`^${COMPANY_NAME}`) });
    sensitiveAudit.assertNeverObserved(container);
    await user.click(companyOption);

    expect(await screen.findByRole('heading', { name: COMPANY_NAME }, { timeout: 5000 })).toBeVisible();
    sensitiveAudit.assertNeverObserved(container);
    await user.click(screen.getByRole('link', { name: new RegExp(PRODUCT_NAME) }));
    expect(await screen.findByRole('heading', { name: PRODUCT_NAME }, { timeout: 5000 })).toBeVisible();
    sensitiveAudit.assertNeverObserved(container);

    await user.click(screen.getByRole('link', { name: 'enterprise.navigation.projects' }));
    const viewProjectDetails = await screen.findByRole(
      'button',
      { name: 'enterprise.projects.actions.viewDetails' },
      { timeout: 20_000 }
    );
    sensitiveAudit.assertNeverObserved(container);
    await user.click(viewProjectDetails);
    await waitFor(
      () =>
        expect(screen.getByRole('heading', { name: /^enterprise\.projectDetail\.lockedProjectTitle/ })).toBeVisible(),
      { timeout: 5000 }
    );

    sensitiveAudit.assertNeverObserved(container);
    expect(container).not.toHaveTextContent(PRIVATE_PROJECT_NAME);
    expect(container).not.toHaveTextContent(PRIVATE_PROJECT_OWNER);
    expect(container).not.toHaveTextContent(PRIVATE_PROJECT_PHONE);
    expect(container).not.toHaveTextContent(RAW_PRIVATE_PROJECT_PHONE);
    expect(container).not.toHaveTextContent(AUTHENTICATED_USER.openId);

    await user.click(screen.getByRole('button', { name: 'enterprise.shell.actions.logout' }));
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'current route' })).toHaveTextContent('/enterprise/login')
    );
    expect(rawBridge.clearSession).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('link', { name: 'open legacy guid' }));
    expect(await screen.findByRole('heading', { name: 'legacy-guid-route' }, { timeout: 5000 })).toBeVisible();
    expect(screen.getByRole('status', { name: 'current route' })).toHaveTextContent('/guid');
    sensitiveAudit.stop(container);
  }, 120_000);

  it('makes the fake bridge reject an unknown runtime operation instead of returning successful undefined data', async () => {
    const unsafeRequest = {
      operation: 'integration.unknown-operation',
      payload: {},
    } as unknown as EnterpriseRequest;

    await expect(rawBridge.request(unsafeRequest)).rejects.toThrow('Unsupported enterprise fake operation');
  });

  it('rejects an unmasked unpurchased project at the renderer final boundary without exposing its phone to DOM', async () => {
    vi.mocked(rawBridge.request).mockResolvedValueOnce(
      success<EnterpriseResponse>({
        operation: 'project.detail',
        data: {
          ...projectSummary,
          contactName: PRIVATE_PROJECT_OWNER,
          phone: RAW_PRIVATE_PROJECT_PHONE,
          purchased: false,
        },
      })
    );
    const sensitiveAudit = beginSensitiveDomAudit([RAW_PRIVATE_PROJECT_PHONE]);

    let failure: unknown;
    try {
      await loadProjectDetail(enterpriseClient, PROJECT_ID, new AbortController().signal);
    } catch (error: unknown) {
      failure = error;
    }

    sensitiveAudit.stop(document.body);
    expect(failure).toMatchObject({
      name: 'ProjectDataError',
      code: 'INVALID_RESPONSE',
      message: 'INVALID_RESPONSE',
    });
    expect(String(failure)).not.toContain(RAW_PRIVATE_PROJECT_PHONE);
    expect(document.body).not.toHaveTextContent(RAW_PRIVATE_PROJECT_PHONE);
  });
});
