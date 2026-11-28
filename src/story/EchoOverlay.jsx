import React, { useCallback, useEffect, useRef } from 'react';
import { motion, useMotionValueEvent, useTransform } from 'framer-motion';
import { ECHO } from './story.config';
import { isScrollLocked, shiftScroll } from '../lib/scrollLock';
import { storyVhToScroll } from './useStoryScroll';
import { TTX_ACTIONS, tvBarrel } from './tv/teletext';
import './EchoOverlay.css';

// =====================================================================
// S8: KONTAKT on the TV's teletext page (P100). The page itself is drawn into the CRT's glass
// (tv/TvRoom + tv/teletext); this layer only makes it usable: the pointer is mapped onto the
// glass (its corners on screen: state.tvGlass) and through the same fisheye as the shader
// (state.tvK) to a teletext cell, so hover and clicks land on the right line on any screen.
// A plain list carries the same contact for keyboards and screen readers. And the page loops:
// past ECHO.wrap it jumps back by ECHO.loop to the very same frame (an endless tape).
// =====================================================================

const LABELS = {
  booking: 'Booking i koncerty: booking@yfl.pl (kopiuj)',
  biznes: 'Biznes i współprace: biznes@yfl.pl (kopiuj)',
  ig: 'Instagram',
  yt: 'YouTube',
  sp: 'Spotify',
  shop: 'Sklep YFL'
};

// screen point -> (u, v) on the glass (0..1, v up), inverse of the bilinear corner patch
function glassUv(x, y, q) {
  const [x00, y00, x10, y10, x01, y01, x11, y11] = q;
  let u = 0.5;
  let v = 0.5;
  for (let i = 0; i < 8; i++) {
    const px = (1 - u) * (1 - v) * x00 + u * (1 - v) * x10 + (1 - u) * v * x01 + u * v * x11;
    const py = (1 - u) * (1 - v) * y00 + u * (1 - v) * y10 + (1 - u) * v * y01 + u * v * y11;
    const dxu = (1 - v) * (x10 - x00) + v * (x11 - x01);
    const dyu = (1 - v) * (y10 - y00) + v * (y11 - y01);
    const dxv = (1 - u) * (x01 - x00) + u * (x11 - x10);
    const dyv = (1 - u) * (y01 - y00) + u * (y11 - y10);
    const det = dxu * dyv - dxv * dyu;
    if (Math.abs(det) < 1e-6) break;
    const ex = x - px;
    const ey = y - py;
    u += (ex * dyv - ey * dxv) / det;
    v += (dxu * ey - dyu * ex) / det;
  }
  return [u, v];
}

