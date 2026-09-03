import { describe, expect, it } from 'vitest';

import {
  buildCategoryDotOption,
  buildCategoryComparisonOption,
  buildDistributionBarOption,
  buildMaterialTreemapOption,
  buildRegionHeatOption,
} from '@/renderer/pages/enterprise/charts/projectChartOptions';

describe('enterprise project chart options', () => {
  it('sorts distribution values descending, limits them to eight and preserves the input', () => {
    const items = [
      { label: '沈阳', value: 12 },
      { label: '大连', value: 28 },
      { label: '鞍山', value: 8 },
      { label: '抚顺', value: 7 },
      { label: '本溪', value: 6 },
      { label: '丹东', value: 5 },
      { label: '锦州', value: 4 },
      { label: '营口', value: 3 },
      { label: '阜新', value: 2 },
    ];

    const option = buildDistributionBarOption(items, false);

    expect(option).toMatchObject({
      animation: true,
      tooltip: { renderMode: 'richText' },
      yAxis: { data: ['大连', '沈阳', '鞍山', '抚顺', '本溪', '丹东', '锦州', '营口'] },
      series: [{ type: 'bar', data: [28, 12, 8, 7, 6, 5, 4, 3] }],
    });
    expect(items[0]).toEqual({ label: '沈阳', value: 12 });
  });

  it('disables animation for reduced motion and returns null for empty distributions', () => {
    expect(buildDistributionBarOption([{ label: '沈阳', value: 12 }], true)).toMatchObject({ animation: false });
    expect(buildDistributionBarOption([], false)).toBeNull();
  });

  it('builds a two-series category comparison and returns null when no categories exist', () => {
    const option = buildCategoryComparisonOption(
      [
        { label: '装备', dimension: 'l1', projectCount: 40, materialNameCount: 12 },
        { label: '建材', dimension: 'l1', projectCount: 72, materialNameCount: 30 },
      ],
      false
    );

    expect(option).toMatchObject({
      tooltip: { renderMode: 'richText' },
      legend: { data: ['项目数', '材料数'] },
      yAxis: { data: ['建材', '装备'] },
      series: [
        { name: '项目数', type: 'bar', data: [72, 40] },
        { name: '材料数', type: 'bar', data: [30, 12] },
      ],
    });
    expect(buildCategoryComparisonOption([], false)).toBeNull();
  });

  it('uses a rich-text formatter that returns plain text rather than HTML markup', () => {
    const option = buildDistributionBarOption([{ label: '{danger|<img src=x>}', value: 12 }], false) as {
      tooltip: { formatter: (params: unknown) => string };
    };

    const formatted = option.tooltip.formatter([
      { axisValueLabel: '{danger|<img src=x>}', seriesName: '项目数', value: 12 },
    ]);

    expect(formatted).toContain('项目数: 12');
    expect(formatted).not.toMatch(/[{}]/);
    expect(formatted).not.toContain('<img');
  });

  it('builds the dashboard insight charts with distinct visual forms', () => {
    const distribution = [
      { label: '沈阳', value: 12 },
      { label: '大连', value: 28 },
      { label: '鞍山', value: 8 },
    ];
    const materials = [
      { label: '机油', value: 90 },
      { label: '润滑油', value: 80 },
      { label: '活性炭', value: 70 },
      { label: '水泥', value: 60 },
      { label: '柴油', value: 50 },
      { label: '氢氧化钠', value: 40 },
      { label: '天然气', value: 30 },
      { label: '盐酸', value: 20 },
      { label: '钢材', value: 10 },
    ];
    const categories = [
      { label: '装备', dimension: 'l1' as const, projectCount: 40, materialNameCount: 12 },
      { label: '建材', dimension: 'l1' as const, projectCount: 72, materialNameCount: 30 },
    ];

    expect(buildRegionHeatOption(distribution, false)).toMatchObject({
      yAxis: { data: ['大连', '沈阳', '鞍山'] },
      series: [
        {
          type: 'bar',
          data: [28, 12, 8],
        },
      ],
    });
    expect(buildMaterialTreemapOption(materials, false)).toMatchObject({
      series: [
        {
          type: 'treemap',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          data: [
            { name: '机油', value: 90 },
            { name: '润滑油', value: 80 },
            { name: '活性炭', value: 70 },
            { name: '水泥', value: 60 },
            { name: '柴油', value: 50 },
            { name: '氢氧化钠', value: 40 },
            { name: '天然气', value: 30 },
            { name: '盐酸', value: 20 },
          ],
        },
      ],
    });
    const categoryOption = buildCategoryDotOption(categories, false) as {
      legend: { data: string[] };
      yAxis: { data: string[] };
      series: Array<{
        name: string;
        type: string;
        data: Array<[number, string]>;
        label: { show: boolean; position: string; formatter: (parameter: { value?: unknown }) => string };
        labelLayout: { hideOverlap: boolean };
      }>;
    };

    expect(categoryOption).toMatchObject({
      legend: { data: ['项目数', '材料数'] },
      yAxis: { data: ['建材', '装备'] },
      series: [
        {
          name: '项目数',
          type: 'line',
          label: { show: true, position: 'top' },
          labelLayout: { hideOverlap: true },
          data: [
            [72, '建材'],
            [40, '装备'],
          ],
        },
        {
          name: '材料数',
          type: 'line',
          label: { show: true, position: 'bottom' },
          labelLayout: { hideOverlap: true },
          data: [
            [30, '建材'],
            [12, '装备'],
          ],
        },
      ],
    });
    expect(categoryOption.series[0].label.formatter({ value: [72, '建材'] })).toBe('72');
    expect(categoryOption.series[1].label.formatter({ value: [0, '装备'] })).toBe('0');
  });
});
