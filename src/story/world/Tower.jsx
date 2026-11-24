import React, { useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ALBUMS } from '../../data/albums';
import { ALBUM_SPACING, ALBUM_RISE } from '../story.config';
import { TOWER, TOWER_HOLE_SCALE, PITCH_X, HOLE_CENTER, GLSL_HOLE } from './calibration';
import { getHoleTexture } from './hole';
import { ensureScene, stepScene } from '../sceneState';
import { albumColor, ROOM_LIGHT } from './albumColor';

// =====================================================================
// S5: THE TOWER. The room is inside it; we flew out through the wound in its skin.
// The skin itself is never seen as a shape: away from the glowing wound it is as black as
// the void, so there is no column, no top, no silhouette. What is seen floats round it:
// the album covers (curved LED panels, spiralling up, each ALBUM_SPACING further round and
// ALBUM_RISE higher, clear of the hole) and two scrolling ticker rings.
// The panels drift and bob on their own, straighten and come forward when the camera is
// on them, and react to the scroll speed (drag, ripple, glitch, RGB split). Out of focus
// they are the hero's dither; in focus the clean cover locks on. Click: the panel flies
// onto the view and becomes the album scene's backdrop (see sceneState.js).
// The compositor drops its own dither out here, so the panels carry it themselves.
// Lock-on: the clean cover breaks through the dither tile by tile along cracks, like the
// wall did, its front glowing like lit grout. Colour: every album has one (read from its
// cover); the album in focus tints the void, its glow and the tickers.
// =====================================================================

const BILL_W = 3.0; // metres of arc
const BILL_H = 3.0;
const BILL_R = TOWER.radius + 0.6; // off the skin: they float
const TICKER_R = BILL_R - 0.12; // just behind the panels' plane (they never overlap)
// THE RIBBONS: two ticker ribbons tangled round the chain of albums, with no fixed pattern.
// Each one follows its own irregular path: a few waves of unrelated frequencies on top of
// one another (height, swing off the tower, bank), so every gap looks different: here
// they cross, there they run side by side, one swings far out while the other hugs the
// tower. Round a cover they never cut through it: where a ribbon is at the cover's height
// it slips BEHIND the album; only once it is clear of the cover's edge may it come round
// IN FRONT. The whole tangle slowly drifts over time. It never flips over (text readable).
// The path is computed in the vertex shader from (q, side): q = album index along the
// chain (fractional), side = -1 / +1 across the ribbon's width. The ends taper to nothing.
// ribbonCenter() below mirrors it (minus the drift) to space the text by length.
const RIBBON_GAP = 0.3; // metres of air between a cover's edge and its ribbon
const TICKERS = [
  { twist: 1, h: 0.36, speed: 0.018, ph: [0.0, 1.7, 4.1, 0.6, 2.3, 0.9, 3.3] },
  { twist: -1, h: 0.5, speed: -0.012, ph: [2.9, 0.4, 1.2, 3.8, 5.1, 2.2, 0.3] }
];
const RIBBON_Q = [-1.9, ALBUMS.length - 1 + 0.95]; // from before the wound to past the last album
const RIBBON_SEGS_PER_Q = 120;
const R_BEHIND = BILL_R - 0.4; // behind a cover (the skin is 0.15 further in)
const R_FRONT = BILL_R + 0.75; // in front of a cover (clear of it coming forward in focus)
const COVER_CLEAR = [BILL_H / 2 + 0.05, BILL_H / 2 + 0.45]; // height off a cover's centre: behind -> may come in front

