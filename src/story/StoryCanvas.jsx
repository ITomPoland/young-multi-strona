import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import StoryDirector from './StoryDirector';
import Compositor from './Compositor';
import Room from './world/Room';
import TileWall from './world/TileWall';
import HeroTile from './world/HeroTile';
import Motes from './world/Motes';
import Tower from './world/Tower';
import Studio from './studio/Studio';
import TvRoom from './tv/TvRoom';
import { ensureThreeState } from './storyThree';
import { markStoryReady } from './storyReady';

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
  // textures are in (Suspense resolved): the hero frame can be shown
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(markStoryReady));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <>
      <Room photo={photo} state={state} />
      <TileWall photo={photo} state={state} />
      <HeroTile photo={photo} cover={cover} state={state} />
      <Motes state={state} />
      <Tower state={state} />
      <Studio state={state} />
      <TvRoom state={state} />
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

function StoryCanvas({ storyVh, state, slotRef, tier = 'high' }) {
  const wrapRef = useRef(null);
  ensureThreeState(state.current);
  useSlotTracking(slotRef, state);

  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const maxDpr = tier === 'low' ? 1 : isTouch ? 1.5 : 1.75;

  // The canvas draws the hero too, so it is visible from the top of the page; it only
  // hides (and stops rendering) once the story has released on its black frame.
  useEffect(() => {
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = wrapRef.current;
      if (!el) return;
      const v = state.current.active ? 'visible' : 'hidden';
      if (el.style.visibility !== v) el.style.visibility = v;
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [state]);

  return (
    <div ref={wrapRef} className="story-canvas-wrap" aria-hidden="true">
      {/* offsetSize: measure the layout box, NOT the transformed one (the hero entrance
          scales this wrapper 1.08 -> 1; a scaled measure would offset the whole frame) */}
      <Canvas
        resize={{ offsetSize: true }}
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
        <Compositor state={state} glow={tier !== 'low'} />
      </Canvas>
    </div>
  );
}

// its props never change (a motion value, refs, the tier): the page's own state changes (the
// mini-player, the overlays) need not re-render the whole 3D scene
export default React.memo(StoryCanvas);
