import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import './Preloader.css';
import logoWhite from '../../assets/logoyflbiale.avif';
import { usePerformance } from '../../context/PerformanceContext';
import useFpsMonitor from '../../hooks/useFpsMonitor';

// MINIMALIST LUXURY VARIANT
const containerVariants = {
  initial: { opacity: 1 },
  exit: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 }
  }
};

const blindVariants = {
  initial: { scaleY: 1 },
  exit: {
    scaleY: 0,
    transition: {
      duration: 0.9,
      ease: [0.76, 0, 0.24, 1]
    }
  }
};

// Logo moves up WITH the middle blind
const logoExitVariant = {
  initial: { y: 0, opacity: 1 },
  animate: { y: 0, opacity: 1 },
  exit: {
    y: "-120vh",
    opacity: 1,
    transition: {
      duration: 0.9,
      delay: 0.3,
      ease: [0.76, 0, 0.24, 1]
    }
  }
};

function Preloader({ onComplete }) {
  const [progress, setProgress] = useState(0);

  // FPS Monitoring
  const { setFps } = usePerformance();
  const { startMonitoring, stopMonitoring } = useFpsMonitor();

  useEffect(() => {
    let isCancelled = false;
    let progressInterval;

    const runSequence = async () => {
      window.scrollTo(0, 0);
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';

      // Preload menu image in background
      const preloadMenuImage = new Image();
      preloadMenuImage.src = '/menu-image.avif';

      // Fast, crisp progress tween (~1.1s instead of 4.5s)
      const duration = 1100;
      const start = Date.now();

      startMonitoring();

      progressInterval = setInterval(() => {
        if (isCancelled) return;
        const elapsed = Date.now() - start;
        const p = Math.min((elapsed / duration) * 100, 100);
        setProgress(p);
        if (p >= 100) clearInterval(progressInterval);
      }, 30);

      // Wait for fonts and minimum visual duration in parallel
      await Promise.all([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, duration))
      ]);

      if (isCancelled) return;

      const avgFps = stopMonitoring();
      setFps(avgFps);

      clearInterval(progressInterval);
      setProgress(100);

      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      window.scrollTo(0, 0);

      if (onComplete) onComplete();
    };

    runSequence();

    return () => {
      isCancelled = true;
      if (progressInterval) clearInterval(progressInterval);
      stopMonitoring();
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [onComplete, setFps, startMonitoring, stopMonitoring]);

  return (
    <motion.div
      className="preloader-container"
      variants={containerVariants}
      initial="initial"
      exit="exit"
    >
      {/* 5 Vertical Blinds */}
      <div className="blinds-layer">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="blind-col"
            variants={blindVariants}
          />
        ))}
      </div>

      {/* Content - Logo & Percentage */}
      <motion.div
        className="preloader-content"
        variants={logoExitVariant}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <div className="minimal-logo-wrapper">
          <img src={logoWhite} className="logo-base" alt="YFL Logo" />
          <div className="logo-fill-container" style={{ height: `${progress}%` }}>
            <img src={logoWhite} className="logo-filled" alt="" aria-hidden="true" />
          </div>
        </div>

        <div className="minimal-counter">
          {Math.round(progress)}%
        </div>
      </motion.div>
    </motion.div>
  );
}

export default Preloader;
