import React, { useRef, forwardRef, useState, useEffect } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  useMotionTemplate,
  useSpring,
  useMotionValue
} from 'framer-motion';
import './NewSong.css';
import HeroWebGLTransition from '../Hero/HeroWebGLTransition';
import GlitchTearWebGL from './GlitchTearWebGL';
import Gramophone from '../Gramophone/Gramophone';
import About from '../About/About';
import SmokeTransition from '../SmokeTransition/SmokeTransition';

const LATEST_RELEASE = {
  titleLine1: 'ZA KAŻDYM',
  titleLine2: 'RA2EM',
  fullTitle: 'ZA KAŻDYM RA2EM',
  artists: 'YOUNG MULTI FT. JULA',
  album: 'LOST MEDIA',
  releaseDate: '19.11.2026',
  albumDate: '11.12.2026',
  producers: 'KUBI PRODUCENT & MARCELI',
  youtubeId: 'KMQQtlTJvMo',
  youtubeUrl: 'https://www.youtube.com/watch?v=KMQQtlTJvMo',
  smartLink: 'https://yfl.lnk.to/ZAKAZDYMRA2EM',
  platforms: [
    {
      id: 'spotify',
      name: 'SPOTIFY',
      url: 'https://yfl.lnk.to/ZAKAZDYMRA2EM',
      accent: '#1DB954'
    },
    {
      id: 'apple',
      name: 'APPLE MUSIC',
      url: 'https://music.apple.com/pl/album/za-ka%C5%BCdym-ra2em-single/1852927950',
      accent: '#FC3C44'
    },
    {
      id: 'ytmusic',
      name: 'YOUTUBE MUSIC',
      url: 'https://music.youtube.com/watch?v=KMQQtlTJvMo',
      accent: '#FF2020'
    },
    {
      id: 'tidal',
      name: 'TIDAL',
      url: 'https://yfl.lnk.to/ZAKAZDYMRA2EM',
      accent: '#00F0FF'
    }
  ]
};

