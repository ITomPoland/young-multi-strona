import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CHAPTER_RANGES, BEATS, chapterProgress, heroTr, crackFront, burstClock, albumFocus, ALBUM_SPACING, ALBUM_RISE, ORBIT_START_VH, whipEase, spinCarry, towerPull, REVEAL } from './story.config';
import { PHOTO, TOWER } from './world/calibration';
import { REST_SIZE, heroTileAt } from './storyThree';

// =====================================================================
// The director turns ONE number (scroll position in story-vh) into everything:
// camera pose + lens, crack front, burst clock (speed ramp that never stops), the burst
// pulse, the hero tile's flight and the pixel-locked pose next to the DOM text.
// Timings live in story.config (BEATS). Runs first every frame.
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
  const { camera, size, scene } = useThree();

  useEffect(() => {
    camera.near = 0.03;
    camera.far = 60;
    if (import.meta.env.DEV) window.__story = { state: state.current, camera, scene };
    const onMove = (e) => {
      state.current.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      state.current.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [camera, scene, state]);

  useFrame((frame, dt) => {
    const s = state.current;
    const vh = storyVh.get();
    // scroll velocity (vh / s), smoothed: drives the secondary motion out at the tower
    const dts = Math.min(Math.max(dt, 1 / 240), 0.1);
    // a stalled frame (a hitch: the scroll ran on meanwhile) is not a burst of speed: it would
    // flash the speed effects (wider lens, glitching covers) for nothing
    const stalled = dt > 0.1;
    const rawVel = s.vh === undefined || stalled ? s.vel ?? 0 : THREE.MathUtils.clamp((vh - s.vh) / dts, -600, 600);
    s.vel = (s.vel ?? 0) + (rawVel - (s.vel ?? 0)) * (1 - Math.exp(-dts * 7));
    s.vh = vh;
    const time = frame.clock.elapsedTime;
    const aspect = size.width / Math.max(size.height, 1);
    const B = BEATS.burst;
    const CAUGHT = BEATS.caught;
    const [turnStart] = CHAPTER_RANGES.turn;

    // one canvas from the hero to the end of the story
    s.active = vh <= REVEAL.end + 2;
    s.tr = heroTr(vh);
    const d = chapterProgress('turn', vh);
    s.single = chapterProgress('single', vh);
    s.turn = d;
    // album tower: focus (-1 = the hole, i = album i), how far out we are, dither -> clean
    const ringIn = smooth(ORBIT_START_VH, ORBIT_START_VH + 95, vh);
    s.albumFocus = albumFocus(vh);
    s.ring = vh > turnStart ? 1 : 0;
    s.clean = smooth(ORBIT_START_VH + 12, ORBIT_START_VH + 80, vh);

    // --- charge: ONE crack front, from the first settled dust straight into the burst ---
    s.crack = crackFront(vh) / 12;

    // --- burst: a soft light wave runs through the room ---
    s.pulse = vh > B ? Math.min((vh - B) / BEATS.pulseVh, 1) : 0;

    // --- story time: impact -> eases into slow motion as the camera catches the tile ->
    //     slow drift through the hold -> the turn ramps it back up. Speed never hits 0.
    s.burst = burstClock(vh) + easeInCubic(clamp01(d / 0.6)) * 1.2 + Math.max(0, d - 0.6) * 0.35;

    // --- CAMERA ---------------------------------------------------------------
    const DEG = Math.PI / 180;
    // lens first (independent of the pose): hero crop -> centred, wider on the punch / whip
    // the whip through the hole: eases in, and LEAVES still moving (no brake at the handoff)
    const m = whipEase(d / 0.6);
    const arc = Math.pow(Math.sin(m * Math.PI), 2); // 0 at both ends with zero slope
    // angular speed round the tower (rad / s) from the scroll speed: bank, lens, billboards
    const dPhi = (albumFocus(vh + 0.5) - albumFocus(vh - 0.5)) * ALBUM_SPACING;
    const omega = s.vel * dPhi;
    s.towerVel = THREE.MathUtils.clamp(omega * 0.35, -1, 1) * ringIn;
    const startOff = PHOTO.cy - PHOTO.height / 2;
    const lensOff = THREE.MathUtils.lerp(startOff, 0, smooth(B - 15, B + 35, vh));
    const punchPeak = smooth(B, B + 8, vh) * (1 - smooth(B + 14, B + 50, vh));
    const speedWide = Math.min(Math.abs(omega) * 0.045, 0.1) * ringIn; // faster = wider lens
    const zoom = (1 - punchPeak * 0.12 - arc * 0.18) * (1 + ringIn * 0.12) * (1 - speedWide);
    const frustum = applyLens(camera, aspect, lensOff, zoom);
    s.frustum = frustum; // per unit depth: the opened album covers exactly this view

    // (A) base path: creeps in while the charge builds, punches in on the burst
    const creep = smooth(BEATS.charge[0], B, vh) * 0.35;
    const punch = easeOutCubic(clamp01((vh - B) / 60)) * 1.45;
    const shakeAmt = smooth(B - 30, B, vh) * (1 - smooth(B + 3, B + 40, vh)) * 0.016 + arc * 0.006;
    const shakeX = Math.sin(time * 41.0) * Math.sin(time * 13.7) * shakeAmt;
    const shakeY = Math.sin(time * 37.0 + 1.3) * Math.cos(time * 11.3) * shakeAmt;
    const yawScale = THREE.MathUtils.lerp(0.55, 1, clamp01((aspect - 0.5) / 1.0));
    _basePos.set(shakeX, shakeY, -(creep + punch));
    _e.set(0, smooth(B + 20, B + 65, vh) * 14 * DEG * yawScale, (smooth(B + 2, B + 22, vh) * (1 - smooth(B + 28, B + 60, vh)) * 4 * DEG) + shakeX * 0.6, 'YXZ');
    _baseQuat.setFromEuler(_e);

    // (B) the single's tile flies on its own ballistic path (same clock as the debris)
    const t = s.heroTile;
    heroTileAt(s.burst, t.position, t.quaternion);
    // The camera does NOT chase the tile off the wall: it heads straight for where the
    // tile will be when it is caught (CAUGHT) and the tile flies into that frame. From the
    // catch on it follows the (slow-motion) tile; after the hold it lets go.
    const caughtBurst = burstClock(CAUGHT);
    const releaseBurst = burstClock(turnStart);
    // (eased in, so following the slow tile starts without a kink: x²/(x+k) has slope 0 at 0)
    const over = Math.max(Math.min(s.burst, releaseBurst) - caughtBurst, 0);
    const lockBurst = caughtBurst + (over * over) / (over + 0.015);
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
    const holdW = smooth(CAUGHT - 8, CAUGHT + 10, vh) * (1 - smooth(0.0, 0.12, d));
    // mouse orbits the camera around the tile (tile stays in the slot, world parallaxes);
    // a slow breathing drift keeps the frozen moment alive
    const drift = holdW * (1 - smooth(0.0, 0.08, d));
    _e.set(p.sy * 0.06 * holdW + Math.sin(time * 0.37) * 0.012 * drift, -p.sx * 0.09 * holdW + Math.sin(time * 0.23 + 1.1) * 0.018 * drift, 0, 'YXZ');
    _q.setFromEuler(_e);
    _lockQuat.copy(_tileQuat).multiply(_q);
    _lockPos.copy(_tilePos).sub(_v.set(sx * dist, sy * dist + Math.sin(time * 0.8) * 0.002 * holdW, -dist).applyQuaternion(_lockQuat));

    // (C) the whip: from wherever we let go of the tile, through the hole, 180° around
    // (from ORBIT_START_VH, d = 0.6, the tower orbit (D) takes over, already moving)
    _endQuat.setFromEuler(_e.set(0, Math.PI, 0, 'YXZ'));
    _endPos.set(0, 0, -7.1);

    // ONE move: from the impact straight to the catch pose, arriving as time has slowed
    const meet = easeInOutCubic(clamp01((vh - (B + 2)) / (CAUGHT - (B + 2))));
    camera.position.copy(_basePos).lerp(_lockPos, meet);
    camera.quaternion.copy(_baseQuat).slerp(_lockQuat, meet);
    if (d > 0) {
      // arc a little sideways while passing the rim, roll into the turn
      camera.position.lerp(_endPos, m);
      camera.position.x += arc * 0.22;
      camera.quaternion.slerp(_endQuat, m);
      camera.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), -arc * 7 * DEG));
    }
    camera.position.x += shakeX * (1 - meet);

    // (D) THE TOWER: out of the wound without stopping. The whip's momentum is handed on:
    // its spin overshoots the tower and swings back (spinCarry), its forward speed becomes
    // the pull-out (exponential, starts at the whip's speed), and the orbit picks up from
    // rest. Out here the camera is a drone, not a rail: it breathes out between albums and
    // in on each one, banks into the turn and widens the lens with the scroll speed, looks
    // a touch ahead of where it is going, and never quite holds still.
    if (vh > ORBIT_START_VH) {
      const f = s.albumFocus;
      const phi = (f + 1) * ALBUM_SPACING;
      const startR = TOWER.z + 7.1; // where the turn left us (z = -7.1), measured from the axis
      const between = f > 0 ? Math.pow(Math.sin(f * Math.PI), 2) : 0; // 0 on each album
      // portrait: the lens is narrow, so stand further off and keep the album in the upper
      // half of the frame, clear of its title at the bottom
      const narrow = clamp01((1 - aspect) / 0.55) * ringIn;
      const r =
        startR +
        narrow * 2.8 +
        towerPull(vh) +
        between * 1.5 +
        Math.sin(time * 0.21) * 0.06 * ringIn;
      const albumH = (f + 1) * ALBUM_RISE;
      // rises with the orbit (eased in from the hole's height), floats over each album
      const y = albumH * ringIn + 0.55 * ringIn + between * 0.5 + Math.sin(time * 0.37) * 0.05 * ringIn;
      camera.position.set(TOWER.x - Math.sin(phi) * r, y, TOWER.z - Math.cos(phi) * r);
      const lookY = albumH + 0.12 * ringIn - narrow * 1.1;
      const pitch = Math.atan2(lookY - y, r);
      // on wide screens the billboard sits right of centre, leaving room for its title
      const sideOffset = 0.17 * clamp01((aspect - 0.9) / 0.6) * ringIn;
      const lead = THREE.MathUtils.clamp(omega * 0.025, -0.06, 0.06) * ringIn;
      const bank = THREE.MathUtils.clamp(-omega * 0.05, -0.12, 0.12) * ringIn;
      const drift = ringIn * (1 - Math.min(Math.abs(omega) * 0.5, 1));
      _e.set(
        pitch + p.sy * 0.03 * ringIn + Math.sin(time * 0.29 + 0.7) * 0.008 * drift,
        Math.PI + phi + spinCarry(vh) + sideOffset + lead - p.sx * 0.045 * ringIn + Math.sin(time * 0.19) * 0.01 * drift,
        bank + Math.sin(time * 0.23 + 2.0) * 0.006 * drift,
        'YXZ'
      );
      camera.quaternion.setFromEuler(_e);
    }
    camera.updateMatrixWorld();
    s.camPos.copy(camera.position);

    // --- the reveal (S6): the studio takes the screen over at REVEAL.switch (see Studio.jsx) ---
    // ...and gives it back (scrolling up) only once the studio camera has really come back
    // onto the glass: it follows the scroll on a spring, so it lags; handing back while it is
    // still out would cut from the head straight to the tower
    s.studioOn = vh >= REVEAL.switch || (s.studioOn && (s.studioU ?? 0) > 0.0015);
    s.revBulge = smooth(REVEAL.switch, REVEAL.pull[0] + 16, vh); // the picture turns into glass
    const pullT = clamp01((vh - REVEAL.pull[0]) / (REVEAL.pull[1] - REVEAL.pull[0]));
    // from rest (no kick), fastest a third of the way, then a long brake: 1 - (1-t)^3 (1+3t)
    s.revPull = 1 - Math.pow(1 - pullT, 3) * (1 + 3 * pullT);
    s.revScan = smooth(REVEAL.scan[0], REVEAL.scan[1], vh);
    s.revHold = smooth(REVEAL.hold[0] - 10, REVEAL.hold[0] + 10, vh);

    // black at the very end, where the next section takes over
    s.black = smooth(REVEAL.end - 34, REVEAL.end - 4, vh);

    // --- the tile's print burns in while it tumbles toward us ---
    const e = easeOutCubic(clamp01((vh - (B + 3)) / (CAUGHT - (B + 3))));
    t.reveal = smooth(0.45, 0.95, e);
    t.scale.copy(REST_SIZE);
    t.visible = true;
  });
  return null;
}
