import { describe, expect, it, vi } from 'vitest';

import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import {
  SupplyDemandDataError,
  buildDemandListQuery,
  loadDemandDetail,
  loadDemandList,
  loadDemandTypes,
  parseDemandRouteParams,
  parseSafeDemandImageUrls,
} from '@/renderer/pages/enterprise/supplyDemand/supplyDemandData';
import {
  allowsCustomPublishOption,
  isPublishFieldVisible,
  serializePublishFieldValue,
} from '@/renderer/pages/enterprise/supplyDemand/Publish/publishFormMetadata';
import type { EnterpriseDemandPublishField } from '@/common/enterprise/contracts';

const createClient = (request: EnterpriseClient['request']): Pick<EnterpriseClient, 'request'> => ({ request });

describe('supply-demand data boundary', () => {
  it('normalizes list filters and keeps explicit pagination', () => {
    expect(
      buildDemandListQuery(
        {
          keyword: ' 精密加工 ',
          typeId: 0,
          city: ' 沈阳市 ',
          district: ' 铁西区 ',
          status: 0,
        },
        { pageNum: 2, pageSize: 20 }
      )
    ).toEqual({
      keyword: '精密加工',
      typeId: 0,
      city: '沈阳市',
      district: '铁西区',
      status: 0,
      pageNum: 2,
      pageSize: 20,
    });
  });

  it('rejects invalid list filters before any request can be created', () => {
    expect(() => buildDemandListQuery({}, { pageNum: 0, pageSize: 20 })).toThrowError(
      expect.objectContaining({ code: 'INVALID_FILTER' })
    );
  });

  it('loads the exact demand list operation and page', async () => {
    const response = {
      operation: 'demand.list' as const,
      data: {
        list: [
          {
            demandId: '9007199254740993',
            typeId: 0,
            typeName: '机加外包',
            title: '精密零件加工',
            companyName: '辽宁装备制造有限公司',
            city: '沈阳市',
            district: '铁西区',
            primaryTags: ['车削', '铝合金'],
            status: 0,
            grabCount: 1,
          },
        ],
        pageNum: 1,
        pageSize: 20,
        pages: 1,
        total: 1,
      },
    };
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue(response);
    const query = buildDemandListQuery({}, { pageNum: 1, pageSize: 20 });

    const result = await loadDemandList(createClient(request), query, new AbortController().signal);

    expect(result).toEqual({
      ...response.data,
      list: response.data.list.map(({ companyName: _companyName, ...item }) => item),
    });
    expect(result.list[0]).not.toHaveProperty('companyName');
    expect(request).toHaveBeenCalledWith({ operation: 'demand.list', payload: query });
  });

  it('rejects malformed list records from an injected client', async () => {
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({
      operation: 'demand.list',
      data: {
        list: [{ demandId: '101', typeId: 0, title: '缺少类型名' }],
        pageNum: 1,
        pageSize: 20,
        pages: 1,
        total: 1,
      },
    });

    const error = await loadDemandList(
      createClient(request),
      buildDemandListQuery({}, { pageNum: 1, pageSize: 20 }),
      new AbortController().signal
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SupplyDemandDataError);
    expect(error).toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('loads database-backed public demand types', async () => {
    const data = [
      { typeId: 0, typeName: '机加外包' },
      { typeId: 6, typeName: '包装服务' },
    ];
    const request = vi.fn<EnterpriseClient['request']>().mockResolvedValue({ operation: 'demand.types', data });

    await expect(loadDemandTypes(createClient(request), new AbortController().signal)).resolves.toEqual(data);
    expect(request).toHaveBeenCalledWith({ operation: 'demand.types', payload: {} });
  });

  it('drops a list response that finishes after cancellation', async () => {
    const controller = new AbortController();
    const request = vi.fn<EnterpriseClient['request']>().mockImplementation(async () => {
      controller.abort();
      return {
        operation: 'demand.list',
        data: { list: [], pageNum: 1, pageSize: 20, pages: 0, total: 0 },
      };
    });

    await expect(
      loadDemandList(createClient(request), buildDemandListQuery({}, { pageNum: 1, pageSize: 20 }), controller.signal)
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('loads type-aware detail fields while preserving a signed string id', async () => {
    const detail = {
      demandId: '-800000000000000001',
      typeId: 6,
      typeName: '包装服务',
      title: '纸箱包装需求',
      primaryTags: [],
      fields: [
        { key: 'packingType', label: '包装类型', value: '纸箱', valueType: 'TEXT' },
        { key: 'budget', label: '预算', value: '5万元', valueType: 'TEXT', unit: '元' },
      ],
    };
    const request = vi
      .fn<EnterpriseClient['request']>()
      .mockResolvedValue({ operation: 'demand.detail', data: detail });

    await expect(
      loadDemandDetail(createClient(request), 6, '-800000000000000001', new AbortController().signal)
    ).resolves.toEqual(detail);
    expect(request).toHaveBeenCalledWith({
      operation: 'demand.detail',
      payload: { typeId: 6, demandId: '-800000000000000001' },
    });
  });

  it('keeps unique trusted demand images and rejects untrusted image values', () => {
    expect(
      parseSafeDemandImageUrls([
        {
          key: 'images',
          label: '产品图片',
          value:
            'http://www.lslnii.com/upload/NFSImgFile/appl/images/demand.jpg, https://evil.example/private.jpg, http://www.lslnii.com/upload/NFSImgFile/appl/images/demand.jpg',
          valueType: 'image',
        },
        { key: 'parameters', label: '产品参数', value: '车削', valueType: 'TEXT' },
      ])
    ).toEqual(['https://www.lslnii.com/upload/NFSImgFile/appl/images/demand.jpg']);
  });

  it.each([
    ['-1', '101'],
    ['type', '101'],
    ['0', '0'],
    ['0', '1 OR 1=1'],
    ['0', '101?phone=13800000000'],
  ])('rejects invalid route params type=%s id=%s before IO', (typeId, demandId) => {
    expect(() => parseDemandRouteParams(typeId, demandId)).toThrowError(
      expect.objectContaining({ code: 'INVALID_ROUTE' })
    );
  });
});

describe('supply-demand publish metadata', () => {
  const conditionalField: EnterpriseDemandPublishField = {
    fieldKey: 'otherIndustry',
    fieldLabel: '其他行业',
    inputType: 'TEXT',
    required: false,
    maxLength: 255,
    options: [],
    visibleWhenJson: '{"field":"industry","operator":"CONTAINS","value":"其他"}',
  };

  it('shows a conditional H5-compatible field only when its dependency contains the configured option', () => {
    expect(isPublishFieldVisible(conditionalField, { industry: ['装备制造', '其他'] })).toBe(true);
    expect(isPublishFieldVisible(conditionalField, { industry: ['装备制造'] })).toBe(false);
  });

  it('fails open for malformed display metadata while the server remains authoritative', () => {
    expect(
      isPublishFieldVisible({ ...conditionalField, visibleWhenJson: '{not-json' }, { industry: ['装备制造'] })
    ).toBe(true);
  });

  it('uses the dictionary-configured separator when serializing multiple H5 option values', () => {
    expect(
      serializePublishFieldValue({ ...conditionalField, inputType: 'MULTISELECT', valueSeparator: '、' }, [
        '纸制品',
        '木制品',
      ])
    ).toBe('纸制品、木制品');
  });

  it('enables a single custom option only when the generic control metadata allows it', () => {
    expect(allowsCustomPublishOption({ ...conditionalField, controlPropsJson: '{"allowCustom":true}' })).toBe(true);
    expect(allowsCustomPublishOption({ ...conditionalField, controlPropsJson: '{"allowCustom":false}' })).toBe(false);
  });
});
