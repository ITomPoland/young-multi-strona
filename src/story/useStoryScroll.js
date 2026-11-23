import { useEffect } from 'react';
import { useScroll, useTransform } from 'framer-motion';

// ---------------------------------------------------------------------
// Stable "1vh in px". CSS `vh` == large viewport on mobile, so it does NOT jump when the
// mobile URL bar shows/hides (window.innerHeight does). We measure a real 100vh element
// so JS and CSS scroll lengths always agree.
// ---------------------------------------------------------------------
export const viewportMetrics = { vhPx: typeof window !== 'undefined' ? window.innerHeight / 100 : 9 };

let probe = null;

function measure() {
  if (!probe) return;
  const h = probe.getBoundingClientRect().height;
  if (h > 0) viewportMetrics.vhPx = h / 100;
}

function ensureProbe() {
  if (probe || typeof document === 'undefined') return;
  probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:100vh;visibility:hidden;pointer-events:none;z-index:-1;';
  document.body.appendChild(probe);
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('orientationchange', measure);
}

export function useViewportProbe() {
  useEffect(() => {
    ensureProbe();
  }, []);
}

// Scroll position expressed in story-vh (story starts at the top of the page)
export function scrollToStoryVh(scrollY) {
  return scrollY / Math.max(viewportMetrics.vhPx, 1);
}

export function storyVhToScroll(vh) {
  return vh * viewportMetrics.vhPx;
}

// MotionValue<number>: current scroll in story-vh. Cheap, no React re-renders.
export function useStoryVh() {
  useViewportProbe();
  const { scrollY } = useScroll();
  return useTransform(scrollY, (v) => scrollToStoryVh(v));
}
