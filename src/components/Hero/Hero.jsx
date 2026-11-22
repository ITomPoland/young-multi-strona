// Plik: /src/components/Hero/Hero.jsx

import React, { useState, useEffect, forwardRef } from 'react';
import { motion, useTransform } from 'framer-motion';
import './Hero.css';
import HeroVideoShader from './HeroVideoShader';

const Hero = forwardRef(function Hero({ scrollY, startAnimation = false }, ref) {
  const [viewportHeight, setViewportHeight] = useState(900);

  useEffect(() => {
    const updateViewport = () => setViewportHeight(window.innerHeight);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Exact pixel sync with NewSong's 0..0.125 transition (0.125 * 12.5vh = 1.5625vh).
  // Extends to 1.15 so Hero can cleanly hand off Layer 1B right after NewSong hits opacity 1,
  // while keeping Hero's live bright Bayer-dithered tiled room running seamlessly behind NewSong!
  const revealDistance = Math.max(viewportHeight * 1.5625, 1);
  const transitionProgress = useTransform(scrollY, [0, revealDistance * 1.15], [0, 1.15]);

  return (
    <motion.section
      ref={ref}
      className="hero-section"
      data-header-theme="dark"
    >
      {/* Semantic H1 for SEO & screen readers (visual display type is composited inside WebGL behind Multi) */}
      <h1 className="hero-sr-only">YOUNG MULTI</h1>

      <div className="hero-content-wrapper">
        <motion.div
          className="hero-video-stage"
          initial={{ opacity: 0.01, scale: 1.08 }}
          animate={startAnimation ? { opacity: 1, scale: 1 } : { opacity: 0.01, scale: 1.08 }}
          transition={{ duration: 1.35, delay: 0.05, ease: [0.76, 0, 0.24, 1] }}
        >
          <HeroVideoShader
            startAnimation={startAnimation}
            transitionProgress={transitionProgress}
          />
        </motion.div>
      </div>
    </motion.section>
  );
});

export default Hero;
