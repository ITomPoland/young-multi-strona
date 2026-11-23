import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  WALL_Z, WALL_LEFT, WALL_RIGHT, WALL_TOP, FLOOR_Y, CEILING_Y, PITCH_X, PITCH_Y,
  HOLE_CENTER, SLAB_FRONT_Z, SLAB_BACK_Z, WALL_THICKNESS, INNER_RADIUS,
  GLSL_PHOTO_PROJECTION, GLSL_PHOTO_WRAPPED, GLSL_TILE_STATE, GLSL_CRACKS, GLSL_HOLE
} from './calibration';
import { getHoleTexture, createWallSlabGeometry } from './hole';

// =====================================================================
// The tiled room + the wall you break through.
//  - floor / ceiling / side walls / front wall: the empty-room photo projected from the
//    original camera (camera projection mapping), wrapped where the photo has no data,
//    so the room still reads correctly when you look back at it from behind the wall.
//  - the wall: tile grout + plaster on the front, a 30 cm broken slab around the hole,
//    a dark back side. Behind the wall there is NO light source: it is dark, the only
//    light is the room shining through the hole.
// =====================================================================

const WORLD_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec2 vUv;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const ROOM_FRAG = /* glsl */ `
  uniform sampler2D uPhoto;
  uniform float uFrontWall;
  uniform float uExposure;
  varying vec3 vWorld;
  ${GLSL_PHOTO_PROJECTION}
  ${GLSL_PHOTO_WRAPPED}
  void main() {
    // the front wall (never in the photo) borrows the back wall's tiles
    vec3 p = uFrontWall > 0.5 ? vec3(vWorld.xy, ${WALL_Z.toFixed(4)}) : vWorld;
    // seen from behind the wall the room is the only light source: push it a bit
    gl_FragColor = vec4(texture2D(uPhoto, photoUvWrapped(p)).rgb * uExposure, 1.0);
  }
`;