const RIBBON_VERT = /* glsl */ `
  attribute float aQ;
  attribute float aS;
  attribute float aL; // metres along the (resting) path: the text runs by length, not angle
  uniform float uTime;
  uniform float uTwist;
  uniform float uH;
  uniform float uW;
  uniform float uPh[7];
  varying vec2 vUv;
  varying vec3 vWorld;

  const float PI = 3.14159265;

  // height off the album chain (in uH), swing off the tower in the gaps, bank
  float wave(float q) { return 0.62 * sin(2.2 * q + uPh[0]) + 0.38 * sin(3.7 * q + uPh[1]) + 0.28 * sin(0.9 * q + uPh[2]); }
  float swingW(float q) { return 0.5 + 0.5 * sin(1.3 * q + uPh[3]) + 0.3 * sin(2.9 * q + uPh[4]); }
  float bankW(float q) { return 0.42 * sin(1.7 * q + uPh[5]) + 0.18 * sin(4.1 * q + uPh[6]); }
  // 1 round a cover (or the wound), 0 in the gap between two
  float coverZone(float q) { return 1.0 - smoothstep(0.2, 0.4, abs(q - floor(q + 0.5))); }

  vec3 center(float q) {
    float drift = sin(uTime * 0.37 + q * 1.9 + uPh[2]);
    float v = wave(q) + drift * 0.12;
    float yOff = v * uH;
    // at a cover's height it goes behind the album; clear of the edge it may come in front
    float front = smoothstep(${COVER_CLEAR[0].toFixed(3)}, ${COVER_CLEAR[1].toFixed(3)}, abs(yOff));
    float rCover = mix(${R_BEHIND.toFixed(3)}, ${R_FRONT.toFixed(3)}, front);
    float rGap = ${TICKER_R.toFixed(3)} + swingW(q) * 0.9;
    float r = mix(rGap, rCover, coverZone(q)) + drift * 0.08;
    float th = (q + 1.0) * ${ALBUM_SPACING.toFixed(5)} + PI;
    float y = (q + 1.0) * ${ALBUM_RISE.toFixed(3)} + yOff;
    return vec3(${TOWER.x.toFixed(3)} + sin(th) * r, y, ${TOWER.z.toFixed(4)} + cos(th) * r);
  }

  void main() {
    float q = aQ;
    vec3 c = center(q);
    vec3 T = normalize(center(q + 0.004) - center(q - 0.004));
    vec3 up = normalize(vec3(0.0, 1.0, 0.0) - T * T.y);
    vec3 side = cross(T, up);
    // banks with the flow (calmer round a cover), never flips: text stays readable
    float tw = uTwist * bankW(q) * (1.0 - coverZone(q) * 0.6) + sin(uTime * 0.6 + q * 2.1) * 0.1;
    vec3 wdir = up * cos(tw) + side * sin(tw);
    // the ends taper to nothing; the width swells a little along the way
    float taper = smoothstep(${RIBBON_Q[0].toFixed(2)}, ${(RIBBON_Q[0] + 0.7).toFixed(2)}, q)
      * (1.0 - smoothstep(${(RIBBON_Q[1] - 0.7).toFixed(2)}, ${RIBBON_Q[1].toFixed(2)}, q));
    float width = uW * (0.85 + 0.15 * sin(2.6 * q + uPh[0]));
    vec3 p = c + wdir * aS * width * 0.5 * taper;
    vUv = vec2(aL / ${(2 * Math.PI * TICKER_R).toFixed(4)}, aS * 0.5 + 0.5); // same density as a full ring
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

// RIBBON_VERT's center() without the drift, to measure the path's length
const smooth01 = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
function ribbonCenter(q, t, out) {
  const P = t.ph;
  const uH = BILL_H / 2 + RIBBON_GAP + t.h / 2;
  const v = 0.62 * Math.sin(2.2 * q + P[0]) + 0.38 * Math.sin(3.7 * q + P[1]) + 0.28 * Math.sin(0.9 * q + P[2]);
  const swing = 0.5 + 0.5 * Math.sin(1.3 * q + P[3]) + 0.3 * Math.sin(2.9 * q + P[4]);
  const zone = 1 - smooth01(0.2, 0.4, Math.abs(q - Math.floor(q + 0.5)));
  const yOff = v * uH;
  const rCover = R_BEHIND + (R_FRONT - R_BEHIND) * smooth01(COVER_CLEAR[0], COVER_CLEAR[1], Math.abs(yOff));
  const rGap = TICKER_R + swing * 0.9;
  const r = rGap + (rCover - rGap) * zone;
  const th = (q + 1) * ALBUM_SPACING + Math.PI;
  return out.set(TOWER.x + Math.sin(th) * r, (q + 1) * ALBUM_RISE + yOff, TOWER.z + Math.cos(th) * r);
}

// the strip: (q, side, length) per vertex; the shape is all in RIBBON_VERT
function ribbonGeometry(t) {
  const segs = Math.round((RIBBON_Q[1] - RIBBON_Q[0]) * RIBBON_SEGS_PER_Q);
  const n = (segs + 1) * 2;
  const aQ = new Float32Array(n);
  const aS = new Float32Array(n);
  const aL = new Float32Array(n);
  const idx = [];
  const prev = new THREE.Vector3();
  const cur = new THREE.Vector3();
  let len = 0;
  for (let k = 0; k <= segs; k++) {
    const q = RIBBON_Q[0] + ((RIBBON_Q[1] - RIBBON_Q[0]) * k) / segs;
    ribbonCenter(q, t, cur);
    if (k > 0) len += cur.distanceTo(prev);
    prev.copy(cur);
    for (let j = 0; j < 2; j++) {
      aQ[k * 2 + j] = q;
      aS[k * 2 + j] = j ? 1 : -1;
      aL[k * 2 + j] = len;
    }
    if (k < segs) {
      const a0 = k * 2;
      idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); // unused
  g.setAttribute('aQ', new THREE.BufferAttribute(aQ, 1));
  g.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  g.setAttribute('aL', new THREE.BufferAttribute(aL, 1));
  g.setIndex(idx);
  return g;
}

// three's CylinderGeometry: (x, z) = r (sin θ, cos θ); ours: (x, z) = -r (sin φ, cos φ) -> θ = φ + π
const thetaOf = (phi) => Math.PI + phi;

const albumPhi = (i) => (i + 1) * ALBUM_SPACING;
const albumY = (i) => (i + 1) * ALBUM_RISE;

// THE VOID: a colour per view direction, tinted by the album in focus (a wide wash and a
// glow towards it, colour pooling below). The sky sphere AND the tower's skin both use it,
// so the skin is the same colour as whatever is behind it: it still hides the far side,
// but never shows as a shape.
const GLSL_VOID = /* glsl */ `
  uniform vec3 uTint;
  uniform float uTintAmt;
  uniform vec3 uFocusDir;
  vec3 voidColor(vec3 dir) {
    float d = max(dot(dir, uFocusDir), 0.0);
    float wide = pow(d, 1.6);
    float glow = pow(d, 7.0);
    float low = smoothstep(0.15, -0.7, dir.y);
    return uTint * (0.018 + wide * 0.07 + glow * 0.17 + low * 0.035) * uTintAmt;
  }
