import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLSL_PHOTO_PROJECTION } from './calibration';
import { BEATS } from '../story.config';

// =====================================================================
// The one tile that flies at the camera in bullet time and turns into the single.
// Its pose is computed by the StoryDirector (state.current.heroTile); this component
// only renders it. Front face: its own piece of the wall photo -> the cover.
// =====================================================================

const VERT = /* glsl */ `
  uniform vec3 uRestCenter;
  uniform vec3 uRestSize;
  varying vec2 vUv;
  varying vec3 vRestWorld;
  varying float vFace;
  varying float vShade;
  void main() {
    vUv = uv;
    vRestWorld = uRestCenter + position * uRestSize;
    vFace = normal.z > 0.5 ? 0.0 : (normal.z < -0.5 ? 2.0 : 1.0);
    vec3 nV = normalize(normalMatrix * normal);
    vShade = mix(0.45, 1.0, clamp(nV.z, 0.0, 1.0));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uPhoto;
  uniform sampler2D uCover;
  uniform float uReveal;
  uniform float uHover;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vRestWorld;
  varying float vFace;
  varying float vShade;
  ${GLSL_PHOTO_PROJECTION}

  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }

  void main() {
    vec3 col;
    float coverMask = 0.0;
    if (vFace < 0.5) {
      vec3 wallPiece = texture2D(uPhoto, photoUv(vRestWorld)).rgb;
      // the piece is 2:1 (two tiles), the cover 16:9: fill the width, crop a sliver top/bottom
      vec3 cover = texture2D(uCover, vec2(vUv.x, 0.5 + (vUv.y - 0.5) * 0.889)).rgb;
      // the cover "burns in" through noise (same language as Multi's disintegration)
      float field = vn(vUv * 9.0) * 0.6 + vn(vUv * 31.0) * 0.4;
      float shown = smoothstep(field - 0.12, field + 0.04, uReveal * 1.2 - 0.05);
      float edge = smoothstep(0.1, 0.0, abs(field - (uReveal * 1.2 - 0.05))) * (1.0 - step(0.999, uReveal));
      col = mix(wallPiece, cover, shown) + vec3(0.7, 0.92, 1.0) * edge * 0.9;
      coverMask = shown;
      // the grout line between the two glued tiles runs across the print
      float groutLine = 1.0 - smoothstep(0.0, 0.007, abs(vUv.x - 0.5));
      col *= 1.0 - groutLine * 0.6;
      col *= vShade;
    } else if (vFace < 1.5) {
      col = vec3(0.72, 0.82, 0.86) * vShade;
    } else {
      float n = vn(vUv * 40.0);
      col = vec3(0.26, 0.26, 0.25) * (0.75 + n * 0.5) * vShade;
    }
    // alpha < 1 tells the post pass to show raw colour (hover = clean, un-dithered cover)
    gl_FragColor = vec4(col, 1.0 - uHover * coverMask * 0.96);
  }
`;

export default function HeroTile({ photo, cover, state }) {
  const meshRef = useRef();
  const matRef = useRef();

  const uniforms = useMemo(
    () => ({
      uPhoto: { value: photo },
      uCover: { value: cover },
      uReveal: { value: 0 },
      uHover: { value: 0 },
      uTime: { value: 0 },
      uRestCenter: { value: new THREE.Vector3() },
      uRestSize: { value: new THREE.Vector3(1, 1, 1) }
    }),
    [photo, cover]
  );

  useFrame((_, dt) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;
    const t = state.current.heroTile;
    mesh.visible = t.visible;
    mesh.position.copy(t.position);
    mesh.quaternion.copy(t.quaternion);
    mesh.scale.copy(t.scale);
    mat.uniforms.uReveal.value = t.reveal;
    const st = state.current;
    const autoClean = st.touch && st.vh > BEATS.textIn[1] + 8 && st.turn < 0.1;
    const target = st.hover || autoClean ? 1 : 0;
    mat.uniforms.uHover.value += (target - mat.uniforms.uHover.value) * Math.min(1, dt * (autoClean ? 2.5 : 6));
    mat.uniforms.uTime.value += dt;
    mat.uniforms.uRestCenter.value.copy(t.restCenter);
    mat.uniforms.uRestSize.value.copy(t.restSize);
  });

  return (
    <mesh ref={meshRef} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <shaderMaterial ref={matRef} vertexShader={VERT} fragmentShader={FRAG} uniforms={uniforms} />
    </mesh>
  );
}