const NewSong = forwardRef((props, ref) => {
  const scrollRef = useRef(null);
  const revealClipRef = useRef(null);
  const gramophoneLayerRef = useRef(null);
  const previousThemeRef = useRef(null);
  const [hoveredAccent, setHoveredAccent] = useState(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mouse parallax for kinetic brutalist typography & cinema viewport
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothMX = useSpring(mouseX, { stiffness: 90, damping: 22 });
  const smoothMY = useSpring(mouseY, { stiffness: 90, damping: 22 });

  const typeLeftX = useTransform(smoothMX, [-0.5, 0.5], [-18, 18]);
  const typeRightX = useTransform(smoothMX, [-0.5, 0.5], [18, -18]);
  const frameTiltX = useTransform(smoothMY, [-0.5, 0.5], [5, -5]);
  const frameTiltY = useTransform(smoothMX, [-0.5, 0.5], [-6, 6]);

  const handlePanelMouseMove = (e) => {
    if (isMobile) return;
    mouseX.set(e.clientX / window.innerWidth - 0.5);
    mouseY.set(e.clientY / window.innerHeight - 0.5);
  };

  // --- TIGHT, ZERO-DEAD-SCROLL TIMELINE (1250vh) ---
  // 0.000 -> 0.095 : Hero -> NewSong WebGL Liquid Chrome Portal
  // 0.095 -> 0.135 : Crisp breath on full ZA KAŻDYM RA2EM poster
  // 0.135 -> 0.255 : WebGL Lost Media VHS Rewind + -25deg Diagonal Glitch Tear -> Discography
  // 0.260 -> 0.560 : 4 Album Cards ScrollStack
  // 0.570 -> 0.740 : Option A: Cards Scatter + Rising Stage (About)
  // 0.840 -> 1.000 : SmokeTransition -> Merch
  const { scrollYProgress: contentProgress } = useScroll({
    target: scrollRef,
    offset: ['start start', 'end end']
  });

  useMotionValueEvent(contentProgress, 'change', (latest) => {
    if (typeof props.setHeaderTheme === 'function') {
      if (latest < 0.05) {
        previousThemeRef.current = null;
        return;
      }
      const newTheme = latest > 0.65 ? 'dark' : 'light';
      if (previousThemeRef.current !== newTheme) {
        previousThemeRef.current = newTheme;
        props.setHeaderTheme(newTheme);
      }
    }
  });

  // === 1. HERO -> NEWSONG WEBGL LIQUID PORTAL (0.00 -> 0.095) ===
  const webglRevealProgress = useTransform(contentProgress, [0.0, 0.095], [0, 1]);
  const viewportPointerEvents = useTransform(contentProgress, (v) => (v >= 0.045 ? 'auto' : 'none'));

  // Dynamic entrance happening LIVE under the rising WebGL wave
  const bgScale = useTransform(contentProgress, [0.0, 0.11, 0.25], [1.22, 1.03, 1.12]);
  const bgBrightness = useTransform(contentProgress, [0.0, 0.09, 0.14, 0.24], [0.42, 0.82, 0.82, 0.55]);
  const bgFilter = useMotionTemplate`brightness(${bgBrightness}) contrast(1.08)`;

  const titleTopX = useTransform(contentProgress, [0.01, 0.10, 0.14, 0.25], ['-6%', '0%', '0%', '-10%']);
  const titleBottomX = useTransform(contentProgress, [0.01, 0.10, 0.14, 0.25], ['6%', '0%', '0%', '10%']);
  const titleOpacity = useTransform(contentProgress, [0.01, 0.09], [0.25, 1]);

  const videoCardY = useTransform(contentProgress, [0.01, 0.095], [70, 0]);
  const videoCardScale = useTransform(contentProgress, [0.01, 0.095, 0.14, 0.25], [0.9, 1, 1, 1.06]);
  const railY = useTransform(contentProgress, [0.03, 0.10], [28, 0]);
  const railOpacity = useTransform(contentProgress, [0.03, 0.095, 0.14, 0.21], [0, 1, 1, 0]);

  // Smooth exit scale/pointer handoff on the outgoing dark poster (zero shaky skew)
  const posterLayerPointerEvents = useTransform(contentProgress, (v) => (v >= 0.045 && v < 0.19 ? 'auto' : 'none'));

  // === 2. NEWSONG -> DISCOGRAPHY: -25deg DIAGONAL CHROME APERTURE (0.135 -> 0.25) ===
  const glitchTearProgress = useTransform(contentProgress, [0.135, 0.25], [0, 1]);
  const gramophoneEntranceScale = useTransform(contentProgress, [0.135, 0.25], [1.07, 1]);

  // === 3. OPTION A: CARDS SCATTER -> RISING STAGE (ABOUT) ===
  const aboutEnterProgress = useTransform(contentProgress, [0.61, 0.75], [0, 1]);
  const aboutLayerOpacity = useTransform(contentProgress, [0.605, 0.64], [0, 1]);
  const aboutPointerEvents = useTransform(contentProgress, (v) => (v >= 0.67 ? 'auto' : 'none'));

  // === 4. SMOKE TRANSITION INTO MERCH (0.84 -> 1.0) ===
  const cloudProgress = useTransform(contentProgress, [0.84, 1.0], [0, 1]);
  const smokeZIndex = useTransform(contentProgress, [0, 0.79, 0.80, 1], [0, 0, 100, 100]);
  const smokeOpacity = useTransform(contentProgress, [0.77, 0.84], [0, 1]);

  const thumbUrl = `https://img.youtube.com/vi/${LATEST_RELEASE.youtubeId}/maxresdefault.jpg`;

  return (
    <motion.section
      id="nowa-piosenka"
      ref={(node) => {
        scrollRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      className="newsong-section"
      data-header-theme="dark"
    >
      <motion.div
        className="newsong-sticky-viewport"
        style={{ pointerEvents: viewportPointerEvents }}
      >
        {/* Clipped container revealed live underneath the Hero molten WebGL frontier */}
        <div ref={revealClipRef} className="newsong-reveal-clip">

          {/* LAYER 1: FULL-BLEED BRUTALIST EDITORIAL POSTER (ZA KAŻDYM RA2EM) */}
          <motion.div
            className="newsong-panel"
            onMouseMove={handlePanelMouseMove}
            style={{
              '--release-accent': hoveredAccent || '#ff2a2a',
              pointerEvents: posterLayerPointerEvents
            }}
          >
            <motion.div
              className="poster-bg-layer"
              style={{ scale: bgScale, filter: bgFilter, willChange: 'transform, filter' }}
              aria-hidden="true"
            >
              <img src={thumbUrl} alt="" className="poster-bg-img" />
            </motion.div>

            <div className="poster-vignette" aria-hidden="true" />
            <div className="poster-accent-wash" aria-hidden="true" />
            <div className="noise-overlay" aria-hidden="true" />

            <div className="poster-type-stage" aria-hidden="true">
              <motion.div
                className="poster-type-row poster-type-top"
                style={{ x: isMobile ? 0 : typeLeftX, opacity: titleOpacity }}
              >
                <motion.span style={{ x: titleTopX }}>{LATEST_RELEASE.titleLine1}</motion.span>
              </motion.div>
              <motion.div
                className="poster-type-row poster-type-bottom"
                style={{ x: isMobile ? 0 : typeRightX, opacity: titleOpacity }}
              >
                <motion.span style={{ x: titleBottomX }}>{LATEST_RELEASE.titleLine2}</motion.span>
              </motion.div>
            </div>

            <motion.div
              className="poster-video-anchor"
              style={{ y: videoCardY, scale: videoCardScale, willChange: 'transform' }}
            >
              <motion.a
                href={LATEST_RELEASE.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="poster-video-frame"
                aria-label={`Obejrzyj teledysk ${LATEST_RELEASE.artists} — ${LATEST_RELEASE.fullTitle} na YouTube`}
                style={{
                  rotateX: isMobile ? 0 : frameTiltX,
                  rotateY: isMobile ? 0 : frameTiltY,
                  transformPerspective: 1200
                }}
              >
                <img
                  src={thumbUrl}
                  alt={`${LATEST_RELEASE.artists} — ${LATEST_RELEASE.fullTitle}`}
                  className="poster-video-img"
                  loading="lazy"
                  width="1280"
                  height="720"
                />
                <div className="poster-video-scrim" />
                <div className="poster-video-cta">
                  <span className="poster-video-cta-label">OBEJRZYJ TELEDYSK</span>
                  <span className="poster-video-cta-arrow" aria-hidden="true">↗</span>
                </div>
              </motion.a>
            </motion.div>

            <motion.div
              className="poster-bottom-rail"
              style={{ y: railY, opacity: railOpacity }}
            >
              <div className="poster-meta-block">
                <h2 className="poster-sr-heading">{LATEST_RELEASE.artists} — {LATEST_RELEASE.fullTitle}</h2>
                <span className="poster-meta-primary">{LATEST_RELEASE.artists}</span>
                <span className="poster-meta-sub">
                  {LATEST_RELEASE.album} ({LATEST_RELEASE.albumDate}) • PROD. {LATEST_RELEASE.producers}
                </span>
              </div>

              <nav className="poster-stream-nav" aria-label="Platformy streamingowe">
                {LATEST_RELEASE.platforms.map((p) => (
                  <a
                    key={p.id}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="poster-stream-link"
                    style={{ '--link-accent': p.accent }}
                    onMouseEnter={() => setHoveredAccent(p.accent)}
                    onMouseLeave={() => setHoveredAccent(null)}
                  >
                    <span>{p.name}</span>
                    <span className="poster-stream-arrow" aria-hidden="true">↗</span>
                  </a>
                ))}
              </nav>
            </motion.div>
          </motion.div>

          {/* LAYER 2: GRAMOPHONE / DISCOGRAPHY (Revealed inside the -25deg Glitch Tear!) */}
          <div ref={gramophoneLayerRef} className="newsong-gramophone-layer">
            <Gramophone
              contentProgress={contentProgress}
              isMenuOpen={props.isMenuOpen}
              style={{ scale: gramophoneEntranceScale, willChange: 'transform' }}
            />
          </div>

          {/* Synchronized WebGL Lost Media VHS Rewind + -25deg Glitch Tear Overlay */}
          <GlitchTearWebGL
            progress={glitchTearProgress}
            targetRef={gramophoneLayerRef}
          />

          {/* LAYER 3: RISING STAGE (ABOUT) */}
          <motion.div
            className="newsong-about-layer"
            style={{
              opacity: aboutLayerOpacity,
              pointerEvents: aboutPointerEvents,
              willChange: 'opacity'
            }}
          >
            <About enterProgress={aboutEnterProgress} />
          </motion.div>

          {/* LAYER 4: SMOKE TRANSITION INTO MERCH */}
          <motion.div
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              pointerEvents: 'none', zIndex: smokeZIndex, opacity: smokeOpacity, mixBlendMode: 'screen'
            }}
          >
            <SmokeTransition progress={cloudProgress} />
          </motion.div>
        </div>

        {/* Synchronized WebGL Hero -> NewSong Molten Chrome Frontier Ribbon */}
        <HeroWebGLTransition progress={webglRevealProgress} targetRef={revealClipRef} />
      </motion.div>
    </motion.section>
  );
});

export default NewSong;
