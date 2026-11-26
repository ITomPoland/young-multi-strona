import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ATRIUM_FLOOR_Y, HALL_BACK_Z, HALL_FRONT_Z, HALL_SIDE_X, PLINTH_R, PLINTH_H, PLINTH_Z } from './showroomConfig';

// =====================================================================
// KLINIKA LOST MEDIA — BRUTALIST CONCRETE ATRIUM (S6 Environment)
// Inspired by Bricelab Concrete Atrium + Young Multi's Lost Media clinic (S0 tile callback).
//
// Architectural layout (head-space metres, head centered at 0,0,0):
//   - Recessed polished dark-concrete gallery floor at y = -0.68 m (ends at front slab edge z = +0.92 m)
//   - Stepped monolithic concrete plinth directly under Multi (top at y = -0.235 m, R = 0.285 m)
//     with a razor-thin recessed emitter groove and subtle outer side calibration brackets
//   - Monumental flanking concrete ribs / colonnade (x = +-1.58 m, z = -0.75..-5.1 m)
//   - Deep concrete ceiling beams framing an overhead skylight oculus at y = +1.72 m
//   - Back wall (z = -5.75 m) with a recessed dark clinical tile alcove echoing S0's tile room
//   - Volumetric skylight shaft + slow-drifting atmospheric dust motes
// =====================================================================

const FLOOR_Y = ATRIUM_FLOOR_Y;
const CEIL_Y = 1.72;
const BACK_Z = HALL_BACK_Z;
const SIDE_X = HALL_SIDE_X;
const PLINTH_TOP_Y = FLOOR_Y + PLINTH_H;

// Shared GLSL noise, concrete formwork, S0 clinical tiles, analytical AO, and blueprint-reveal wave
const GLSL_ATRIUM_COMMON = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  float vnoise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
      mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm2(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * vnoise2(p);
      p = rot * p * 2.03 + vec2(17.1, 31.7);
      a *= 0.5;
    }
    return v;
  }

  // Triplanar-style 2D coords from world position & normal
  vec2 archUv(vec3 w, vec3 n) {
    vec3 an = abs(n);
    if (an.y > an.x && an.y > an.z) return w.xz;
    if (an.x > an.z) return vec2(w.z, w.y);
    return w.xy;
  }

  // Brutalist formwork concrete: subtle poured-panel seams + recessed tie-rod pinholes + mineral grain
  // Returns vec3(albedoTone, seamMask, heightForBump)
  vec3 concreteField(vec3 w, vec3 n) {
    vec2 p = archUv(w, n);
    float macro = fbm2(p * 1.15);
    float mid   = fbm2(p * 5.2 + vec2(3.7, -8.1));
    float fine  = vnoise2(p * 28.0);

    // Architectural formwork panels (0.72 m x 0.42 m modules)
    vec2 panel = p / vec2(0.72, 0.42);
    vec2 pf = fract(panel);
    vec2 edge = min(pf, 1.0 - pf);
    float seamX = 1.0 - smoothstep(0.0, 0.011, edge.x);
    float seamY = 1.0 - smoothstep(0.0, 0.016, edge.y);
    float seam = max(seamX, seamY);

    // Tadao Ando style recessed tie-rod pinholes inside each panel
    vec2 pinA = (pf - vec2(0.22, 0.5)) * vec2(0.72, 0.42);
    vec2 pinB = (pf - vec2(0.78, 0.5)) * vec2(0.72, 0.42);
    float pin = (1.0 - smoothstep(0.008, 0.015, length(pinA)))
              + (1.0 - smoothstep(0.008, 0.015, length(pinB)));
    pin = clamp(pin, 0.0, 1.0);

    // Slight tonal shift per poured slab
    float slabTint = (hash12(floor(panel)) - 0.5) * 0.14;
    float tone = 0.52 + (macro - 0.5) * 0.34 + (mid - 0.5) * 0.18 + (fine - 0.5) * 0.09 + slabTint;
    tone *= 1.0 - seam * 0.34 - pin * 0.55;
    float height = macro * 0.5 + mid * 0.3 + fine * 0.2 - seam * 0.35 - pin * 0.6;
    return vec3(clamp(tone, 0.12, 1.0), max(seam, pin * 0.8), height);
  }

  // Analytical architectural ambient occlusion inside the atrium volume
  float atriumAO(vec3 w) {
    float dFloor = clamp((w.y - ${FLOOR_Y.toFixed(3)}) / 0.55, 0.0, 1.0);
    float dCeil  = clamp((${CEIL_Y.toFixed(3)} - w.y) / 0.55, 0.0, 1.0);
    float dSide  = clamp((${SIDE_X.toFixed(3)} - abs(w.x)) / 0.65, 0.0, 1.0);
    float dBack  = clamp((w.z - ${BACK_Z.toFixed(3)}) / 0.75, 0.0, 1.0);
    float corner = (0.38 + 0.62 * smoothstep(0.0, 1.0, dFloor))
                 * (0.45 + 0.55 * smoothstep(0.0, 1.0, dCeil))
                 * (0.50 + 0.50 * smoothstep(0.0, 1.0, dSide))
                 * (0.52 + 0.48 * smoothstep(0.0, 1.0, dBack));
    // Soft shadow pooled around the base of the central monolithic plinth
    float rPlinth = length(w.xz);
    float plinthAO = mix(0.28, 1.0, smoothstep(${PLINTH_R.toFixed(3)}, ${(PLINTH_R + 0.65).toFixed(3)}, rPlinth));
    plinthAO = mix(plinthAO, 1.0, smoothstep(${FLOOR_Y.toFixed(3)}, ${(FLOOR_Y + 0.42).toFixed(3)}, w.y));
    return corner * plinthAO;
  }

  // Bricelab-inspired 3D Blueprint -> Concrete architectural wave
  // Returns vec2(concreteReveal 0..1, blueprintLineEnergy 0..1+)
  vec2 blueprintWave(vec3 w, vec3 n, float reveal, float edgeFactor) {
    if (reveal <= 0.0005) return vec2(0.0);
    // Distance from the central chamber (normalized across the 7.5 m hall)
    float dist = length(w * vec3(0.85, 0.75, 0.92));
    float front = reveal * 9.8 - 0.35;
    float behind = front - dist;

    // Leading wireframe/CAD blueprint zone right ahead of concrete materialization
    float wireWindow = smoothstep(-0.35, 0.35, behind) * (1.0 - smoothstep(0.95, 2.35, behind));
    float scanCrest  = exp(-pow((behind - 0.12) / 0.22, 2.0));

    // Crisp architectural CAD grid lines + geometry edge highlights
    vec2 p = archUv(w, n);
    vec2 g = abs(fract(p / 0.36 - 0.5) - 0.5) / max(fwidth(p / 0.36), vec2(0.001));
    float fineGrid = 1.0 - min(min(g.x, g.y), 1.0);
    vec2 gMaj = abs(fract(p / 1.44 - 0.5) - 0.5) / max(fwidth(p / 1.44), vec2(0.001));
    float majorGrid = 1.0 - min(min(gMaj.x, gMaj.y), 1.0);

    float wire = (fineGrid * 0.24 + majorGrid * 0.65 + edgeFactor * 0.95) * wireWindow;
    wire += (majorGrid * 0.45 + edgeFactor * 0.75 + 0.18) * scanCrest;

    // Solid architectural concrete materializes smoothly right behind the blueprint crest
    float solid = smoothstep(0.35, 1.95, behind) * smoothstep(0.0, 0.18, reveal);
    return vec2(solid, wire);
  }
