import React, { useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { ALBUMS } from '../../data/albums';
import { ALBUM_SPACING, ALBUM_RISE } from '../story.config';
import { TOWER, TOWER_HOLE_SCALE, PITCH_X, HOLE_CENTER, GLSL_HOLE } from './calibration';
import { getHoleTexture } from './hole';

// =====================================================================
// S5: THE TOWER. The room is inside it; we flew out through the wound in its skin.
// Outside: curved LED billboards with the album covers spiral up the cylinder (they never
// cross the hole: each is ALBUM_SPACING further round and ALBUM_RISE higher), plus two
// scrolling ticker rings. Clean colours (the compositor drops the dither out here).
// =====================================================================

const BILL_W = 3.0; // metres of arc
const BILL_H = 3.0;
const BILL_R = TOWER.radius + 0.05;
const TICKER_R = TOWER.radius + 0.02;
const TICKERS = [
  { y: ALBUM_RISE + 3.0 / 2 + 0.42, speed: 0.018, h: 0.36 },
  { y: ALBUM_RISE * ALBUMS.length + 2.4, speed: -0.012, h: 0.5 }
];

// three's CylinderGeometry: (x, z) = r (sin θ, cos θ); ours: (x, z) = -r (sin φ, cos φ) -> θ = φ + π
const thetaOf = (phi) => Math.PI + phi;

const albumPhi = (i) => (i + 1) * ALBUM_SPACING;
const albumY = (i) => (i + 1) * ALBUM_RISE;

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
  void main() {
    float hd = skinHoleDist(vWorld);
    if (hd < 0.0) discard;
    float phi = atan(-(vWorld.x - ${TOWER.x.toFixed(3)}), -(vWorld.z - ${TOWER.z.toFixed(4)}));
    // facade panels: vertical seams every 9°, horizontal every 1.25 m
    float a = fract(phi / 0.15708 + 0.5);
    float h = fract(vWorld.y / 1.25);
    float seam = max(1.0 - smoothstep(0.0, 0.02, min(a, 1.0 - a)), 1.0 - smoothstep(0.0, 0.012, min(h, 1.0 - h)));
    vec3 col = vec3(0.022, 0.025, 0.028) * (1.0 - seam * 0.5);
    // rim light so the cylinder reads against the dark
    vec3 v = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - clamp(dot(normalize(vNormalW), v), 0.0, 1.0), 2.4);
    col += vec3(0.32, 0.42, 0.48) * rim * 0.16;
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

const BILL_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uBright;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    // LED frame round the screen
    vec2 e = min(vUv, 1.0 - vUv);
    float edge = min(e.x, e.y);
    float frame = 1.0 - smoothstep(0.006, 0.012, edge);
    float inner = smoothstep(0.016, 0.02, edge);
    vec2 cuv = (vUv - 0.02) / 0.96;
    vec3 cover = texture2D(uMap, clamp(cuv, 0.0, 1.0)).rgb;
    // LED screen: a fine pixel grid, a slow scan bar
    vec2 px = fract(cuv * 220.0);
    float led = 0.9 + 0.1 * step(0.18, px.x) * step(0.18, px.y);
    float scan = 1.0 + 0.05 * exp(-pow(fract(cuv.y * 0.5 - uTime * 0.07) - 0.5, 2.0) * 120.0);
    vec3 col = cover * led * scan * uBright * inner;
    col += vec3(0.85, 0.95, 1.05) * frame * (0.5 + uBright * 0.9);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const TICKER_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOffset;
  uniform float uOn;
  uniform float uRepeat;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${GLSL_SKIN_HOLE}
  void main() {
    if (skinHoleDist(vWorld) < 0.3) discard;
    float a = texture2D(uMap, vec2(fract(vUv.x * uRepeat + uOffset), vUv.y)).a;
    vec3 col = mix(vec3(0.015, 0.017, 0.02), vec3(0.95, 1.0, 1.05) * 1.15, a);
    float rule = 1.0 - smoothstep(0.0, 0.05, min(vUv.y, 1.0 - vUv.y));
    col += vec3(0.5, 0.62, 0.68) * rule * 0.5;
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

export default function Tower({ state }) {
  const groupRef = useRef();
  const textures = useCovers();
  const holeTex = getHoleTexture();
  const ticker = useMemo(() => {
    const t = new THREE.CanvasTexture(tickerCanvas());
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }, []);
  const billArc = BILL_W / BILL_R;
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
    g.traverse((o) => {
      const u = o.material?.uniforms;
      if (!u) return;
      if (u.uOn) u.uOn.value = 1;
      if (u.uTime) u.uTime.value += dt;
      if (o.userData.album !== undefined) {
        const w = 1 - Math.min(Math.abs(f - o.userData.album), 1);
        u.uBright.value = 0.5 + w * 0.62;
      }
      if (o.userData.ticker !== undefined) {
        u.uOffset.value += dt * TICKERS[o.userData.ticker].speed;
      }
    });
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* the skin, with the wound we flew out of */}
      <mesh position={[TOWER.x, (TOWER.top + TOWER.bottom) / 2, TOWER.z]}>
        <cylinderGeometry args={[TOWER.radius, TOWER.radius, TOWER.top - TOWER.bottom, 160, 1, true]} />
        <shaderMaterial vertexShader={SHELL_VERT} fragmentShader={SHELL_FRAG} uniforms={{ uOn: { value: 1 }, uHole: { value: holeTex } }} />
      </mesh>

      {/* album billboards, spiralling up and round */}
      {ALBUMS.map((album, i) => (
        <mesh key={album.id} position={[TOWER.x, albumY(i), TOWER.z]} userData={{ album: i }}>
          <cylinderGeometry args={[BILL_R, BILL_R, BILL_H, 64, 1, true, thetaOf(albumPhi(i)) - billArc / 2, billArc]} />
          <shaderMaterial
            vertexShader={BILL_VERT}
            fragmentShader={BILL_FRAG}
            uniforms={{ uMap: { value: textures[i] }, uBright: { value: 0.5 }, uTime: { value: 0 } }}
          />
        </mesh>
      ))}

      {/* ticker rings */}
      {TICKERS.map((t, k) => (
        <mesh key={k} position={[TOWER.x, t.y, TOWER.z]} userData={{ ticker: k }}>
          <cylinderGeometry args={[TICKER_R, TICKER_R, t.h, 160, 1, true]} />
          <shaderMaterial
            vertexShader={BILL_VERT}
            fragmentShader={TICKER_FRAG}
            uniforms={{ uMap: { value: ticker }, uOffset: { value: 0 }, uOn: { value: 1 }, uHole: { value: holeTex }, uRepeat: { value: repeatFor(t.h) } }}
          />
        </mesh>
      ))}
    </group>
  );
}