`;

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform float uOn;
  varying vec3 vWorld;
  ${GLSL_VOID}
  void main() {
    gl_FragColor = vec4(voidColor(normalize(vWorld - cameraPosition)) * uOn, 1.0);
  }
`;

const SHELL_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// the hole in the skin: the wall's hole outline, mapped onto the cylinder (arc length, height)
const GLSL_SKIN_HOLE = /* glsl */ `
  uniform sampler2D uHole;
  ${GLSL_HOLE}
  float skinHoleDist(vec3 p) {
    float phi = atan(-(p.x - ${TOWER.x.toFixed(3)}), -(p.z - ${TOWER.z.toFixed(4)}));
    vec2 d = vec2(-phi * ${TOWER.radius.toFixed(3)} - ${HOLE_CENTER.x.toFixed(3)}, p.y - ${HOLE_CENTER.y.toFixed(3)}) / ${PITCH_X.toFixed(4)};
    float r = holeRadius(atan(d.y, d.x)) * ${TOWER_HOLE_SCALE.toFixed(3)};
    return length(d) - r; // < 0 inside the hole (tile units)
  }
`;

const SHELL_FRAG = /* glsl */ `
  uniform float uOn;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  ${GLSL_SKIN_HOLE}
  ${GLSL_VOID}
  void main() {
    float hd = skinHoleDist(vWorld);
    if (hd < 0.0) discard;
    float phi = atan(-(vWorld.x - ${TOWER.x.toFixed(3)}), -(vWorld.z - ${TOWER.z.toFixed(4)}));
    // facade panels: vertical seams every 9°, horizontal every 1.25 m
    float a = fract(phi / 0.15708 + 0.5);
    float h = fract(vWorld.y / 1.25);
    float seam = max(1.0 - smoothstep(0.0, 0.02, min(a, 1.0 - a)), 1.0 - smoothstep(0.0, 0.012, min(h, 1.0 - h)));
    // the skin only exists in the wound's light: a couple of metres out it is pure black,
    // so the tower never reads as a column (no rim, no outline, no top)
    float near = exp(-hd * 0.32);
    vec3 col = voidColor(normalize(vWorld - cameraPosition)) + vec3(0.03, 0.035, 0.04) * (1.0 - seam * 0.6) * near;
    // the room's light bleeding out round the wound
    col += vec3(0.55, 0.72, 0.8) * exp(-hd * 0.55) * 0.35;
    gl_FragColor = vec4(col * uOn, 1.0);
  }
`;

