import type { EChartsCoreOption } from 'echarts/core';

import type { EnterpriseDashboardDistributionItem, EnterpriseProjectDrillItem } from '@/common/enterprise/contracts';

type TooltipParameter = {
  axisValueLabel?: unknown;
  name?: unknown;
  seriesName?: unknown;
  value?: unknown;
};

const CHART_ITEM_LIMIT = 8;
const PRIMARY_COLOR = '#1677ff';
const SECONDARY_COLOR = '#36b7a5';

/** Removes markup-like tokens before values reach ECharts' rich-text parser. */
const toPlainText = (value: unknown): string =>
  String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replaceAll('{', '｛')
    .replaceAll('}', '｝')
    .replace(/[\r\n]+/g, ' ')
    .trim();

const tooltipValue = (value: unknown): string => {
  if (!Array.isArray(value)) return toPlainText(value);
  return value.map(toPlainText).filter(Boolean).join(', ');
};

/** Produces newline-separated text only; no HTML is passed to tooltip rendering. */
const formatAxisTooltip = (parameters: unknown): string => {
  const items = (Array.isArray(parameters) ? parameters : [parameters]).filter(
    (item): item is TooltipParameter => typeof item === 'object' && item !== null
  );
  if (!items.length) return '';

  const title = toPlainText(items[0].axisValueLabel ?? items[0].name);
  const lines = items.map((item) => {
    const seriesName = toPlainText(item.seriesName);
    const value = tooltipValue(item.value);
    return seriesName ? `${seriesName}: ${value}` : value;
  });
  return [title, ...lines].filter(Boolean).join('\n');
};

const tooltip = {
  trigger: 'axis' as const,
  renderMode: 'richText' as const,
  confine: true,
  formatter: formatAxisTooltip,
};

const grid = { top: 18, right: 24, bottom: 28, left: 18, containLabel: true };

export const buildDistributionBarOption = (
  items: EnterpriseDashboardDistributionItem[],
  reducedMotion: boolean
): EChartsCoreOption | null => {
  if (!items.length) return null;
  const sorted = items.toSorted((left, right) => right.value - left.value).slice(0, CHART_ITEM_LIMIT);

  return {
    animation: !reducedMotion,
    color: [PRIMARY_COLOR],
    tooltip,
    grid,
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: '#667085' },
      splitLine: { lineStyle: { color: '#edf1f7' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: sorted.map((item) => item.label),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: '#344054', width: 112, overflow: 'truncate' },
    },
    series: [
      {
        name: '数量',
        type: 'bar',
        data: sorted.map((item) => item.value),
        barMaxWidth: 18,
        itemStyle: { borderRadius: [0, 6, 6, 0] },
      },
    ],
  };
};

export const buildCategoryComparisonOption = (
  items: EnterpriseProjectDrillItem[],
  reducedMotion: boolean
): EChartsCoreOption | null => {
  if (!items.length) return null;
  const sorted = items.toSorted((left, right) => right.projectCount - left.projectCount).slice(0, CHART_ITEM_LIMIT);

  return {
    animation: !reducedMotion,
    color: [PRIMARY_COLOR, SECONDARY_COLOR],
    tooltip,
    legend: {
      data: ['项目数', '材料数'],
      top: 0,
      right: 0,
      textStyle: { color: '#667085' },
    },
    grid: { ...grid, top: 42 },
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: '#667085' },
      splitLine: { lineStyle: { color: '#edf1f7' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: sorted.map((item) => item.label),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: '#344054', width: 112, overflow: 'truncate' },
    },
    series: [
      {
        name: '项目数',
        type: 'bar',
        data: sorted.map((item) => item.projectCount),
        barMaxWidth: 14,
        itemStyle: { borderRadius: [0, 5, 5, 0] },
      },
      {
        name: '材料数',
        type: 'bar',
        data: sorted.map((item) => item.materialNameCount ?? 0),
        barMaxWidth: 14,
        itemStyle: { borderRadius: [0, 5, 5, 0] },
      },
    ],
  };
};
