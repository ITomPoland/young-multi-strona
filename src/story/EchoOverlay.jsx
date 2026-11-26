import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useTransform } from 'framer-motion';
import { ECHO } from './story.config';
import { jumpTo, shiftScroll } from '../lib/scrollLock';
import { storyVhToScroll } from './useStoryScroll';
import './EchoOverlay.css';

// =====================================================================
// S8: KONTAKT. The CD's centre hole was a window onto the hero frame: the camera lands in it
// and Multi is standing there. The contact comes up as the VCR's on-screen menu; scrolling on,
// the tape rewinds and the menu scrambles into the YOUNG MULTI type. That frame is the first
// frame of the site, so the page loops: past ECHO.wrap it jumps back to the same frame and the
// film plays again (endless tape). PLAY does the same jump on demand.
// =====================================================================

const CHANNELS = [
  { id: 'booking', label: 'BOOKING · KONCERTY', value: 'BOOKING@YFL.PL', copy: 'booking@yfl.pl' },
  { id: 'biznes', label: 'BIZNES · WSPÓŁPRACE', value: 'BIZNES@YFL.PL', copy: 'biznes@yfl.pl' },
  { id: 'ig', label: 'INSTAGRAM', value: '@YOUNGMULTI', href: 'https://www.instagram.com/youngmulti/' },
  { id: 'yt', label: 'YOUTUBE', value: 'YOUNG MULTI', href: 'https://www.youtube.com/channel/UCiP6-9NHJ36BCxUWL-gNKYg' },
  { id: 'sp', label: 'SPOTIFY', value: 'YOUNG MULTI', href: 'https://open.spotify.com/artist/5CkZIA3WpaEFxp0wSjMzRI' },
  { id: 'shop', label: 'SKLEP', value: 'SKLEP.YFL.PL', href: 'https://sklep.yfl.pl/' },
  { id: 'play', label: 'PLAY', value: 'OD POCZĄTKU', play: true }
];