const BILL_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// The album panel: a slice of a cylinder round the tower axis (mesh origin = the axis).
// uFlat   0 -> 1: unbends it into the plane tangent at its centre (in focus)
// uFocus  0 -> 1: comes forward off the tower
// uVel   -1 -> 1: scroll speed round the tower: the middle leads and the edges trail like
//                 a sheet pulled through air, a ripple runs across it
// uOpen   0 -> 1: the album is opened: the panel unbends and flies onto a camera-facing
//                 quad that covers the whole view (uCamM, uFr, uDepth); it becomes the backdrop
// uPull:          the gap between uOpen and a value chasing it: the surface bulges towards
//                 the camera from where it was clicked (uClick) as it sets off, settles by
//                 itself as the move slows; negative on close (it dents and springs back)
// Like a sheet of paper: every vertex runs its own, delayed copy of uOpen. The clicked
//   point leads on the way out (uDir = 1) and arrives first on the way back (uDir = 0);
//   the far edges trail, so the sheet curls in an arc towards the camera and a soft wave
//   runs through it while it travels. Flat again once it has landed.
// always: drifts in and out, bobs and sways a little, each panel on its own phase
const PANEL_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uThetaC;
  uniform float uR;
  uniform float uFlat;
  uniform float uFocus;
  uniform float uVel;
  uniform float uOpen;
  uniform float uPull;
  uniform float uDir;
  uniform vec2 uClick;
  uniform mat4 uCamM;
  uniform vec4 uFr; // left, right, bottom, top per unit depth
  uniform float uDepth;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    vec3 n0 = vec3(sin(uThetaC), 0.0, cos(uThetaC)); // outward at the panel's centre
    vec3 t0 = vec3(cos(uThetaC), 0.0, -sin(uThetaC)); // along the arc (+theta)
    float th = atan(p.x, p.z) - uThetaC;
    th = atan(sin(th), cos(th));
    vec3 flatP = n0 * uR + t0 * (th * uR);
    flatP.y = p.y;
    // this vertex's own progress: delayed by its distance from the click point
    float dn = clamp(distance(uv, uClick) / 1.15, 0.0, 1.0);
    float lagD = mix(1.0 - dn, dn, uDir);
    float ov = clamp(uOpen * 1.9 - 0.9 * lagD, 0.0, 1.08);
    ov = ov < 1.0 ? ov * ov * (3.0 - 2.0 * ov) : ov; // eased per vertex, the overshoot kept
    float flight = sin(3.14159 * clamp(ov, 0.0, 1.0)); // 0 at rest and landed, 1 mid-air
    float flatK = max(uFlat, min(ov, 1.0));
    p = mix(p, flatP, flatK);
    vec3 nrm = normalize(mix(normalize(vec3(p.x, 0.0, p.z)), n0, flatK));
    float x = uv.x * 2.0 - 1.0; // -1 .. 1 across
    float y = uv.y * 2.0 - 1.0;
    float t = uTime;
    float calm = 1.0 - min(ov, 1.0);
    // floating: out/in drift, bob, a slow sway round its own centre
    float outD = 0.1 * sin(t * 0.43 + uSeed * 2.3) + uFocus * 0.4;
    // speed: the middle leads, the edges trail; a ripple runs across against the motion
    outD += abs(uVel) * (1.0 - x * x) * 0.32;
    outD += uVel * sin(x * 3.2 - y * 1.4 + t * 4.0) * 0.07;
    p += nrm * outD * calm;
    p += t0 * (uVel * (1.0 - x * x) * 0.22) * calm;
    p.y += (0.07 * sin(t * 0.61 + uSeed * 1.7) + uVel * x * x * 0.12) * calm;
    float sway = 0.035 * sin(t * 0.33 + uSeed * 3.1) * (1.0 - uFocus * 0.6) * calm;
    p += t0 * (p.y * sway);
    p += nrm * (x * sway * 0.6);

    vec4 world = modelMatrix * vec4(p, 1.0);
    if (abs(uOpen) > 0.0001 || abs(uPull) > 0.0001) {
      // the quad that covers the view at uDepth (square cover, so it covers the long side)
      vec2 c = vec2(uFr.x + uFr.y, uFr.z + uFr.w) * 0.5 * uDepth;
      float hs = max(uFr.y - uFr.x, uFr.w - uFr.z) * 0.5 * uDepth * 1.04;
      vec4 coverW = uCamM * vec4(c + vec2(x, y) * hs, -uDepth, 1.0);
      world.xyz = mix(world.xyz, coverW.xyz, ov);
      // the pull: a bump round the click point, towards the camera
      float dc = distance(uv, uClick);
      float bump = exp(-dc * dc * 7.0);
      vec3 toCam = normalize(cameraPosition - world.xyz);
      world.xyz += toCam * uPull * bump * mix(0.9, 0.12, clamp(uOpen, 0.0, 1.0));
      // the paper: picked up by one point, the rest hangs (sags) and trails in an arc,
      // a soft wave runs through the sheet; all of it gone once it has landed
      float travel = mix(1.0, 0.3, clamp(uOpen, 0.0, 1.0)); // smaller as it nears the lens
      world.xyz += toCam * flight * (0.1 + 0.5 * lagD) * travel;
      world.y -= flight * lagD * lagD * 0.55 * travel;
      world.xyz += toCam * flight * sin(dn * 7.0 - uTime * 7.5) * 0.09 * travel;
    }
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// The panel's image. The look follows the story's two states of a picture:
//  - not locked on (out of focus): the hero's turquoise 3-level Bayer dither, an LED grid
//  - locked on (in focus): the clean cover; the moment it locks, a short glitch burst
//  - speed: rows jump sideways and the channels split along the motion
//  - LOST MEDIA (uUpcoming): a damaged tape: tracking bands, it never fully locks
//  - opened (uOpen): it dissolves back into the dither, darker, as the scene's backdrop
const PANEL_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uBright;
  uniform float uTime;
  uniform float uSeed;
  uniform float uVel;
  uniform float uFocus;
  uniform float uOpen;
  uniform float uGlitch;
  uniform float uUpcoming;
  uniform float uDim;
  uniform vec3 uCol;
  uniform float uReveal;
  uniform vec2 uCrackC;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // 4x4 Bayer from two 2x2 levels: M2(x, y) = (2x + 3y) mod 4
  float m2(vec2 q) { return mod(2.0 * q.x + 3.0 * q.y, 4.0); }
  float bayer4(vec2 p) {
    vec2 q = mod(floor(p), 4.0);
    return (4.0 * m2(mod(q, 2.0)) + m2(floor(q / 2.0)) + 0.5) / 16.0;
  }
  // the hero's palette: #080A0C -> #284650 -> #C2D6E0
  vec3 dither3(float l, vec2 frag) {
    float th = bayer4(frag / 2.0);
    float s = clamp(l, 0.0, 1.0) * 2.0;
    float lo = floor(s);
    float lvl = lo + step(th, s - lo);
    vec3 c0 = vec3(0.031, 0.039, 0.047);
    vec3 c1 = vec3(0.157, 0.275, 0.314);
    vec3 c2 = vec3(0.761, 0.839, 0.878);
    return lvl < 0.5 ? c0 : (lvl < 1.5 ? c1 : c2);
  }
  // the same dither with the album's own colour worked into the mid and light tones
  vec3 dither3t(float l, vec2 frag, float amt) {
    vec3 d = dither3(l, frag);
    float th = bayer4(frag / 2.0);
    float s = clamp(l, 0.0, 1.0) * 2.0;
    float lvl = floor(s) + step(th, s - floor(s));
    vec3 c1 = mix(vec3(0.157, 0.275, 0.314), uCol * 0.4, amt);
    vec3 c2 = mix(vec3(0.761, 0.839, 0.878), mix(vec3(0.82), uCol, 0.45), amt);
    return lvl < 0.5 ? d : (lvl < 1.5 ? c1 : c2);
  }

  void main() {
    // LED frame round the screen (gone once opened)
    vec2 e = min(vUv, 1.0 - vUv);
    float edge = min(e.x, e.y);
    float frame = (1.0 - smoothstep(0.006, 0.012, edge)) * (1.0 - uOpen);
    float inner = mix(smoothstep(0.016, 0.02, edge), 1.0, uOpen);
    vec2 cuv = mix((vUv - 0.02) / 0.96, vUv, uOpen);

    // --- glitch: rows jump sideways (speed, the lock-on burst, the damaged tape) ---
    float tick = floor(uTime * 22.0);
    float tapeFlick = uUpcoming * (0.35 + 0.65 * step(0.86, hash(vec2(floor(uTime * 6.0), uSeed))));
    float g = clamp(abs(uVel) * 1.3 + uGlitch + tapeFlick, 0.0, 1.6);
    float rowN = mix(36.0, 90.0, hash(vec2(tick, 1.0)));
    float row = floor(cuv.y * rowN);
    float jump = step(1.0 - g * 0.3, hash(vec2(row, tick)));
    cuv.x += jump * (hash(vec2(row, tick + 7.0)) - 0.5) * 0.16 * g;
    // tape tracking band rolling down the damaged one
    float band = uUpcoming * exp(-pow((fract(cuv.y * 0.7 + uTime * 0.12) - 0.5) * 9.0, 2.0));
    cuv.x += band * 0.04 * sin(cuv.y * 180.0 + uTime * 30.0);

    float shift = uVel * 0.014 + jump * g * 0.012 + band * 0.01;
    vec3 cover = vec3(
      texture2D(uMap, clamp(cuv + vec2(shift, 0.0), 0.0, 1.0)).r,
      texture2D(uMap, clamp(cuv, 0.0, 1.0)).g,
      texture2D(uMap, clamp(cuv - vec2(shift, 0.0), 0.0, 1.0)).b
    );
    float lum = dot(cover, vec3(0.299, 0.587, 0.114));

    // LED screen: a fine pixel grid, a slow scan bar
    vec2 px = fract(cuv * 220.0);
    float led = 0.9 + 0.1 * step(0.18, px.x) * step(0.18, px.y);
    float scan = 1.0 + 0.05 * exp(-pow(fract(cuv.y * 0.5 - uTime * 0.07) - 0.5, 2.0) * 120.0);
    vec3 clean = cover * led * scan * uBright;

    // not locked on -> dither (in the album's colour)
    vec3 dith = dither3t(lum * (0.55 + uBright * 0.5) + band * 0.3, gl_FragCoord.xy, 0.4);

    // --- the lock-on: the clean cover breaks through the dither tile by tile, along a
    //     star of cracks from one point, like the wall did. The crack front glows like
    //     the lit grout; the tile just broken through flashes. The tape only half breaks. ---
    vec2 tg = (vUv - 0.02) / 0.96 * 11.0; // a stable tile grid (the glitch does not move it)
    vec2 cell = floor(tg);
    vec2 dc = cell + 0.5 - uCrackC * 11.0;
    float ang = atan(dc.y, dc.x);
    float rays = 0.62 + 0.75 * abs(sin(ang * 2.5 + 1.3 + uSeed)) * (0.6 + 0.4 * abs(sin(ang * 4.0 + 0.4)));
    float cd = (length(dc) * rays + hash(cell * 9.13 + uSeed) * 1.1) / 10.5;
    float front = uReveal * (1.0 - uUpcoming * 0.45) * 1.3 - 0.12;
    float broken = step(cd, front);
    float ahead = cd - front;
    vec2 gf = abs(fract(tg) - 0.5);
    float grout = smoothstep(0.42, 0.5, max(gf.x, gf.y));
    float crack = grout * (exp(-abs(ahead) * 20.0) + step(0.0, ahead) * smoothstep(0.2, 0.0, ahead) * 0.3);
    crack *= step(0.001, uReveal) * (1.0 - uOpen) * inner;
    float flash = broken * exp(-(front - cd) * 28.0);
    // a few dithered rows still flash through while the lock-on glitch runs
    float lock = broken * (1.0 - jump * min(g, 1.0) * 0.8);
    vec3 col = mix(dith, clean * (1.0 + flash * 0.7), lock) * inner;
    vec3 groutLight = mix(vec3(0.85, 1.05, 1.15), uCol * 1.3, 0.5);
    col += groutLight * crack * 1.5;

    // opened: the cover dissolves into a darker dither (the album's colour), the backdrop
    vec3 back = dither3t(lum * 0.62, gl_FragCoord.xy, 0.6) * 0.8;
    col = mix(col, back, smoothstep(0.25, 0.9, uOpen));

    col += mix(vec3(0.85, 0.95, 1.05), uCol * 1.15, 0.45 * uFocus) * frame * (0.5 + uBright * 0.9);
    // scanlines on the damaged tape
    col *= 1.0 - uUpcoming * 0.18 * step(0.5, fract(gl_FragCoord.y / 3.0)) * (1.0 - uOpen);
    col *= 1.0 - uDim;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const TICKER_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOffset;
  uniform float uOn;
  uniform float uRepeat;
  uniform vec3 uTint;
  uniform float uTintAmt;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${GLSL_SKIN_HOLE}
  void main() {
    if (skinHoleDist(vWorld) < 0.3) discard;
    float rule = 1.0 - smoothstep(0.0, 0.05, min(vUv.y, 1.0 - vUv.y));
    // the back of the ribbon (seen where it wraps round the far side) carries the same
    // text, un-mirrored, so the whole ribbon reads as one continuous ticker
    vec2 tuv = gl_FrontFacing ? vUv : vec2(-vUv.x, vUv.y);
    float a = texture2D(uMap, vec2(fract(tuv.x * uRepeat + uOffset * (gl_FrontFacing ? 1.0 : -1.0)), tuv.y)).a;
    vec3 ink = mix(vec3(0.95, 1.0, 1.05), mix(vec3(1.0), uTint, 0.45), uTintAmt) * 1.15;
    vec3 col = mix(vec3(0.015, 0.017, 0.02) + uTint * 0.025 * uTintAmt, ink, a);
    col += mix(vec3(0.5, 0.62, 0.68), uTint * 0.9, uTintAmt) * rule * 0.5;
    gl_FragColor = vec4(col * uOn, 1.0);
  }
`;

// One seamless run of the ticker text; the shader repeats it a whole number of times
// round the ring (so the loop never cuts a word)
function tickerCanvas() {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '700 84px "Antonio", sans-serif';
  const items = ['YOUNG MULTI', ...ALBUMS.map((a) => `${a.title} ${a.year}`), 'ZA KAŻDYM RA2EM'];
  const text = `${items.join('   ✦   ')}   ✦   `;
  ctx.font = font;
  const w = Math.min(Math.ceil(ctx.measureText(text).width), 8192);
  c.width = w;
  c.height = 128;
  ctx.font = font;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 66);
  return c;
}

function useCovers() {
  const textures = useLoader(THREE.TextureLoader, ALBUMS.map((a) => a.cover));
  useMemo(() => {
    textures.forEach((t) => {
      t.colorSpace = THREE.NoColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.anisotropy = 8;
      t.needsUpdate = true;
    });
  }, [textures]);
  return textures;
}

const OPEN_DEPTH = 0.6; // metres in front of the camera where the opened album lands
const _ndc = new THREE.Vector2();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _tint = new THREE.Vector3();
const REVEAL_IN = 1.5; // per second: the crack run takes ~0.7 s, whatever the scroll speed
const REVEAL_OUT = 2.5;

// world centre of album i's panel (i = -1: the wound)
function panelCenter(i, out) {
  const phi = albumPhi(i);
  return out.set(TOWER.x - Math.sin(phi) * BILL_R, albumY(i), TOWER.z - Math.cos(phi) * BILL_R);
}

export default function Tower({ state }) {
  const groupRef = useRef();
  const panelRefs = useRef([]);
  const { camera } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const textures = useCovers();
  const holeTex = getHoleTexture();
  const skyRef = useRef();
  // one colour per album, read from the covers once
  const colors = useMemo(() => textures.map((t) => (t.image ? albumColor(t.image) : ROOM_LIGHT)), [textures]);
  // shared by the sky, the skin and the tickers (same objects: set once a frame)
  const tintU = useMemo(
    () => ({
      uTint: { value: new THREE.Vector3(...ROOM_LIGHT) },
      uTintAmt: { value: 0 },
      uFocusDir: { value: new THREE.Vector3(0, 0, 1) }
    }),
    []
  );
  const ticker = useMemo(() => {
    const t = new THREE.CanvasTexture(tickerCanvas());
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }, []);
  const billArc = BILL_W / BILL_R;
  const ribbons = useMemo(() => TICKERS.map((t) => ribbonGeometry(t)), []);
  // whole repeats of the text round each ring, at the text's own aspect
  const repeatFor = (h) => {
    const img = ticker.image;
    const runMetres = (img.width / img.height) * h;
    return Math.max(1, Math.round((2 * Math.PI * TICKER_R) / runMetres));
  };

  useFrame((_, dt) => {
    const s = state.current;
    const g = groupRef.current;
    if (!g) return;
    g.visible = s.ring > 0;
    if (!g.visible) return;
    const f = s.albumFocus;

    // --- the album scene: resolve the click point on the panel, run the tween ---
    const sc = ensureScene(s);
    if (sc.index >= 0 && sc.ndc && !sc.uv) {
      const mesh = panelRefs.current[sc.index];
      _ndc.set(sc.ndc[0], sc.ndc[1]);
      raycaster.setFromCamera(_ndc, camera);
      const hit = mesh ? raycaster.intersectObject(mesh, false)[0] : null;
      sc.uv = hit?.uv ? hit.uv.clone() : new THREE.Vector2(0.5, 0.5);
    }
    stepScene(sc, Math.min(dt, 0.1)); // real time even at low fps (a slow phone)
    const fr = s.frustum;
    s.albumColors = colors;

    // --- the colour of the moment: the album in focus (blending between two), the room's
    //     light while we are still at the wound; the glow sits on the album being looked at ---
    const n = ALBUMS.length;
    const fc = Math.min(Math.max(f, -1), n - 1);
    const i0 = Math.floor(fc);
    const t = fc - i0;
    const c0 = i0 < 0 ? ROOM_LIGHT : colors[i0];
    const c1 = colors[Math.min(i0 + 1, n - 1)];
    _tint.set(c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t);
    const kt = 1 - Math.exp(-dt * 4);
    tintU.uTint.value.lerp(_tint, kt);
    tintU.uTintAmt.value = s.clean ?? 0;
    panelCenter(i0, _a).lerp(panelCenter(Math.min(i0 + 1, n - 1), _b), t);
    tintU.uFocusDir.value.lerp(_a.sub(camera.position).normalize(), kt).normalize();
    if (skyRef.current) skyRef.current.position.copy(camera.position);

    g.traverse((o) => {
      const u = o.material?.uniforms;
      if (!u) return;
      if (u.uOn) u.uOn.value = 1 - Math.min(Math.max(sc.open, 0), 1) * 0.85;
      if (u.uTime) u.uTime.value += dt;
      if (o.userData.album !== undefined) {
        const i = o.userData.album;
        const w = 1 - Math.min(Math.abs(f - i), 1);
        const focus = w * w * (3 - 2 * w);
        u.uBright.value = 0.5 + w * 0.62;
        const k = 1 - Math.exp(-dt * 5);
        u.uFocus.value += (focus - u.uFocus.value) * k;
        u.uFlat.value += (focus * 0.85 - u.uFlat.value) * k;
        u.uVel.value = (s.towerVel ?? 0) * (1 - sc.open);
        // the moment the camera locks on: a short glitch burst, and the crack run starts
        // (an event at its own speed, not scrubbed by the scroll)
        const locked = u.uFocus.value > (o.userData.locked ? 0.45 : 0.62);
        if (locked && !o.userData.locked) u.uGlitch.value = 1;
        o.userData.locked = locked;
        u.uReveal.value = locked
          ? Math.min(1, u.uReveal.value + dt * REVEAL_IN)
          : Math.max(0, u.uReveal.value - dt * REVEAL_OUT);
        u.uGlitch.value = Math.max(0, u.uGlitch.value - dt * 2.4);
        // opened / dimmed while another album is open
        const mine = sc.index === i;
        u.uOpen.value = mine ? sc.open : 0;
        u.uPull.value = mine ? sc.pull : 0;
        u.uDir.value = sc.dir;
        u.uDim.value = !mine && sc.index >= 0 ? Math.min(Math.max(sc.open, 0), 1) * 0.9 : 0;
        if (mine) {
          if (sc.uv) u.uClick.value.copy(sc.uv);
          u.uCamM.value.copy(camera.matrixWorld);
          if (fr) u.uFr.value.set(fr.left, fr.right, fr.bottom, fr.top);
        }
        o.renderOrder = mine && Math.abs(sc.open) > 0.0001 ? 10 : 0;
      }
      if (o.userData.ticker !== undefined) {
        u.uOffset.value += dt * TICKERS[o.userData.ticker].speed;
      }
    });
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* the void, round the camera, drawn first */}
      <mesh ref={skyRef} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[40, 32, 16]} />
        <shaderMaterial
          vertexShader={SKY_VERT}
          fragmentShader={SKY_FRAG}
          side={THREE.BackSide}
          depthWrite={false}
          uniforms={{ uOn: { value: 1 }, ...tintU }}
        />
      </mesh>

      {/* the skin, with the wound we flew out of */}
      <mesh position={[TOWER.x, (TOWER.top + TOWER.bottom) / 2, TOWER.z]}>
        <cylinderGeometry args={[TOWER.radius, TOWER.radius, TOWER.top - TOWER.bottom, 160, 1, true]} />
        <shaderMaterial vertexShader={SHELL_VERT} fragmentShader={SHELL_FRAG} uniforms={{ uOn: { value: 1 }, uHole: { value: holeTex }, ...tintU }} />
      </mesh>

      {/* album billboards, spiralling up and round */}
      {ALBUMS.map((album, i) => (
        <mesh
          key={album.id}
          ref={(m) => {
            panelRefs.current[i] = m;
          }}
          position={[TOWER.x, albumY(i), TOWER.z]}
          userData={{ album: i }}
          frustumCulled={false}
        >
          <cylinderGeometry args={[BILL_R, BILL_R, BILL_H, 64, 32, true, thetaOf(albumPhi(i)) - billArc / 2, billArc]} />
          <shaderMaterial
            vertexShader={PANEL_VERT}
            fragmentShader={PANEL_FRAG}
            side={THREE.DoubleSide}
            uniforms={{
              uMap: { value: textures[i] },
              uBright: { value: 0.5 },
              uTime: { value: i * 7.3 },
              uSeed: { value: i * 1.618 },
              uThetaC: { value: thetaOf(albumPhi(i)) },
              uR: { value: BILL_R },
              uFlat: { value: 0 },
              uFocus: { value: 0 },
              uVel: { value: 0 },
              uOpen: { value: 0 },
              uPull: { value: 0 },
              uDir: { value: 1 },
              uClick: { value: new THREE.Vector2(0.5, 0.5) },
              uCamM: { value: new THREE.Matrix4() },
              uFr: { value: new THREE.Vector4(-1, 1, -1, 1) },
              uDepth: { value: OPEN_DEPTH },
              uGlitch: { value: 0 },
              uUpcoming: { value: album.upcoming ? 1 : 0 },
              uDim: { value: 0 },
              uCol: { value: new THREE.Vector3(...colors[i]) },
              uReveal: { value: 0 },
              // where the cracks start: off-centre, a different spot on every cover
              uCrackC: { value: new THREE.Vector2(0.5 + 0.14 * Math.sin(i * 2.3 + 0.6), 0.52 + 0.12 * Math.cos(i * 1.7 + 0.3)) }
            }}
          />
        </mesh>
      ))}

      {/* ticker ribbons, braided round the albums */}
      {TICKERS.map((t, k) => (
        <mesh key={k} geometry={ribbons[k]} userData={{ ticker: k }} frustumCulled={false}>
          <shaderMaterial
            side={THREE.DoubleSide}
            vertexShader={RIBBON_VERT}
            fragmentShader={TICKER_FRAG}
            uniforms={{
              uMap: { value: ticker },
              uOffset: { value: 0 },
              uOn: { value: 1 },
              uHole: { value: holeTex },
              uRepeat: { value: repeatFor(t.h) },
              uTime: { value: k * 3.1 },
              uTwist: { value: t.twist },
              uPh: { value: t.ph },
              uH: { value: BILL_H / 2 + RIBBON_GAP + t.h / 2 },
              uW: { value: t.h },
              ...tintU
            }}
          />
        </mesh>
      ))}
    </group>
  );
}