// Front face of the wall right behind the tiles: photo grout between intact tiles,
// plaster where tiles fell off, and the hole opening (discarded) as the wall gives way.
const WALL_FRONT_FRAG = /* glsl */ `
  uniform sampler2D uPhoto;
  uniform sampler2D uHole;
  uniform float uCrack;
  uniform float uBurst;
  uniform float uTime;
  varying vec3 vWorld;
  ${GLSL_PHOTO_PROJECTION}
  ${GLSL_TILE_STATE}
  ${GLSL_CRACKS}
  ${GLSL_HOLE}

  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec2 cellF = vec2((vWorld.x - ${WALL_LEFT.toFixed(4)}) / ${PITCH_X.toFixed(4)}, (${WALL_TOP.toFixed(4)} - vWorld.y) / ${PITCH_Y.toFixed(4)});
    vec2 cell = floor(cellF);
    vec2 f = fract(cellF);

    // the hole: final ragged outline (shared profile), opening up during the burst
    vec2 d = (vWorld.xy - vec2(${HOLE_CENTER.x.toFixed(3)}, ${HOLE_CENTER.y.toFixed(3)})) / ${PITCH_X.toFixed(4)};
    float ang = atan(d.y, d.x);
    float outline = holeRadius(ang);
    float open = smoothstep(0.03, 0.42, uBurst);
    float dist = length(d);
    if (dist < outline * open) discard;

    float r = cellRadius(cell);
    float tl = max(0.0, uBurst - cellDelay(cell, r));
    float inner = (r < ${INNER_RADIUS.toFixed(2)} || dist < outline + 0.9) ? 1.0 : 0.0;
    float tileGone = inner * step(0.015, tl);

    vec3 photo = texture2D(uPhoto, photoUv(vWorld)).rgb;
    float plasterN = vnoise(vWorld.xy * 38.0) * 0.6 + vnoise(vWorld.xy * 140.0) * 0.4;
    vec3 plaster = vec3(0.2, 0.21, 0.215) * (0.7 + plasterN * 0.6);
    float rim = 1.0 - smoothstep(0.0, 0.6, dist - outline * open);
    plaster = mix(plaster, vec3(0.42, 0.41, 0.39) * (0.8 + plasterN * 0.4), rim * step(0.001, open));
    vec3 col = mix(photo, plaster, tileGone);

    // "prześwietlenie": the grout of cracked tiles glows (the dust went in here)
    float grout = 1.0 - smoothstep(0.03, 0.085, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    float cd = crackDist(cell);
    float cracked = smoothstep(cd - 1.5, cd + 0.4, uCrack * 12.0);
    float flicker = 0.88 + 0.12 * sin(uTime * 13.0 + cell.x * 3.1 + cell.y * 1.7);
    float leak = grout * cracked * (1.0 - tileGone) * (1.0 - smoothstep(0.04, 0.35, uBurst)) * flicker;
    col += vec3(0.85, 1.05, 1.15) * leak * 1.7;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// The 30 cm slab: broken edge around the hole + the dark back side
const SLAB_FRAG = /* glsl */ `
  uniform sampler2D uHole;
  uniform float uBurst;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  ${GLSL_TILE_STATE}
  ${GLSL_HOLE}

  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    // the front cap is covered by the wall-front plane
    if (vNormalW.z > 0.5) discard;

    vec2 d = (vWorld.xy - vec2(${HOLE_CENTER.x.toFixed(3)}, ${HOLE_CENTER.y.toFixed(3)})) / ${PITCH_X.toFixed(4)};
    float dist = length(d);
    float outline = holeRadius(atan(d.y, d.x));
    float n = vnoise(vWorld.xy * 22.0 + vWorld.z * 9.0) * 0.6 + vnoise(vWorld.xy * 90.0 + vWorld.z * 40.0) * 0.4;

    vec3 col;
    if (vNormalW.z < -0.5) {
      // back side: raw brick/plaster in the dark, faint light bleeding around the hole
      float bricks = step(0.08, fract(vWorld.y * 7.5)) * step(0.05, fract(vWorld.x * 3.6 + floor(vWorld.y * 7.5) * 0.5));
      col = vec3(0.07, 0.075, 0.08) * (0.6 + n * 0.5) * mix(0.55, 1.0, bricks);
      float bleed = exp(-max(dist - outline, 0.0) * 1.1);
      col += vec3(0.32, 0.42, 0.46) * bleed * (0.55 + n * 0.45);
    } else {
      // broken edge: chunky plaster + brick, lit by the room on the front half
      float depth01 = clamp((vWorld.z - ${SLAB_BACK_Z.toFixed(4)}) / ${WALL_THICKNESS.toFixed(3)}, 0.0, 1.0);
      vec3 plaster = vec3(0.46, 0.45, 0.43) * (0.65 + n * 0.55);
      vec3 brick = vec3(0.30, 0.20, 0.17) * (0.7 + n * 0.5);
      col = mix(brick, plaster, step(0.62, depth01 + (n - 0.5) * 0.25));
      col *= mix(0.45, 1.15, depth01);
    }
    gl_FragColor = vec4(col * smoothstep(0.3, 0.5, uBurst + 0.2), 1.0);
  }
`;

// Light pouring OUT of the room through the hole into the dark (seen after the turn)
const SHAFT_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SHAFT_FRAG = /* glsl */ `
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vUv;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
  void main() {
    // vUv.y: 1 at the hole, 0 far into the void
    float along = 1.0 - vUv.y;
    float streaks = vn(vec2(vUv.x * 30.0, along * 2.0 - uTime * 0.12)) * 0.7 + 0.3;
    float fade = (1.0 - smoothstep(0.0, 1.0, along)) * smoothstep(0.0, 0.06, along);
    float seam = sin(vUv.x * 3.14159 * 2.0) * 0.5 + 0.5;
    vec3 col = vec3(0.62, 0.84, 0.92) * streaks * fade * uIntensity * (0.6 + 0.4 * seam);
    gl_FragColor = vec4(col * 0.16, 0.0);
  }