// the tape counter: the whole story is "track 21", 0:21:21 long; the morph rewinds it to 0:00:00
const TAPE_SECONDS = 21 * 60 + 21;
const fmt = (sec) => {
  const t = Math.max(0, Math.round(sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// The menu turning into the type: letter by letter the OSD text breaks into the letters of
// YOUNG MULTI and tape blocks. Deterministic per (row, letter, step): scrubbing back un-breaks it.
const GLYPHS = 'YOUNGMULTIYOUNGMULTI█▓▒░';
const hash = (a, b) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
function scramble(text, row, p, step) {
  if (p <= 0) return text;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ' || hash(row, i) > p * 1.35) {
      out += ch;
      continue;
    }
    out += GLYPHS[Math.floor(hash(row * 7 + i, step) * GLYPHS.length)];
  }
  return out;
}

export default function EchoOverlay({ storyVh }) {
  const [m0, m1] = ECHO.menu;
  const [g0, g1] = ECHO.morph;

  // in with the menu, out as it breaks into the type (gone well before the loop frame)
  const hudOpacity = useTransform(storyVh, [m0 - 4, m0 + 4, g1 - 16, g1 - 4], [0, 1, 1, 0]);
  const menuOpacity = useTransform(storyVh, [m0, m0 + 6, g0 + 18, g1 - 6], [0, 1, 1, 0]);
  const menuX = useTransform(storyVh, [g0, g1], [0, -24]);
  const creditsOpacity = useTransform(storyVh, [m1 - 6, m1 + 2, g0, g0 + 16], [0, 1, 1, 0]);
  const interactive = useTransform(storyVh, (v) => (v > m0 + 4 && v < g0 + 10 ? 'auto' : 'none'));

  const counterRef = useRef(null);
  const [mode, setMode] = useState('stop'); // stop | rew
  const [lines, setLines] = useState(0); // menu lines typed in so far
  const [mp, setMp] = useState(0); // morph progress, quantised (0..40)
  const [sel, setSel] = useState(0);
  const [copied, setCopied] = useState(null);
  const listRef = useRef(null);
  const wrapping = useRef(false);

  const update = useCallback(
    (v) => {
      // the endless tape: past the wrap point, the same frame sits `loop` higher up the page
      if (v >= ECHO.wrap && !wrapping.current) {
        wrapping.current = true;
        shiftScroll(-storyVhToScroll(ECHO.loop));
        requestAnimationFrame(() => (wrapping.current = false));
        return;
      }
      const p = smooth(g0, g1 - 8, v);
      if (counterRef.current) counterRef.current.textContent = fmt((1 - p) * TAPE_SECONDS);
      const next = v > g0 + 2 ? 'rew' : 'stop';
      setMode((o) => (o === next ? o : next));
      const q = Math.round(p * 40);
      setMp((o) => (o === q ? o : q));
      // the menu is typed line by line as you scroll in (and un-typed going back)
      const n = Math.max(0, Math.min(CHANNELS.length + 1, Math.floor(((v - m0) / (m1 - m0)) * (CHANNELS.length + 1) + 0.6)));
      setLines((o) => (o === n ? o : n));
    },
    [m0, m1, g0, g1]
  );
  useMotionValueEvent(storyVh, 'change', update);
  useEffect(() => update(storyVh.get()), [storyVh, update]);

  const activate = useCallback(async (c) => {
    if (c.play) {
      jumpTo(0);
      return;
    }
    if (c.copy) {
      try {
        await navigator.clipboard.writeText(c.copy);
        setCopied(c.id);
        setTimeout(() => setCopied((o) => (o === c.id ? null : o)), 2200);
      } catch {
        window.location.href = `mailto:${c.copy}`;
      }
    }
  }, []);

  // a real VCR menu: arrows move the cursor, Enter picks (only while focus is in the menu)
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = (sel + (e.key === 'ArrowDown' ? 1 : -1) + CHANNELS.length) % CHANNELS.length;
    setSel(next);
    listRef.current?.querySelectorAll('.echo-item')[next]?.focus();
  };

  const p = mp / 40;
  const step = mp;
  const year = new Date().getFullYear();
  // rows tear sideways a little as the tape runs back (VHS tracking)
  const tear = (row) => (p > 0 ? (hash(row, step) - 0.5) * 2 * Math.min(p * 3, 1) * (1 - p) : 0);

  return (
    <div className="echo-overlay">
      {/* --- VCR status: STOP (end of the tape) / REW + counter --- */}
      <motion.div className="echo-hud" style={{ opacity: hudOpacity }} aria-hidden="true">
        <span className={`echo-hud-mode is-${mode}`}>{mode === 'rew' ? '◀◀ REW' : '■ STOP'}</span>
        <span className="echo-hud-counter">
          <span className="echo-hud-ctr">CTR</span>
          <span ref={counterRef}>{fmt(TAPE_SECONDS)}</span>
        </span>
      </motion.div>

      {/* --- the menu: the contact --- */}
      <motion.section
        className="echo-menu"
        style={{ opacity: menuOpacity, x: menuX, pointerEvents: interactive }}
        aria-labelledby="echo-title"
      >
        <h2 id="echo-title" className={`echo-title${lines > 0 ? ' is-on' : ''}`} style={{ translate: `${tear(0) * 0.6}em 0` }}>
          <span className="echo-title-kicker">{scramble('TRACK 21 · HIDDEN TRACK', 1, p, step)}</span>
          <span aria-label="KONTAKT">{scramble('KONTAKT', 2, p, step)}</span>
        </h2>
        <ul className="echo-list" ref={listRef} onKeyDown={onKeyDown}>
          {CHANNELS.map((c, i) => {
            const on = lines > i + 1;
            const isSel = sel === i && p === 0;
            const row = i + 3;
            const value = copied === c.id ? 'SKOPIOWANO ✓' : c.value;
            const inner = (
              <>
                <span className="echo-cursor" aria-hidden="true">▶</span>
                <span className="echo-idx" aria-hidden="true">
                  {c.play ? '▶▶' : String(i + 1).padStart(2, '0')}
                </span>
                <span className="echo-label">{scramble(c.label, row, p, step)}</span>
                <span className="echo-dots" aria-hidden="true" />
                <span className="echo-value">
                  {scramble(value, row + 20, p, step)}
                  {c.href && <span aria-hidden="true"> ↗</span>}
                </span>
              </>
            );
            const common = {
              className: `echo-item${isSel ? ' is-sel' : ''}${c.play ? ' is-play' : ''}${copied === c.id ? ' is-copied' : ''}`,
              onMouseEnter: () => setSel(i),
              onFocus: () => setSel(i),
              tabIndex: on && p === 0 ? 0 : -1
            };
            return (
              <li key={c.id} className={`echo-row${on ? ' is-on' : ''}`} style={{ translate: `${tear(row)}em 0` }}>
                {c.href ? (
                  <a {...common} href={c.href} target="_blank" rel="noopener noreferrer" aria-label={`${c.label}: ${c.value} (nowa karta)`}>
                    {inner}
                  </a>
                ) : (
                  <button
                    type="button"
                    {...common}
                    onClick={() => activate(c)}
                    aria-label={c.play ? 'Odtwórz stronę od początku' : `Skopiuj adres ${c.copy}`}
                  >
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="echo-hint" aria-hidden="true">
          ▲▼ WYBIERZ · ENTER OK · MAIL = KOPIUJ · SCROLL = OD NOWA
        </p>
      </motion.section>

      {/* --- the camcorder stamp + credits --- */}
      <motion.footer className="echo-credits" style={{ opacity: creditsOpacity, pointerEvents: interactive }}>
        <span className="echo-stamp" aria-hidden="true">
          SP · LOST MEDIA · 11.12.2026
        </span>
        <span>© {year} YOUNG FAMILY LABEL</span>
      </motion.footer>
    </div>
  );
}