`;

const ATRIUM_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// Concrete walls, colonnade ribs, ceiling beams, and S0 clinical tile alcove on the back wall
const CONCRETE_FRAG = /* glsl */ `
  uniform float uReveal;
  uniform float uTime;
  uniform float uEnergy;
  uniform vec3 uRim;
  uniform float uIsBack;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;
  ${GLSL_ATRIUM_COMMON}

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(cameraPosition - vWorld);

    // Geometry-edge highlight for the CAD blueprint phase
    vec2 uvEdge = min(vUv, 1.0 - vUv);
    float geomEdge = 1.0 - smoothstep(0.0, 0.028, min(uvEdge.x, uvEdge.y));
    vec2 bw = blueprintWave(vWorld, n, uReveal, geomEdge);
    float solid = bw.x;
    float wire = bw.y;
    if (solid < 0.002 && wire < 0.002) {
      gl_FragColor = vec4(0.005, 0.007, 0.009, 1.0);
      return;
    }

    vec3 cf = concreteField(vWorld, n);
    float tone = cf.x;
    float height = cf.z;

    // S0 callback: recessed dark clinical tile alcove centered on the monumental back wall
    float isTileZone = 0.0;
    float groutMask = 0.0;
    float tileRough = 0.78;
    if (uIsBack > 0.5) {
      vec2 aPos = abs(vWorld.xy - vec2(0.0, 0.34));
      float inAlcove = (1.0 - smoothstep(1.16, 1.22, aPos.x)) * (1.0 - smoothstep(0.92, 0.98, aPos.y));
      if (inAlcove > 0.01) {
        isTileZone = inAlcove;
        // Clinical ceramic grid matching S0's sterile clinic proportions (0.14 m square tiles)
        vec2 tc = vWorld.xy / 0.145;
        vec2 tf = fract(tc);
        vec2 tid = floor(tc);
        vec2 te = min(tf, 1.0 - tf);
        groutMask = 1.0 - smoothstep(0.025, 0.065, min(te.x, te.y));
        float perTile = hash12(tid);
        float tileTone = mix(0.32 + perTile * 0.24, 0.11, groutMask);
        tone = mix(tone, tileTone, inAlcove);
        height = mix(height, (1.0 - groutMask) * 0.55 + (perTile - 0.5) * 0.12, inAlcove);
        tileRough = mix(tileRough, mix(0.28 + perTile * 0.24, 0.92, groutMask), inAlcove);
      }
    }

    // Screen-space micro-bump from procedural concrete/tile height
    vec3 dpdx = dFdx(vWorld);
    vec3 dpdy = dFdy(vWorld);
    float dhdx = dFdx(height);
    float dhdy = dFdy(height);
    vec3 surfGrad = normalize(cross(dpdy, n) * dhdx + cross(n, dpdx) * dhdy + vec3(1e-5));
    float bumpAmt = mix(0.14, 0.24, isTileZone);
    vec3 bn = normalize(n - surfGrad * bumpAmt);

    // --- LIGHTING (Dramatic single architectural skylight + subtle particle-cloud bounce) ---
    // 1. Overhead skylight slot at (0, CEIL_Y + 0.15, -0.35)
    vec3 skyPos = vec3(0.0, ${CEIL_Y.toFixed(2)} + 0.15, -0.35);
    vec3 toSky = skyPos - vWorld;
    float dSky = length(toSky);
    vec3 Lsky = toSky / max(dSky, 0.001);
    float skyAtten = 1.0 / (1.0 + 0.14 * dSky * dSky);
    // Directional skylight cone: focuses energy down the center atrium, leaving deep moody wings
    float cone = smoothstep(0.15, 0.85, max(dot(-Lsky, normalize(vec3(0.0, -1.0, -0.22))), 0.0));
    float ndlSky = max(dot(bn, Lsky), 0.0);

    // Secondary distant corridor skylight slit near back alcove (grazes the S0 clinical tiles!)
    vec3 backSky = vec3(0.0, ${CEIL_Y.toFixed(2)} - 0.05, ${(BACK_Z + 0.45).toFixed(2)});
    vec3 toBackL = backSky - vWorld;
    float dBackL = length(toBackL);
    vec3 Lback = toBackL / max(dBackL, 0.001);
    float backAtten = 1.0 / (1.0 + 0.22 * dBackL * dBackL);
    float ndlBack = max(dot(bn, Lback), 0.0);

    // 2. Live bounce light from the living particle cloud at (0, 0, 0.04)
    vec3 cloudPos = vec3(0.0, 0.0, 0.04);
    vec3 toCloud = cloudPos - vWorld;
    float dCloud = length(toCloud);
    vec3 Lcloud = toCloud / max(dCloud, 0.001);
    float cloudAtten = 1.0 / (1.0 + 0.42 * dCloud * dCloud);
    float ndlCloud = max(dot(bn, Lcloud), 0.0);

    // Specular sheen (stronger on the damp S0 clinical tiles & grazing concrete ribs)
    vec3 Hsky = normalize(Lsky + v);
    float specPow = mix(18.0, 64.0, 1.0 - tileRough);
    float specSky = pow(max(dot(bn, Hsky), 0.0), specPow) * mix(0.18, 0.58, isTileZone * (1.0 - groutMask));
    vec3 Hback = normalize(Lback + v);
    float specBack = pow(max(dot(bn, Hback), 0.0), specPow) * mix(0.14, 0.65, isTileZone * (1.0 - groutMask));

    // Grazing Fresnel rim catches cold skylight along concrete rib edges
    float fres = pow(1.0 - max(dot(bn, v), 0.0), 3.2);

    float ao = atriumAO(vWorld);
    vec3 baseCol = vec3(0.075, 0.088, 0.098) * tone;
    // Slight clinical cool slate shift in the S0 tiled alcove
    baseCol = mix(baseCol, vec3(0.068, 0.094, 0.106) * tone, isTileZone);

    vec3 lit = baseCol * (0.14 * ao);
    // Main cold architectural skylight
    lit += (baseCol * ndlSky + vec3(0.68, 0.78, 0.84) * specSky) * skyAtten * (0.45 + 1.35 * cone) * ao * 1.45;
    // Grazing back skylight illuminating the S0 tiled alcove
    lit += (baseCol * ndlBack + vec3(0.62, 0.82, 0.90) * specBack) * backAtten * ao * 1.15;
    // Subtle reactive turquoise bounce from Multi's particle cloud
    float cloudGlow = 0.24 + uEnergy * 0.72;
    lit += (baseCol * 0.8 + vec3(0.08)) * uRim * ndlCloud * cloudAtten * cloudGlow * ao;
    // Grazing rim on ribs
    lit += vec3(0.28, 0.40, 0.46) * fres * (skyAtten * 0.45 + backAtten * 0.25) * ao;
    // Ultra-subtle S0 grout ghost-glint right behind the scan wave
    if (isTileZone > 0.1) {
      float groutPulse = 0.5 + 0.5 * sin(uTime * 1.1 - vWorld.y * 3.0);
      lit += uRim * groutMask * isTileZone * (0.04 + 0.04 * groutPulse + uEnergy * 0.08) * backAtten;
    }

    // Distance atmospheric fog into deep dark obsidian-slate
    float fogDist = length(cameraPosition - vWorld);
    float fog = 1.0 - exp(-fogDist * fogDist * 0.015);
    vec3 fogCol = vec3(0.008, 0.012, 0.016) + uRim * 0.009 * uReveal;
    vec3 concrete = mix(lit, fogCol, clamp(fog, 0.0, 0.82));

    vec3 col = mix(vec3(0.005, 0.007, 0.009), concrete, solid);
    // Blueprint wireframe lines glow softly in HDR turquoise during materialization
    col += uRim * wire * 1.15;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Polished dark concrete gallery floor with analytical blurred reflections of skylight & particle cloud
