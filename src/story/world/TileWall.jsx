import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  TILE_COLS, TILE_ROWS, PITCH_X, PITCH_Y, WALL_Z, WALL_LEFT, WALL_TOP,
  TILE_THICKNESS, HOLE_CENTER, HERO_CELL, SLAB_BACK_Z, GLSL_PHOTO_PROJECTION, GLSL_TILE_STATE,
  GLSL_CRACKS, GLSL_HOLE, GLSL_PULSE, GROUT_LIGHT
} from './calibration';
import { getHoleTexture } from './hole';

// =====================================================================
// 616 tiles of the back wall in ONE draw call.
// All motion is a pure function of scroll (uniforms), so scrolling back up
// reassembles the wall exactly. No physics simulation.
// =====================================================================

const VERT = /* glsl */ `
  attribute vec2 aCell;
  attribute vec4 aRand;

  uniform float uCrack;     // 0..1 crack front growing out from the centre
  uniform float uBurst;     // burst "time" (slow-mo is baked into this curve)
  uniform float uTime;
  uniform vec2 uHeroCell;
  uniform sampler2D uHole;
  uniform vec3 uHeroPos;  // the single's tile: debris flows around it instead of through it
  uniform vec3 uCamPos;   // ...and around the lens when the camera flies through the debris
  uniform float uClean;   // album ring: debris that flew behind the wall clears out of the way

  varying vec3 vRestWorld;
  varying vec2 vUv;
  varying float vFace;      // 0 front, 1 side, 2 back
  varying float vShade;
  varying float vCrack;
  varying vec4 vRand;

  ${GLSL_TILE_STATE}
  ${GLSL_CRACKS}
  ${GLSL_HOLE}

  mat3 rotAxis(vec3 axis, float a) {
    float s = sin(a), c = cos(a), oc = 1.0 - c;
    return mat3(
      oc * axis.x * axis.x + c,          oc * axis.x * axis.y + axis.z * s, oc * axis.z * axis.x - axis.y * s,
      oc * axis.x * axis.y - axis.z * s, oc * axis.y * axis.y + c,          oc * axis.y * axis.z + axis.x * s,
      oc * axis.z * axis.x + axis.y * s, oc * axis.y * axis.z - axis.x * s, oc * axis.z * axis.z + c
    );
  }

  void main() {
    vec3 center = vec3(
      ${WALL_LEFT.toFixed(4)} + (aCell.x + 0.5) * ${PITCH_X.toFixed(4)},
      ${WALL_TOP.toFixed(4)} - (aCell.y + 0.5) * ${PITCH_Y.toFixed(4)},
      ${(WALL_Z - TILE_THICKNESS * 0.5).toFixed(4)}
    );

    vRestWorld = center + position;
    vUv = uv;
    vRand = aRand;
    vFace = normal.z > 0.5 ? 0.0 : (normal.z < -0.5 ? 2.0 : 1.0);

    float r = cellRadius(aCell);
    float zone = cellZone(r);
    // every tile over the final hole outline must go (the wall behind it is gone)
    vec2 dh = (center.xy - vec2(${HOLE_CENTER.x.toFixed(3)}, ${HOLE_CENTER.y.toFixed(3)})) / ${PITCH_X.toFixed(4)};
    if (length(dh) < holeRadius(atan(dh.y, dh.x)) + 0.9) zone = 2.0;
    float cd = crackDist(aCell);
    // nothing is cracked in the hero frame (front <= -1.5): tiles start to shiver as their
    // grout lights up (dust settling, then the spreading cracks)
    float cracked = smoothstep(cd - 1.5, cd + 0.4, uCrack * 12.0);
    vCrack = cracked;

    vec3 local = position;
    vec3 n = normal;
    vec3 offset = vec3(0.0);

    // --- anticipation: cracked tiles shiver and pop out a few mm ---
    float shiver = cracked * (1.0 - smoothstep(0.0, 0.25, uBurst));
    offset.z += shiver * (0.004 + aRand.y * 0.018);
    float wob = sin(uTime * (22.0 + aRand.x * 14.0) + aRand.z * 6.28) * 0.012 * shiver;
    mat3 shiverRot = rotAxis(normalize(aRand.xyz - 0.5 + 0.001), wob);
    local = shiverRot * local;
    n = shiverRot * n;

    if (zone > 1.5) {
      // --- INNER: blown out toward the camera ---
      float tl = max(0.0, uBurst - cellDelay(aCell, r));
      vec2 radial = normalize(center.xy - vec2(${HOLE_CENTER.x.toFixed(3)}, ${HOLE_CENTER.y.toFixed(3)}) + (aRand.xy - 0.5) * 0.3);
      vec3 vel = normalize(vec3(radial * (0.55 + aRand.w * 0.9), 1.25 + aRand.y * 1.1)) * (1.1 + aRand.w * 2.0);
      // ~15% are knocked backwards into the dark behind the wall (you fly past them later)
      if (aRand.y < 0.15) vel = vec3(radial * (0.3 + aRand.w * 0.5), -0.6 - aRand.x * 0.9);
      offset += vel * tl + vec3(0.0, -0.32 * tl * tl, 0.0);
      vec3 axis = normalize(aRand.zxy - 0.5 + 0.001);
      mat3 spin = rotAxis(axis, tl * (1.6 + aRand.x * 4.5));
      local = spin * local;
      n = spin * n;
    } else if (zone > 0.5) {
      // --- RING: cracked, hinge on the top edge, ~30% fall later ---
      float tl = max(0.0, uBurst - cellDelay(aCell, r) - 0.08);
      float hang = smoothstep(0.0, 0.6, tl) * (0.12 + aRand.y * 0.55) * step(0.35, aRand.z);
      vec3 hinge = vec3(0.0, ${(PITCH_Y * 0.5).toFixed(4)}, 0.0);
      mat3 tilt = rotAxis(vec3(1.0, 0.0, 0.0), hang);
      local = tilt * (local - hinge) + hinge;
      n = tilt * n;
      float falls = step(aRand.w, 0.3);
      float ft = max(0.0, tl - 0.25 - aRand.x * 0.3) * falls;
      offset += vec3((aRand.x - 0.5) * 0.15 * ft, -0.9 * ft * ft, 0.25 * ft);
      mat3 fallSpin = rotAxis(normalize(aRand.yzx - 0.5 + 0.001), ft * 3.0);
      local = fallSpin * local;
      n = fallSpin * n;
    }

    // The single's tile is rendered separately (HeroTile)
    if ((abs(aCell.x - uHeroCell.x) < 0.5 || abs(aCell.x - uHeroCell.x - 1.0) < 0.5) && abs(aCell.y - uHeroCell.y) < 0.5) {
      local *= 0.0;
    }

    // keep flying debris out of the hero tile and away from the lens (no interpenetration)
    if (zone > 1.5) {
      vec3 c = center + offset;
      vec3 dh = c - uHeroPos;
      float lh = length(dh);
      if (lh < 0.36) c += (dh / max(lh, 1e-4)) * (0.36 - lh);
      vec3 dc = c - uCamPos;
      float lc = length(dc);
      if (lc < 0.3) c += (dc / max(lc, 1e-4)) * (0.3 - lc);
      offset = c - center;
    }

    // on the album ring the debris behind the wall shrinks away with the dither
    if (center.z + offset.z < ${(SLAB_BACK_Z - 0.05).toFixed(4)}) local *= 1.0 - uClean;
    vec3 world = center + local + offset;
    // fake key light from the camera side + soft fill, == 1.0 for an untouched tile
    vec3 nW = normalize(n);
    vShade = mix(0.42, 1.0, clamp(nW.z, 0.0, 1.0)) + max(dot(nW, normalize(vec3(-0.4, 0.7, 0.4))), 0.0) * 0.12 * (1.0 - step(0.999, nW.z));

    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uPhoto;
  uniform float uCrack;
  uniform float uBurst;
  uniform float uPulse;

  varying vec3 vRestWorld;
  varying vec2 vUv;
  varying float vFace;
  varying float vShade;
  varying float vCrack;
  varying vec4 vRand;

  ${GLSL_PHOTO_PROJECTION}
  ${GLSL_PULSE}

  // the tile's own outline (grout side), about a pixel wide at any distance
  float tileEdge(vec2 uv) {
    vec2 fw = max(fwidth(uv), vec2(1e-4));
    vec2 f = min(uv, 1.0 - uv);
    vec2 l = 1.0 - smoothstep(fw * 0.8, fw * 1.8, f);
    return max(l.x, l.y);
  }

  float crackLine(vec2 uv, float seed) {
    float a = seed * 6.2831;
    vec2 dir = vec2(cos(a), sin(a));
    vec2 o = vec2(fract(seed * 7.13), fract(seed * 3.71)) * 0.6 + 0.2;
    float d = abs(dot(uv - o, vec2(-dir.y, dir.x)));
    // jagged
    d += (fract(sin(dot(floor(uv * 18.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.012;
    return 1.0 - smoothstep(0.0, 0.018, d);
  }

  void main() {
    vec3 col;
    if (vFace < 0.5) {
      col = texture2D(uPhoto, photoUv(vRestWorld)).rgb;
      // hairline cracks across the glaze appear AFTER the grout lights up (dust first)
      float lines = max(crackLine(vUv, vRand.x), crackLine(vUv, vRand.w) * step(0.5, vRand.y));
      float lineAmt = vCrack * smoothstep(0.26, 0.5, uCrack);
      float glow = lines * lineAmt * (1.0 - smoothstep(0.05, 0.4, uBurst));
      col = mix(col, col * 0.35, lines * lineAmt);
      col += vec3(0.85, 1.05, 1.15) * glow * 1.4;
    } else if (vFace < 1.5) {
      col = vec3(0.70, 0.80, 0.84); // glazed ceramic edge
    } else {
      col = vec3(0.24, 0.24, 0.23) * (0.8 + vRand.z * 0.4); // tile adhesive
    }
    vec3 light = vec3(0.0);
    // the burst pulse runs round every tile as it passes (also the ones already flying)
    float ring = pulseRing(vRestWorld);
    if (ring > 0.001 && vFace < 0.5) light = ${GROUT_LIGHT} * ring * tileEdge(vUv) * 0.28 + col * ring * 0.05;
    gl_FragColor = vec4(col * vShade + light, 1.0);
  }
`;

