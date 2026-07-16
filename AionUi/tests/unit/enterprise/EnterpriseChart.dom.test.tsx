import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import EnterpriseChart from '@/renderer/pages/enterprise/charts/EnterpriseChart';

const chartMocks = vi.hoisted(() => ({
  init: vi.fn(),
  use: vi.fn(),
  setOption: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('echarts/core', () => ({
  init: chartMocks.init,
  use: chartMocks.use,
}));
vi.mock('echarts/charts', () => ({ BarChart: {} }));
vi.mock('echarts/components', () => ({ GridComponent: {}, LegendComponent: {}, TooltipComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

const originalResizeObserver = globalThis.ResizeObserver;
let resizeObserverCallback: ResizeObserverCallback | undefined;
const observe = vi.fn();
const disconnect = vi.fn();

class ResizeObserverMock implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }

  observe = observe;
  unobserve = vi.fn();
  disconnect = disconnect;
}

describe('EnterpriseChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resizeObserverCallback = undefined;
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverMock,
    });
    chartMocks.init.mockReturnValue({
      setOption: chartMocks.setOption,
      resize: chartMocks.resize,
      dispose: chartMocks.dispose,
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: originalResizeObserver,
    });
  });

  it('initializes once, updates options, resizes and disposes with its container', () => {
    const firstOption = { series: [] };
    const nextOption = { series: [{ type: 'bar', data: [12] }] };
    const view = render(
      <EnterpriseChart
        ariaLabel='regions'
        option={firstOption}
        rows={[{ label: '沈阳', value: 12 }]}
        fallback='chart unavailable'
      />
    );

    const chartElement = screen.getByRole('img', { name: 'regions' });
    expect(chartMocks.init).toHaveBeenCalledWith(chartElement);
    expect(chartMocks.setOption).toHaveBeenLastCalledWith(firstOption, { notMerge: true });
    expect(observe).toHaveBeenCalledWith(chartElement);
    expect(screen.getByRole('table', { name: 'regions data' })).toHaveTextContent('沈阳12');

    view.rerender(
      <EnterpriseChart
        ariaLabel='regions'
        option={nextOption}
        rows={[{ label: '沈阳', value: 12 }]}
        fallback='chart unavailable'
      />
    );
    expect(chartMocks.init).toHaveBeenCalledTimes(1);
    expect(chartMocks.setOption).toHaveBeenLastCalledWith(nextOption, { notMerge: true });

    resizeObserverCallback?.([], {} as ResizeObserver);
    expect(chartMocks.resize).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(chartMocks.dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps accessible data and shows a local fallback when canvas initialization fails', async () => {
    chartMocks.init.mockImplementationOnce(() => {
      throw new Error('canvas unavailable');
    });

    render(
      <EnterpriseChart
        ariaLabel='regions'
        option={{ series: [] }}
        rows={[{ label: '沈阳', value: 12 }]}
        fallback='chart unavailable'
      />
    );

    expect(await screen.findByRole('status')).toHaveTextContent('chart unavailable');
    expect(screen.queryByRole('img', { name: 'regions' })).toBeNull();
    expect(screen.getByRole('table', { name: 'regions data' })).toHaveTextContent('沈阳12');
    expect(chartMocks.dispose).not.toHaveBeenCalled();
  });
});