const FLOOR_FRAG = /* glsl */ `
  uniform float uReveal;
  uniform float uTime;
  uniform float uEnergy;
  uniform vec3 uRim;
  uniform vec3 uTintCol;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;
  ${GLSL_ATRIUM_COMMON}

  void main() {
    vec3 n = vec3(0.0, 1.0, 0.0);
    vec3 v = normalize(cameraPosition - vWorld);

    // Concentric architectural expansion rings around the central plinth
    float r = length(vWorld.xz - vec2(0.0, ${PLINTH_Z.toFixed(3)}));
    float ring1 = 1.0 - smoothstep(0.0, 0.008, abs(r - 0.58));
    float ring2 = 1.0 - smoothstep(0.0, 0.009, abs(r - 1.28));
    float ring3 = 1.0 - smoothstep(0.0, 0.010, abs(r - 2.25));
    float rings = clamp(ring1 + ring2 + ring3, 0.0, 1.0);

    vec2 bw = blueprintWave(vWorld, n, uReveal, rings * 0.9);
    float solid = bw.x;
    float wire = bw.y;
    if (solid < 0.002 && wire < 0.002) {
      gl_FragColor = vec4(0.005, 0.007, 0.009, 1.0);
      return;
    }

    vec3 cf = concreteField(vWorld, n);
    float tone = cf.x * (1.0 - rings * 0.42);
    float wetPatch = smoothstep(0.32, 0.72, fbm2(vWorld.xz * 1.35 + vec2(4.2, -1.9)));
    float microN = fbm2(vWorld.xz * 12.0) - 0.5;
    float rough = mix(0.16, 0.52, wetPatch) + microN * 0.08;

    vec3 bn = normalize(vec3(
      (fbm2(vWorld.xz * 9.0 + vec2(0.05, 0.0)) - fbm2(vWorld.xz * 9.0 - vec2(0.05, 0.0))) * 0.14,
      1.0,
      (fbm2(vWorld.xz * 9.0 + vec2(0.0, 0.05)) - fbm2(vWorld.xz * 9.0 - vec2(0.0, 0.05))) * 0.14
    ));

    float ao = atriumAO(vWorld);
    float ndv = max(dot(bn, v), 0.0);
    float fres = 0.06 + 0.94 * pow(1.0 - ndv, 4.2);

    vec3 skyPos = vec3(0.0, ${CEIL_Y.toFixed(2)}, -0.35);
    vec3 toSky = skyPos - vWorld;
    float dSky = length(toSky);
    vec3 Lsky = toSky / max(dSky, 0.001);
    float skyAtten = 1.0 / (1.0 + 0.12 * dSky * dSky);
    float skyPool = exp(-dot(vWorld.xz - vec2(0.0, -0.25), vWorld.xz - vec2(0.0, -0.25)) * 0.34);

    vec3 baseCol = vec3(0.048, 0.058, 0.066) * tone;
    vec3 lit = baseCol * (0.12 + 1.25 * skyPool * skyAtten) * ao;

    vec3 refl = reflect(-v, bn);
    float tCeil = (${CEIL_Y.toFixed(2)} - vWorld.y) / max(refl.y, 0.02);
    vec2 hitCeil = vWorld.xz + refl.xz * tCeil;
    float slotX = 1.0 - smoothstep(0.28, 0.78 + rough * 0.9, abs(hitCeil.x));
    float slotZ = 1.0 - smoothstep(0.65, 2.20 + rough * 1.4, abs(hitCeil.y + 1.8));
    float skyRefl = slotX * slotZ * smoothstep(0.02, 0.25, refl.y);
    lit += vec3(0.45, 0.62, 0.70) * skyRefl * fres * mix(0.85, 0.24, rough) * ao;

    float tCloud = (0.02 - vWorld.y) / max(refl.y, 0.02);
    vec2 hitCloud = vWorld.xz + refl.xz * tCloud;
    float cloudDist2 = dot(hitCloud - vec2(0.0, 0.03), hitCloud - vec2(0.0, 0.03));
    float cloudRefl = exp(-cloudDist2 / (0.08 + rough * 0.32)) * smoothstep(0.01, 0.22, refl.y);
    vec3 cloudCol = mix(uRim, uTintCol, 0.22);
    lit += cloudCol * cloudRefl * fres * (0.42 + uEnergy * 0.95) * ao;

    vec3 Hsky = normalize(Lsky + v);
    float ringSpec = pow(max(dot(bn, Hsky), 0.0), 42.0);
    lit += uRim * rings * (0.04 + 0.14 * ringSpec) * skyAtten * ao;

    float pillarBand = smoothstep(1.15, 1.55, abs(vWorld.x));
    float ribShadow = 0.5 + 0.5 * cos((vWorld.z + 0.8) * 3.14159265 / 0.65);
    lit *= 1.0 - pillarBand * ribShadow * 0.35;

    // Crisp architectural front-edge chamfer highlight along z = HALL_FRONT_Z
    float frontRim = 1.0 - smoothstep(0.0, 0.022, abs(${HALL_FRONT_Z.toFixed(3)} - vWorld.z));
    lit += vec3(0.28, 0.42, 0.48) * frontRim * 0.45;

    float fogDist = length(cameraPosition - vWorld);
    float fog = 1.0 - exp(-fogDist * fogDist * 0.016);
    vec3 fogCol = vec3(0.008, 0.012, 0.016) + uRim * 0.008 * uReveal;
    vec3 floorCol = mix(lit, fogCol, clamp(fog, 0.0, 0.85));

    vec3 col = mix(vec3(0.005, 0.007, 0.009), floorCol, solid);
    col += uRim * wire * 1.1;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Monolithic central concrete & brushed dark-steel plinth with subtle recessed emitter groove
const PLINTH_FRAG = /* glsl */ `
  uniform float uReveal;
  uniform float uTime;
  uniform float uEnergy;
  uniform vec3 uRim;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;
  ${GLSL_ATRIUM_COMMON}

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(cameraPosition - vWorld);
    float r = length(vWorld.xz);

    float rimEdge = smoothstep(${(PLINTH_R - 0.014).toFixed(4)}, ${PLINTH_R.toFixed(4)}, r) * step(0.5, n.y);
    float topLine = 1.0 - smoothstep(0.0, 0.012, abs(vWorld.y - ${PLINTH_TOP_Y.toFixed(4)}));
    vec2 bw = blueprintWave(vWorld, n, uReveal, max(rimEdge, topLine));
    float solid = bw.x;
    float wire = bw.y;
    if (solid < 0.002 && wire < 0.002) {
      gl_FragColor = vec4(0.005, 0.007, 0.009, 1.0);
      return;
    }

    // Fine architectural brushed stone/anodized-metal texture
    float grain = fbm2(vec2(atan(vWorld.z, vWorld.x) * 3.0, vWorld.y * 14.0));
    float topCap = smoothstep(0.5, 0.85, n.y);

    // Subtle calibration tick marks etched around the outer bevel of the plinth top
    float ang = atan(vWorld.z, vWorld.x);
    float ticks = smoothstep(0.92, 0.99, cos(ang * 36.0))
                * smoothstep(${(PLINTH_R - 0.022).toFixed(4)}, ${(PLINTH_R - 0.015).toFixed(4)}, r)
                * (1.0 - smoothstep(${(PLINTH_R - 0.006).toFixed(4)}, ${PLINTH_R.toFixed(4)}, r))
                * topCap;

    // Razor-thin recessed magnetic emitter groove inset 2.5 cm from plinth edge
    float groove = (1.0 - smoothstep(0.0012, 0.0042, abs(r - ${(PLINTH_R - 0.028).toFixed(4)}))) * topCap;
    float innerWell = (1.0 - smoothstep(${(PLINTH_R - 0.045).toFixed(4)}, ${(PLINTH_R - 0.028).toFixed(4)}, r)) * topCap;

    vec3 Lsky = normalize(vec3(0.0, 1.0, 0.15));
    float ndl = max(dot(n, Lsky), 0.0);
    vec3 H = normalize(Lsky + v);
    float spec = pow(max(dot(n, H), 0.0), 48.0);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);

    // Vertical dark gradient toward the floor
    float hGrad = smoothstep(${FLOOR_Y.toFixed(3)}, ${PLINTH_TOP_Y.toFixed(3)}, vWorld.y);
    vec3 matCol = vec3(0.032, 0.038, 0.044) * (0.7 + 0.6 * grain) * (0.45 + 0.55 * hGrad);
    matCol *= 1.0 - innerWell * 0.55;

    vec3 lit = matCol * (0.35 + 1.15 * ndl);
    lit += vec3(0.55, 0.68, 0.76) * spec * (0.18 + 0.35 * topCap);
    lit += uRim * fres * (0.18 + 0.24 * uEnergy) * hGrad;
    // Soft live turquoise bounce on the recessed center dish directly under the particles
    float dishGlow = exp(-r * r * 18.0) * topCap;
    lit += uRim * dishGlow * (0.09 + 0.28 * uEnergy);
    // Razor-thin emitter groove + subtle clinical ticks (HDR bloom when particle energy surges)
    float breath = 0.78 + 0.22 * sin(uTime * 1.4);
    lit += uRim * groove * (0.85 * breath + uEnergy * 0.95);
    lit += vec3(0.45, 0.62, 0.70) * ticks * 0.38;

    vec3 col = mix(vec3(0.005, 0.007, 0.009), lit, solid);
    col += uRim * wire * 1.2;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Volumetric overhead skylight beam (additive, soft fresnel & animated dust-shaft streaks)
