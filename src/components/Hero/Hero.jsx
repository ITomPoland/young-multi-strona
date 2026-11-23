// Plik: /src/components/Hero/Hero.jsx

import React, { forwardRef, useState } from 'react';
import './Hero.css';
import { hasWebGL } from '../../story/webgl';

// Story chapter S0. The hero is DRAWN by the story canvas (src/story/StoryCanvas.jsx):
// the room, Multi, the YOUNG MULTI type and his dust live in the same renderer as the
// rest of the story, so there is no hand-off between two canvases. This section only
// holds the semantic H1, the dark backdrop and the no-WebGL fallback.
const Hero = forwardRef(function Hero(_props, ref) {
  const [webgl] = useState(hasWebGL);

  return (
    <section ref={ref} className="hero-section" data-header-theme="dark">
      {/* Semantic H1 for SEO & screen readers (visual display type is composited inside WebGL) */}
      <h1 className="hero-sr-only">YOUNG MULTI</h1>

      {!webgl && (
        <div className="hero-content-wrapper">
          <div className="hero-video-stage">
            <video
              src="/hero-stacked.mp4"
              poster="/hero-poster-stacked.jpg"
              muted
              loop
              playsInline
              autoPlay
              preload="auto"
              className="hero-video-fallback"
              aria-hidden="true"
            />
          </div>
        </div>
      )}
    </section>
  );
});

export default Hero;
