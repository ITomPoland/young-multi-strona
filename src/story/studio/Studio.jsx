import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { makeHeadGeometry, makeNeckGeometry, makeGlasses, HEAD_TOP, HEAD_BOTTOM, EYE_Y, GLSL_LENS_INSIDE, LENS_PLANE, LENS_BULGE } from './headParts';
import { loadHeadAsset, HEAD_FIT, PHOTO_FIT } from './headAsset';
import { ABOUT } from '../story.config';
import { makeShapes, PAD_FEATURE_Z } from './aboutShapes';
import { createParticleSim, packHeadParticles, packShapeTexture, SHAPE_CENTER, BOX_DIMS } from './particleSim';
import Atrium from './Atrium';
import LostMediaBox from './LostMediaBox';
import MerchShowcase from './MerchShowcase';
import logoUrl from '../../assets/logoyflbiale.avif';

// =====================================================================
// S6: THE STUDIO. The tower was a reflection in Multi's sunglasses.
// A second scene (its own camera), drawn by the Compositor instead of the world once
// state.studioOn; the world is rendered into a texture (state.worldTex) that the lens shows.
//
//  1. The seam: the camera starts a centimetre off the lens, so the lens covers the whole
//     screen, and the lens shows the world texture by SCREEN position: pixel-identical to
//     the frame before. Then the picture bulges, darkens at the rim, a glint crosses it.
//  2. The pull-back: distance grows geometrically (a constant zoom speed) on an expo-out of
//     the scroll, softened by a spring in time; the lens mapping morphs from screen space to
//     the whole world squeezed into the glass (a convex mirror); dolly zoom, a roll that
//     unwinds, a 3/4 arc. The head "notices" the camera and turns to it as it arrives.
//  3. The scan: a laser line runs down the head; above it the head is dots (from the hero's
//     dust: the story closes its loop), below it still the solid head. The glasses stay.
//  4. Hold: the head follows the cursor, the cursor pushes the dots away, they flow back.
// The key light is a spot on the face: the shoulders (and the cut edges of the bust) sink
// into the dark studio.
//
// The real head (scripts/prepare-head.mjs: the Meshy model + Multi's Balenciaga shield as a
// clean glass, outline traced on the portrait) is loaded by headAsset.js, the portrait is
// projected onto it from the front. Without those files: the placeholder head (headParts.js).
// See docs/storytelling/STAN-S6.md.
// =====================================================================

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const DEG = Math.PI / 180;

const D0 = 0.011; // metres off the lens at the seam
const D1 = 1.0; // metres off the head at the end (the real head + fur collar in frame)
const END_YAW = 26 * DEG; // the 3/4 view
const END_PITCH = -5 * DEG;
const FOV0 = 54; // degrees, at the seam
const RIM = new THREE.Color(0.55, 0.85, 0.95); // the studio's turquoise rim light
const HY_END = 0.056; // the reflection's final scale: metres of glass per unit of the world's NDC (vertical)
const POINTS = 90000;
const VISOR_POINTS = 10000;
const SIM_SIZE_DESKTOP = 352; // 123,904 living GPGPU particles
const SIM_SIZE_MOBILE = 224;  // 50,176 living GPGPU particles on touch/mobile

// ---------------- shaders ----------------
const HEAD_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vN;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// Multi's photo, projected onto the head from the front (head space, see PHOTO_FIT).
// uFitM: model -> head space (the model's fit); the projection must not follow the camera.
const GLSL_PHOTO = /* glsl */ `
  uniform sampler2D tPhoto;
  uniform float uHasPhoto;
  uniform vec4 uPhotoFit; // cx, cy (px), k (px per metre), size (px)
  vec2 photoUv(vec3 h) {
    vec2 px = vec2(uPhotoFit.x + h.x * uPhotoFit.z, uPhotoFit.y - (h.y - ${EYE_Y.toFixed(4)}) * uPhotoFit.z);
    return vec2(px.x / uPhotoFit.w, 1.0 - px.y / uPhotoFit.w);
  }
  // how much of this surface the photo saw: facing the front, inside the frame
  float photoW(vec3 hn, vec2 uv) {
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    return smoothstep(0.05, 0.5, hn.z) * inside * uHasPhoto;
  }
  // the key is a spot on the face: the shoulders sink into the dark studio (and with them the
  // edges where the bust is cut off). Head space: an ellipse round the face
  float spotK(vec3 h) {
    float r = length(vec2(h.x / 0.17, (h.y - 0.01) / 0.2));
    return 1.0 - 0.985 * smoothstep(0.62, 1.18, r);
  }
`;

