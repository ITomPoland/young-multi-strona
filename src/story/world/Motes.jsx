import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WALL_Z, WALL_LEFT, WALL_TOP, PITCH_X, PITCH_Y, HOLE_CELL, HOLE_CENTER, GLSL_TILE_STATE, GLSL_CRACKS } from './calibration';

// =====================================================================
// Multi's dust, once more. It soaked into the grout (hero), so when the wall bursts it is
// blown back out of the very same grout lines with the debris, then floats in the air
// through the bullet time: the hero's motif carried into the single, and something always
// moving in the slowed-down frame. Pure function of the burst clock (scroll back = back in).
// =====================================================================

const COUNT = 900;
const fx = (v) => v.toFixed(4);

const VERT = /* glsl */ `
  uniform float uBurst;
  uniform float uTime;
  uniform float uViewH;
  uniform float uFade;
  varying float vAlpha;

  ${GLSL_TILE_STATE}
  ${GLSL_CRACKS}

  void hide() {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
  }

  void main() {
    float index = position.x;
    float ra = position.y;
    float rb = position.z;
    if (uBurst <= 0.0 || uFade <= 0.0) { hide(); return; }

    // where it was: on the grout the hero dust soaked into (same pick as the dust)
    vec2 holeCell = vec2(${fx(HOLE_CELL.x)}, ${fx(HOLE_CELL.y)});
    vec2 cell = floor(holeCell);
    for (int k = 0; k < 12; k++) {
      vec2 rr = vec2(
        fract(index * 0.7548776662 + 0.13 + float(k) * 0.3183),
        fract(index * 0.5698402909 + 0.37 + float(k) * 0.5371)
      );
      vec2 c = floor(holeCell + (rr - 0.5) * 13.0);
      float lit = handoffLit(c);
      if (fract(index * 0.3819660113 + float(k) * 0.6180339887) < lit * lit) { cell = c; break; }
    }
    float edgeSel = fract(index * 0.1234567 + 0.71);
    float along = fract(index * 0.4142135 + 0.29);
    vec2 local = edgeSel < 0.25 ? vec2(along, 0.0)
               : edgeSel < 0.5  ? vec2(along, 1.0)
               : edgeSel < 0.75 ? vec2(0.0, along)
               :                  vec2(1.0, along);
    vec3 rest = vec3(
      ${fx(WALL_LEFT)} + (cell.x + local.x) * ${fx(PITCH_X)},
      ${fx(WALL_TOP)} - (cell.y + local.y) * ${fx(PITCH_Y)},
      ${fx(WALL_Z + 0.004)}
    );

    // blown out with the debris, heavy drag: fast at first, then hanging in the air
    float tl = max(0.0, uBurst - ra * 0.06);
    vec2 radial = normalize(rest.xy - vec2(${fx(HOLE_CENTER.x)}, ${fx(HOLE_CENTER.y)}) + (vec2(ra, rb) - 0.5) * 0.5);
    vec3 dir = normalize(vec3(radial * (0.45 + rb * 1.25), 0.55 + ra * 1.7));
    float speed = 1.0 + rb * 2.8;
    float drag = 2.2;
    vec3 pos = rest + dir * speed * (1.0 - exp(-drag * tl)) / drag;
    pos.y -= 0.025 * tl * tl;
    // floating: a slow, never-still drift
    float fl = smoothstep(0.25, 1.0, tl);
    pos += vec3(
      sin(uTime * 0.61 + ra * 40.0),
      sin(uTime * 0.47 + rb * 37.0),
      sin(uTime * 0.53 + ra * 13.0 + rb * 7.0)
    ) * 0.014 * fl;

    vec4 mv = viewMatrix * vec4(pos, 1.0);
    float dist = -mv.z;
    if (dist < 0.06) { hide(); return; }
    gl_Position = projectionMatrix * mv;
    float px = (0.007 + rb * 0.012) * projectionMatrix[1][1] * uViewH * 0.5 / dist;
    gl_PointSize = clamp(px, 1.5, 9.0);

    float twinkle = 0.45 + 0.55 * sin(uTime * (1.4 + ra * 2.6) + rb * 21.0);
    vAlpha = smoothstep(0.0, 0.015, tl) * smoothstep(0.1, 0.35, dist) * twinkle * uFade;
  }
`;

const FRAG = /* glsl */ `
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = (1.0 - smoothstep(0.3, 0.5, r)) * vAlpha;
    if (a < 0.01) discard;
    // the grout light it carried out (HDR: picked up by the glow, dithered with the scene)
    gl_FragColor = vec4(vec3(0.85, 1.02, 1.12) * 2.0, a);
  }
`;

export default function Motes({ state }) {
  const matRef = useRef();

  const geometry = useMemo(() => {
    const data = new Float32Array(COUNT * 3);
    let seed = 4242;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < COUNT; i++) {
      data[i * 3] = i * 7 + 3; // index into the dust's quasi-random pick
      data[i * 3 + 1] = rnd();
      data[i * 3 + 2] = rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data, 3));
    return geo;
  }, []);

  const uniforms = useMemo(
    () => ({
      uBurst: { value: 0 },
      uTime: { value: 0 },
      uViewH: { value: 800 },
      uFade: { value: 0 }
    }),
    []
  );

  useFrame((frame, dt) => {
    const s = state.current;
    const u = matRef.current?.uniforms;
    if (!u) return;
    u.uBurst.value = s.burst;
    u.uTime.value += dt;
    u.uViewH.value = frame.size.height * frame.gl.getPixelRatio();
    // gone before the camera whips through the hole
    u.uFade.value = 1 - THREE.MathUtils.smoothstep(s.turn, 0.35, 0.6);
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </points>
  );
}
