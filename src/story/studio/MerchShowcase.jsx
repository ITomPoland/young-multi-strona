import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MERCH_ITEMS } from '../../data/merch';
import { SHAPE_CENTER } from './particleSim';

// =====================================================================
// S7: SELECTED GOODS — 3D ARCHIVAL GARMENT SHOWCASE (Items 02..04)
// Lives directly inside the dark Lost Media studio alongside LostMediaBox (Item 01).
//  - Corner-BFS matte extraction removes exterior white studio backdrop while keeping
//    interior silver zippers & white YFL neck tags 100% crisp and untouched.
//  - Custom silhouette-rim + moving studio softbox shader makes jet-black cotton,
//    tonal puff-print lettering, and sleeve patches pop against the dark atrium.
//  - Codrops-inspired scroll-velocity cloth curve + tactile cursor tilt.
// =====================================================================

const RIM_COLOR = new THREE.Color(0.55, 0.85, 0.95);
const APPAREL_ITEMS = MERCH_ITEMS.filter((it) => !it.is3DBox);

// Extract crisp anti-aliased alpha cutout from exterior white background using 4-way corner BFS
function buildGarmentTexture(image) {
  const S = 768;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  ctx.drawImage(image, 0, 0, S, S);

  const imgData = ctx.getImageData(0, 0, S, S);
  const d = imgData.data;
  const total = S * S;
  const visited = new Uint8Array(total);
  const bg = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const isLightBg = (idx) => {
    const p = idx * 4;
    return d[p] > 226 && d[p + 1] > 226 && d[p + 2] > 226;
  };

  const enqueue = (idx) => {
    if (visited[idx]) return;
    visited[idx] = 1;
    if (isLightBg(idx)) {
      bg[idx] = 1;
      queue[tail++] = idx;
    }
  };

  // Seed flood-fill from all 4 outer borders
  for (let x = 0; x < S; x++) {
    enqueue(x);
    enqueue((S - 1) * S + x);
  }
  for (let y = 1; y < S - 1; y++) {
    enqueue(y * S);
    enqueue(y * S + (S - 1));
  }

  while (head < tail) {
    const cur = queue[head++];
    const x = cur % S;
    const y = (cur - x) / S;
    if (x > 0) enqueue(cur - 1);
    if (x < S - 1) enqueue(cur + 1);
    if (y > 0) enqueue(cur - S);
    if (y < S - 1) enqueue(cur + S);
  }

  // Write clean alpha + de-fringe edge pixels so zero white halo appears in the dark studio
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    if (bg[i]) {
      d[p] = 12;
      d[p + 1] = 15;
      d[p + 2] = 18;
      d[p + 3] = 0;
    } else {
      const x = i % S;
      const y = (i - x) / S;
      // Count immediate background neighbors for smooth 1.5px anti-aliased edge & de-fringe
      let bgNeighbors = 0;
      if (x > 0 && bg[i - 1]) bgNeighbors++;
      if (x < S - 1 && bg[i + 1]) bgNeighbors++;
      if (y > 0 && bg[i - S]) bgNeighbors++;
      if (y < S - 1 && bg[i + S]) bgNeighbors++;
      if (bgNeighbors > 0) {
        const luma = (d[p] + d[p + 1] + d[p + 2]) / 3;
        const fringe = Math.max(0, (luma - 80) / 175);
        d[p] = Math.round(d[p] * (1 - fringe * 0.72));
        d[p + 1] = Math.round(d[p + 1] * (1 - fringe * 0.72));
        d[p + 2] = Math.round(d[p + 2] * (1 - fringe * 0.72));
        d[p + 3] = Math.round(255 * (1 - bgNeighbors * 0.22));
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

const GARMENT_VERT = /* glsl */ `
  uniform float uVelBend;
  uniform float uTime;
  uniform float uFocus;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vN;

  void main() {
    vUv = uv;
    vec3 p = position;
    // Subtle Codrops cloth/arc curvature driven by scroll velocity + organic micro-breath
    float arc = sin(uv.x * 3.14159265);
    float vArc = sin(uv.y * 3.14159265);
    p.z += arc * uVelBend * 0.042;
    p.x += (uv.y - 0.5) * uVelBend * 0.018;
    p.z += sin(uTime * 1.15 + uv.x * 3.8 + uv.y * 2.4) * 0.0022 * arc * vArc * uFocus;

    vec4 w = modelMatrix * vec4(p, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const GARMENT_FRAG = /* glsl */ `
  uniform sampler2D tMap;
  uniform float uHasMap;
  uniform float uFocus;
  uniform float uOpacity;
  uniform vec2 uLightUv;
  uniform float uTime;
  uniform vec3 uRim;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vN;

  void main() {
    if (uHasMap < 0.5 || uOpacity < 0.005) discard;
    vec4 tex = texture2D(tMap, vUv);
    if (tex.a < 0.04) discard;

    // Compute 2D silhouette edge gradient from alpha so dark studio rim light wraps the garment!
    float eps = 0.0055;
    float aL = texture2D(tMap, vUv - vec2(eps, 0.0)).a;
    float aR = texture2D(tMap, vUv + vec2(eps, 0.0)).a;
    float aD = texture2D(tMap, vUv - vec2(0.0, eps)).a;
    float aU = texture2D(tMap, vUv + vec2(0.0, eps)).a;
    vec2 grad = vec2(aL - aR, aD - aU);
    float edgeMag = clamp(length(grad) * 1.4, 0.0, 1.0);
    vec2 edgeDir = grad / max(length(grad), 0.001);

    // Controlled tonal lift on jet-black cotton so puff-print lettering & patches gleam richly
    vec3 raw = tex.rgb;
    vec3 lifted = pow(max(raw, vec3(0.0001)), vec3(0.80)) * 1.38 + vec3(0.016, 0.020, 0.024);

    // Moving studio softbox spotlight tracking pointer across the garment
    vec2 dL = (vUv - uLightUv) * vec2(1.15, 1.0);
    float spot = exp(-dot(dL, dL) * 4.2);
    // Overhead skylight falloff (brighter on shoulders/hood, moodier toward hem)
    float topLight = 0.62 + 0.52 * smoothstep(0.08, 0.92, vUv.y);

    // Sculptural edge rim catching top-left softbox + cool turquoise clinical accent
    float rimTop = max(dot(edgeDir, normalize(vec2(-0.35, 0.92))), 0.0);
    float rimSide = max(dot(edgeDir, normalize(vec2(0.85, 0.35))), 0.0);
    vec3 col = lifted * (topLight + spot * 0.62);
    // Subtle specular fabric sheen where dark tones have print/texture variation
    float detail = clamp((raw.r + raw.g + raw.b) * 0.9, 0.0, 1.0);
    col += vec3(0.72, 0.86, 0.92) * spot * (0.045 + 0.14 * detail) * uFocus;
    // Crisp dark-lookbook silhouette rim around shoulders, hood, sleeves
    col += vec3(0.76, 0.88, 0.94) * edgeMag * rimTop * 0.42;
    col += uRim * edgeMag * (0.16 + 0.45 * rimSide) * (0.5 + 0.5 * uFocus);

    // Out-of-focus items step subtly back into cool shadow
    col *= mix(0.32, 1.0, uFocus);
    gl_FragColor = vec4(col, tex.a * uOpacity);
  }
`;

// Minimal clinical archival specimen plate behind each black garment (frames silhouette cleanly)
const SPECIMEN_FRAG = /* glsl */ `
  uniform float uFocus;
  uniform float uOpacity;
  uniform vec2 uLightUv;
  uniform vec3 uRim;
  varying vec2 vUv;

  void main() {
    if (uOpacity < 0.005) discard;
    vec2 c = vUv - 0.5;
    vec2 e = min(vUv, 1.0 - vUv);

    // Razor-thin hairline frame
    float border = 1.0 - smoothstep(0.002, 0.0055, min(e.x, e.y));
    // Four surgical corner L-ticks
    float inCorner = step(0.41, abs(c.x)) * step(0.41, abs(c.y));
    float tick = border * inCorner;

    // Soft dark-slate clinical backlight pool directly behind the jet-black garment
    float halo = exp(-dot(c * vec2(1.15, 0.95), c * vec2(1.15, 0.95)) * 7.5);
    float cursorHalo = exp(-dot(vUv - uLightUv, vUv - uLightUv) * 6.5) * 0.45;

    vec3 bg = vec3(0.014, 0.020, 0.025) + vec3(0.055, 0.088, 0.104) * (halo + cursorHalo) * uFocus;
    vec3 lineCol = mix(vec3(0.35, 0.48, 0.55), uRim * 1.15, tick);
    vec3 col = bg + lineCol * (border * 0.16 + tick * 0.65) * (0.35 + 0.65 * uFocus);

    float alpha = (0.48 * halo + 0.24 + border * 0.55) * uOpacity * mix(0.35, 1.0, uFocus);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
  }
`;

function GarmentCard({ item, index, state }) {
  const groupRef = useRef();
  const [tex, setTex] = useState(null);

  useEffect(() => {
    let live = true;
    let built = null;
    const im = new Image();
    im.onload = () => {
      if (!live) return;
      built = buildGarmentTexture(im);
      setTex(built);
    };
    im.src = item.imgUrl;
    return () => {
      live = false;
      built?.dispose();
    };
  }, [item.imgUrl]);

  const mats = useMemo(() => {
    const shared = {
      uFocus: { value: 0 },
      uOpacity: { value: 0 },
      uLightUv: { value: new THREE.Vector2(0.5, 0.55) },
      uTime: { value: 0 },
      uRim: { value: RIM_COLOR }
    };
    return {
      shared,
      garment: new THREE.ShaderMaterial({
        vertexShader: GARMENT_VERT,
        fragmentShader: GARMENT_FRAG,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          ...shared,
          tMap: { value: null },
          uHasMap: { value: 0 },
          uVelBend: { value: 0 }
        }
      }),
      plate: new THREE.ShaderMaterial({
        vertexShader: GARMENT_VERT,
        fragmentShader: SPECIMEN_FRAG,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        side: THREE.FrontSide,
        uniforms: {
          ...shared,
          uVelBend: { value: 0 }
        }
      })
    };
  }, []);

  useEffect(() => {
    mats.garment.uniforms.tMap.value = tex;
    mats.garment.uniforms.uHasMap.value = tex ? 1 : 0;
  }, [tex, mats]);

  useEffect(
    () => () => {
      mats.garment.dispose();
      mats.plate.dispose();
    },
    [mats]
  );

  const smoothPose = useRef({ rx: 0, ry: 0, bend: 0 });

  useFrame((frame, dt) => {
    const s = state.current;
    const g = groupRef.current;
    if (!g) return;
    if (!s.studioOn) {
      g.visible = false;
      return;
    }

    const merchFocus = s.merchFocus ?? 0;
    const boxScan = s.boxScan ?? 0;
    // Item offset along the gallery rail: 0 = centered hero, +1 = right waiting, -1 = left past
    const offset = index - merchFocus;
    const absOff = Math.abs(offset);

    const visible = boxScan > 0.7 && absOff < 1.65;
    g.visible = visible;
    if (!visible) return;

    const d = Math.min(dt, 0.1);
    const time = frame.clock.elapsedTime;
    const p = s.pointer;

    const focus = Math.max(0, 1 - absOff * 1.15);
    const focusSmooth = focus * focus * (3 - 2 * focus);
    const opacity = THREE.MathUtils.smoothstep(1.62 - absOff, 0.0, 0.65) * THREE.MathUtils.smoothstep(boxScan, 0.75, 1.0);

    // Smooth 3D gallery stage positioning (arc in XZ depth like a curated dark museum!)
    const px = SHAPE_CENTER.x + offset * 0.56;
    const py = SHAPE_CENTER.y + Math.sin(time * 0.75 + index * 1.9) * 0.005 * focusSmooth - absOff * 0.015;
    const pz = SHAPE_CENTER.z - absOff * 0.28;
    g.position.set(px, py, pz);
    g.scale.setScalar(0.82 + 0.18 * focusSmooth);

    // Tactile cursor tilt + gentle angled stance off-center
    const sp = smoothPose.current;
    const tRx = -p.sy * 0.16 * focusSmooth;
    const tRy = -offset * 0.34 + p.sx * 0.26 * focusSmooth;
    const rawVel = THREE.MathUtils.clamp((s.vel ?? 0) * 0.008, -1.2, 1.2);
    const k = 1 - Math.exp(-d * 7);
    sp.rx += (tRx - sp.rx) * k;
    sp.ry += (tRy - sp.ry) * k;
    sp.bend += (rawVel - sp.bend) * (1 - Math.exp(-d * 9));
    g.rotation.set(sp.rx, sp.ry, 0, 'YXZ');

    mats.shared.uFocus.value = focusSmooth;
    mats.shared.uOpacity.value = opacity;
    mats.shared.uTime.value = time;
    mats.shared.uLightUv.value.set(0.5 + p.sx * 0.32 * focusSmooth, 0.56 + p.sy * 0.26 * focusSmooth);
    mats.garment.uniforms.uVelBend.value = sp.bend;
    mats.plate.uniforms.uVelBend.value = sp.bend * 0.5;
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* Subtle dark clinical specimen backing frame */}
      <mesh position={[0, 0, -0.022]} material={mats.plate} renderOrder={2}>
        <planeGeometry args={[0.31, 0.34, 12, 12]} />
      </mesh>
      {/* Cutout 3D garment plane */}
      <mesh material={mats.garment} renderOrder={3}>
        <planeGeometry args={[0.33, 0.33, 24, 24]} />
      </mesh>
    </group>
  );
}

export default function MerchShowcase({ state }) {
  return (
    <group name="SelectedGoodsShowcase">
      {APPAREL_ITEMS.map((item, i) => (
        <GarmentCard key={item.id} item={item} index={i + 1} state={state} />
      ))}
    </group>
  );
}
