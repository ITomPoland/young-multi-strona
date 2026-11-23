import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import StoryDirector from './StoryDirector';
import DitherPass from './DitherPass';
import Room from './world/Room';
import TileWall from './world/TileWall';
import HeroTile from './world/HeroTile';
import { ensureThreeState } from './storyThree';

function useRawTexture(src) {
  const tex = useLoader(THREE.TextureLoader, src);
  useMemo(() => {
    tex.colorSpace = THREE.NoColorSpace; // raw values, identical to the hero's WebGL sampling
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
  }, [tex]);
  return tex;
}

function World({ state }) {
  const photo = useRawTexture('/hero-empty-room.jpg');
  const cover = useRawTexture('/release-cover.jpg');
  return (
    <>
      <Room photo={photo} state={state} />
      <TileWall photo={photo} state={state} />
      <HeroTile photo={photo} cover={cover} state={state} />
    </>
  );
}

// Keeps state.slot in sync with the DOM element the hero tile must sit on
function useSlotTracking(slotRef, state) {
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return undefined;
    // Measured relative to the sticky viewport that also holds the canvas, so the rect is in
    // canvas pixels. The slot itself is never transformed, only its siblings are.
    const frame = el.closest('.story-sticky');
    const update = () => {
      const r = el.getBoundingClientRect();
      const f = frame?.getBoundingClientRect();
      state.current.slot = {
        x: r.left - (f?.left ?? 0),
        y: r.top - (f?.top ?? 0),
        w: r.width,
        h: r.height
      };
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (frame) ro.observe(frame);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [slotRef, state]);
}

export default function StoryCanvas({ storyVh, state, slotRef, tier = 'high' }) {
  const wrapRef = useRef(null);
  ensureThreeState(state.current);
  useSlotTracking(slotRef, state);

  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const maxDpr = tier === 'low' ? 1 : isTouch ? 1.5 : 1.75;

  // Fade the canvas in over the hero (cheap DOM opacity, no React re-render)
  useEffect(() => {
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = wrapRef.current;
      if (!el) return;
      const s = state.current;
      const o = s.canvasOpacity;
      el.style.opacity = String(o);
      el.style.visibility = s.active && o > 0.001 ? 'visible' : 'hidden';
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [state]);

  return (
    <div ref={wrapRef} className="story-canvas-wrap" aria-hidden="true">
      <Canvas
        flat
        linear
        dpr={[1, maxDpr]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ position: [0, 0, 0], near: 0.03, far: 60 }}
      >
        <StoryDirector storyVh={storyVh} state={state} />
        <Suspense fallback={null}>
          <World state={state} />
        </Suspense>
        <DitherPass state={state} glow={tier !== 'low'} />
      </Canvas>
    </div>
  );
}