// copy to the clipboard: the async API, else the old execCommand route (some browsers / iframes
// refuse the first); false only if both fail
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export default function EchoOverlay({ storyVh, state }) {
  const [h0, h1] = ECHO.hold;
  const active = useTransform(storyVh, (v) => (v > h0 - 4 && v < h1 + 2 ? 'auto' : 'none'));
  const layerRef = useRef(null);
  const wrapping = useRef(false);
  const copyTimer = useRef(0);

  // the endless tape: past the wrap point, the same frame sits `loop` higher up the page
  const onScroll = useCallback((v) => {
    if (v >= ECHO.wrap && !wrapping.current) {
      wrapping.current = true;
      shiftScroll(-storyVhToScroll(ECHO.loop));
      requestAnimationFrame(() => (wrapping.current = false));
    }
  }, []);
  useMotionValueEvent(storyVh, 'change', onScroll);

  // ...and the other way round: at the very top (the hero), scrolling up jumps forward by
  // `loop` to the very same frame at the end of the page and carries on backwards into the TV
  // (so the contact is one short scroll up from the start). Wheel, touch and the arrow keys;
  // not while the preloader runs or something holds the page.
  useEffect(() => {
    const atTop = () => window.scrollY <= 2;
    const ready = () => Boolean(state?.current?.heroStart) && !isScrollLocked();
    let lastWrap = 0;
    const wrapUp = () => {
      const now = performance.now();
      if (now - lastWrap < 600) return;
      lastWrap = now;
      shiftScroll(storyVhToScroll(ECHO.loop));
    };
    const onWheel = (e) => {
      if (e.deltaY < 0 && atTop() && ready()) wrapUp();
    };
    let touchY = null;
    const onTouchStart = (e) => {
      touchY = e.touches?.[0]?.clientY ?? null;
    };
    const onTouchMove = (e) => {
      const y = e.touches?.[0]?.clientY;
      if (touchY == null || y == null) return;
      // finger moving down at the top = trying to scroll up past the start
      if (y - touchY > 24 && atTop() && ready()) {
        touchY = y;
        wrapUp();
      }
    };
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.key === 'ArrowUp' || e.key === 'PageUp') && atTop() && ready()) wrapUp();
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
    };
  }, [state]);

  const actionAt = useCallback(
    (e) => {
      const s = state?.current;
      if (!s?.tvGlass || !s.ttxHit || Math.abs((s.tvChan ?? 0) - 1) > 0.05) return null;
      const rect = layerRef.current?.getBoundingClientRect();
      const [u, v] = glassUv(e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0), s.tvGlass);
      if (u < 0 || u > 1 || v < 0 || v > 1) return null;
      const [gu, gv] = tvBarrel(u, v, s.tvK ?? 0);
      if (gu < 0 || gu > 1 || gv < 0 || gv > 1) return null;
      return s.ttxHit(gu, 1 - gv);
    },
    [state]
  );

  const run = useCallback(
    async (id) => {
      const a = TTX_ACTIONS[id];
      const s = state?.current;
      if (!a) return;
      if (a.href) {
        window.open(a.href, '_blank', 'noopener,noreferrer');
        return;
      }
      if (await copyText(a.copy)) {
        if (s?.ttx) s.ttx.copied = id;
        clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => {
          if (s?.ttx?.copied === id) s.ttx.copied = null;
        }, 2200);
      } else {
        window.location.href = `mailto:${a.copy}`;
      }
    },
    [state]
  );

  // the hover is re-checked every frame (the picture can move under a still pointer)
  const lastPt = useRef(null);
  const setHover = useCallback(
    (pt) => {
      const id = pt ? actionAt(pt) : null;
      const s = state?.current;
      if (s?.ttx && s.ttx.hover !== id) s.ttx.hover = id;
      const el = layerRef.current;
      if (el) {
        el.style.cursor = id ? 'pointer' : '';
        el.classList.toggle('interactive', Boolean(id));
      }
    },
    [actionAt, state]
  );
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const v = storyVh.get();
      if (lastPt.current && v > h0 - 4 && v < h1 + 2) setHover(lastPt.current);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [storyVh, h0, h1, setHover]);

  const onMove = (e) => {
    lastPt.current = { clientX: e.clientX, clientY: e.clientY };
    const id = actionAt(e);
    const s = state?.current;
    if (s?.ttx) s.ttx.hover = id;
    const el = layerRef.current;
    if (el) {
      el.style.cursor = id ? 'pointer' : '';
      el.classList.toggle('interactive', Boolean(id)); // (the site's custom cursor grows on these)
    }
  };
  const onLeave = () => {
    lastPt.current = null;
    const s = state?.current;
    if (s?.ttx) s.ttx.hover = null;
    layerRef.current?.classList.remove('interactive');
  };
  const onClick = (e) => {
    const id = actionAt(e);
    if (id) run(id);
  };

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  return (
    <motion.div
      ref={layerRef}
      className="echo-overlay"
      style={{ pointerEvents: active }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onClick={onClick}
    >
      <motion.section className="echo-sr" aria-label="Kontakt" style={{ pointerEvents: active }}>
        <h2>Kontakt</h2>
        <ul>
          {Object.keys(LABELS).map((id) => (
            <li key={id}>
              {TTX_ACTIONS[id].href ? (
                <a href={TTX_ACTIONS[id].href} target="_blank" rel="noopener noreferrer">
                  {LABELS[id]}
                </a>
              ) : (
                <button type="button" onClick={() => run(id)}>
                  {LABELS[id]}
                </button>
              )}
            </li>
          ))}
        </ul>
      </motion.section>
    </motion.div>
  );
}
