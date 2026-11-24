import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useTransform } from 'framer-motion';
import { ABOUT } from './story.config';

// =====================================================================
// S6 hold: "O MNIE" as the read-out of the scan that just ran down Multi's head, which stays
// in the middle of the screen; the read-out goes round it.
//  - the scan finishes: "SKAN ZAKOŃCZONY", the name decodes character by character
//  - three chapters, one at a time (left): a sentence whose words light up with the scroll
//    (key words in the studio's turquoise). Meanwhile the head's dots pour into a shape about
//    the chapter (Studio: ABOUT.morph): a game pad, a vinyl, the YFL logo
//  - on the right, the index of the chapters (the one on now lit) and what the dots form
//  - the numbers, decoding like the name, as the dots come back together as the head
// Everything is scrubbed by the scroll (reversible). Copy: the facts from the old About
// section, in the third person (this is a fan site).
// =====================================================================

const CHAPTERS = [
  {
    index: '01',
    title: 'POCZĄTEK',
    meta: 'GŁUBCZYCE · YOUTUBE',
    form: 'PAD',
    words: [
      'Chłopak z', ['Głubczyc,'], 'który zaczynał od gier. Ksywkę dał mu kanał', ['MultiGameplayGuy'],
      '— jeden z większych gamingowych na polskim YouTube.'
    ]
  },
  {
    index: '02',
    title: 'NOWA FALA',
    meta: '2017 · OLiS #1',
    form: 'WINYL',
    words: [
      'W 2017 debiut', ['„Nowa Fala”'], 'wskoczył prosto na', ['1. miejsce OLiS.'],
      'Skok z YouTube’a do trapu podzielił ludzi. Zrobił swoje.'
    ]
  },
  {
    index: '03',
    title: 'YOUNG FAMILY',
    meta: 'YFL · OD ZERA',
    form: 'YFL',
    words: [
      'Zaczynał sam: zero kontaktów, mikrofon i internet. Dziś prowadzi', ['Young Family Label'],
      'i otworzył drzwi kolejnym twórcom z YouTube’a.'
    ]
  }
];

const STATS = [
  ['4', 'ALBUMY'],
  ['2X', '1. MIEJSCE OLiS'],
  ['2X', 'PLATYNA'],
  ['2017', 'DEBIUT']
];

const GLYPHS = 'ABCDEFGHIJKLMNOPRSTUWXYZ0123456789#/<>*+=';
const clamp01 = (v) => Math.min(Math.max(v, 0), 1);