const SHAFT_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const SHAFT_FRAG = /* glsl */ `
  uniform float uIntensity;
  uniform float uTime;
  uniform float uEnergy;
  uniform vec3 uRim;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    if (uIntensity <= 0.001) discard;
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 n = normalize(vNormal);
    // Soften silhouette edges so the volumetric cone NEVER shows hard polygon edges
    float edgeFade = pow(abs(dot(n, v)), 1.65);
    // vUv.y: 1 at ceiling skylight, 0 at floor
    float topFade = smoothstep(1.0, 0.86, vUv.y);
    float botFade = smoothstep(0.0, 0.32, vUv.y);
    // Slow vertical curtains of dust inside the light shaft
    float ang = vUv.x * 6.2831853;
    float streak1 = vn(vec2(cos(ang) * 2.2 + 3.0, sin(ang) * 2.2 + vUv.y * 1.4 + uTime * 0.04));
    float streak2 = vn(vec2(cos(ang * 2.0) * 3.5 + 9.0, vUv.y * 2.8 - uTime * 0.06));
    float haze = 0.52 + 0.48 * (streak1 * 0.65 + streak2 * 0.35);

    vec3 beamCol = mix(vec3(0.46, 0.66, 0.76), uRim, 0.42);
    float a = edgeFade * topFade * botFade * haze * uIntensity * (0.062 + uEnergy * 0.022);
    gl_FragColor = vec4(beamCol * a, 0.0);
  }
`;

