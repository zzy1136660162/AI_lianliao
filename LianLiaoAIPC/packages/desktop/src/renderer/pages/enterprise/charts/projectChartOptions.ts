import type { EChartsCoreOption } from 'echarts/core';

import type { EnterpriseDashboardDistributionItem, EnterpriseProjectDrillItem } from '@/common/enterprise/contracts';

type TooltipParameter = {
  axisValueLabel?: unknown;
  name?: unknown;
  seriesName?: unknown;
  value?: unknown;
};

type LabelParameter = {
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

/** Line points use [count, category], so only the numeric dimension belongs in the visible label. */
const formatPointValue = (parameter: LabelParameter): string => {
  const value = Array.isArray(parameter.value) ? parameter.value[0] : parameter.value;
  return toPlainText(value);
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

const grid = {
  top: 18,
  right: 24,
  bottom: 28,
  left: 18,
  outerBoundsMode: 'same' as const,
  outerBoundsContain: 'axisLabel' as const,
};

const sortedDistribution = (items: EnterpriseDashboardDistributionItem[]) =>
  items.toSorted((left, right) => right.value - left.value).slice(0, CHART_ITEM_LIMIT);

const sortedCategories = (items: EnterpriseProjectDrillItem[]) =>
  items.toSorted((left, right) => right.projectCount - left.projectCount).slice(0, CHART_ITEM_LIMIT);

export const buildDistributionBarOption = (
  items: EnterpriseDashboardDistributionItem[],
  reducedMotion: boolean
): EChartsCoreOption | null => {
  if (!items.length) return null;
  const sorted = sortedDistribution(items);

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
  const sorted = sortedCategories(items);

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

/** Compact horizontal bars keep the regional ranking readable in the narrow workbench card. */
export const buildRegionHeatOption = (
  items: EnterpriseDashboardDistributionItem[],
  reducedMotion: boolean
): EChartsCoreOption | null => {
  if (!items.length) return null;
  const sorted = sortedDistribution(items).slice(0, 5);

  return {
    animation: !reducedMotion,
    color: [PRIMARY_COLOR],
    tooltip,
    grid: { top: 8, right: 42, bottom: 24, left: 14, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: {
      type: 'value',
      min: 0,
      axisLabel: { color: '#667085', fontSize: 10 },
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#edf1f7' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: sorted.map((item) => item.label),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: '#344054', width: 70, overflow: 'truncate', fontSize: 10 },
    },
    series: [
      {
        name: '项目数',
        type: 'bar',
        data: sorted.map((item) => item.value),
        barMaxWidth: 12,
        label: { show: true, position: 'right', color: '#1677ff', fontSize: 9 },
        itemStyle: { borderRadius: [0, 5, 5, 0] },
      },
    ],
  };
};

/** Area makes the purchasing-material composition readable without repeating another bar chart. */
export const buildMaterialTreemapOption = (
  items: EnterpriseDashboardDistributionItem[],
  reducedMotion: boolean
): EChartsCoreOption | null => {
  if (!items.length) return null;
  const sorted = sortedDistribution(items).slice(0, 8);

  return {
    animation: !reducedMotion,
    color: ['#1677ff', '#2f8ff3', '#1aa6d9', '#28b9b0', '#49c7a8', '#7ad2b3', '#a4dac2', '#c7e6d4'],
    tooltip: { ...tooltip, trigger: 'item' },
    series: [
      {
        name: '数量',
        type: 'treemap',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: {
          show: true,
          color: '#ffffff',
          fontSize: 9,
          lineHeight: 11,
          overflow: 'truncate',
          formatter: '{b}\n{c}',
        },
        upperLabel: { show: false },
        itemStyle: { borderColor: '#ffffff', borderWidth: 2, gapWidth: 2 },
        data: sorted.map((item) => ({ name: item.label, value: item.value })),
      },
    ],
  };
};

/** Each metric connects vertically across categories so its trend remains visually continuous. */
export const buildCategoryDotOption = (
  items: EnterpriseProjectDrillItem[],
  reducedMotion: boolean
): EChartsCoreOption | null => {
  if (!items.length) return null;
  const sorted = sortedCategories(items).slice(0, 5);

  return {
    animation: !reducedMotion,
    color: [PRIMARY_COLOR, SECONDARY_COLOR],
    tooltip,
    legend: {
      data: ['项目数', '材料数'],
      top: 0,
      right: 0,
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: '#667085', fontSize: 10 },
    },
    grid: { top: 30, right: 28, bottom: 24, left: 14, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: {
      type: 'value',
      min: 0,
      minInterval: 1,
      axisLabel: { color: '#667085', fontSize: 10 },
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#edf1f7' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: sorted.map((item) => item.label),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: '#344054', width: 88, overflow: 'truncate', fontSize: 10 },
    },
    series: [
      {
        name: '项目数',
        type: 'line',
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 9,
        data: sorted.map((item) => [item.projectCount, item.label]),
        lineStyle: { color: PRIMARY_COLOR, width: 2 },
        itemStyle: { color: PRIMARY_COLOR },
        label: {
          show: true,
          position: 'top',
          distance: 4,
          color: PRIMARY_COLOR,
          fontSize: 9,
          formatter: formatPointValue,
        },
        labelLayout: { hideOverlap: true },
        z: 2,
      },
      {
        name: '材料数',
        type: 'line',
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 9,
        data: sorted.map((item) => [item.materialNameCount ?? 0, item.label]),
        lineStyle: { color: SECONDARY_COLOR, width: 2 },
        itemStyle: { color: SECONDARY_COLOR },
        label: {
          show: true,
          position: 'bottom',
          distance: 4,
          color: SECONDARY_COLOR,
          fontSize: 9,
          formatter: formatPointValue,
        },
        labelLayout: { hideOverlap: true },
        z: 2,
      },
    ],
  };
};
