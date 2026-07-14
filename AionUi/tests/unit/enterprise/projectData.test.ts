import { describe, expect, it, vi } from 'vitest';

import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import {
  ProjectDataError,
  buildDesensitizedProjectName,
  buildProjectListQuery,
  displayProjectName,
  loadProjectDashboard,
  loadProjectDetail,
  loadProjectList,
  parseProjectId,
} from '@/renderer/pages/enterprise/projects/projectData';

const createClient = (request: EnterpriseClient['request']): Pick<EnterpriseClient, 'request'> => ({ request });

const query = buildProjectListQuery(
  {
    keyword: ' factory ',
    categoryL1: ' Building ',
    categoryL2: ' Materials ',
    materialShortName: ' Cement ',
    materialName: ' P.O 42.5 ',
    province: ' Liaoning ',
    city: ' Shenyang ',
    minInvestment: 1000,
    maxInvestment: 8000,
  },
  { pageNum: 2, pageSize: 20 }
);

const project = {
  hpInfoId: '901',
  projectName: 'Factory expansion',
  constructionUnit: 'Acme Manufacturing',
  province: 'Liaoning',
  city: 'Shenyang',
  totalInvestment: 5000,
  constructionNature: 'New build',
  projectNature: 'Industrial',
  procurementSummary: '<strong>Steel and cement</strong>',
  publishedAt: '2026-06-20',
};

const projectPage = (overrides: Record<string, unknown> = {}) => ({
  operation: 'project.list' as const,
  data: {
    list: [project],
    pageNum: 2,
    pageSize: 20,
    pages: 3,
    total: 41,
    ...overrides,
  },
});

const dashboard = {
  runId: 'run-20260715',
  updatedAt: '2026-07-15',
  projectCount: 128,
  categoryL1Count: 6,
  categoryL2Count: 24,
  materialShortNameCount: 48,
  materialNameCount: 96,
  investmentTotalYi: 36.5,
  regionDistribution: [{ label: 'Shenyang', value: 80, projectCount: 80 }],
  budgetDistribution: [{ label: '10-50m', value: 30 }],
  categoryDistribution: [{ label: 'Building materials', value: 72 }],
  materialTop: [{ label: 'Cement', value: 42 }],
};

const expectCode = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ProjectDataError);
  expect(error).toMatchObject({ code });
};

const translateProjectName = (key: string, values?: Record<string, unknown>): string => {
  if (key === 'enterprise.projectDetail.locked.enterpriseInvestor') return '某企业投资';
  if (key === 'enterprise.projectDetail.locked.governmentInvestor') return '政府投资';
  if (key === 'enterprise.projectDetail.locked.defaultNature') return '新建';
  if (key === 'enterprise.projectDetail.lockedInvestment') return `${String(values?.value ?? '')}万元`;
  if (key === 'enterprise.projectDetail.lockedProjectTitle') {
    return `${String(values?.province ?? '')}${String(values?.investor ?? '')}${String(values?.investment ?? '')}${String(values?.nature ?? '')}项目`;
  }
  throw new Error(`Unexpected translation key: ${key}`);
};

describe('project display privacy', () => {
  it('builds the H5-compatible enterprise title without exposing the raw project or owner name', () => {
    const protectedName = buildDesensitizedProjectName(
      {
        ...project,
        projectName: '原始机密项目名',
        constructionUnit: '辽宁装备制造有限公司',
        province: '辽宁省',
        constructionNature: '扩建项目',
      },
      translateProjectName
    );

    expect(protectedName).toBe('辽宁省某企业投资5000万元扩建项目');
    expect(protectedName).not.toContain('原始机密项目名');
    expect(protectedName).not.toContain('辽宁装备制造有限公司');
  });

  it('defaults to a government-funded new-build title when safe source fields are absent', () => {
    expect(
      buildDesensitizedProjectName(
        {
          hpInfoId: '901',
          projectName: '不得展示的项目名',
          constructionUnit: '沈阳市发展和改革委员会',
          province: '辽宁省',
        },
        translateProjectName
      )
    ).toBe('辽宁省政府投资新建项目');
  });

  it('reveals the raw name only after the detail response explicitly confirms purchase', () => {
    expect(displayProjectName(project, true, translateProjectName)).toBe('Factory expansion');
    expect(displayProjectName(project, false, translateProjectName)).not.toContain('Factory expansion');
    expect(displayProjectName(project, undefined, translateProjectName)).not.toContain('Factory expansion');
  });
});

