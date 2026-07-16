import { BarChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { init, use, type EChartsCoreOption, type EChartsType } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import React, { useEffect, useRef, useState, type ReactNode } from 'react';

use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

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

/**
 * Owns one ECharts instance and keeps the source values available to screen readers.
 * A canvas failure is isolated to this chart so the surrounding enterprise page remains usable.
 */
const EnterpriseChart: React.FC<EnterpriseChartProps> = ({ ariaLabel, option, rows, fallback }) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    let chart: EChartsType;
    try {
      chart = init(element);
    } catch {
      setFailed(true);
      return;
    }

    chartRef.current = chart;
    const resize = () => chart.resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    if (observer) observer.observe(element);
    else window.addEventListener('resize', resize);

    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', resize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

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
