// Plik: /src/components/Hero/Hero.jsx

import React, { useState, useEffect, forwardRef } from 'react';
import {
  motion,
  useTransform,
  useMotionValue,
  useSpring,
  useMotionTemplate
} from 'framer-motion';
import './Hero.css';

// Responsive image imports with srcset
import cutoutPersonSrcset from '../../assets/cutout-person.avif?w=400;800;1200&format=avif&as=srcset';
import cutoutPersonFallback from '../../assets/cutout-person.avif?w=800&format=avif';

const Hero = forwardRef(function Hero({ scrollY, startAnimation = false }, ref) {
  const mouseX = useMotionValue(0);

  const smoothMouseX = useSpring(mouseX, {
    stiffness: 50,
    damping: 20,
    mass: 1
  });

  const [viewport, setViewport] = useState({ width: 1200, height: 900 });

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const isMobile = viewport.width <= 768;

  const xYoung = useTransform(smoothMouseX, [0, viewport.width], [50, -50]);
  const xMulti = useTransform(smoothMouseX, [0, viewport.width], [-50, 50]);

  // Exact pixel sync with NewSong's 0..0.095 WebGL reveal (0.095 * 11.5vh = 1.0925vh)
  const revealDistance = Math.max(viewport.height * 1.0925, 650);
  const y = useTransform(scrollY, [0, revealDistance], [0, -85]);
  const scale = useTransform(scrollY, [0, revealDistance], [1, 1.08]);
  const brightness = useTransform(scrollY, [0, revealDistance], [1, 0.35]);
  const filter = useMotionTemplate`brightness(${brightness})`;

  const handleMouseMove = (e) => {
    mouseX.set(e.clientX);
  };

  return (
    <motion.section
      ref={ref}
      className="hero-section"
      data-header-theme="light"
      onMouseMove={handleMouseMove}
    >
      <motion.div
        className="hero-content-wrapper"
        style={{ y, scale, filter }}
      >
        <motion.img
          src="/multiztlem.avif"
          alt="Tło"
          className="hero-background-image"
          fetchPriority="high"
          initial={{ opacity: 0.01, scale: 1.15 }}
          animate={startAnimation ? { opacity: 1, scale: 1 } : { opacity: 0.01, scale: 1.15 }}
          transition={{ duration: 1.5, delay: 0.1, ease: [0.76, 0, 0.24, 1] }}
        />

        <div className="hero-person-container">
          <motion.img
            srcSet={cutoutPersonSrcset}
            src={cutoutPersonFallback}
            sizes="(max-width: 768px) 100vw, 50vw"
            alt="Young Multi"
            className="hero-cutout-image"
            fetchPriority="high"
            initial={{ opacity: 0.01, scale: 1.1, y: 50 }}
            animate={startAnimation ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0.01, scale: 1.1, y: 50 }}
            transition={{ duration: 1.4, delay: 0.2, ease: [0.76, 0, 0.24, 1] }}
          />
        </div>

        <motion.h1
          className="text-young"
          style={{ x: isMobile ? 0 : xYoung }}
          initial={{ y: "-20%", opacity: 0.01, filter: "blur(10px)" }}
          animate={startAnimation ? { y: "-34%", opacity: 1, filter: "blur(0px)" } : { y: "-20%", opacity: 0.01, filter: "blur(10px)" }}
          transition={{
            y: { duration: 1.2, delay: 0.4, ease: [0.16, 1, 0.3, 1] },
            opacity: { duration: 1.0, delay: 0.4 },
            filter: { duration: 1.0, delay: 0.4 }
          }}
        >
          YOUNG
        </motion.h1>

        <motion.h2
          className="text-multi"
          style={{ x: isMobile ? 0 : xMulti }}
          initial={{ y: "90%", opacity: 0.01, filter: "blur(10px)" }}
          animate={startAnimation ? { y: "80%", opacity: 1, filter: "blur(0px)" } : { y: "90%", opacity: 0.01, filter: "blur(10px)" }}
          transition={{
            y: { duration: 1.2, delay: 0.6, ease: [0.16, 1, 0.3, 1] },
            opacity: { duration: 1.0, delay: 0.6 },
            filter: { duration: 1.0, delay: 0.6 }
          }}
        >
          MULTI
        </motion.h2>
      </motion.div>
    </motion.section>
  );
});

export default Hero;