const SKIN_VERT = /* glsl */ `
  uniform mat4 uFitM;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vHead;
  varying vec3 vHeadN;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vHead = (uFitM * vec4(position, 1.0)).xyz;
    vHeadN = normalize(mat3(uFitM) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// the solid head: the photo where it saw the face, the dark studio + rim light where it did
// not; gone above the scan line, whose cut shows as a glowing laser section
const HEAD_FRAG = /* glsl */ `
  uniform float uScanY;
  uniform float uScanOn;
  uniform vec3 uRim;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vHead;
  varying vec3 vHeadN;
  ${GLSL_PHOTO}
  void main() {
    float above = vWorld.y - uScanY;
    if (uScanOn > 0.5 && above > 0.0) discard;
    if (!gl_FrontFacing) {
      // inside, seen through the cut: a hot section at the line, dark a little below it
      // (the spot's falloff too: no glowing outline of the bust's cut-off bottom)
      vec3 cut = uRim * (exp(above / 0.005) * 1.8 + exp(above / 0.03) * 0.15) * uScanOn * spotK(vHead);
      gl_FragColor = vec4(cut + vec3(0.004, 0.005, 0.006), 1.0);
      return;
    }
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vWorld);
    float key = max(dot(n, normalize(vec3(-0.55, 0.55, 0.65))), 0.0);
    float fill = max(dot(n, normalize(vec3(0.7, -0.1, 0.4))), 0.0);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 plain = vec3(0.30, 0.205, 0.155) * (0.12 + 0.95 * key + 0.2 * fill) + uRim * rim * 0.8;
    vec2 puv = photoUv(vHead);
    float pw = photoW(normalize(vHeadN), puv);
    vec3 photo = texture2D(tPhoto, clamp(puv, 0.0, 1.0)).rgb;
    vec3 unseen = vec3(0.008, 0.01, 0.012) + uRim * rim * 0.55;
    vec3 col = mix(plain, mix(unseen, photo * 1.3 + uRim * rim * 0.22, pw), uHasPhoto);
    col *= spotK(vHead);
    float band = exp(-pow(above / 0.0035, 2.0)) * uScanOn * spotK(vHead);
    col += uRim * band * 3.5;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const FRAME_FRAG = /* glsl */ `
  uniform vec3 uRim;
  varying vec3 vWorld;
  varying vec3 vN;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 h = normalize(normalize(vec3(-0.55, 0.55, 0.65)) + v);
    float spec = pow(max(dot(n, h), 0.0), 60.0);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.5);
    vec3 col = vec3(0.012) + vec3(0.9) * spec * 0.8 + uRim * rim * 0.35;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const LENS_VERT = /* glsl */ `
  attribute vec2 aEdge; // x: distance to the glass's edge (model units; Multi's visor only)
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vEdge;
  void main() {
    vUv = uv;
    vEdge = aEdge.x;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// THE LENS. One mapping of the world picture onto the glass, in LENS space:
//  - the world is GLUED to the glass: its centre stays at the camera's anchor (where we
//    started), and uH (metres of glass per unit of the world's NDC) is, at the seam, exactly
//    the patch the camera sees: the frame before, pixel for pixel (uB blends in from the
//    plain screen position over the first few percent). Then uH follows the view (the world
//    holds still on screen) up to its final scale, and stays there: covers all the glass. The world
//    texture holds only the part on the visible glass (uRect; Compositor renders the world
//    camera's frustum narrowed / widened to it), so it stays sharp at every distance
//  - uK -> 1: the convex mirror bends it (edges compressed), it swims a little with the
//    viewing angle (uSwim); past its edge it fades into the dark
//  - a hairline on the shield's polished edge catches the light (vEdge: Multi's visor only)
//  - uBulge (Takt 1, still full-screen): convex glass, chromatic fringes, darker rim
//  - uWorldK: the world fades out of the glass as the head is revealed; what stays is what
//    sunglasses really reflect here: the dark studio, a softbox, the turquoise rim light
const LENS_FRAG = /* glsl */ `
  uniform float uScanY;
  uniform float uScanOn;
  uniform sampler2D tWorld;
  uniform vec2 uRes;
  uniform float uK;
  uniform float uB;
  uniform float uBulge;
  uniform float uWorldK;
  uniform vec2 uH; // lens-space metres per unit of the world's NDC (x, y), set per frame
  uniform vec4 uRect; // the part of the world's NDC the world texture holds (min.xy, max.xy)
  uniform vec2 uAnchorUv; // where the camera starts on the glass: the world's NDC origin is glued here
  uniform vec2 uPlane;
  uniform float uEdgeOn; // 1: vEdge is real (Multi's visor), 0: the code shield
  uniform float uEdgeScale; // model units -> metres
  uniform float uOutline; // 1: cut the glass by the analytic outline (the code-built shield)
  uniform vec2 uSwim;
  uniform float uSide;
  uniform vec3 uRim;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vEdge;
  ${GLSL_LENS_INSIDE}

  // what the glasses reflect in the studio (world directions)
  vec3 studioEnv(vec3 r) {
    vec3 col = mix(vec3(0.01, 0.012, 0.014), vec3(0.06, 0.068, 0.075), smoothstep(-0.5, 0.9, r.y));
    // the key softbox, high in front, a little to the left: a big soft rectangle. Placed where
    // the glasses really reflect it from the camera's path, so the highlight slides across the
    // glass by itself as the camera arcs round (no timed flash)
    vec3 L = normalize(vec3(-0.27, 0.13, 0.95)); // measured: the final view reflects to (-0.31, -0.06, 0.95)
    vec3 Lx = normalize(cross(vec3(0.0, 1.0, 0.0), L));
    vec3 Ly = cross(L, Lx);
    float a = dot(r, Lx);
    float b = dot(r, Ly);
    float box = (1.0 - smoothstep(0.14, 0.26, abs(a))) * (1.0 - smoothstep(0.035, 0.09, abs(b))) * step(0.0, dot(r, L));
    // a softbox is brighter in the middle, with a soft falloff to its edges
    box *= 0.6 + 0.4 * (1.0 - smoothstep(0.0, 0.2, abs(a)));
    col += vec3(0.95, 0.97, 1.0) * box * 0.32;
    // a long strip light overhead, in front: the clean highlight line along the visor's upper
    // part (where the glass turns up), sliding as the camera moves
    float el = r.y;
    float strip0 = (1.0 - smoothstep(0.012, 0.03, abs(el - 0.42))) * smoothstep(0.2, 0.5, r.z) * (1.0 - smoothstep(0.35, 0.6, abs(r.x)));
    col += vec3(0.85, 0.9, 0.95) * strip0 * 0.55;
    // the big diffuser over the set: the upper part of the glass (turning up) goes a soft grey,
    // as on the photo
    col += vec3(0.07, 0.078, 0.085) * smoothstep(0.05, 0.55, el) * smoothstep(-0.2, 0.4, r.z);
    // the turquoise rim light, a tall strip behind to the right
    vec3 R2 = normalize(vec3(0.85, 0.1, -0.5));
    vec3 R2x = normalize(cross(vec3(0.0, 1.0, 0.0), R2));
    float strip = (1.0 - smoothstep(0.05, 0.1, abs(dot(r, R2x)))) * smoothstep(0.6, 0.85, dot(r, R2));
    col += uRim * strip * 0.9;
    return col;
  }

  vec3 sampleWorld(vec2 uv, float ca) {
    vec2 c = uv - 0.5;
    vec3 col = vec3(
      texture2D(tWorld, clamp(0.5 + c * (1.0 + ca), 0.001, 0.999)).r,
      texture2D(tWorld, clamp(uv, 0.001, 0.999)).g,
      texture2D(tWorld, clamp(0.5 + c * (1.0 - ca), 0.001, 0.999)).b
    );
    // past the picture's edge the reflection fades into the dark (never a framed postcard)
    vec2 out2 = max(-uv, uv - 1.0);
    float outside = max(out2.x, out2.y);
    return col * (1.0 - smoothstep(0.0, 0.12, outside));
  }

  void main() {
    if (uOutline > 0.5 && lensInside(vUv, uSide) > 1.0) discard;
    // the scan takes the glass too (above the line it is dots, like the head)
    float above = vWorld.y - uScanY;
    if (uScanOn > 0.5 && above > 0.0) discard;
    float aspect = uRes.x / uRes.y;
    vec2 suv = gl_FragCoord.xy / uRes;

    // the world on the glass: glued to it, its centre (NDC 0) at the camera's anchor, uH metres
    // per NDC unit (grows slowly: the reflection zooms out, it never slides about)
    vec2 nw = (vUv - uAnchorUv) * uPlane / uH;
    // convex mirror: the edges of the glass squeeze it towards the anchor; it swims with the angle
    vec2 rn = (vUv - 0.5) * 2.0;
    nw = nw * (1.0 - 0.18 * uK * dot(rn, rn)) + uSwim;
    // the first few percent: the plain screen position (where both agree)
    vec2 nd = mix(suv * 2.0 - 1.0, nw, uB);

    // Takt 1: convex glass bulge round the middle of the screen (= the anchor)
    vec2 pc = nd * 0.5 * vec2(aspect, 1.0);
    float r2 = dot(pc, pc);
    float bulge = uBulge * (1.0 - uK);
    nd *= 1.0 - bulge * 0.28 * r2;
    // NDC -> the world texture, which holds only the part of the world on the visible glass
    vec2 uv = (nd - uRect.xy) / (uRect.zw - uRect.xy);
    float ca = bulge * 0.006 * r2 * 2.0 + uK * 0.004 * dot(rn, rn);
    vec3 world = sampleWorld(uv, ca);

    // the glass: dark tint, reflectivity rising to the rim (fresnel)
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 n = normalize(vN);
    float ndv = abs(dot(n, v));
    float fres = 0.32 + 0.68 * pow(1.0 - ndv, 4.0);
    vec3 r = reflect(-v, n * sign(dot(n, v)));
    float glassK = max(uBulge * 0.5, uK);
    vec3 refl = world * uWorldK + studioEnv(r) * uK;
    vec3 glass = vec3(0.006, 0.007, 0.008) + refl * mix(0.78, 1.0, fres);
    // the polished edge of the shield: a hairline that catches the studio's light
    float e = vEdge * uEdgeScale;
    float bevel = uEdgeOn * (1.0 - smoothstep(0.0003, 0.0016, e));
    vec3 rb = normalize(r + vec3(0.0, 0.25, 0.0)); // an edge faces every way: it finds the overhead light
    glass += bevel * uK * (studioEnv(rb) * 1.6 + vec3(0.05, 0.06, 0.065) + uRim * 0.12 * (1.0 - ndv));
    vec3 col = mix(world, glass, glassK);
    col += uRim * exp(-pow(above / 0.0035, 2.0)) * 2.5 * uScanOn;
    // Takt 1: the full-screen picture darkens towards its rim (the edge of the glass)
    float svig = smoothstep(0.5, 1.1, length((suv - 0.5) * vec2(aspect, 1.0)) * 1.15) * uBulge * (1.0 - uK);
    // after: the real rim of the lens
    float lvig = smoothstep(0.6, 1.0, length(rn) * 0.85) * uK;
    col *= 1.0 - svig * 0.85 - lvig * 0.35;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// GPGPU-driven living particles: positions + velocities come from ping-pong FBOs (particleSim.js)
// Features: photo-projected Multi portrait, optical depth-of-field bokeh, kinetic HDR velocity glow,
// and seamless laser-scan birth behind uScanY.
const DOTS_VERT = /* glsl */ `
  attribute vec2 aSimUv;
  uniform sampler2D tSimPos;
  uniform sampler2D tSimVel;
  uniform sampler2D tTarget0; // xyz = head-space metres, w = rnd
  uniform sampler2D tTarget1; // w = pad feature mask
  uniform sampler2D tTarget2; // xy = flat vinyl coords, w = radius (m)
  uniform sampler2D tTarget4; // xyz = box local metres, w = edgeMask
  uniform sampler2D tMeta;    // xyz = head-space normal, w = isVisor
  ${GLSL_PHOTO}
  uniform float uScanY;
  uniform float uScanOn;
  uniform float uBoxScanY;
  uniform float uBoxScanOn;
  uniform float uTime;
  uniform float uDpr;
  uniform float uPx;
  uniform vec3 uRim;
  uniform float uMorph; // 0 head, 1 pad, 2 vinyl, 3 YFL logo, 4 LOST MEDIA box
  uniform vec3 uShapeC;
  uniform float uSpin;
  uniform vec3 uLabelCol; // the vinyl's label: Nowa Fala's colour
  varying vec3 vCol;
  varying float vA;
  varying float vBokeh;
  varying float vEnergy;

  vec3 shapeCol(float i, vec3 headCol, float rnd, float padFeat, vec4 d2, float boxEdge) {
    if (i < 0.5) return headCol;
    float tone = 0.58 + 0.68 * fract(rnd * 17.0);
    if (i < 1.5) {
      // the pad: dark obsidian body, crisp luminous buttons / dpad / sticks
      if (padFeat > 0.75) return mix(vec3(0.95, 1.0, 1.0), uRim * 1.45, step(0.5, fract(rnd * 5.0)) * 0.65);
      return padFeat > 0.25 ? vec3(0.42, 0.52, 0.58) * tone : vec3(0.20, 0.26, 0.30) * tone;
    }
    if (i < 2.5) {
      float r = d2.w;
      // grooves catch the overhead light in a clean specular band while the disc spins
      float sheen = pow(abs(cos(atan(d2.y, d2.x) + uSpin - 0.8)), 14.0);
      vec3 grooves = vec3(0.24, 0.30, 0.35) * tone + vec3(0.88, 0.94, 1.0) * sheen * 0.95;
      return r < 0.0482 ? uLabelCol * (0.78 + 0.48 * fract(rnd * 11.0)) : grooves;
    }
    if (i < 3.5) {
      return vec3(0.96, 0.98, 1.0) * (0.76 + 0.34 * fract(rnd * 17.0));
    }
    // S7 LOST MEDIA Collector's Box: obsidian archival body + crisp luminous edges/frame
    vec3 boxBody = vec3(0.18, 0.24, 0.28) * tone;
    vec3 boxRimCol = mix(vec3(0.90, 0.96, 1.0), uRim * 1.45, 0.55);
    return mix(boxBody, boxRimCol, smoothstep(0.2, 0.9, boxEdge));
  }

  void main() {
    vec4 posData = texture2D(tSimPos, aSimUv);
    vec4 velData = texture2D(tSimVel, aSimUv);
    vec4 d0 = texture2D(tTarget0, aSimUv);
    vec4 d1 = texture2D(tTarget1, aSimUv);
    vec4 d2 = texture2D(tTarget2, aSimUv);
    vec4 d4 = texture2D(tTarget4, aSimUv);
    vec4 meta = texture2D(tMeta, aSimUv);

    vec3 hp = d0.xyz;
    float rnd = d0.w;
    vec3 hn = normalize(meta.xyz + vec3(0.0, 0.0, 1e-4));
    float isVisor = meta.w;
    float life = posData.w;
    float speed = length(velData.xyz);
    float energy = clamp(velData.w, 0.0, 1.0);

    // Chapter blend (0 head -> 1 pad -> 2 vinyl -> 3 YFL -> 4 LOST MEDIA box)
    float m = clamp(uMorph, 0.0, 4.0);
    float seg = min(floor(m), 3.0);
    float wave = clamp(rnd * 0.65 + (0.22 - hp.y) * 0.85, 0.0, 1.0);
    float lt = smoothstep(0.0, 1.0, clamp((m - seg - wave * 0.44) / 0.56, 0.0, 1.0));
    float fly = sin(3.14159265 * lt);
    float headK = seg < 0.5 ? 1.0 - lt : 0.0;
    float shapeK = 1.0 - headK;

    float above = hp.y - uScanY;
    float shown = uScanOn > 0.5 ? smoothstep(0.0, 0.004, above) * smoothstep(0.0, 0.04, life + 0.02) : 0.0;
    // Reverse materialization laser (S7): particles BELOW uBoxScanY fuse into the solid Collector's Box
    float boxAbove = d4.y - uBoxScanY;
    if (uBoxScanOn > 0.5) {
      shown *= smoothstep(-0.002, 0.007, boxAbove);
    }

    vec4 w = modelMatrix * vec4(posData.xyz, 1.0);
    vec3 nW = normalize(mat3(modelMatrix) * hn);
    vec4 mv = viewMatrix * w;
    gl_Position = projectionMatrix * mv;

    vec3 v = normalize(cameraPosition - w.xyz);
    float facing = dot(nW, v);
    float isDrifter = smoothstep(0.885, 0.915, rnd);
    // Head back-faces fade smoothly at rest, but stay visible for orbiting aura drifters, wakes, and morphs
    float backVis = mix(smoothstep(-0.18, 0.22, facing), 1.0, max(max(shapeK, isDrifter * 0.85), smoothstep(0.06, 0.28, speed)));
    shown *= backVis;
    // Aura drifters stay delicate & translucent so they never clutter the portrait
    shown *= mix(1.0, 0.62, isDrifter * (1.0 - fly));

    // Optical depth-of-field bokeh relative to the centre of the face / active shape
    vec4 focusMv = viewMatrix * modelMatrix * vec4(uShapeC, 1.0);
    float depthOff = abs(-mv.z - (-focusMv.z));
    float bokeh = smoothstep(0.085, 0.34, depthOff);

    float shimmer = 0.90 + 0.10 * sin(uTime * 3.8 + rnd * 62.8318);
    float sizeScale = (0.58 + 0.82 * rnd) * mix(1.0, 0.78, isDrifter) * (1.0 + bokeh * 1.45 + energy * 0.42 + fly * 0.2) * shimmer;
    gl_PointSize = min(uPx * uDpr * sizeScale * (0.95 / max(-mv.z, 0.05)), 52.0) * step(0.005, shown);

    // Portrait & material lighting
    float key = max(dot(nW, normalize(vec3(-0.55, 0.55, 0.65))), 0.0);
    float rim = pow(1.0 - max(facing, 0.0), 2.5);
    vec3 teal = vec3(0.15, 0.26, 0.31) * (0.34 + 0.92 * key) + vec3(0.76, 0.84, 0.88) * key * key * 0.35 + uRim * rim * 0.72;

    vec2 puv = photoUv(hp);
    float pw = photoW(hn, puv);
    vec3 photo = texture2D(tPhoto, clamp(puv, 0.0, 1.0)).rgb;
    vec3 skinCol = mix(teal, photo * 2.95 + vec3(0.025, 0.04, 0.048) + uRim * rim * 0.48, pw);
    skinCol = max(skinCol, teal * 0.48);

    // Balenciaga shield visor reads as dark sculpted glass with cool specular edge
    vec3 visorCol = vec3(0.035, 0.05, 0.062) + vec3(0.78, 0.90, 0.96) * pow(key, 5.0) * 0.72 + uRim * rim * 0.95;
    visorCol = mix(visorCol, photo * 1.45 + uRim * rim * 0.55, pw * 0.42);
    vec3 headCol = mix(skinCol, visorCol, isVisor) * spotK(hp);

    vCol = mix(shapeCol(seg, headCol, rnd, d1.w, d2, d4.w), shapeCol(seg + 1.0, headCol, rnd, d1.w, d2, d4.w), lt);

    // Kinetic HDR energy: fast cursor wakes & morph vortices glow luminous cold turquoise (blooms in Compositor)
    float kineticGlow = clamp(energy * 0.75 + smoothstep(0.16, 0.85, speed) * 0.65, 0.0, 1.35);
    vec3 hotCol = uRim * 1.45 + vec3(0.28, 0.36, 0.40);
    vCol = mix(vCol, hotCol, clamp(kineticGlow * 0.68, 0.0, 0.88));
    vCol *= 1.0 + kineticGlow * 0.45;

    // Laser scan birth flare (S6 head) + reverse materialization fusion flare (S7 box)
    float scanBand = exp(-pow(above / 0.009, 2.0)) * uScanOn * spotK(hp);
    float birthFlare = (1.0 - smoothstep(0.0, 0.55, life)) * uScanOn * spotK(hp);
    float boxBand = exp(-pow(boxAbove / 0.009, 2.0)) * uBoxScanOn;
    vCol += uRim * (scanBand * 1.85 + birthFlare * 0.65 + boxBand * 2.4);

    vA = shown;
    vBokeh = bokeh;
    vEnergy = kineticGlow;
  }
`;

const DOTS_FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  varying float vBokeh;
  varying float vEnergy;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5 || vA < 0.008) discard;
    // Crisp anti-aliased dot in focus -> creamy optical bokeh disc out of focus
    float innerEdge = mix(0.22, 0.04, vBokeh);
    float disc = 1.0 - smoothstep(innerEdge, 0.5, r);
    float core = exp(-r * r * mix(16.0, 5.5, vBokeh));
    float alpha = vA * disc * mix(0.94, 0.32, vBokeh);
    vec3 col = vCol * (0.86 + 0.30 * core + vEnergy * 0.38 * core);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

const BACK_FRAG = /* glsl */ `
  uniform vec3 uRim;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - vec2(0.55, 0.55);
    float glow = exp(-dot(c, c) * 7.0);
    vec3 col = vec3(0.006, 0.008, 0.01) + uRim * glow * 0.05;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ---------------- the dots: sampled on the head's surface ----------------
function sampleDots(meshes, count) {
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const rnd = new Float32Array(count);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  // split by area (roughly): most on the head
  const shares = [0.86, 0.14];
  let k = 0;
  meshes.forEach((m, i) => {
    const sampler = new MeshSurfaceSampler(m).build();
    const nThis = i === meshes.length - 1 ? count - k : Math.round(count * shares[i]);
    for (let j = 0; j < nThis; j++, k++) {
      sampler.sample(p, n);
      pos.set([p.x, p.y, p.z], k * 3);
      nor.set([n.x, n.y, n.z], k * 3);
      rnd[k] = Math.random();
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aNormal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  return g;
}

const _lens = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _pivot = new THREE.Vector3();
const _right = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _invHead = new THREE.Matrix4();
const _rayO = new THREE.Vector3();
const _rayD = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _swipeRaw = new THREE.Vector3();
const _fitMat = new THREE.Matrix4();
const _fitPos = new THREE.Vector3();
const _fitQuat = new THREE.Quaternion();
const _fitEuler = new THREE.Euler();
const _fitScale = new THREE.Vector3();

export default function Studio({ state }) {
  const { gl, size } = useThree();
  const studio = useMemo(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.002, 20);
    return { scene, camera };
  }, []);
  const headGroup = useRef();
  const studioState = useRef({ cloudEnergy: 0 });
  const boxPoseRef = useRef({ rx: 0.07, ry: -0.30 });
  const follow = useRef({
    u: 0, v: 0, yaw: 0, pitch: 0, m: 0, mv: 0,
    cx: 0, cy: 0, pointerSeen: false, cursorOn: 0, cursorSpd: 0,
    hasHit: false, prevHit: new THREE.Vector3(), swipeVel: new THREE.Vector3()
  });
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  // GPGPU ping-pong particle physics engine (desktop: 352^2 = 123,904 particles; touch: 224^2 = 50,176)
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const sim = useMemo(() => createParticleSim(gl, isTouch ? SIM_SIZE_MOBILE : SIM_SIZE_DESKTOP), [gl, isTouch]);
  const simNeedsReset = useRef(true);
  useEffect(() => () => sim?.dispose(), [sim]);

  // Also allow touch-dragging on mobile to stir the particle cloud
  useEffect(() => {
    const onMove = () => {
      follow.current.pointerSeen = true;
    };
    const onTouch = (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      state.current.pointer.x = (t.clientX / window.innerWidth) * 2 - 1;
      state.current.pointer.y = -((t.clientY / window.innerHeight) * 2 - 1);
      follow.current.pointerSeen = true;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onTouch);
    };
  }, [state]);

  // the real head (if its files are there); the placeholder until then / without them
  const [asset, setAsset] = useState(null);
  const [assetTried, setAssetTried] = useState(false); // loaded, or known to be missing
  const fitRef = useRef();
  const scanRange = useRef([HEAD_TOP + 0.01, HEAD_BOTTOM - 0.01]);
  const glassBottom = useRef(-1); // the glass's lowest point (head space): once the scan is past it, no reflection
  useEffect(() => {
    let live = true;
    loadHeadAsset().then((a) => {
      if (!live) return;
      if (a) setAsset(a);
      setAssetTried(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const parts = useMemo(() => {
    const head = makeHeadGeometry();
    const neck = makeNeckGeometry();
    const dots = sampleDots([new THREE.Mesh(head), new THREE.Mesh(neck)], POINTS);
    return { head, neck, dots };
  }, []);

  const mats = useMemo(() => {
    const rim = { value: RIM };
    const scan = { uScanY: { value: HEAD_TOP }, uScanOn: { value: 0 } };
    // shared by the solid head and the dots
    const photo = {
      tPhoto: { value: null },
      uHasPhoto: { value: 0 },
      uPhotoFit: { value: new THREE.Vector4(PHOTO_FIT.cx, PHOTO_FIT.cy, PHOTO_FIT.k, PHOTO_FIT.size) },
      uFitM: { value: new THREE.Matrix4() }
    };
    return {
      photo,
      scan,
      head: new THREE.ShaderMaterial({
        vertexShader: SKIN_VERT,
        fragmentShader: HEAD_FRAG,
        side: THREE.DoubleSide,
        uniforms: { ...scan, ...photo, uRim: rim }
      }),
      frame: new THREE.ShaderMaterial({ vertexShader: HEAD_VERT, fragmentShader: FRAME_FRAG, uniforms: { uRim: rim } }),
      // shared by both lenses (each gets its own uSide)
      lensU: {
        tWorld: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uK: { value: 0 },
        uB: { value: 0 },
        uBulge: { value: 0 },
        uWorldK: { value: 1 },
        uH: { value: new THREE.Vector2(0.004, 0.004) },
        uRect: { value: new THREE.Vector4(-1, -1, 1, 1) },
        uPlane: { value: LENS_PLANE.clone() },
        uAnchorUv: { value: new THREE.Vector2(0.5, 0.5) },
        uSwim: { value: new THREE.Vector2() },
        uRim: rim
      },
      dots: new THREE.ShaderMaterial({
        vertexShader: DOTS_VERT,
        fragmentShader: DOTS_FRAG,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          ...scan,
          ...photo,
          tSimPos: { value: sim?.posTex ?? null },
          tSimVel: { value: sim?.velTex ?? null },
          tTarget0: { value: sim?.textures.tTarget0 ?? null },
          tTarget1: { value: sim?.textures.tTarget1 ?? null },
          tTarget2: { value: sim?.textures.tTarget2 ?? null },
          tTarget4: { value: sim?.textures.tTarget4 ?? null },
          tMeta: { value: sim?.textures.tMeta ?? null },
          uBoxScanY: { value: -BOX_DIMS.h },
          uBoxScanOn: { value: 0 },
          uTime: { value: 0 },
          uDpr: { value: 1 },
          uPx: { value: isTouch ? 4.3 : 3.4 },
          uMorph: { value: 0 },
          uShapeC: { value: SHAPE_CENTER.clone() },
          uSpin: { value: 0 },
          uLabelCol: { value: new THREE.Vector3(0.92, 0.56, 0.5) },
          uRim: rim
        }
      }),
      back: new THREE.ShaderMaterial({
        vertexShader: LENS_VERT,
        fragmentShader: BACK_FRAG,
        depthWrite: false,
        uniforms: { uRim: rim }
      })
    };
  }, [sim, isTouch]);

  const glasses = useMemo(
    () =>
      makeGlasses(mats.frame, (side) => {
        const m = new THREE.ShaderMaterial({
          vertexShader: LENS_VERT,
          fragmentShader: LENS_FRAG,
          side: THREE.DoubleSide,
          uniforms: { ...mats.lensU, ...mats.scan, uSide: { value: side }, uOutline: { value: 1 }, uEdgeOn: { value: 0 }, uEdgeScale: { value: 1 } }
        });
        return m;
      }),
    [mats]
  );
  // place it on the head (HEAD_FIT), and scan from its top to its bottom
  useEffect(() => {
    const g = fitRef.current;
    if (!g) return undefined;
    const apply = () => {
      // the placeholder is already in place (metres); only the real model is fitted
      const f = asset ? HEAD_FIT : { scale: 1, position: [0, 0, 0], rotation: [0, 0, 0] };
      g.scale.setScalar(f.scale);
      g.position.fromArray(f.position);
      g.rotation.set(f.rotation[0], f.rotation[1], f.rotation[2]);
      g.updateMatrix();
      mats.photo.uFitM.value.copy(g.matrix);
      mats.photo.tPhoto.value = asset?.photo ?? null;
      mats.photo.uHasPhoto.value = asset?.photo ? 1 : 0;
      if (asset) {
        asset.head.computeBoundingBox();
        const box = asset.head.boundingBox.clone().applyMatrix4(g.matrix);
        scanRange.current = [box.max.y + 0.005, box.min.y - 0.005];
        if (asset.visor) {
          asset.visor.computeBoundingBox();
          glassBottom.current = asset.visor.boundingBox.clone().applyMatrix4(g.matrix).min.y;
        }
      } else {
        scanRange.current = [HEAD_TOP + 0.01, HEAD_BOTTOM - 0.01];
      }
    };
    apply();
    if (import.meta.env.DEV) {
      window.__headFit = HEAD_FIT;
      window.__photoFit = PHOTO_FIT;
      window.__applyHeadFit = apply;
    }
    return undefined;
  }, [asset, mats]);

  // the glass as dots too (the scan takes it like the rest of the head): sampled on the visor
  const visorDots = useMemo(() => (asset?.visor ? sampleDots([new THREE.Mesh(asset.visor)], VISOR_POINTS) : null), [asset]);
  useEffect(() => () => visorDots?.dispose(), [visorDots]);

  // Multi's own visor (cut out of the model) as the lens: its material, the camera's anchor on
  // it (from the script's measurements, model units -> the fit), its size in lens space
  const visorAnchor = useRef();
  const visorMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: LENS_VERT,
        fragmentShader: LENS_FRAG,
        side: THREE.DoubleSide,
        uniforms: { ...mats.lensU, ...mats.scan, uSide: { value: 0 }, uOutline: { value: 0 }, uEdgeOn: { value: 1 }, uEdgeScale: { value: HEAD_FIT.scale } }
      }),
    [mats]
  );
  useEffect(() => () => visorMat.dispose(), [visorMat]);
  useEffect(() => {
    const info = asset?.visorInfo;
    const a = visorAnchor.current;
    if (asset?.visor && !asset.visor.getAttribute('aEdge')) {
      const e = asset.visor.getAttribute('uv1');
      asset.visor.setAttribute('aEdge', e ?? new THREE.BufferAttribute(new Float32Array(asset.visor.getAttribute('position').count * 2).fill(1), 2));
    }
    if (asset?.visor && info && a) {
      a.position.fromArray(info.anchor);
      a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3().fromArray(info.normal).normalize());
      mats.lensU.uPlane.value.set(info.size[0] * HEAD_FIT.scale, info.size[1] * HEAD_FIT.scale);
      mats.lensU.uAnchorUv.value.fromArray(info.anchorUv);
    } else {
      mats.lensU.uPlane.value.copy(LENS_PLANE);
      mats.lensU.uAnchorUv.value.set(0.5, 0.5);
    }
  }, [asset, mats]);

  // "O MNIE": every dot's place in each chapter's shape, as attributes of the dot clouds (the
  // head's, the glass's, the placeholder's). The shapes are built in metres round the middle of
  // the face, then brought into the fit group's units. Rebuilt once the logo picture is in.
  const [logoImg, setLogoImg] = useState(null);
  const [logoTried, setLogoTried] = useState(false);
  useEffect(() => {
    const im = new Image();
    im.onload = () => {
      setLogoImg(im);
      setLogoTried(true);
    };
    im.onerror = () => setLogoTried(true);
    im.src = logoUrl;
  }, []);
  useEffect(() => {
    if (!sim) {
      if (assetTried && logoTried) state.current.studioPrep = (state.current.studioPrep ?? 0) + 1;
      return;
    }
    const f = asset ? HEAD_FIT : { scale: 1, position: [0, 0, 0], rotation: [0, 0, 0] };
    _fitPos.fromArray(f.position);
    _fitEuler.set(f.rotation[0], f.rotation[1], f.rotation[2]);
    _fitQuat.setFromEuler(_fitEuler);
    _fitScale.setScalar(f.scale);
    _fitMat.compose(_fitPos, _fitQuat, _fitScale);

    const srcHead = asset ? asset.dots : parts.dots;
    const srcVisor = asset ? visorDots : null;
    const { target0, meta } = packHeadParticles(srcHead, srcVisor, _fitMat, sim.count);

    const sh = makeShapes(sim.count, logoImg, 11);
    const padFeatZ = PAD_FEATURE_Z * 0.86;
    const target1 = packShapeTexture(sh.pad, sim.count, 0.86, (_x, _y, z) =>
      z > padFeatZ ? 1.0 : z > padFeatZ * 0.7 ? 0.5 : 0.0
    );
    const target2 = packShapeTexture(sh.vinyl, sim.count, 0.86, (x, y) => Math.hypot(x, y));
    const target3 = packShapeTexture(sh.logo, sim.count, 0.86);

    sim.setTargetData(0, target0);
    sim.setTargetData(1, target1);
    sim.setTargetData(2, target2);
    sim.setTargetData(3, target3);
    sim.setTargetData(4, meta);

    // Pre-compile & warm up the GPGPU simulation shaders right now (0 hitches mid-scroll)
    sim.shared.uScanY.value = scanRange.current[0];
    sim.shared.uScanOn.value = 0;
    sim.shared.uMorph.value = 0;
    sim.step(gl, 1 / 60, true);
    mats.dots.uniforms.tSimPos.value = sim.posTex;
    mats.dots.uniforms.tSimVel.value = sim.velTex;
    simNeedsReset.current = true;

    // the studio is complete (its head, if there is one, and the shapes): the Compositor may
    // warm it up (compile + upload) now; each new version is warmed again
    if (assetTried && logoTried) state.current.studioPrep = (state.current.studioPrep ?? 0) + 1;
  }, [sim, gl, asset, assetTried, visorDots, parts, logoImg, logoTried, mats, state]);

  // hand the scene + camera to the Compositor
  useEffect(() => {
    const s = state.current;
    s.studio = studio;
    return () => {
      if (s.studio === studio) s.studio = null;
    };
  }, [state, studio]);

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose?.());
      mats.photo.tPhoto.value?.dispose();
      parts.head.dispose();
      parts.neck.dispose();
      parts.dots.dispose();
      glasses.group.traverse((o) => o.material?.uniforms?.uSide && o.material.dispose());
      glasses.dispose();
    },
    [mats, parts, glasses]
  );

  const buf = useMemo(() => new THREE.Vector2(), []);

  const wasOn = useRef(false);

  useFrame((frame, dt) => {
    const s = state.current;
    if (!s.studioOn || !headGroup.current) {
      wasOn.current = false;
      s.studioU = 0;
      return;
    }
    const cam = studio.camera;
    const time = frame.clock.elapsedTime;
    const d = Math.min(dt, 0.1);
    const F = follow.current;
    // entering the studio (again): start from where the scroll is, not from where we left it
    if (!wasOn.current) {
      wasOn.current = true;
      F.u = s.revPull;
      F.v = 0;
      F.yaw = -0.24 * (1 - smooth(0.55, 1.0, F.u));
      F.pitch = 0;
      F.m = ABOUT.morph(s.vh ?? 0);
      F.mv = 0;
      F.cx = s.pointer.x;
      F.cy = s.pointer.y;
      F.hasHit = false;
      F.swipeVel.set(0, 0, 0);
      simNeedsReset.current = true;
    }

    // the scroll gives a target; the camera follows it on a spring (inertia, never a rail)
    const W = 7;
    const n = 4;
    for (let k = 0; k < n; k++) {
      const acc = (s.revPull - F.u) * W * W - 2 * 0.9 * W * F.v;
      F.v += acc * (d / n);
      F.u += F.v * (d / n);
    }
    const u = Math.min(Math.max(F.u, 0), 1.03);
    s.studioU = F.u; // the director hands the screen back to the world only once this is ~0

    // the head: looks off to its right, turns to the camera as it arrives; in the hold it
    // follows the cursor; in S7 (Collector's Box) settles level so the Box owns its own 3/4 tilt
    const p = s.pointer;
    const hold = s.revHold ?? 0;
    const boxMorph = s.boxMorph ?? 0;
    const boxScan = s.boxScan ?? 0;
    const boxExplode = s.boxExplode ?? 0;
    const headFollow = hold * (1 - boxMorph);
    const k = 1 - Math.exp(-d * 3);
    F.yaw += (-0.24 * (1 - smooth(0.55, 1.0, u)) + p.sx * 0.28 * headFollow - F.yaw) * k;
    F.pitch += (-p.sy * 0.12 * headFollow - F.pitch) * k;
    const hg = headGroup.current;
    hg.rotation.set(F.pitch, F.yaw + Math.sin(time * 0.31) * 0.012 * headFollow, 0, 'YXZ');
    hg.updateMatrixWorld(true);

    // where the lens is now (it moves with the head)
    // the camera's anchor: on Multi's own visor if the model has one, else on the code shield
    const lens = asset?.visor && visorAnchor.current ? visorAnchor.current : glasses.anchor;
    lens.getWorldPosition(_lens);
    lens.getWorldQuaternion(_q);
    _n.set(0, 0, 1).applyQuaternion(_q);
    const lensYaw = Math.atan2(_n.x, _n.z);

    const aspect = size.width / Math.max(size.height, 1);
    const wide = clamp01((aspect - 0.9) / 0.6);

    // the pull-back is anchored on the middle of the visor: it stays at the centre of the
    // frame the whole way back (the camera only ever turns round it), and only at the very
    // end does the frame ease aside: the head to the left on wide screens (room for the text
    // on the right), the head up on tall ones
    // (in the hold the camera opens out slightly into the brutalist atrium so the plinth,
    // volumetric skylight, and colonnade parallax cleanly round Multi's living particle head)
    const chapterArc = Math.sin(F.m * 1.45) * 0.085 * hold * wide;
    const yaw =
      THREE.MathUtils.lerp(lensYaw, END_YAW * (1 - 0.72 * hold), smooth(0.2, 1.0, u)) +
      chapterArc +
      p.sx * (0.095 * wide + 0.05 * (1 - wide)) * hold;
    const pitch = THREE.MathUtils.lerp(0, END_PITCH, smooth(0.25, 1.0, u)) + p.sy * 0.045 * hold;
    _dir.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const settle = smooth(0.68, 1.0, u);
    // (on tall screens a nudge the other way: the 3/4 view swings the head right of the anchor)
    // ("o mnie", the hold: back to the middle, the read-out goes round it)
    _pivot.copy(_lens).addScaledVector(_right, (0.13 * wide + 0.075 * (1 - wide)) * settle * (1 - hold) + 0.02 * hold);
    _pivot.y -= (0.03 * wide + 0.11 * (1 - wide)) * settle + 0.07 * (1 - wide) * hold + 0.018 * wide * hold;
    // on a tall screen the long lens is narrow: end further back so the head fits across;
    // in HOLD breathe slightly wider to frame the monolithic plinth & colonnade
    const d1 = D1 * Math.pow(Math.max(1, 0.9 / aspect), 0.8) * (1 + 0.15 * hold * wide);
    const dist = D0 * Math.pow(d1 / D0, u);
    cam.position.copy(_pivot).addScaledVector(_dir, dist);
    // handheld: a slight drift once off the glass
    const drift = smooth(0.3, 1.0, u);
    cam.position.x += Math.sin(time * 0.43) * 0.003 * drift;
    cam.position.y += Math.sin(time * 0.37 + 1.2) * 0.0022 * drift;
    cam.up.set(0, 1, 0);
    cam.lookAt(_pivot);
    // a roll that comes and goes in flight (none at the seam, none at the end)
    cam.rotateZ(Math.sin(Math.PI * smooth(0.04, 0.9, u)) * 4 * DEG);
    // dolly zoom: wide on the glass, long lens on the head, gently breathing wider into the atrium
    cam.fov = THREE.MathUtils.lerp(FOV0, 29, smooth(0.0, 0.9, u)) + 5.0 * hold * wide;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // --- the lens ---
    gl.getDrawingBufferSize(buf);
    const lu = mats.lensU;
    lu.tWorld.value = s.worldTex ?? null;
    lu.uRes.value.copy(buf);
    lu.uB.value = smooth(0.0, 0.05, u);
    lu.uK.value = smooth(0.01, 0.4, u);
    lu.uBulge.value = s.revBulge;
    // THE REFLECTION, glued to the glass: the world's NDC origin sits at the anchor (where the
    // camera started), Hy metres of glass per NDC unit. At the seam Hy is exactly the patch
    // of glass the camera sees (the frame before, pixel for pixel), and it follows the view
    // (the world holds still on screen while the head comes into view round it) until it
    // reaches the final scale (HY_END), where it stays: the covers are never smaller in the
    // glass than at the end, and never spread out. A soft minimum: no kink.
    const hh = Math.max(dist - LENS_BULGE, D0 - LENS_BULGE) * Math.tan((cam.fov * DEG) / 2);
    const Hy = Math.pow(Math.pow(hh, -4) + Math.pow(HY_END, -4), -0.25);
    lu.uH.value.set(Hy * aspect, Hy);
    // the world texture holds just the world on the glass in view (so it stays sharp): the
    // view's patch round the anchor, clipped to the glass (+ a margin)
    const plane = lu.uPlane.value;
    const anc = lu.uAnchorUv.value;
    const mx = 0.08 * plane.x * lu.uK.value;
    const my = 0.08 * plane.y * lu.uK.value;
    const x0 = Math.max(-hh * aspect, -anc.x * plane.x - mx);
    const x1 = Math.min(hh * aspect, (1 - anc.x) * plane.x + mx);
    const y0 = Math.max(-hh, -anc.y * plane.y - my);
    const y1 = Math.min(hh, (1 - anc.y) * plane.y + my);
    const sw = 0.1 * lu.uK.value; // room for the swim
    const r = lu.uRect.value.set(x0 / (Hy * aspect) - sw, y0 / Hy - sw, x1 / (Hy * aspect) + sw, y1 / Hy + sw);
    // (Compositor: the world camera's frustum narrowed / widened to exactly that NDC rect)
    s.lensRect = [(r.x + r.z) / 2, (r.y + r.w) / 2, (r.z - r.x) / 2, (r.w - r.y) / 2];
    // the world dims in the glass as the head is revealed, but stays: the tower keeps turning
    // in Multi's sunglasses all through the hold
    const worldK = 1 - 0.4 * smooth(0.55, 0.95, u);
    lu.uWorldK.value = worldK;
    // ...until the scan has taken the glass: then the world is not drawn at all
    const scanYNow = THREE.MathUtils.lerp(scanRange.current[0], scanRange.current[1], s.revScan);
    s.lensWorld = s.revScan > 0 && scanYNow < glassBottom.current - 0.01 ? 0 : worldK;
    // the reflection swims a little with the viewing angle (lens space)
    _toCam.copy(cam.position).sub(_lens).normalize();
    const lx = _toCam.dot(_right.set(Math.cos(lensYaw), 0, -Math.sin(lensYaw)));
    lu.uSwim.value.set(-lx * 0.08, -_toCam.y * 0.08).multiplyScalar(lu.uK.value);

    // the photo's projection (live in dev: window.__photoFit)
    mats.photo.uPhotoFit.value.set(PHOTO_FIT.cx, PHOTO_FIT.cy, PHOTO_FIT.k, PHOTO_FIT.size);

    // --- scan + GPGPU living particle simulation ---
    const scanY = THREE.MathUtils.lerp(scanRange.current[0], scanRange.current[1], s.revScan);
    const scanOn = s.revScan > 0 ? 1 : 0;
    mats.head.uniforms.uScanY.value = scanY;
    mats.head.uniforms.uScanOn.value = scanOn;
    const du = mats.dots.uniforms;
    du.uTime.value = time;
    du.uDpr.value = gl.getPixelRatio();

    // --- "o mnie": soft spring on scroll -> morph target ---
    const morphTarget = ABOUT.morph(s.vh ?? 0);
    const jumped = Math.abs(morphTarget - F.m) > 1.5;
    if (jumped) {
      F.m = morphTarget;
      F.mv = 0;
    } else {
      F.mv += ((morphTarget - F.m) * 28 - F.mv * 8.5) * d;
      F.m += F.mv * d;
    }
    const spin = time * 0.9;
    du.uMorph.value = F.m;
    du.uSpin.value = spin;
    const lc = s.albumColors?.[0];
    if (lc) du.uLabelCol.value.set(lc[0], lc[1], lc[2]);

    // --- 3D cursor ray + swipe velocity in head-local space ---
    const fastK = 1 - Math.exp(-d * 26);
    F.cx += (p.x - F.cx) * fastK;
    F.cy += (p.y - F.cy) * fastK;
    _ndc.set(F.cx, F.cy);
    raycaster.setFromCamera(_ndc, cam);
    _invHead.copy(hg.matrixWorld).invert();
    _rayO.copy(raycaster.ray.origin).applyMatrix4(_invHead);
    _rayD.copy(raycaster.ray.direction).transformDirection(_invHead).normalize();

    // Closest point on the cursor ray to the centre of the head/shape (head-local metres)
    const tPlane = _hit.copy(SHAPE_CENTER).sub(_rayO).dot(_rayD);
    _hit.copy(_rayO).addScaledVector(_rayD, tPlane);
    if (F.hasHit && d > 1e-4) {
      _swipeRaw.copy(_hit).sub(F.prevHit).divideScalar(d);
      const rawSpd = _swipeRaw.length();
      if (rawSpd > 2.4) _swipeRaw.multiplyScalar(2.4 / rawSpd);
      const velBlend = 1 - Math.exp(-d * (rawSpd > 0.04 ? 18 : 6));
      F.swipeVel.lerp(_swipeRaw, velBlend);
    } else {
      F.swipeVel.set(0, 0, 0);
      F.hasHit = true;
    }
    F.prevHit.copy(_hit);

    const swipeSpd = F.swipeVel.length();
    const targetCursorOn = (F.pointerSeen ? Math.max(hold, scanOn * 0.45) : 0) * (1 - smooth(0.0, 0.35, boxScan));
    F.cursorOn += (targetCursorOn - F.cursorOn) * (1 - Math.exp(-d * 6));
    const normSpd = Math.min(swipeSpd / 0.9, 1.35);
    F.cursorSpd += (normSpd - F.cursorSpd) * (1 - Math.exp(-d * (normSpd > F.cursorSpd ? 16 : 4)));

    // Shared Collector's Box 3/4 pose (pixel-locked between GPGPU particles and solid LostMediaBox)
    const bp = boxPoseRef.current;
    const targetRx = 0.065 + Math.sin(time * 0.5) * 0.022 - p.sy * 0.15 * boxMorph;
    const targetRy = -0.32 + Math.sin(time * 0.36) * 0.065 + p.sx * 0.28 * boxMorph + boxExplode * 0.16;
    const bpK = 1 - Math.exp(-d * 5.5);
    bp.rx += (targetRx - bp.rx) * bpK;
    bp.ry += (targetRy - bp.ry) * bpK;

    // Reverse turquoise laser scan sweeping UP the Collector's Box (particles -> solid textured box)
    const boxScanY = THREE.MathUtils.lerp(-BOX_DIMS.h * 0.5 - 0.014, BOX_DIMS.h * 0.5 + 0.026, boxScan);
    const boxScanOn = boxScan > 0.002 ? 1 : 0;
    du.uBoxScanY.value = boxScanY;
    du.uBoxScanOn.value = boxScanOn;

    // Live kinetic cloud energy drives reactive bounce light on the plinth, floor reflections & ribs
    const scanPulse = s.revScan * (1 - s.revScan) * 2.2 + boxScan * (1 - boxScan) * 2.6;
    const rawCloudEnergy = Math.min(1.0, F.cursorSpd * 0.55 + Math.min(Math.abs(F.mv), 1.5) * 0.45 + scanPulse * 0.6);
    studioState.current.cloudEnergy += (rawCloudEnergy - studioState.current.cloudEnergy) * (1 - Math.exp(-d * 6));

    if (sim) {
      const sh = sim.shared;
      const vu = sim.velUniforms;
      sh.uTime.value = time;
      sh.uSpin.value = spin;
      sh.uMorph.value = F.m;
      sh.uScanY.value = scanY;
      sh.uScanOn.value = scanOn;
      sh.uBoxRot.value.set(bp.rx, bp.ry);
      vu.uHold.value = hold;
      vu.uRayO.value.copy(_rayO);
      vu.uRayD.value.copy(_rayD);
      vu.uSwipeVel.value.copy(F.swipeVel);
      vu.uCursorOn.value = F.cursorOn;
      vu.uCursorSpd.value = F.cursorSpd;
      vu.uMorphVel.value = Math.abs(F.mv);

      const needReset = simNeedsReset.current || jumped;
      // Pause GPGPU stepping once 100% of particles have fused into the solid Collector's Box
      if (boxScan < 0.995 || needReset) {
        sim.step(gl, d, needReset);
        simNeedsReset.current = false;
      }
      du.tSimPos.value = sim.posTex;
      du.tSimVel.value = sim.velTex;
    }
  });

  return createPortal(
    <>
      {/* the dark studio behind (visible during visor pull-back before the atrium materializes) */}
      <mesh position={[0.05, 0.02, -8.5]} renderOrder={-5} material={mats.back}>
        <planeGeometry args={[18, 12]} />
      </mesh>

      {/* Klinika Lost Media — Brutalist Concrete Atrium (materializes via Blueprint wave on scan) */}
      <Atrium state={state} studioState={studioState} />

      <group ref={headGroup}>
        {asset ? (
          <group ref={fitRef}>
            <mesh geometry={asset.head} material={mats.head} />
            {asset.visor && (
              <>
                <mesh geometry={asset.visor} material={visorMat} />
                <object3D ref={visorAnchor} />
              </>
            )}
          </group>
        ) : (
          <group ref={fitRef}>
            <mesh geometry={parts.head} material={mats.head} />
            <mesh geometry={parts.neck} material={mats.head} />
          </group>
        )}
        {sim && <points geometry={sim.pointsGeo} material={mats.dots} frustumCulled={false} renderOrder={2} />}
        {/* S7: Physical textured LOST MEDIA Collector's Box + Iridescent Disc + Selected Goods garments */}
        <LostMediaBox state={state} boxPoseRef={boxPoseRef} />
        <MerchShowcase state={state} />
        <primitive object={glasses.group} visible={!asset?.visor} />
      </group>
    </>,
    studio.scene
  );
}
