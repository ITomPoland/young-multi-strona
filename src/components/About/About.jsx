import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useMotionTemplate,
  useMotionValueEvent
} from 'framer-motion';
import './About.css';
import { JellyDread } from './JellyDread';
import { SpectralGuide } from './SpectralGuide';
import { FaceFeatures } from './FaceFeatures';
import { SpeechBubble } from './SpeechBubble';

// Responsive image imports with srcset
import headImgSrcset from '../../assets/head1.avif?w=400;800;1200&format=avif&as=srcset';
import headImgFallback from '../../assets/head1.avif?w=800&format=avif';

const factsLeft = [
  "Nazywam się Michał Rychlik, ale wszyscy znają mnie jako Young Multi — zaczynałem jako YouTuber i gamer.",
  "W 2017 wypuściłem mój pierwszy album 'Nowa Fala' i wskoczył od razu na szczyt OLiS.",
  "Zanim zacząłem rapować, byłem jednym z większych gamingowych twórców na polskim YouTube.",
  "Urodziłem się w Głubczycach, w małej miejscowości, z której ruszyłem w stronę muzyki.",
  "To ja założyłem Young Family Label — miejsce, w którym działa też kilku młodych artystów.",
];

const factsRight = [
  "Moja zmiana z YouTubera na rapera wywołała dużo hejtu, ale i tak zrobiłem swoje.",
  "Styl, który robiłem, był mocno inspirowany trapem z USA — i to ludzi najbardziej podzieliło.",
  "Zaczynałem muzykę totalnie sam — zero kontaktów w branży, tylko ja, mikrofon i internet.",
  "Mój przydomek 'Multi' to skrót od dawnej nazwy kanału — MultiGameplayGuy.",
  "Wielu raperów mnie krytykowało, ale finalnie to ja otworzyłem drzwi dla nowych twórców z YouTube.",
];

const dreadPositions = [
  { x: 35.5, y: 41.6 }, { x: 39.5, y: 39.5 }, { x: 44.5, y: 37.5 },
  { x: 48.5, y: 37.5 }, { x: 52.5, y: 37.5 }, { x: 57.5, y: 39.5 },
  { x: 61.5, y: 41.6 },
];

