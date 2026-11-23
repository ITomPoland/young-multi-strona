// Plik: /src/App.jsx

import React, { useState, useRef, useCallback, Suspense, lazy } from 'react';
import { AnimatePresence } from 'framer-motion';

// Critical components - load immediately
import Hero from './components/Hero/Hero';
import Preloader from './components/Preloader/Preloader';
import Header from './components/Header/Header';
import MenuOverlay from './components/MenuOverlay/MenuOverlay';
import CustomCursor from './components/CustomCursor/CustomCursor';
import SmoothScroll from './components/SmoothScroll/SmoothScroll';
import FanBanner from './components/FanBanner/FanBanner';
// import NoiseOverlay from './components/NoiseOverlay/NoiseOverlay'; // DISABLED
import useAdaptiveFavicon from './hooks/useAdaptiveFavicon';
import head1Img from './assets/head1.avif'; // Explicit import for preload
import StorySection from './story/StorySection';
import { useStoryVh, storyVhToScroll, viewportMetrics } from './story/useStoryScroll';
import { anchorVh } from './story/story.config';
import { legacyToLocal } from './components/NewSong/timeline';

// Lazy-loaded components - load when needed (below the fold)
const NewSong = lazy(() => import('./components/NewSong/NewSong'));
const Merch = lazy(() => import('./components/Merch/Merch'));
const Contact = lazy(() => import('./components/Contact/Contact'));
const NotFound = lazy(() => import('./components/NotFound/NotFound'));

import { PerformanceProvider } from './context/PerformanceContext';

function App() {
  const path = window.location.pathname;
  const isHome = path === '/' || path === '/index.html';

  return (
    <PerformanceProvider>
      {isHome ? (
        <HomePage />
      ) : (
        <Suspense fallback={null}>
          <NotFound />
        </Suspense>
      )}
      <FanBanner />
    </PerformanceProvider>
  );
}

function HomePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // One scroll clock for the whole story (scroll position in vh)
  const storyVh = useStoryVh();

  // === ADAPTIVE FAVICON ===
  useAdaptiveFavicon();

  // === SECTION REFS FOR DYNAMIC NAVIGATION ===
  const heroRef = useRef(null);
  const storyRef = useRef(null);
  const newSongRef = useRef(null);
  const merchRef = useRef(null);
  const contactRef = useRef(null);

  const openMenu = useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  // === DYNAMIC SCROLL NAVIGATION ===
  // Uses actual DOM positions and calculates offsets for nested sections
  const handleSectionClick = useCallback((sectionId) => {
    // HOME always scrolls to top
    if (sectionId === 'home') {
      window.scrollTo({ top: 0, behavior: 'auto' });
      setTimeout(() => setIsMenuOpen(false), 300);
      return;
    }

    // KONTAKT scrolls to very bottom of page
    if (sectionId === 'kontakt') {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
      setTimeout(() => setIsMenuOpen(false), 300);
      return;
    }

    // Chapters inside the story / discography are addressed by their timeline position
    const vhPx = viewportMetrics.vhPx;
    const newSongPos = (localProgress) => {
      const el = newSongRef.current;
      if (!el) return 0;
      return el.offsetTop + (el.offsetHeight - vhPx * 100) * localProgress;
    };

    let scrollPosition = 0;
    switch (sectionId) {
      case 'nowa-piosenka':
        scrollPosition = storyVhToScroll(anchorVh('nowa-piosenka'));
        break;
      case 'dyskografia':
        scrollPosition = storyVhToScroll(anchorVh('dyskografia'));
        break;
      case 'o-mnie':
        scrollPosition = newSongPos(legacyToLocal(0.76));
        break;
      case 'merch':
        scrollPosition = merchRef.current ? merchRef.current.offsetTop : 0;
        break;
      default:
        scrollPosition = 0;
    }

    // TELEPORT: instant scroll
    window.scrollTo({ top: scrollPosition, behavior: 'auto' });

    // Close menu with delay to allow exit animation
    setTimeout(() => setIsMenuOpen(false), 300);
  }, []);

  // === ASSET PRELOADING ===
  React.useEffect(() => {
    // 1. Code Splitting Preload
    import('./components/NewSong/NewSong');
    import('./story/StoryCanvas');
    import('./components/Merch/Merch');
    import('./components/Contact/Contact');

    // 2. Heavy Assets Preload
    const preloadImage = (src) => {
      const img = new Image();
      img.src = src;
    };

    // Preload About Head
    preloadImage(head1Img);

    // Defer heavy video preload and skip on mobile (where SmokeTransition uses a CSS curtain)
    let videoTimer;
    if (window.innerWidth >= 768) {
      videoTimer = setTimeout(() => {
        const video = document.createElement('video');
        video.src = '/smoke-transition.mp4';
        video.preload = 'metadata';
        video.load();
      }, 2000);
    }

    return () => {
      if (videoTimer) clearTimeout(videoTimer);
    };
  }, []);

  const handlePreloaderComplete = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <>
      {/* CUSTOM CURSOR */}
      <CustomCursor />
      <SmoothScroll />

      {/* NOISE OVERLAY - DISABLED
       <NoiseOverlay />
      */}

      {/* UNIFIED PRELOADER */}
      <AnimatePresence>
        {isLoading && <Preloader onComplete={handlePreloaderComplete} />}
      </AnimatePresence>

      {/* MAIN CONTENT */}
      <>
        <Header
          onMenuClick={openMenu}
          onCloseClick={closeMenu}
          isMenuOpen={isMenuOpen}
          startAnimation={!isLoading}
        />

        <AnimatePresence mode='wait'>
          {isMenuOpen && (
            <MenuOverlay onSectionClick={handleSectionClick} onClose={closeMenu} />
          )}
        </AnimatePresence>

        <main>
          <Hero ref={heroRef} />
          <StorySection ref={storyRef} storyVh={storyVh} startAnimation={!isLoading} />
          <Suspense fallback={null}>
            <NewSong ref={newSongRef} isMenuOpen={isMenuOpen} />
            <Merch ref={merchRef} />
            <Contact ref={contactRef} />
          </Suspense>
        </main>
      </>
    </>
  );
}

export default App;