describe('project list boundary', () => {
  it('trims every supported filter and includes explicit investment bounds', () => {
    expect(query).toEqual({
      keyword: 'factory',
      categoryL1: 'Building',
      categoryL2: 'Materials',
      materialShortName: 'Cement',
      materialName: 'P.O 42.5',
      province: 'Liaoning',
      city: 'Shenyang',
      minInvestment: 1000,
      maxInvestment: 8000,
      pageNum: 2,
      pageSize: 20,
    });
  });

  it('loads only the matching project operation and exact page', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(projectPage());
    await expect(loadProjectList(createClient(request), query, new AbortController().signal)).resolves.toEqual(
      projectPage().data
    );
    expect(request).toHaveBeenCalledWith({ operation: 'project.list', payload: query });
  });

  it.each([
    ['wrong page', { list: [project], pageNum: 1, pageSize: 20, pages: 3, total: 41 }],
    ['invalid identity', { list: [{ ...project, hpInfoId: 'project-901' }] }],
    ['non-finite investment', { list: [{ ...project, totalInvestment: Number.POSITIVE_INFINITY }] }],
    ['unknown field', { list: [{ ...project, rawPhone: '13800000000' }] }],
  ])('rejects %s without creating fallback records', async (_name, data) => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({ operation: 'project.list', data });
    await expectCode(loadProjectList(createClient(request), query, new AbortController().signal), 'INVALID_RESPONSE');
  });

  it('does not invoke accessors in a project record', async () => {
    let reads = 0;
    const hostile = { ...project } as Record<string, unknown>;
    Object.defineProperty(hostile, 'projectName', {
      enumerable: true,
      get: () => {
        reads += 1;
        return 'secret';
      },
    });
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(projectPage({ list: [hostile] }));
    await expectCode(loadProjectList(createClient(request), query, new AbortController().signal), 'INVALID_RESPONSE');
    expect(reads).toBe(0);
  });
});

describe('project dashboard boundary', () => {
  it('loads the live dashboard then its top-level drill list with the returned run identity', async () => {
    const request = vi
      .fn<EnterpriseClient['request']>()
      .mockResolvedValueOnce({ operation: 'project.dashboard', data: dashboard })
      .mockResolvedValueOnce({
        operation: 'project.drill',
        data: [
          {
            label: 'Building materials',
            dimension: 'l1',
            categoryL1: 'Building materials',
            categoryL2Count: 4,
            materialNameCount: 22,
            projectCount: 72,
          },
        ],
      });

    await expect(loadProjectDashboard(createClient(request), new AbortController().signal)).resolves.toMatchObject({
      dashboard,
      drillItems: [{ label: 'Building materials', projectCount: 72 }],
    });
    expect(request).toHaveBeenNthCalledWith(1, { operation: 'project.dashboard', payload: {} });
    expect(request).toHaveBeenNthCalledWith(2, {
      operation: 'project.drill',
      payload: { level: 'l1', runId: 'run-20260715', minProjectCount: 1 },
    });
  });

  it.each([
    ['negative KPI', { ...dashboard, projectCount: -1 }],
    ['fractional count', { ...dashboard, materialNameCount: 1.5 }],
    ['non-finite investment', { ...dashboard, investmentTotalYi: Number.NaN }],
    ['malformed distribution', { ...dashboard, regionDistribution: [{ label: 'Shenyang', value: -1 }] }],
  ])('rejects a dashboard with %s', async (_name, data) => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'project.dashboard',
      data,
    });
    await expectCode(loadProjectDashboard(createClient(request), new AbortController().signal), 'INVALID_RESPONSE');
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('project detail boundary', () => {
  it.each(['', '0', '-1', '1.2', 'project-901', '901?phone=13800000000'])(
    'rejects invalid route identity %s before request',
    async (hpInfoId) => {
      const request = vi.fn<EnterpriseClient['request']>();
      expect(() => parseProjectId(hpInfoId)).toThrowError(ProjectDataError);
      await expectCode(
        loadProjectDetail(createClient(request), hpInfoId, new AbortController().signal),
        'INVALID_REQUEST'
      );
      expect(request).not.toHaveBeenCalled();
    }
  );

  it('accepts purchased detail fields as plain text', async () => {
    const detail = {
      ...project,
      contactName: 'Jane',
      phone: '13800000000',
      address: 'No. 8 Industry Road',
      constructionPeriod: '2026-2027',
      projectComposition: '<script>not executable</script>',
      equipment: 'Production line',
      materials: 'Steel',
      purchased: true,
    };
    const request = vi
      .fn<EnterpriseClient['request']>()
      .mockResolvedValue({ operation: 'project.detail', data: detail });
    await expect(loadProjectDetail(createClient(request), '901', new AbortController().signal)).resolves.toEqual(
      detail
    );
  });

  it('rejects a raw unpurchased phone even when an injected client bypasses the main bridge', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'project.detail',
      data: { ...project, phone: '13800000000', purchased: false },
    });
    await expectCode(loadProjectDetail(createClient(request), '901', new AbortController().signal), 'INVALID_RESPONSE');
  });
});