`;

export default function Room({ photo, state }) {
  const frontRef = useRef();
  const slabRef = useRef();
  const shaftRef = useRef();
  const holeTex = getHoleTexture();

  const roomUniforms = useMemo(() => ({ uPhoto: { value: photo }, uFrontWall: { value: 0 }, uExposure: { value: 1 } }), [photo]);
  const frontWallUniforms = useMemo(() => ({ uPhoto: { value: photo }, uFrontWall: { value: 1 }, uExposure: { value: 1 } }), [photo]);
  const wallFrontUniforms = useMemo(
    () => ({
      uPhoto: { value: photo },
      uHole: { value: holeTex },
      uCrack: { value: 0 },
      uBurst: { value: 0 },
      uTime: { value: 0 }
    }),
    [photo, holeTex]
  );
  const slabUniforms = useMemo(() => ({ uHole: { value: holeTex }, uBurst: { value: 0 } }), [holeTex]);
  const shaftUniforms = useMemo(() => ({ uIntensity: { value: 0 }, uTime: { value: 0 } }), []);

  const slabGeo = useMemo(() => createWallSlabGeometry(), []);
  const shaftGeo = useMemo(() => {
    // open cone: 1.1 m at the hole -> 3.2 m, 6 m deep into the void (toward -Z)
    const g = new THREE.CylinderGeometry(1.1, 3.2, 6, 48, 1, true);
    g.rotateX(Math.PI / 2); // top (r=1.1, uv.y=1) -> +Z
    g.translate(0, 0, -3);
    return g;
  }, []);

  const width = WALL_RIGHT - WALL_LEFT;
  const height = CEILING_Y - FLOOR_Y;
  const midX = (WALL_LEFT + WALL_RIGHT) / 2;
  const midY = (CEILING_Y + FLOOR_Y) / 2;
  const frontZ = 1.5; // the room closes a bit behind the start camera
  const roomDepth = -WALL_Z + frontZ;
  const midZ = (WALL_Z + frontZ) / 2;

  useFrame((_, dt) => {
    const s = state.current;
    if (frontRef.current) {
      const u = frontRef.current.uniforms;
      u.uCrack.value = s.crack;
      u.uBurst.value = s.burst;
      u.uTime.value += dt;
    }
    if (slabRef.current) slabRef.current.uniforms.uBurst.value = s.burst;
    // exposure stays exactly 1 while the photo must match the hero, rises after the turn
    const exposure = 1 + 0.7 * THREE.MathUtils.smoothstep(s.turn, 0.2, 0.55);
    roomUniforms.uExposure.value = exposure;
    frontWallUniforms.uExposure.value = exposure;
    if (shaftRef.current) {
      shaftRef.current.uniforms.uIntensity.value = THREE.MathUtils.smoothstep(s.burst, 0.1, 0.6);
      shaftRef.current.uniforms.uTime.value += dt;
    }
  });

  return (
    <group>
      <mesh position={[midX, FLOOR_Y, midZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, roomDepth]} />
        <shaderMaterial vertexShader={WORLD_VERT} fragmentShader={ROOM_FRAG} uniforms={roomUniforms} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[midX, CEILING_Y, midZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, roomDepth]} />
        <shaderMaterial vertexShader={WORLD_VERT} fragmentShader={ROOM_FRAG} uniforms={roomUniforms} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[WALL_LEFT, midY, midZ]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[roomDepth, height]} />
        <shaderMaterial vertexShader={WORLD_VERT} fragmentShader={ROOM_FRAG} uniforms={roomUniforms} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[WALL_RIGHT, midY, midZ]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[roomDepth, height]} />
        <shaderMaterial vertexShader={WORLD_VERT} fragmentShader={ROOM_FRAG} uniforms={roomUniforms} side={THREE.DoubleSide} />
      </mesh>
      {/* front wall: only ever seen through the hole, after the 180° turn */}
      <mesh position={[midX, midY, frontZ]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[width, height]} />
        <shaderMaterial vertexShader={WORLD_VERT} fragmentShader={ROOM_FRAG} uniforms={frontWallUniforms} side={THREE.DoubleSide} />
      </mesh>

      {/* front face of the wall behind the tiles */}
      <mesh position={[midX, midY, SLAB_FRONT_Z + 0.001]}>
        <planeGeometry args={[width, height]} />
        <shaderMaterial ref={frontRef} vertexShader={WORLD_VERT} fragmentShader={WALL_FRONT_FRAG} uniforms={wallFrontUniforms} />
      </mesh>

      {/* the wall's thickness and back side */}
      <mesh geometry={slabGeo}>
        <shaderMaterial ref={slabRef} vertexShader={WORLD_VERT} fragmentShader={SLAB_FRAG} uniforms={slabUniforms} />
      </mesh>

      {/* room light spilling out through the hole into the dark */}
      <mesh geometry={shaftGeo} position={[HOLE_CENTER.x, HOLE_CENTER.y, SLAB_BACK_Z]}>
        <shaderMaterial
          ref={shaftRef}
          vertexShader={SHAFT_VERT}
          fragmentShader={SHAFT_FRAG}
          uniforms={shaftUniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.CustomBlending}
          blendEquation={THREE.AddEquation}
          blendSrc={THREE.OneFactor}
          blendDst={THREE.OneFactor}
          blendSrcAlpha={THREE.ZeroFactor}
          blendDstAlpha={THREE.OneFactor}
        />
      </mesh>
    </group>
  );
}
