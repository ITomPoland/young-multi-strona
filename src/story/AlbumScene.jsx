import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { LATEST_RELEASE } from '../data/release';

// =====================================================================
// THE ALBUM SCENE (DOM half). The 3D cover has flown onto the view and dissolved into the
// dither behind this; here the tracklist runs in a BARREL: an endless-feeling vertical
// column bent round a horizontal cylinder. The bend follows the scroll speed: flat at
// rest, a barrel when you scroll fast. It arrives fully bent, with doubled gaps, and
// relaxes into place. Titles resolve out of glitch glyphs (the same "signal lock" as the
// panels). The page scroll is locked while it is open; the wheel / touch / arrows drive it.
// =====================================================================

const GLYPHS = '▓▒░█▚▞#%&@$/<>=*+';
const HIDDEN = '▒▒▒▒▒▒▒▒▒▒▒▒';

// text that resolves left to right out of glyphs; `live` keeps it scrambling (hidden tracks)
function useScramble(text, delay = 0, live = false) {
  const [out, setOut] = useState(() => text.replace(/\S/g, ' '));
  useEffect(() => {
    let raf;
    const start = performance.now() + delay;
    const dur = 380 + text.length * 22;
    const tick = (now) => {
      const t = live ? 0 : Math.min(Math.max((now - start) / dur, 0), 1);
      const solved = Math.floor(t * text.length);
      let s = '';
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === ' ') s += ' ';
        else if (i < solved) s += c;
        else if (now < start) s += ' ';
        else s += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      setOut(s);
      if (live || t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, delay, live]);
  return out;
}

function Scramble({ text, delay, live, className }) {
  const s = useScramble(text, delay, live);
  return (
    <span className={className} aria-hidden="true">
      {s}
    </span>
  );
}

// distance between two tracks on the barrel: the tallest track (with its feat. line) + air
function itemStep(items) {
  let h = 0;
  for (const el of items) if (el) h = Math.max(h, el.offsetHeight);
  return (h || 80) * 1.22;
}

function splitFeat(title) {
  const m = title.match(/^(.*?)\s*(\((?:feat|ft)\..*\))$/i);
  return m ? [m[1], m[2]] : [title, ''];
}

export default function AlbumScene({ album, tint, onClose }) {
  const rootRef = useRef(null);
  const closeRef = useRef(null);
  const itemsRef = useRef([]);
  const target = useRef(0);
  const [active, setActive] = useState(0);
  const count = album.tracklist.length;

  // --- the barrel ---
  useEffect(() => {
    const items = itemsRef.current;
    let raf;
    let last = performance.now();
    let pos = 0;
    let prev = 0;
    let vel = 0;
    let curve = 1.25; // arrives fully bent...
    let gap = 2.0; // ...with doubled gaps
    let fade = 0;
    let shownActive = 0;
    const R = () => Math.max(window.innerHeight * 0.42, 260);
    const step = () => itemStep(items);

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const H = step();
      const max = (count - 1) * H;
      target.current = Math.min(Math.max(target.current, 0), max);
      pos += (target.current - pos) * (1 - Math.exp(-dt * 8));
      vel += ((pos - prev) / Math.max(dt, 1e-3) - vel) * (1 - Math.exp(-dt * 10));
      prev = pos;
      const relax = 1 - Math.exp(-dt * 2.6);
      const want = Math.min(Math.abs(vel) / (H * 9), 1) * 0.95;
      curve += (Math.max(want, 0.04) - curve) * (want > curve ? 1 - Math.exp(-dt * 10) : relax);
      gap += (1 - gap) * relax;
      fade += (1 - fade) * (1 - Math.exp(-dt * 4));
      const Rb = R() / Math.max(curve, 1e-3);
      for (let i = 0; i < items.length; i++) {
        const el = items[i];
        if (!el) continue;
        const y = i * H * gap - pos;
        const a = y / Rb;
        const ty = Rb * Math.sin(a);
        const tz = -Rb * (1 - Math.cos(a));
        const vis = Math.abs(a) < Math.PI / 2 ? Math.cos(a) : 0;
        const band = Math.max(0, 1 - Math.abs(ty) / (window.innerHeight * 0.55));
        el.style.transform = `translate3d(0, ${ty.toFixed(1)}px, ${tz.toFixed(1)}px) rotateX(${(-a).toFixed(4)}rad)`;
        el.style.opacity = (fade * vis * (0.25 + 0.75 * band)).toFixed(3);
      }
      const a = Math.round(pos / H);
      if (a !== shownActive) {
        shownActive = a;
        setActive(a);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [count]);

  // --- input: wheel / touch / keys drive the barrel; Esc closes ---
  useEffect(() => {
    const el = rootRef.current;
    const H = () => itemStep(itemsRef.current);
    const onWheel = (e) => {
      e.preventDefault();
      target.current += e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
    };
    let ty = null;
    const onTouchStart = (e) => {
      ty = e.touches[0].clientY;
    };
    const onTouchMove = (e) => {
      if (ty === null) return;
      e.preventDefault();
      const y = e.touches[0].clientY;
      target.current += (ty - y) * 1.4;
      ty = y;
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown' || e.key === 'PageDown') target.current += H();
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') target.current -= H();
      else return;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const shown = album.tracklist.filter(Boolean).length;

  return (
    <motion.div
      ref={rootRef}
      className={`album-scene${album.upcoming ? ' is-upcoming' : ''}`}
      style={{ '--album-tint': tint }}
      data-lenis-prevent
      role="dialog"
      aria-modal="true"
      aria-label={`${album.title}: tracklista`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.5, delay: 0.25 } }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
    >
      <div className="album-scene-top">
        <span>DYSKOGRAFIA · {album.year}</span>
        <button ref={closeRef} type="button" className="album-scene-close" onClick={onClose}>
          ZAMKNIJ <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div className="album-scene-info">
        <span className="album-scene-kicker">{album.upcoming ? `PREMIERA ${album.year}` : `ALBUM · ${album.year}`}</span>
        <h3 className="album-scene-title">
          <span className="story-sr-only">{album.title}</span>
          <Scramble text={album.title} delay={350} />
        </h3>
        <p className="album-scene-note">{album.note}</p>
        <span className="album-scene-meta">
          {album.upcoming ? `${shown} / ${count} UTWORÓW ODSŁONIĘTYCH` : `${count} WYBRANYCH UTWORÓW`}
        </span>
      </div>

      <ol className="album-scene-barrel" aria-label="Tracklista">
        {album.tracklist.map((track, i) => {
          const [name, feat] = track ? splitFeat(track) : ['', ''];
          const isLink = album.upcoming && i === 0;
          const Tag = isLink ? 'a' : 'div';
          const linkProps = isLink ? { href: LATEST_RELEASE.smartLink, target: '_blank', rel: 'noopener noreferrer' } : {};
          return (
            <li
              key={i}
              ref={(el) => {
                itemsRef.current[i] = el;
              }}
              className={`album-track${i === active ? ' is-active' : ''}${track ? '' : ' is-hidden'}`}
            >
              <Tag className="album-track-inner" {...linkProps}>
                <span className="album-track-no">{String(i + 1).padStart(2, '0')}</span>
                {track ? (
                  <span className="album-track-name">
                    <span className="story-sr-only">{track}</span>
                    <Scramble text={name.toUpperCase()} delay={520 + i * 110} />
                    {feat && <span className="album-track-feat" aria-hidden="true">{feat.toUpperCase()}</span>}
                    {isLink && <span className="album-track-cue" aria-hidden="true">POSŁUCHAJ ↗</span>}
                  </span>
                ) : (
                  <span className="album-track-name">
                    <span className="story-sr-only">Utwór jeszcze nieodsłonięty</span>
                    <Scramble text={HIDDEN} live />
                    <span className="album-track-feat" aria-hidden="true">11.12.2026</span>
                  </span>
                )}
              </Tag>
            </li>
          );
        })}
      </ol>

      <div className="album-scene-hint" aria-hidden="true">
        SCROLL ↕ · ESC
      </div>
    </motion.div>
  );
}
