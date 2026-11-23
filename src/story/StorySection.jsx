import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { motion, useTransform, useMotionValueEvent } from 'framer-motion';
import { LATEST_RELEASE } from '../data/release';
import { CHAPTER_RANGES, STORY_SCROLL_VH, CANVAS_FADE_VH } from './story.config';
import { createStoryState } from './storyState';
import { usePerformance } from '../context/PerformanceContext';
import './StorySection.css';

const StoryCanvas = lazy(() => import('./StoryCanvas'));

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const StorySection = React.forwardRef(function StorySection({ storyVh }, ref) {
  const stateRef = useRef(null);
  if (!stateRef.current) stateRef.current = createStoryState();
  const slotRef = useRef(null);
  const { tier } = usePerformance();
  const [webgl] = useState(() => (typeof window === 'undefined' ? true : hasWebGL()));

  const [singleStart, singleEnd] = CHAPTER_RANGES.single;
  const [turnStart] = CHAPTER_RANGES.turn;
  const singleLen = singleEnd - singleStart;

  // --- DOM overlay timing (scroll-scrubbed, reversible) ---
  const at = (f) => singleStart + singleLen * f;
  const overlayOpacity = useTransform(storyVh, [at(0.28), at(0.4), at(0.9), turnStart + 4], [0, 1, 1, 0]);
  const overlayY = useTransform(storyVh, [at(0.28), at(0.42), at(0.9), turnStart + 4], [26, 0, 0, -18]);
  const titleBackX = useTransform(storyVh, [at(0.26), at(0.45), turnStart + 10], ['-4%', '0%', '-8%']);
  const titleFrontX = useTransform(storyVh, [at(0.3), at(0.48), turnStart + 10], ['5%', '0%', '10%']);
  const interactive = useTransform(storyVh, (v) => (v > at(0.34) && v < turnStart + 2 ? 'auto' : 'none'));

  // fallback (no WebGL): a plain cover in the slot
  const fallbackOpacity = useTransform(storyVh, [CANVAS_FADE_VH[0], CANVAS_FADE_VH[1]], [0, 1]);

  // Mini-player appears once the tile has flown past and stays for the rest of the page
  const [miniVisible, setMiniVisible] = useState(false);
  useMotionValueEvent(storyVh, 'change', (v) => {
    // ...but steps aside on the final screen so it never covers the footer
    const nearEnd = window.scrollY + window.innerHeight * 1.6 > document.documentElement.scrollHeight;
    const show = v > turnStart + 30 && !nearEnd;
    setMiniVisible((prev) => (prev === show ? prev : show));
  });

  useEffect(() => {
    document.documentElement.style.setProperty('--story-scroll-vh', String(STORY_SCROLL_VH));
  }, []);

  return (
    <>
      <section
        ref={ref}
        id="historia"
        className="story-section"
        data-header-theme="dark"
        style={{ height: `calc(${STORY_SCROLL_VH + 100} * 1vh)` }}
      >
        {/* anchor for the menu / SEO: the single lives inside the story */}
        <span id="nowa-piosenka" className="story-anchor" style={{ top: `calc(${at(0.5)} * 1vh)` }} />

        <div className="story-sticky">
          {webgl ? (
            <Suspense fallback={null}>
              <StoryCanvas storyVh={storyVh} state={stateRef} slotRef={slotRef} tier={tier} />
            </Suspense>
          ) : (
            <motion.div className="story-fallback-bg" style={{ opacity: fallbackOpacity }} />
          )}

          {/* === S3: the single (DOM = crisp, clickable, indexable) === */}
          <motion.div
            className="story-single"
            style={{ opacity: overlayOpacity, pointerEvents: interactive }}
          >
            <div className="story-single-grid">
              <motion.p className="story-title story-title--back" aria-hidden="true" style={{ x: titleBackX, y: overlayY }}>
                {LATEST_RELEASE.titleLine1}
              </motion.p>

              <a
                ref={slotRef}
                className="story-single-slot"
                href={LATEST_RELEASE.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Obejrzyj teledysk ${LATEST_RELEASE.artists} — ${LATEST_RELEASE.fullTitle} na YouTube`}
                onMouseEnter={() => (stateRef.current.hover = true)}
                onMouseLeave={() => (stateRef.current.hover = false)}
                onFocus={() => (stateRef.current.hover = true)}
                onBlur={() => (stateRef.current.hover = false)}
              >
                {!webgl && <img src={LATEST_RELEASE.coverSrc} alt="" className="story-slot-fallback" />}
                <span className="story-play-cue">
                  <span className="story-play-line" aria-hidden="true" />
                  OBEJRZYJ TELEDYSK
                  <span aria-hidden="true"> ↗</span>
                </span>
              </a>

              <motion.p className="story-title story-title--front" aria-hidden="true" style={{ x: titleFrontX }}>
                {LATEST_RELEASE.titleLine2}
              </motion.p>

              <motion.aside className="story-meta" style={{ y: overlayY }}>
                <h2 className="story-sr-only">
                  {LATEST_RELEASE.artists} — {LATEST_RELEASE.fullTitle}
                </h2>
                <div className="story-meta-group">
                  <span className="story-kicker">NOWY SINGIEL · {LATEST_RELEASE.releaseDate}</span>
                  <span className="story-artist">{LATEST_RELEASE.artists}</span>
                  <span className="story-credits">
                    {LATEST_RELEASE.album} ({LATEST_RELEASE.albumDate})
                  </span>
                  <span className="story-credits story-credits--muted">PROD. {LATEST_RELEASE.producers}</span>
                </div>
                <nav className="story-streams" aria-label="Platformy streamingowe">
                  {LATEST_RELEASE.platforms.map((p) => (
                    <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="story-stream">
                      <span>{p.name}</span>
                      <span className="story-stream-arrow" aria-hidden="true">↗</span>
                    </a>
                  ))}
                </nav>
              </motion.aside>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Mini-player: the single stays one tap away for the rest of the page */}
      <a
        className={`story-mini${miniVisible ? ' is-visible' : ''}`}
        href={LATEST_RELEASE.smartLink}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={miniVisible ? 0 : -1}
        aria-hidden={!miniVisible}
      >
        <span className="story-mini-cover" style={{ backgroundImage: `url(${LATEST_RELEASE.coverSrc})` }} />
        <span className="story-mini-text">
          <span className="story-mini-label">▶ NOWY SINGIEL</span>
          <span className="story-mini-title">{LATEST_RELEASE.fullTitle}</span>
        </span>
      </a>
    </>
  );
});

export default StorySection;