function About({ enterProgress }) {
  // Fallback MotionValue (1 = fully revealed) if About is ever rendered standalone
  const fallbackProgress = useMotionValue(1);
  const progress = enterProgress || fallbackProgress;

  // --- RISING STAGE CHOREOGRAPHY (Option A) ---
  // 1. Overhead concert spotlight cone ignites from top edge
  const spotlightOpacity = useTransform(progress, [0.05, 0.72], [0, 1]);
  const spotlightScaleY = useTransform(progress, [0.05, 0.80], [0.4, 1]);

  // 2. Architectural rim backlight halo behind Multi's silhouette
  const rimOpacity = useTransform(progress, [0.18, 0.88], [0, 1]);
  const rimScale = useTransform(progress, [0.18, 0.90], [0.65, 1]);

  // 3. Giant background typography "O MNIE" rises & expands
  const titleOpacity = useTransform(progress, [0.14, 0.72], [0, 1]);
  const titleY = useTransform(progress, [0.14, 0.80], [72, 0]);
  const titleScale = useTransform(progress, [0.14, 0.80], [0.92, 1]);

  // 4. Multi's head + interactive dreads emerge out of stage shadow
  const avatarY = useTransform(progress, [0.16, 0.95], ["34%", "0%"]);
  const avatarScale = useTransform(progress, [0.16, 0.95], [0.9, 1]);
  const avatarOpacity = useTransform(progress, [0.12, 0.48], [0, 1]);
  const avatarBrightness = useTransform(progress, [0.16, 0.88], [0.32, 1]);
  const avatarFilter = useMotionTemplate`brightness(${avatarBrightness})`;

  // 5. Subtle interactive hint fades in once stage settles
  const hintOpacity = useTransform(progress, [0.82, 0.98], [0, 1]);
  const hintY = useTransform(progress, [0.82, 0.98], [14, 0]);

  // 6. Mobile fact card entrance
  const mobileFactOpacity = useTransform(progress, [0.35, 0.85], [0, 1]);
  const mobileFactY = useTransform(progress, [0.35, 0.85], [24, 0]);

  // Trigger organic dreads momentum sway as Multi finishes rising onto stage
  const [swaySignal, setSwaySignal] = useState(0);
  const hasSwayedRef = useRef(false);
  useMotionValueEvent(progress, "change", (latest) => {
    if (latest >= 0.72 && !hasSwayedRef.current) {
      hasSwayedRef.current = true;
      setSwaySignal((c) => c + 1);
    } else if (latest < 0.25 && hasSwayedRef.current) {
      hasSwayedRef.current = false;
    }
  });

  // --- DETEKCJA MOBILE ---
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- LOGIKA MOBILE (Carousel) ---
  const [mobileFactIndex, setMobileFactIndex] = useState(0);
  const mobileFacts = [...factsLeft, ...factsRight];

  useEffect(() => {
    if (!isMobile) return;
    const interval = setInterval(() => {
      setMobileFactIndex((prev) => (prev + 1) % mobileFacts.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isMobile, mobileFacts.length]);

  // --- LOGIKA DESKTOP ---
  const [activeInfo, setActiveInfo] = useState(null);
  const [infoText, setInfoText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef(null);

  const ghostDreadOffsetX = useMotionValue(0);
  const ghostDreadOffsetY = useMotionValue(0);
  const ghostDreadOffset = { x: ghostDreadOffsetX, y: ghostDreadOffsetY };

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setIsIdle(false);

    if (!activeInfo) {
      idleTimerRef.current = setTimeout(() => {
        setIsIdle(true);
      }, 2000);
    }
  }, [activeInfo]);

  const handleMouseMove = (e) => {
    if (isMobile) return;
    mouseX.set(e.clientX);
    mouseY.set(e.clientY);
    resetIdleTimer();
  };

  const handleDragStart = () => {
    setHasInteracted(true);
    resetIdleTimer();
  };

  const currentMouthState = (activeInfo && isTyping) ? 'talking' : (isIdle ? 'prompt' : 'idle');

  const showInfo = useCallback((direction) => {
    setHasInteracted(true);
    if (direction === 'left') {
      setInfoText(factsLeft[Math.floor(Math.random() * factsLeft.length)]);
      setActiveInfo('left');
    } else if (direction === 'right') {
      setInfoText(factsRight[Math.floor(Math.random() * factsRight.length)]);
      setActiveInfo('right');
    }
    setIsTyping(true);
    resetIdleTimer();
  }, [resetIdleTimer]);

  const handleTypingComplete = () => {
    setIsTyping(false);
  };

  const handleDragReport = (offsetX) => {
    if (activeInfo) return;
    if (offsetX < -100) showInfo('left');
    else if (offsetX > 100) showInfo('right');
  };

  const handleDragEnd = () => {};

  const handleSectionClick = () => {
    if (isMobile) return;
    if (activeInfo) {
      setActiveInfo(null);
      setIsTyping(false);
    }
  };

  useEffect(() => {
    if (isMobile) return;
    resetIdleTimer();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [resetIdleTimer, isMobile]);

  // --- RENDEROWANIE ---

  // 1. WIDOK MOBILNY
  if (isMobile) {
    return (
      <section className="about-section mobile-view">
        <motion.div
          className="about-stage-spotlight"
          style={{ opacity: spotlightOpacity, scaleY: spotlightScaleY }}
          aria-hidden="true"
        />
        <motion.div
          className="about-rim-glow"
          style={{ opacity: rimOpacity, scale: rimScale }}
          aria-hidden="true"
        />

        <motion.div
          className="mobile-title-container"
          style={{ opacity: titleOpacity, y: titleY }}
        >
          <h2 className="about-title mobile">O MNIE</h2>
        </motion.div>

        <motion.div
          className="mobile-carousel-container"
          style={{ opacity: mobileFactOpacity, y: mobileFactY }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={mobileFactIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5 }}
              className="mobile-fact-text"
            >
              {mobileFacts[mobileFactIndex]}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <motion.img
          srcSet={headImgSrcset}
          src={headImgFallback}
          sizes="(max-width: 768px) 80vw, 40vw"
          alt="Young Multi"
          className="about-head mobile-head"
          style={{
            y: avatarY,
            scale: avatarScale,
            opacity: avatarOpacity,
            filter: avatarFilter
          }}
        />
      </section>
    );
  }

  // 2. WIDOK DESKTOP
  return (
    <motion.section
      className="about-section"
      onMouseMove={handleMouseMove}
      onClick={handleSectionClick}
    >
      {/* Overhead Concert Spotlight + Silhouette Rim Backlight */}
      <motion.div
        className="about-stage-spotlight"
        style={{ opacity: spotlightOpacity, scaleY: spotlightScaleY }}
        aria-hidden="true"
      />
      <motion.div
        className="about-rim-glow"
        style={{ opacity: rimOpacity, scale: rimScale }}
        aria-hidden="true"
      />

      {/* 1. WARSTWA TŁA: TYTUŁ "O MNIE" */}
      <motion.div
        className="about-content"
        style={{ opacity: titleOpacity, y: titleY, scale: titleScale }}
      >
        <h2 className="about-title">O MNIE</h2>
      </motion.div>

      {/* 2. WARSTWA ŚRODKOWA: GŁOWA I DREDY (RISING STAGE) */}
      <motion.div
        className="about-avatar-container"
        style={{
          y: avatarY,
          scale: avatarScale,
          opacity: avatarOpacity,
          filter: avatarFilter
        }}
      >
        <img
          srcSet={headImgSrcset}
          src={headImgFallback}
          sizes="(max-width: 768px) 80vw, 40vw"
          alt="Young Multi"
          className="about-head"
          style={{ zIndex: 1 }}
        />

        <FaceFeatures
          mouseX={mouseX}
          mouseY={mouseY}
          mouthState={currentMouthState}
        />

        {dreadPositions.map((pos, i) => (
          <motion.div
            key={i}
            className="jelly-dread-wrapper interactive"
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, zIndex: 10 }}
          >
            <JellyDread
              dreadId={`dread-gradient-${i}`}
              dreadIndex={i}
              swaySignal={swaySignal}
              onDragStart={handleDragStart}
              onDragReport={handleDragReport}
              onDragEnd={handleDragEnd}
              ghostOffset={i === 3 ? ghostDreadOffset : null}
            >
              <linearGradient
                id={`dread-gradient-${i}`}
                gradientUnits="userSpaceOnUse"
                x1="0" y1="500" x2="0" y2="700"
                spreadMethod="pad"
                colorInterpolation="sRGB"
              >
                <stop offset="0%" stopColor="#000000" />
                <stop offset="20%" stopColor="#000000" />
                <stop offset="50%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#ffffff" />
              </linearGradient>
            </JellyDread>
          </motion.div>
        ))}

        <AnimatePresence>
          {!activeInfo && isIdle && !isMobile && (
            <SpectralGuide
              startPos={{
                x: '46%',
                y: '50%'
              }}
              ghostOffset={ghostDreadOffset}
            />
          )}
        </AnimatePresence>
      </motion.div>

      {/* Subtle interactive micro-hint above bottom fan bar */}
      {!hasInteracted && !activeInfo && (
        <motion.div
          className="about-stage-hint"
          style={{ opacity: hintOpacity, y: hintY }}
          aria-hidden="true"
        >
          <span className="about-stage-hint-dot" />
          <span>POCIĄGNIJ DREDY, ABY POZNAĆ HISTORIĘ</span>
        </motion.div>
      )}

      {/* 3. WARSTWA WIERZCHNIA: DYMEK */}
      <AnimatePresence>
        {activeInfo && (
          <SpeechBubble
            key={activeInfo}
            text={infoText}
            direction={activeInfo}
            onTypingComplete={handleTypingComplete}
          />
        )}
      </AnimatePresence>

    </motion.section>
  );
}

export default About;
