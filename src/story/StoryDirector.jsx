import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CHAPTER_RANGES, CANVAS_FADE_VH, chapterProgress } from './story.config';
import { PHOTO } from './world/calibration';
import { REST_SIZE, heroTileAt } from './storyThree';

// =====================================================================
// The director turns ONE number (scroll position in story-vh) into everything:
// camera pose + lens, crack/burst timing (with the bullet-time curve), the hero tile's
// flight and the pixel-locked pose next to the DOM text. Runs first every frame.
// =====================================================================

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInCubic = (t) => t * t * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// Lens: the view window over the photo plane (in pixels around the principal point).
// zoom = 1 + offsetY = principal->photo centre reproduces the hero's CSS "cover" crop 1:1.
function applyLens(camera, aspect, offsetYpx, zoom = 1) {
  const photoAspect = PHOTO.width / PHOTO.height;
  let halfW;
  let halfH;
  if (aspect <= photoAspect) {
    halfH = PHOTO.height / 2;
    halfW = halfH * aspect;
  } else {
    halfW = PHOTO.width / 2;
    halfH = halfW / aspect;
  }
  halfW /= zoom;
  halfH /= zoom;
  const cxOff = PHOTO.width / 2 - PHOTO.cx;
  const near = camera.near;
  const k = near / PHOTO.f;
  const left = (cxOff - halfW) * k;
  const right = (cxOff + halfW) * k;
  const top = (offsetYpx + halfH) * k;
  const bottom = (offsetYpx - halfH) * k;
  camera.projectionMatrix.makePerspective(left, right, top, bottom, near, camera.far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return { left: left / near, right: right / near, top: top / near, bottom: bottom / near };
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _basePos = new THREE.Vector3();
const _baseQuat = new THREE.Quaternion();
const _tilePos = new THREE.Vector3();
const _tileQuat = new THREE.Quaternion();
const _lockPos = new THREE.Vector3();
const _lockQuat = new THREE.Quaternion();
const _endPos = new THREE.Vector3();
const _endQuat = new THREE.Quaternion();

export default function StoryDirector({ storyVh, state }) {
  const { camera, size } = useThree();

  useEffect(() => {
    camera.near = 0.03;
    camera.far = 60;
    if (import.meta.env.DEV) window.__story = { state: state.current, camera };
    const onMove = (e) => {
      state.current.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      state.current.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [camera, state]);

  useFrame((frame, dt) => {
    const s = state.current;
    const vh = storyVh.get();
    s.vh = vh;
    const time = frame.clock.elapsedTime;
    const aspect = size.width / Math.max(size.height, 1);

    const [explodeStart, explodeEnd] = CHAPTER_RANGES.explode;
    const [singleStart, singleEnd] = CHAPTER_RANGES.single;
    const [, turnEnd] = CHAPTER_RANGES.turn;

    s.active = vh >= CANVAS_FADE_VH[0] - 2 && vh <= turnEnd + 2;
    s.canvasOpacity = smooth(CANVAS_FADE_VH[0], CANVAS_FADE_VH[1], vh);

    const q = chapterProgress('explode', vh);
    const sp = chapterProgress('single', vh);
    const d = chapterProgress('turn', vh);
    s.single = sp;
    s.turn = d;

    // --- cracks: the grout Multi's dust went into is already glowing at the hand-off ---
    // the grout under the dust is lit from the very first 3D frame (no gap at the hand-off)
    s.crack = Math.max(0.22, smooth(0, 0.3, q) * 0.72);

    // --- SPEED RAMP (music-video edit): burst -> near-freeze while the single passes
    //     -> time snaps back as we whip through the hole ---
    const bu = clamp01((q - 0.28) / 0.72);
    s.burst =
      1.0 * (1 - Math.pow(1 - bu, 2.4)) +
      sp * 0.07 +
      easeInCubic(clamp01(d / 0.6)) * 1.2 +
      Math.max(0, d - 0.6) * 0.35;


    // --- CAMERA ---------------------------------------------------------------
    const DEG = Math.PI / 180;
    // lens first (independent of the pose): hero crop -> centred, wider on the punch / whip
    const m = easeInOutCubic(clamp01(d / 0.6)); // the whip through the hole
    const startOff = PHOTO.cy - PHOTO.height / 2;
    const lensOff = THREE.MathUtils.lerp(startOff, 0, smooth(0, 0.6, q));
    const punchPeak = smooth(0.28, 0.42, q) * (1 - smooth(0.45, 0.9, q));
    const zoom = 1 - punchPeak * 0.12 - Math.sin(m * Math.PI) * 0.16;
    const frustum = applyLens(camera, aspect, lensOff, zoom);

    // (A) base path: creep while the grout glows, punch-in on the burst, start turning
    const creep = smooth(0, 0.28, q) * 0.35;
    const punch = easeOutCubic(clamp01((q - 0.28) / 0.72)) * 1.45;
    const shakeAmt = smooth(0.12, 0.3, q) * (1 - smooth(0.32, 0.7, q)) * 0.016 + Math.sin(m * Math.PI) * 0.006;
    const shakeX = Math.sin(time * 41.0) * Math.sin(time * 13.7) * shakeAmt;
    const shakeY = Math.sin(time * 37.0 + 1.3) * Math.cos(time * 11.3) * shakeAmt;
    const yawScale = THREE.MathUtils.lerp(0.55, 1, clamp01((aspect - 0.5) / 1.0));
    _basePos.set(shakeX, shakeY, -(creep + punch));
    _e.set(0, smooth(0.5, 1, q) * 14 * DEG * yawScale, (smooth(0.3, 0.55, q) * (1 - smooth(0.6, 1, q)) * 4 * DEG) + shakeX * 0.6, 'YXZ');
    _baseQuat.setFromEuler(_e);

    // (B) the single's tile flies on its own ballistic path (same clock as the debris)
    const t = s.heroTile;
    heroTileAt(s.burst, t.position, t.quaternion);
    // after the hold the camera lets go: frame it where it was when time snapped back
    const RELEASE_BURST = 1.07; // burst clock at the end of the hold (1.0 + 0.07)
    const lockBurst = d > 0 ? Math.min(s.burst, RELEASE_BURST) : s.burst;
    heroTileAt(lockBurst, _tilePos, _tileQuat);

    // camera pose that frames the tile exactly in the DOM slot (camera faces its print)
    let slotW = 0.5;
    let sx = 0;
    let sy = 0;
    if (s.slot && size.width > 0) {
      const { x, y, w } = s.slot;
      const h = s.slot.h;
      const nx = (x + w / 2) / size.width;
      const ny = 1 - (y + h / 2) / size.height;
      sx = frustum.left + nx * (frustum.right - frustum.left);
      sy = frustum.bottom + ny * (frustum.top - frustum.bottom);
      slotW = (w / size.width) * (frustum.right - frustum.left);
    }
    const dist = REST_SIZE.x / Math.max(slotW, 0.05);
    const p = s.pointer;
    const k = Math.min(1, dt * 3);
    p.sx += (p.x - p.sx) * k;
    p.sy += (p.y - p.sy) * k;
    const holdW = smooth(0.28, 0.42, sp) * (1 - smooth(0.0, 0.12, d));
    // mouse orbits the camera around the tile (tile stays in the slot, world parallaxes)
    _e.set(p.sy * 0.06 * holdW, -p.sx * 0.09 * holdW, 0, 'YXZ');
    _q.setFromEuler(_e);
    _lockQuat.copy(_tileQuat).multiply(_q);
    _lockPos.copy(_tilePos).sub(_v.set(sx * dist, sy * dist + Math.sin(time * 0.8) * 0.002 * holdW, -dist).applyQuaternion(_lockQuat));

    // (C) the whip: from wherever we let go of the tile, through the hole, 180° around
    _endQuat.setFromEuler(_e.set(0, Math.PI + (easeOutCubic(clamp01((d - 0.6) / 0.4)) * 2.5 * DEG), 0, 'YXZ'));
    const after = easeOutCubic(clamp01((d - 0.6) / 0.4));
    _endPos.set(0, 0, -7.1 - after * 0.45);

    // blend A -> B (meet the tile as time slows down) -> C (let go, whip through the hole)
    const meet = easeInOutCubic(clamp01((vh - (explodeStart + (explodeEnd - explodeStart) * 0.62)) / ((singleStart + (singleEnd - singleStart) * 0.32) - (explodeStart + (explodeEnd - explodeStart) * 0.62))));
    camera.position.copy(_basePos).lerp(_lockPos, meet);
    camera.quaternion.copy(_baseQuat).slerp(_lockQuat, meet);
    if (d > 0) {
      // arc a little sideways while passing the rim, roll into the turn
      const arc = Math.sin(m * Math.PI);
      camera.position.lerp(_endPos, m);
      camera.position.x += arc * 0.22;
      camera.quaternion.slerp(_endQuat, m);
      camera.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), -arc * 7 * DEG));
    }
    camera.position.x += shakeX * (1 - meet);
    camera.updateMatrixWorld();
    s.camPos.copy(camera.position);

    s.black = smooth(0.84, 0.98, d);

    // --- the tile's print burns in while it tumbles toward us ---
    const flyStart = explodeStart + (explodeEnd - explodeStart) * 0.3;
    const flyEnd = singleStart + (singleEnd - singleStart) * 0.34;
    const e = easeOutCubic(clamp01((vh - flyStart) / (flyEnd - flyStart)));
    t.reveal = smooth(0.45, 0.95, e);
    t.scale.copy(REST_SIZE);
    t.visible = true;
  });
  return null;
}