// Ambient dust motes drifting slowly through the skylight shaft and dark colonnade
const DUST_VERT = /* glsl */ `
  attribute float aRnd;
  uniform float uTime;
  uniform float uDpr;
  uniform float uIntensity;
  varying float vA;
  varying float vRnd;
  void main() {
    vec3 p = position;
    // Gentle thermal buoyancy + slow lazy drift
    float t = uTime * (0.14 + 0.12 * aRnd) + aRnd * 62.83;
    p.x += sin(t * 0.9 + p.z * 1.7) * 0.08;
    p.y = ${FLOOR_Y.toFixed(3)} + mod(p.y - ${FLOOR_Y.toFixed(3)} + uTime * (0.018 + 0.026 * aRnd), ${(CEIL_Y - FLOOR_Y).toFixed(3)});
    p.z += cos(t * 0.7 + p.x * 1.9) * 0.08;

    vec4 w = modelMatrix * vec4(p, 1.0);
    vec4 mv = viewMatrix * w;
    gl_Position = projectionMatrix * mv;

    // Brighter inside the central skylight shaft, softly fading in the wings
    float inBeam = exp(-dot(p.xz, p.xz) * 0.72);
    float heightFade = smoothstep(${FLOOR_Y.toFixed(3)}, ${(FLOOR_Y + 0.25).toFixed(3)}, p.y)
                     * smoothstep(${CEIL_Y.toFixed(3)}, ${(CEIL_Y - 0.35).toFixed(3)}, p.y);
    float twinkle = 0.55 + 0.45 * sin(uTime * (1.8 + 2.5 * aRnd) + aRnd * 41.0);
    vA = uIntensity * heightFade * (0.14 + 0.86 * inBeam) * twinkle;
    vRnd = aRnd;
    gl_PointSize = clamp((1.5 + 2.4 * aRnd) * uDpr * (1.6 / max(-mv.z, 0.3)), 1.0, 9.0) * step(0.01, vA);
  }
`;

