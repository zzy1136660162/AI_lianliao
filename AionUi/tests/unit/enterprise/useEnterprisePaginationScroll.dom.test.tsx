import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEnterprisePaginationScroll } from '@/renderer/pages/enterprise/layout/useEnterprisePaginationScroll';

const requestAnimationFrameMock = vi.fn<(callback: FrameRequestCallback) => number>(() => 1);
const scrollIntoViewMock = vi.fn();
let reducedMotion = false;

const Probe = () => {
  const { targetRef, scrollToTarget } = useEnterprisePaginationScroll<HTMLDivElement>();

  return (
    <>
      <div ref={targetRef}>list-top</div>
      <button type='button' onClick={scrollToTarget}>
        page
      </button>
    </>
  );
};

describe('useEnterprisePaginationScroll', () => {
  beforeEach(() => {
    reducedMotion = false;
    requestAnimationFrameMock.mockClear();
    scrollIntoViewMock.mockClear();
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scrolls the list heading into view after the next animation frame', async () => {
    render(<Probe />);

    await userEvent.click(screen.getByRole('button', { name: 'page' }));

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);
    const callback = requestAnimationFrameMock.mock.calls[0]?.[0];
    expect(callback).toEqual(expect.any(Function));
    callback?.(0);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('avoids smooth animation when the user requests reduced motion', async () => {
    reducedMotion = true;
    render(<Probe />);

    await userEvent.click(screen.getByRole('button', { name: 'page' }));
    requestAnimationFrameMock.mock.calls[0]?.[0](0);

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });
});
