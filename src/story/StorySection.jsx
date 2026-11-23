import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { motion, useTransform, useMotionValueEvent } from 'framer-motion';
import { LATEST_RELEASE } from '../data/release';
import { CHAPTER_RANGES, BEATS, STORY_SCROLL_VH, FALLBACK_FADE_VH, anchorVh } from './story.config';
import { createStoryState } from './storyState';
import { hasWebGL } from './webgl';
import AlbumsOverlay from './AlbumsOverlay';
import { usePerformance } from '../context/PerformanceContext';
import './StorySection.css';

const StoryCanvas = lazy(() => import('./StoryCanvas'));

// The story canvas starts at the very top of the page and also draws the hero
// (Multi, the type, the dust): one renderer from the first frame to the end.
const StorySection = React.forwardRef(function StorySection({ storyVh, startAnimation = false }, ref) {
  const stateRef = useRef(null);
  if (!stateRef.current) stateRef.current = createStoryState();
  const slotRef = useRef(null);
  const { tier } = usePerformance();
  const [webgl] = useState(hasWebGL);

  useEffect(() => {
    stateRef.current.heroStart = startAnimation;
  }, [startAnimation]);

  const [turnStart] = CHAPTER_RANGES.turn;
  const [inA, inB] = BEATS.textIn;

  // --- DOM overlay timing (scroll-scrubbed, reversible): it lands as the camera catches the tile ---
  const overlayOpacity = useTransform(storyVh, [inA, inB, turnStart - 14, turnStart + 4], [0, 1, 1, 0]);
  const overlayY = useTransform(storyVh, [inA, inB + 3, turnStart - 14, turnStart + 4], [26, 0, 0, -18]);
  const titleBackX = useTransform(storyVh, [inA - 4, inB + 5, turnStart + 10], ['-4%', '0%', '-8%']);
  const titleFrontX = useTransform(storyVh, [inA + 2, inB + 8, turnStart + 10], ['5%', '0%', '10%']);
  const interactive = useTransform(storyVh, (v) => (v > inA + 10 && v < turnStart + 2 ? 'auto' : 'none'));

  // fallback (no WebGL): a plain cover in the slot
  const fallbackOpacity = useTransform(storyVh, [FALLBACK_FADE_VH[0], FALLBACK_FADE_VH[1]], [0, 1]);

  // Mini-player appears once the tile has flown past and stays for the rest of the page
  const [miniVisible, setMiniVisible] = useState(false);
  useMotionValueEvent(storyVh, 'change', (v) => {
    // ...but steps aside on the final screen so it never covers the footer
    const nearEnd = window.scrollY + window.innerHeight * 1.6 > document.documentElement.scrollHeight;
    // ...and while the album ring is on screen (it has its own titles bottom-left)
    const [albumsStart, albumsEnd] = CHAPTER_RANGES.albums;
    const onRing = v > albumsStart - 40 && v < albumsEnd;
    const show = v > turnStart + 30 && !nearEnd && !onRing;
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
        {/* anchors for the menu / SEO: the single and the discography live inside the story */}
        <span id="nowa-piosenka" className="story-anchor" style={{ top: `calc(${anchorVh('nowa-piosenka')} * 1vh)` }} />
        <span id="albumy" className="story-anchor" style={{ top: `calc(${anchorVh('dyskografia')} * 1vh)` }} />

        <div className="story-sticky">
          {webgl ? (
            <>
              {/* source of Multi + his matte (stacked); in-viewport non-zero opacity keeps the decoder at full FPS */}
              <video
                ref={(el) => {
                  stateRef.current.video = el;
                }}
                src="/hero-stacked.mp4"
                poster="/hero-poster-stacked.jpg"
                muted
                loop
                playsInline
                autoPlay
                preload="auto"
                className="hero-video-source"
                aria-hidden="true"
              />
              {/* the hero's entrance (was on the old hero canvas) */}
              <motion.div
                className="story-canvas-intro"
                initial={{ opacity: 0.01, scale: 1.08 }}
                animate={startAnimation ? { opacity: 1, scale: 1 } : { opacity: 0.01, scale: 1.08 }}
                transition={{ duration: 1.35, delay: 0.05, ease: [0.76, 0, 0.24, 1] }}
              >
                <Suspense fallback={null}>
                  <StoryCanvas storyVh={storyVh} state={stateRef} slotRef={slotRef} tier={tier} />
                </Suspense>
              </motion.div>
            </>
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

          {/* === S5: album ring === */}
          {webgl && <AlbumsOverlay storyVh={storyVh} />}
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
