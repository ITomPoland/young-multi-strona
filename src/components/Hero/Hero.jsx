// Plik: /src/components/Hero/Hero.jsx

import React, { forwardRef } from 'react';
import { motion } from 'framer-motion';
import './Hero.css';
import HeroVideoShader from './HeroVideoShader';

// Story chapter S0–S1. `transitionProgress` (0 -> 0.5) comes from the story timeline:
// Multi dissolves, his dust is pulled into the back wall, then the 3D StoryCanvas
// takes over on an identical empty-room frame (see src/story/story.config.js).
const Hero = forwardRef(function Hero({ transitionProgress, startAnimation = false }, ref) {
  return (
    <motion.section ref={ref} className="hero-section" data-header-theme="dark">
      {/* Semantic H1 for SEO & screen readers (visual display type is composited inside WebGL) */}
      <h1 className="hero-sr-only">YOUNG MULTI</h1>

      <div className="hero-content-wrapper">
        <motion.div
          className="hero-video-stage"
          initial={{ opacity: 0.01, scale: 1.08 }}
          animate={startAnimation ? { opacity: 1, scale: 1 } : { opacity: 0.01, scale: 1.08 }}
          transition={{ duration: 1.35, delay: 0.05, ease: [0.76, 0, 0.24, 1] }}
        >
          <HeroVideoShader startAnimation={startAnimation} transitionProgress={transitionProgress} />
        </motion.div>
      </div>
    </motion.section>
  );
});

export default Hero;
