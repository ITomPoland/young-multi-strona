import React, { useRef, forwardRef } from 'react';
import { motion, useScroll, useTransform, useMotionValueEvent } from 'framer-motion';
import './NewSong.css';
import SmokeTransition from '../SmokeTransition/SmokeTransition';
import { LEGACY_START, NEWSONG_SCROLL_VH } from './timeline';

// =====================================================================
// After the story (which ends on "o mnie", S6) -> black frame.
// This section continues from that black frame: Smoke -> Merch. (The old About section that
// used to sit here is gone: "o mnie" lives in the story now, AboutOverlay.)
// ---------------------------------------------------------------------

const NewSong = forwardRef((props, ref) => {
  const scrollRef = useRef(null);
  const previousThemeRef = useRef(null);

  const { scrollYProgress } = useScroll({
    target: scrollRef,
    offset: ['start start', 'end end']
  });

  const contentProgress = useTransform(scrollYProgress, (p) => LEGACY_START + (1 - LEGACY_START) * p);

  useMotionValueEvent(contentProgress, 'change', (latest) => {
    if (typeof props.setHeaderTheme === 'function') {
      const newTheme = latest > 0.65 ? 'dark' : 'light';
      if (previousThemeRef.current !== newTheme) {
        previousThemeRef.current = newTheme;
        props.setHeaderTheme(newTheme);
      }
    }
  });

  // === 1. ENTRANCE FROM THE STORY'S BLACK FRAME ===
  const blackVeil = useTransform(scrollYProgress, [0, 0.035], [1, 0]);
  const viewportPointerEvents = useTransform(scrollYProgress, (v) => (v > 0.02 ? 'auto' : 'none'));

  // === 3. SMOKE TRANSITION INTO MERCH ===
  const cloudProgress = useTransform(contentProgress, [0.84, 1.0], [0, 1]);
  const smokeZIndex = useTransform(contentProgress, [0, 0.79, 0.8, 1], [0, 0, 100, 100]);
  const smokeOpacity = useTransform(contentProgress, [0.77, 0.84], [0, 1]);

  return (
    <motion.section
      id="dyskografia"
      ref={(node) => {
        scrollRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      className="newsong-section"
      data-header-theme="dark"
      style={{ height: `calc(${NEWSONG_SCROLL_VH + 100} * 1vh)` }}
    >
      <motion.div className="newsong-sticky-viewport" style={{ pointerEvents: viewportPointerEvents }}>
        <div className="newsong-stage">
          {/* LAYER 3: SMOKE TRANSITION INTO MERCH */}
          <motion.div
            className="newsong-smoke-layer"
            style={{ zIndex: smokeZIndex, opacity: smokeOpacity }}
          >
            <SmokeTransition progress={cloudProgress} />
          </motion.div>

          {/* continuity with the story: we arrive here from total darkness */}
          <motion.div className="newsong-black-veil" style={{ opacity: blackVeil }} aria-hidden="true" />
        </div>
      </motion.div>
    </motion.section>
  );
});

export default NewSong;
