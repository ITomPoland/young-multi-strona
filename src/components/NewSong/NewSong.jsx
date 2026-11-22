import React, { useRef, forwardRef, useState, useEffect } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  useSpring,
  useMotionValue
} from 'framer-motion';
import './NewSong.css';
import ReleaseDitherCanvas from './ReleaseDitherCanvas';
import AmbientDust from './AmbientDust';
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
  coverSrc: '/release-cover.jpg',
  youtubeUrl: 'https://www.youtube.com/watch?v=KMQQtlTJvMo',
  smartLink: 'https://yfl.lnk.to/ZAKAZDYMRA2EM',
  platforms: [
    {
      id: 'spotify',
      name: 'SPOTIFY',
      url: 'https://yfl.lnk.to/ZAKAZDYMRA2EM'
    },
    {
      id: 'apple',
      name: 'APPLE MUSIC',
      url: 'https://music.apple.com/pl/album/za-ka%C5%BCdym-ra2em-single/1852927950'
    },
    {
      id: 'ytmusic',
      name: 'YOUTUBE MUSIC',
      url: 'https://music.youtube.com/watch?v=KMQQtlTJvMo'
    },
    {
      id: 'tidal',
      name: 'TIDAL',
      url: 'https://yfl.lnk.to/ZAKAZDYMRA2EM'
    }
  ]
};