// text that decodes as `progress` (0..1, a function of the scroll) grows: resolved from the
// left, the rest cycling through glyphs (written straight to the DOM, no re-render)
function Scramble({ storyVh, range, text, className }) {
  const ref = useRef(null);
  const p = useRef(0);
  const draw = (t) => {
    const el = ref.current;
    if (!el) return;
    const n = text.length;
    const done = Math.floor(clamp01(p.current) * (n + 4)) - 4;
    let out = '';
    for (let i = 0; i < n; i++) {
      const c = text[i];
      if (c === ' ' || i < done) out += c;
      else if (i < done + 6 && p.current > 0) out += GLYPHS[(Math.floor(t / 55) * 7 + i * 13) % GLYPHS.length];
      else out += ' ';
    }
    el.textContent = out;
  };
  useMotionValueEvent(storyVh, 'change', (v) => {
    p.current = (v - range[0]) / (range[1] - range[0]);
    draw(performance.now());
  });
  // keep the glyphs cycling while it is half decoded and the page rests
  useEffect(() => {
    let raf;
    const loop = (t) => {
      if (p.current > 0 && p.current < 1) draw(t);
      raf = requestAnimationFrame(loop);
    };
    p.current = (storyVh.get() - range[0]) / (range[1] - range[0]);
    draw(performance.now());
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <span ref={ref} className={className} aria-label={text}>
      {' '}
    </span>
  );
}

// one word that lights up between a and b (story-vh)
function Word({ storyVh, a, b, hl, children }) {
  const opacity = useTransform(storyVh, [a, b], [0.13, 1]);
  return (
    <motion.span className={`about-word${hl ? ' is-key' : ''}`} style={{ opacity }}>
      {children}
    </motion.span>
  );
}

function Chapter({ storyVh, chapter, range }) {
  const [a, b] = range;
  const opacity = useTransform(storyVh, [a - 2, a + 8, b - 12, b - 2], [0, 1, 1, 0]);
  const y = useTransform(storyVh, [a - 2, a + 10, b - 12, b - 2], [36, 0, 0, -28]);
  // the words: split, each with its slot in the sweep (keys a little slower)
  const tokens = [];
  chapter.words.forEach((part) => {
    const key = Array.isArray(part);
    (key ? part[0] : part).split(' ').forEach((w) => w && tokens.push({ w, key }));
  });
  const sweep = [a + 4, a + 40];
  const step = (sweep[1] - sweep[0]) / tokens.length;
  return (
    <motion.article className="about-chapter" style={{ opacity, y }}>
      <header className="about-chapter-head">
        <span className="about-index">{chapter.index}</span>
        <span className="about-rule" aria-hidden="true" />
        <span className="about-chapter-title">{chapter.title}</span>
        <span className="about-meta">{chapter.meta}</span>
      </header>
      <p className="about-text">
        {tokens.map((t, i) => (
          <React.Fragment key={i}>
            <Word storyVh={storyVh} a={sweep[0] + i * step} b={sweep[0] + i * step + step * 5} hl={t.key}>
              {t.w}
            </Word>{' '}
          </React.Fragment>
        ))}
      </p>
    </motion.article>
  );
}

export default function AboutOverlay({ storyVh }) {
  const rootOpacity = useTransform(storyVh, [ABOUT.intro[0], ABOUT.intro[0] + 8, ABOUT.out[0], ABOUT.out[1]], [0, 1, 1, 0]);
  const introOpacity = useTransform(storyVh, [ABOUT.intro[0], ABOUT.intro[0] + 6], [0, 1]);
  const nameY = useTransform(storyVh, [ABOUT.intro[0], ABOUT.intro[1]], [24, 0]);
  const statsOpacity = useTransform(storyVh, [ABOUT.stats[0] - 4, ABOUT.stats[0] + 6], [0, 1]);
  const statsY = useTransform(storyVh, [ABOUT.stats[0] - 4, ABOUT.stats[0] + 8], [30, 0]);
  const hudOpacity = useTransform(storyVh, [ABOUT.chapters[0][0] - 10, ABOUT.chapters[0][0] + 4], [0, 1]);
  const [active, setActive] = useState(() => ABOUT.chapterAt(storyVh.get()));
  const [done, setDone] = useState(false);
  useMotionValueEvent(storyVh, 'change', (v) => {
    const c = ABOUT.chapterAt(v);
    setActive((prev) => (prev === c ? prev : c));
    const d = v >= ABOUT.stats[0];
    setDone((prev) => (prev === d ? prev : d));
  });

  return (
    <motion.section className="story-about" style={{ opacity: rootOpacity }} aria-labelledby="about-heading">
      <h2 id="about-heading" className="story-sr-only">
        O mnie: Young Multi
      </h2>

      <div className="about-col">
        <motion.div className="about-intro" style={{ opacity: introOpacity }}>
          <span className="about-kicker">
            <span className="about-blink" aria-hidden="true" />
            SKAN ZAKOŃCZONY · <Scramble storyVh={storyVh} range={ABOUT.intro} text="100%" />
          </span>
          <motion.div style={{ y: nameY }}>
            <Scramble storyVh={storyVh} range={ABOUT.intro} text="MICHAŁ RYCHLIK" className="about-realname" />
            <Scramble storyVh={storyVh} range={[ABOUT.intro[0] + 4, ABOUT.intro[1] + 8]} text="YOUNG MULTI" className="about-name" />
          </motion.div>
        </motion.div>

        <div className="about-chapters">
          {CHAPTERS.map((c, i) => (
            <Chapter key={c.index} storyVh={storyVh} chapter={c} range={ABOUT.chapters[i]} />
          ))}
          <motion.div className="about-stats" style={{ opacity: statsOpacity, y: statsY }}>
            {STATS.map(([n, label], i) => (
              <div className="about-stat" key={label}>
                <Scramble storyVh={storyVh} range={[ABOUT.stats[0] + i * 3, ABOUT.stats[1] + i * 3]} text={n} className="about-stat-n" />
                <span className="about-stat-label">{label}</span>
              </div>
            ))}
            <p className="about-next">
              <span className="about-rule" aria-hidden="true" />
              NASTĘPNIE: LOST MEDIA · 11.12.2026
            </p>
          </motion.div>
        </div>
      </div>

      {/* the index (wide screens): the chapters, the one on now lit, and what the dots form */}
      <motion.aside className="about-hud" style={{ opacity: hudOpacity }} aria-hidden="true">
        <div className="about-hud-head">
          <span>O MNIE</span>
          <span className="about-hud-count">{String(Math.max(active, done ? 2 : 0) + 1).padStart(2, '0')} / 03</span>
        </div>
        <ol className="about-hud-list">
          {CHAPTERS.map((c, i) => (
            <li key={c.index} className={`about-hud-item${i === active ? ' is-on' : ''}${i < active || done ? ' is-past' : ''}`}>
              <span className="about-hud-index">{c.index}</span>
              <span className="about-hud-bar" />
              <span className="about-hud-title">{c.title}</span>
            </li>
          ))}
        </ol>
        <div className="about-hud-form">
          <span className="about-hud-form-label">FORMA</span>
          <span key={active + (done ? 9 : 0)} className="about-hud-form-value">
            {active >= 0 ? CHAPTERS[active].form : 'MICHAŁ'}
          </span>
        </div>
      </motion.aside>
    </motion.section>
  );
}
