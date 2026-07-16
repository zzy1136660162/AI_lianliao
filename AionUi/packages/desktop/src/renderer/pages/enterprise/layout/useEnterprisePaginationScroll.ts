import { useCallback, useRef } from 'react';

export const useEnterprisePaginationScroll = <T extends HTMLElement>() => {
  const targetRef = useRef<T>(null);
  const scrollToTarget = useCallback(() => {
    window.requestAnimationFrame(() => {
      const reducedMotion =
        typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      targetRef.current?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  }, []);

  return { targetRef, scrollToTarget };
};