const NewSong = forwardRef((props, ref) => {
  const scrollRef = useRef(null);
  const gramophoneLayerRef = useRef(null);
  const previousThemeRef = useRef(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Smooth 3D spatial camera parallax driven by cursor inside the tiled room
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothMX = useSpring(mouseX, { stiffness: 65, damping: 24 });
  const smoothMY = useSpring(mouseY, { stiffness: 65, damping: 24 });

  // Mid-deep plane: ZA KAŻDYM floating behind the monolith
  const typeBackX = useTransform(smoothMX, [-0.5, 0.5], [-20, 20]);
  const typeBackY = useTransform(smoothMY, [-0.5, 0.5], [-10, 10]);

  // Center plane: Borderless floating monolith gentle 3D tilt (no XY dodging so hover is 100% locked!)
  const frameTiltX = useTransform(smoothMY, [-0.5, 0.5], [3.8, -3.8]);
  const frameTiltY = useTransform(smoothMX, [-0.5, 0.5], [-4.8, 4.8]);

  // Foreground plane: RA2EM drifting closer to camera (editorial index stays steady for crisp link hover)
  const typeFrontX = useTransform(smoothMX, [-0.5, 0.5], [24, -24]);
  const typeFrontY = useTransform(smoothMY, [-0.5, 0.5], [12, -12]);

  const handlePanelMouseMove = (e) => {
    if (isMobile) return;
    mouseX.set(e.clientX / window.innerWidth - 0.5);
    mouseY.set(e.clientY / window.innerHeight - 0.5);
  };

  // --- UNIFIED TIMELINE (1350vh) ---
  // 0.000 -> 0.125 : Hero 12,288-particle 3D dust shatter -> organically condenses into borderless monolith
  // 0.106 -> 0.126 : Seamless 1:1 handoff into floating 3D spatial ZA KAŻDYM RA2EM world
  // 0.126 -> 0.165 : Breath & 3D drift inside the tiled room
  // 0.165 -> 0.275 : -25deg Diagonal Aperture -> Discography
  // 0.275 -> 0.560 : 4 Album Cards ScrollStack
  // 0.570 -> 0.750 : Option A: Cards Scatter + Rising Stage (About)
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

  // === 1. SEAMLESS 3D SPATIAL HANDOFF FROM HERO DUST MORPH (0.112 -> 0.124) ===
  const stageOpacity = useTransform(contentProgress, [0.112, 0.124], [0, 1]);
  const viewportPointerEvents = useTransform(contentProgress, (v) => (v >= 0.108 ? 'auto' : 'none'));

  // Monumental 3D typography floats out of depth (behind + in front of monolith)
  const backTitleOpacity = useTransform(contentProgress, [0.112, 0.146, 0.175, 0.245], [0, 1, 1, 0.15]);
  const backTitleX = useTransform(contentProgress, [0.112, 0.148, 0.17, 0.27], ['-5%', '0%', '0%', '-10%']);
  const backTitleScale = useTransform(contentProgress, [0.112, 0.148], [0.92, 1]);

  const frontTitleOpacity = useTransform(contentProgress, [0.116, 0.152, 0.175, 0.24], [0, 1, 1, 0]);
  const frontTitleX = useTransform(contentProgress, [0.116, 0.152, 0.17, 0.27], ['6%', '0%', '0%', '12%']);
  const frontTitleScale = useTransform(contentProgress, [0.116, 0.152], [1.08, 1]);

  // Floating monolith stays 1:1 locked during handoff, then softly floats forward on scroll exit
  const monolithScale = useTransform(contentProgress, [0.165, 0.27], [1, 1.045]);
  const monolithCtaOpacity = useTransform(contentProgress, [0.120, 0.148, 0.175, 0.235], [0, 1, 1, 0]);

  // Floating spatial credits & stream index emerge organically in foreground 3D space
  const indexOpacity = useTransform(contentProgress, [0.118, 0.152, 0.175, 0.235], [0, 1, 1, 0]);
  const indexEntryX = useTransform(contentProgress, [0.118, 0.152], [28, 0]);
  const indexEntryY = useTransform(contentProgress, [0.118, 0.152], [14, 0]);

  const posterLayerPointerEvents = useTransform(contentProgress, (v) => (v >= 0.108 && v < 0.23 ? 'auto' : 'none'));

  // === 2. NEWSONG -> DISCOGRAPHY: -25deg DIAGONAL APERTURE (0.165 -> 0.275) ===
  const glitchTearProgress = useTransform(contentProgress, [0.165, 0.275], [0, 1]);
  const gramophoneEntranceScale = useTransform(contentProgress, [0.165, 0.275], [1.07, 1]);

  // === 3. OPTION A: CARDS SCATTER -> RISING STAGE (ABOUT) ===
  const aboutEnterProgress = useTransform(contentProgress, [0.61, 0.75], [0, 1]);
  const aboutLayerOpacity = useTransform(contentProgress, [0.605, 0.64], [0, 1]);
  const aboutPointerEvents = useTransform(contentProgress, (v) => (v >= 0.67 ? 'auto' : 'none'));

  // === 4. SMOKE TRANSITION INTO MERCH (0.84 -> 1.0) ===
  const cloudProgress = useTransform(contentProgress, [0.84, 1.0], [0, 1]);
  const smokeZIndex = useTransform(contentProgress, [0, 0.79, 0.80, 1], [0, 0, 100, 100]);
  const smokeOpacity = useTransform(contentProgress, [0.77, 0.84], [0, 1]);

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
        <motion.div
          className="newsong-stage-handoff"
          style={{ opacity: stageOpacity }}
        >
          {/* LAYER 1: FLOATING 3D SPATIAL SCREENING WORLD (Transparent directly over Hero's bright live Bayer tiled room!) */}
          <motion.div
            className="newsong-panel"
            onMouseMove={handlePanelMouseMove}
            style={{ pointerEvents: posterLayerPointerEvents }}
          >
            {/* Subtle localized depth mist ONLY behind right text column (keeps bright tiled room 100% untouched!) */}
            <div className="spatial-readability-mist" aria-hidden="true" />

            {/* DEPTH PLANE 1: FLOATING 3D MONUMENTAL BACK TYPOGRAPHY (Behind Monolith) */}
            <motion.div
              className="spatial-type-back"
              aria-hidden="true"
              style={{
                opacity: backTitleOpacity,
                x: isMobile ? 0 : typeBackX,
                y: isMobile ? 0 : typeBackY,
                scale: backTitleScale
              }}
            >
              <motion.span style={{ x: backTitleX }}>
                {LATEST_RELEASE.titleLine1}
              </motion.span>
            </motion.div>

            {/* DEPTH PLANE 2: LIVE 3D AMBIENT DUST MOTES (Continuing Multi's dust!) */}
            <AmbientDust mouseX={smoothMX} mouseY={smoothMY} />

            {/* DEPTH PLANE 3: BORDERLESS FLOATING FILM MONOLITH (Pixel-locked to Hero dot assembly) */}
            <div className="poster-monolith-slot">
              <motion.div
                className="poster-monolith-float"
                style={{
                  scale: monolithScale,
                  willChange: 'transform'
                }}
              >
                <div className="poster-monolith-levitate">
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
                    <ReleaseDitherCanvas
                      src={LATEST_RELEASE.coverSrc}
                      alt={`${LATEST_RELEASE.artists} — ${LATEST_RELEASE.fullTitle}`}
                    />
                    <div className="poster-video-scrim" />
                  </motion.a>
                </div>

                <motion.a
                  href={LATEST_RELEASE.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="monolith-play-cue"
                  style={{ opacity: monolithCtaOpacity }}
                >
                  <span className="monolith-play-line" aria-hidden="true" />
                  <span>OBEJRZYJ TELEDYSK</span>
                  <span className="monolith-play-arrow" aria-hidden="true">↗</span>
                </motion.a>
              </motion.div>
            </div>

            {/* DEPTH PLANE 4: FLOATING GHOST FOREGROUND TYPOGRAPHY (Overlapping lower edge for 3D sandwich!) */}
            <motion.div
              className="spatial-type-front"
              aria-hidden="true"
              style={{
                opacity: frontTitleOpacity,
                x: isMobile ? 0 : typeFrontX,
                y: isMobile ? 0 : typeFrontY,
                scale: frontTitleScale
              }}
            >
              <motion.span style={{ x: frontTitleX }}>
                {LATEST_RELEASE.titleLine2}
              </motion.span>
            </motion.div>

            {/* DEPTH PLANE 5: FLOATING SPATIAL EDITORIAL INDEX (Free-floating in open 3D right space, rock-steady hover) */}
            <aside className="spatial-editorial-slot">
              <motion.div
                className="spatial-editorial-index"
                style={{ opacity: indexOpacity }}
              >
                <motion.div
                  className="spatial-index-inner"
                  style={{
                    x: isMobile ? 0 : indexEntryX,
                    y: indexEntryY
                  }}
                >
                  <div className="spatial-meta-group">
                    <h2 className="poster-sr-heading">{LATEST_RELEASE.artists} — {LATEST_RELEASE.fullTitle}</h2>
                    <span className="spatial-kicker">
                      NOWY SINGIEL · {LATEST_RELEASE.releaseDate}
                    </span>
                    <span className="spatial-artist">{LATEST_RELEASE.artists}</span>
                    <span className="spatial-credits">
                      {LATEST_RELEASE.album} ({LATEST_RELEASE.albumDate})
                    </span>
                    <span className="spatial-credits spatial-credits-muted">
                      PROD. {LATEST_RELEASE.producers}
                    </span>
                  </div>

                  <div className="spatial-hairline" aria-hidden="true" />

                  <nav className="spatial-stream-list" aria-label="Platformy streamingowe">
                    {LATEST_RELEASE.platforms.map((p) => (
                      <a
                        key={p.id}
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="spatial-stream-link"
                      >
                        <span className="spatial-stream-name">{p.name}</span>
                        <span className="spatial-stream-arrow" aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </nav>
                </motion.div>
              </motion.div>
            </aside>
          </motion.div>

          {/* LAYER 2: GRAMOPHONE / DISCOGRAPHY */}
          <div ref={gramophoneLayerRef} className="newsong-gramophone-layer">
            <Gramophone
              contentProgress={contentProgress}
              isMenuOpen={props.isMenuOpen}
              style={{ scale: gramophoneEntranceScale, willChange: 'transform' }}
            />
          </div>

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
        </motion.div>
      </motion.div>
    </motion.section>
  );
});

export default NewSong;
