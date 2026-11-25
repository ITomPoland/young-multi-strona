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
import StorySection from './story/StorySection';
import { useStoryVh, storyVhToScroll } from './story/useStoryScroll';
import { anchorVh } from './story/story.config';

// Lazy-loaded components - load when needed (below the fold)
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

    // Chapters inside the story are addressed by their timeline position (story.config anchors)

    let scrollPosition = 0;
    switch (sectionId) {
      case 'nowa-piosenka':
        scrollPosition = storyVhToScroll(anchorVh('nowa-piosenka'));
        break;
      case 'dyskografia':
        scrollPosition = storyVhToScroll(anchorVh('dyskografia'));
        break;
      case 'o-mnie':
        scrollPosition = storyVhToScroll(anchorVh('o-mnie'));
        break;
      case 'merch':
        scrollPosition = storyVhToScroll(anchorVh('merch'));
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
    // Code Splitting Preload
    import('./story/StoryCanvas');
    import('./components/Contact/Contact');
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
            <Contact ref={contactRef} />
          </Suspense>
        </main>
      </>
    </>
  );
}

export default App;