export default function TileWall({ photo, state }) {
  const matRef = useRef();

  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(PITCH_X * 0.94, PITCH_Y * 0.94, TILE_THICKNESS);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = box.index;
    geo.setAttribute('position', box.getAttribute('position'));
    geo.setAttribute('normal', box.getAttribute('normal'));
    geo.setAttribute('uv', box.getAttribute('uv'));

    const count = TILE_COLS * TILE_ROWS;
    const cells = new Float32Array(count * 2);
    const rands = new Float32Array(count * 4);
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    let i = 0;
    for (let row = 0; row < TILE_ROWS; row++) {
      for (let col = 0; col < TILE_COLS; col++) {
        cells[i * 2] = col;
        cells[i * 2 + 1] = row;
        rands[i * 4] = rnd();
        rands[i * 4 + 1] = rnd();
        rands[i * 4 + 2] = rnd();
        rands[i * 4 + 3] = rnd();
        i++;
      }
    }
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rands, 4));
    geo.instanceCount = count;
    box.dispose();
    return geo;
  }, []);

  const uniforms = useMemo(
    () => ({
      uPhoto: { value: photo },
      uCrack: { value: 0 },
      uBurst: { value: 0 },
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uHeroCell: { value: new THREE.Vector2(HERO_CELL.x, HERO_CELL.y) },
      uHole: { value: getHoleTexture() },
      uHeroPos: { value: new THREE.Vector3(0, 0, 99) },
      uCamPos: { value: new THREE.Vector3(0, 0, 99) },
      uClean: { value: 0 }
    }),
    [photo]
  );

  useFrame((_, dt) => {
    const u = matRef.current?.uniforms;
    if (!u) return;
    u.uCrack.value = state.current.crack;
    u.uBurst.value = state.current.burst;
    u.uPulse.value = state.current.pulse;
    u.uClean.value = state.current.clean;
    if (state.current.heroTile) u.uHeroPos.value.copy(state.current.heroTile.position);
    if (state.current.camPos) u.uCamPos.value.copy(state.current.camPos);
    u.uTime.value += dt;
  });

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial ref={matRef} vertexShader={VERT} fragmentShader={FRAG} uniforms={uniforms} />
    </mesh>
  );
}
