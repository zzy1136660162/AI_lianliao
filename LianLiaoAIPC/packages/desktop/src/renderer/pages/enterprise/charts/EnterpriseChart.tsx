import { BarChart, LineChart, ScatterChart, TreemapChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { init, use, type EChartsCoreOption, type EChartsType } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import React, { useEffect, useRef, useState, type ReactNode } from 'react';

use([
  BarChart,
  LineChart,
  ScatterChart,
  TreemapChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export type EnterpriseChartRow = {
  label: string;
  value: string | number;
};

export type EnterpriseChartProps = {
  ariaLabel: string;
  option: EChartsCoreOption;
  rows: EnterpriseChartRow[];
  fallback: ReactNode;
};

const disposeSafely = (chart: EChartsType) => {
  try {
    chart.dispose();
  } catch {
    // A renderer can be only partially initialized when Canvas is unavailable.
    // The chart has already failed locally, so disposal must not break the page.
  }
};

/**
 * Owns one ECharts instance and keeps the source values available to screen readers.
 * A canvas failure is isolated to this chart so the surrounding enterprise page remains usable.
 */
const EnterpriseChart: React.FC<EnterpriseChartProps> = ({ ariaLabel, option, rows, fallback }) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (failed) return;
    const element = elementRef.current;
    if (!element) return;

    let active = true;
    let chart: EChartsType;
    try {
      chart = init(element);
    } catch {
      setFailed(true);
      return;
    }

    chartRef.current = chart;
    const resize = () => {
      try {
        chart.resize();
      } catch {
        if (!active) return;
        if (chartRef.current === chart) chartRef.current = null;
        disposeSafely(chart);
        setFailed(true);
      }
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    if (observer) observer.observe(element);
    else window.addEventListener('resize', resize);

    return () => {
      active = false;
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', resize);
      if (chartRef.current === chart) {
        chartRef.current = null;
        disposeSafely(chart);
      }
    };
  }, [failed]);

  useEffect(() => {
    if (failed) return;
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.setOption(option, { notMerge: true });
    } catch {
      chartRef.current = null;
      disposeSafely(chart);
      setFailed(true);
    }
  }, [failed, option]);

  const dataTable = (
    <table className='enterprise-chart__data' aria-label={`${ariaLabel} data`}>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.label}-${index}`}>
            <th scope='row'>{row.label}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (failed) {
    return (
      <>
        <div role='status'>{fallback}</div>
        {dataTable}
      </>
    );
  }

  return (
    <>
      <div ref={elementRef} className='enterprise-chart' role='img' aria-label={ariaLabel} />
      {dataTable}
    </>
  );
};

export default EnterpriseChart;