const DUST_FRAG = /* glsl */ `
  uniform vec3 uRim;
  varying float vA;
  varying float vRnd;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5 || vA < 0.01) discard;
    float soft = 1.0 - smoothstep(0.08, 0.5, r);
    vec3 col = mix(vec3(0.75, 0.88, 0.94), uRim * 1.2, vRnd * 0.55);
    gl_FragColor = vec4(col * vA * soft * 0.48, 0.0);
  }
`;

// Overhead recessed skylight emissive panel
const SKYLIGHT_FRAG = /* glsl */ `
  uniform float uIntensity;
  uniform vec3 uRim;
  varying vec2 vUv;
  void main() {
    if (uIntensity <= 0.001) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    vec2 c = (vUv - 0.5) * 2.0;
    float soft = (1.0 - smoothstep(0.65, 1.0, abs(c.x))) * (1.0 - smoothstep(0.75, 1.0, abs(c.y)));
    vec3 col = mix(vec3(0.78, 0.90, 0.95), uRim * 1.25, 0.25) * (0.75 + 0.65 * soft) * uIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const RIM_COLOR = new THREE.Color(0.55, 0.85, 0.95);

function createDustGeo(count = 360) {
  const pos = new Float32Array(count * 3);
  const rnd = new Float32Array(count);
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    // 65% clustered inside the skylight column, 35% drifting through the wider atrium
    const inCore = i < count * 0.65;
    const rad = inCore ? Math.sqrt(rand()) * 0.95 : 0.6 + rand() * 1.75;
    const ang = rand() * Math.PI * 2;
    pos[i * 3] = Math.cos(ang) * rad;
    pos[i * 3 + 1] = FLOOR_Y + rand() * (CEIL_Y - FLOOR_Y);
    pos[i * 3 + 2] = inCore ? Math.sin(ang) * rad - 0.15 : -0.3 - rand() * 4.9;
    rnd[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  return g;
}

export default function Atrium({ state, studioState }) {
  const groupRef = useRef();
  const revealRef = useRef(0);

  const mats = useMemo(() => {
    const shared = {
      uReveal: { value: 0 },
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uRim: { value: RIM_COLOR }
    };
    const makeConcrete = (isBack = 0) =>
      new THREE.ShaderMaterial({
        vertexShader: ATRIUM_VERT,
        fragmentShader: CONCRETE_FRAG,
        uniforms: { ...shared, uIsBack: { value: isBack } }
      });
    return {
      shared,
      concrete: makeConcrete(0),
      backWall: makeConcrete(1),
      floor: new THREE.ShaderMaterial({
        vertexShader: ATRIUM_VERT,
        fragmentShader: FLOOR_FRAG,
        uniforms: {
          ...shared,
          uTintCol: { value: new THREE.Color(0.55, 0.85, 0.95) }
        }
      }),
      plinth: new THREE.ShaderMaterial({
        vertexShader: ATRIUM_VERT,
        fragmentShader: PLINTH_FRAG,
        uniforms: { ...shared }
      }),
      shaft: new THREE.ShaderMaterial({
        vertexShader: SHAFT_VERT,
        fragmentShader: SHAFT_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        uniforms: {
          uIntensity: { value: 0 },
          uTime: shared.uTime,
          uEnergy: shared.uEnergy,
          uRim: shared.uRim
        }
      }),
      dust: new THREE.ShaderMaterial({
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        uniforms: {
          uTime: shared.uTime,
          uDpr: { value: 1 },
          uIntensity: { value: 0 },
          uRim: shared.uRim
        }
      }),
      skylight: new THREE.ShaderMaterial({
        vertexShader: ATRIUM_VERT,
        fragmentShader: SKYLIGHT_FRAG,
        uniforms: {
          uIntensity: { value: 0 },
          uRim: shared.uRim
        }
      })
    };
  }, []);

  const dustGeo = useMemo(() => createDustGeo(360), []);

  useEffect(
    () => () => {
      mats.concrete.dispose();
      mats.backWall.dispose();
      mats.floor.dispose();
      mats.plinth.dispose();
      mats.shaft.dispose();
      mats.dust.dispose();
      mats.skylight.dispose();
      dustGeo.dispose();
    },
    [mats, dustGeo]
  );

  // Colonnade rib Z positions receding from foreground flanks to the back clinical alcove
  const ribZs = useMemo(() => [-0.75, -1.75, -2.85, -4.0, -5.1], []);
  const beamZs = useMemo(() => [-1.25, -2.55, -3.9, -5.15], []);

  useFrame((frame, dt) => {
    const s = state.current;
    if (!s.studioOn) {
      revealRef.current = 0;
      if (groupRef.current) groupRef.current.visible = false;
      return;
    }
    const d = Math.min(dt, 0.1);
    const time = frame.clock.elapsedTime;

    // Reveal starts right as the laser scan fires (s.revScan 0 -> 1) and completes in HOLD
    const rawRev = Math.min(Math.max(s.revScan * 0.82 + (s.revHold ?? 0) * 0.25, 0), 1);
    revealRef.current += (rawRev - revealRef.current) * (1 - Math.exp(-d * 6.5));
    const rev = revealRef.current;

    const j = s.studioJourney ?? s.dvdJourney ?? 0;
    // Stay 100% visible while passing the slab edge; only hide at j >= 0.48 when the camera has swept
    // forward OVER the giant LOST MEDIA cover (z ≈ +0.25) so 0 pixels of the clinic can be seen!
    if (groupRef.current) groupRef.current.visible = rev > 0.001 && j < 0.48;
    if (rev <= 0.001 || j >= 0.48) return;

    // Volumetric light & skylight softly settle down once past the floor edge
    const lightOn = THREE.MathUtils.smoothstep(rev, 0.22, 0.92) * (1 - THREE.MathUtils.smoothstep(j, 0.28, 0.47));
    const energy = studioState.current?.cloudEnergy ?? 0;

    mats.shared.uReveal.value = rev;
    mats.shared.uTime.value = time;
    mats.shared.uEnergy.value = energy;
    mats.shaft.uniforms.uIntensity.value = lightOn;
    mats.dust.uniforms.uIntensity.value = lightOn;
    mats.dust.uniforms.uDpr.value = frame.gl.getPixelRatio();
    mats.skylight.uniforms.uIntensity.value = lightOn;
  });

  const hallH = CEIL_Y - FLOOR_Y;
  const hallMidY = (CEIL_Y + FLOOR_Y) * 0.5;
  const hallDepth = HALL_FRONT_Z - BACK_Z; // Ends crisply at front cross-section slab edge z = +0.92
  const hallMidZ = (BACK_Z + HALL_FRONT_Z) * 0.5;
  const plinthH = PLINTH_H;

  return (
    <group ref={groupRef} name="LostMediaAtrium" visible={false}>
      {/* Recessed dark polished concrete gallery floor */}
      <mesh position={[0, FLOOR_Y, hallMidZ]} rotation={[-Math.PI / 2, 0, 0]} material={mats.floor}>
        <planeGeometry args={[SIDE_X * 2.2, hallDepth]} />
      </mesh>

      {/* Ceiling slabs flanking the central overhead skylight slot */}
      <mesh position={[-1.42, CEIL_Y, hallMidZ]} rotation={[Math.PI / 2, 0, 0]} material={mats.concrete}>
        <planeGeometry args={[2.0, hallDepth]} />
      </mesh>
      <mesh position={[1.42, CEIL_Y, hallMidZ]} rotation={[Math.PI / 2, 0, 0]} material={mats.concrete}>
        <planeGeometry args={[2.0, hallDepth]} />
      </mesh>
      {/* Recessed skylight light-well panel */}
      <mesh position={[0, CEIL_Y + 0.14, -1.6]} rotation={[Math.PI / 2, 0, 0]} material={mats.skylight}>
        <planeGeometry args={[0.84, 5.2]} />
      </mesh>
      {/* Skylight shaft side baffles (create real architectural depth in ceiling) */}
      <mesh position={[-0.42, CEIL_Y + 0.07, -1.6]} rotation={[0, Math.PI / 2, 0]} material={mats.concrete}>
        <planeGeometry args={[5.2, 0.18]} />
      </mesh>
      <mesh position={[0.42, CEIL_Y + 0.07, -1.6]} rotation={[0, -Math.PI / 2, 0]} material={mats.concrete}>
        <planeGeometry args={[5.2, 0.18]} />
      </mesh>

      {/* Outer side concrete walls */}
      <mesh position={[-SIDE_X, hallMidY, hallMidZ]} rotation={[0, Math.PI / 2, 0]} material={mats.concrete}>
        <planeGeometry args={[hallDepth, hallH]} />
      </mesh>
      <mesh position={[SIDE_X, hallMidY, hallMidZ]} rotation={[0, -Math.PI / 2, 0]} material={mats.concrete}>
        <planeGeometry args={[hallDepth, hallH]} />
      </mesh>

      {/* Back monumental concrete wall with recessed S0 clinical tile alcove */}
      <mesh position={[0, hallMidY, BACK_Z]} material={mats.backWall}>
        <planeGeometry args={[SIDE_X * 2.2, hallH]} />
      </mesh>
      {/* Subtle architectural frame slabs around the S0 clinical tile alcove (2mm clear of BACK_Z = zero Z-fighting) */}
      <mesh position={[-1.36, 0.34, BACK_Z + 0.094]} material={mats.concrete}>
        <boxGeometry args={[0.32, 2.08, 0.18]} />
      </mesh>
      <mesh position={[1.36, 0.34, BACK_Z + 0.094]} material={mats.concrete}>
        <boxGeometry args={[0.32, 2.08, 0.18]} />
      </mesh>
      <mesh position={[0, 1.44, BACK_Z + 0.094]} material={mats.concrete}>
        <boxGeometry args={[3.04, 0.24, 0.18]} />
      </mesh>

      {/* Brutalist colonnade ribs (left & right, inset 8mm from floor/ceiling = zero Z-fighting) */}
      {ribZs.map((z, idx) => (
        <React.Fragment key={z}>
          <mesh position={[-1.58 - (idx % 2) * 0.08, hallMidY, z]} material={mats.concrete}>
            <boxGeometry args={[0.34, hallH - 0.012, 0.26]} />
          </mesh>
          <mesh position={[1.58 + (idx % 2) * 0.08, hallMidY, z]} material={mats.concrete}>
            <boxGeometry args={[0.34, hallH - 0.012, 0.26]} />
          </mesh>
        </React.Fragment>
      ))}

      {/* Overhead brutalist concrete ceiling beams spanning the atrium (inset cleanly from side walls) */}
      {beamZs.map((z) => (
        <mesh key={z} position={[0, CEIL_Y - 0.125, z]} material={mats.concrete}>
          <boxGeometry args={[SIDE_X * 2.0 - 0.02, 0.23, 0.22]} />
        </mesh>
      ))}

      {/* Central monolithic brutalist plinth directly beneath Multi's particle head */}
      <group position={[0, 0, PLINTH_Z]}>
        {/* Lower wide concrete base step (sunk 4mm into slab so bottom cap never Z-fights floor) */}
        <mesh position={[0, FLOOR_Y + 0.055 - 0.002, 0]} material={mats.plinth}>
          <cylinderGeometry args={[PLINTH_R + 0.13, PLINTH_R + 0.16, 0.114, 64]} />
        </mesh>
        {/* Main monolithic cylindrical pedestal rising to y = PLINTH_TOP_Y */}
        <mesh position={[0, FLOOR_Y + plinthH * 0.5 + 0.002, 0]} material={mats.plinth}>
          <cylinderGeometry args={[PLINTH_R, PLINTH_R + 0.025, plinthH - 0.004, 64]} />
        </mesh>
        {/* Subtle outer calibration brackets on far left/right (zero obstruction of Multi's face!) */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * (PLINTH_R + 0.012), PLINTH_TOP_Y + 0.045, 0]} material={mats.plinth}>
            <boxGeometry args={[0.008, 0.09, 0.016]} />
          </mesh>
        ))}
      </group>

      {/* Volumetric overhead skylight shaft pouring down onto Multi & the plinth */}
      <mesh position={[0, hallMidY + 0.06, 0.02]} material={mats.shaft} renderOrder={1}>
        <cylinderGeometry args={[0.42, 0.92, hallH + 0.1, 48, 1, true]} />
      </mesh>
      {/* Inner tighter core shaft for crisp cinematic god-ray depth */}
      <mesh position={[0, hallMidY + 0.06, 0.02]} material={mats.shaft} renderOrder={1}>
        <cylinderGeometry args={[0.18, 0.44, hallH + 0.1, 36, 1, true]} />
      </mesh>

      {/* Slow-drifting atmospheric dust motes inside the skylight beam */}
      <points geometry={dustGeo} material={mats.dust} frustumCulled={false} renderOrder={3} />
    </group>
  );
}
