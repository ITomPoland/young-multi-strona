import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { makeHeadGeometry, makeNeckGeometry, makeGlasses, HEAD_TOP, HEAD_BOTTOM, EYE_Y, GLSL_LENS_INSIDE, LENS_PLANE, LENS_BULGE } from './headParts';
import { loadHeadAsset, HEAD_FIT, PHOTO_FIT } from './headAsset';

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
//
// PLACEHOLDER: the head is a deformed sphere. The real one (a .glb from an AI image-to-3D,
// with Multi's photo projected onto it from the photo's camera) replaces makeHeadGeometry;
// everything else stays. See docs/storytelling/SCENARIUSZ.md, S6.
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
const POINTS = 90000;

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
      vec3 cut = uRim * (exp(above / 0.005) * 1.8 + exp(above / 0.03) * 0.15) * uScanOn;
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
    float band = exp(-pow(above / 0.0035, 2.0)) * uScanOn;
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
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vN;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// THE LENS. One mapping of the world picture onto the glass, in LENS space:
//  - at the seam (uK = 0) the world picture covers exactly the patch of glass the camera sees
//    (uE0: that patch's half size), so it matches the frame before; uB blends in from the
//    plain screen position over the first few percent of the pull-back, where both agree
//  - uK -> 1: the patch grows to the whole glass (log-scale), the convex mirror bends it
//    (edges compressed), and it swims a little with the viewing angle (uSwim)
//  - uBulge (Takt 1, still full-screen): convex glass, chromatic fringes, darker rim
//  - uWorldK: the world fades out of the glass as the head is revealed; what stays is what
//    sunglasses really reflect here: the dark studio, a softbox, the turquoise rim light
const LENS_FRAG = /* glsl */ `
  uniform sampler2D tWorld;
  uniform vec2 uRes;
  uniform float uK;
  uniform float uB;
  uniform float uBulge;
  uniform float uWorldK;
  uniform vec2 uE0;
  uniform vec2 uPlane;
  uniform vec2 uAnchorUv; // where the camera starts on the glass (UV)
  uniform float uOutline; // 1: cut the glass by the analytic outline (the code-built shield)
  uniform vec2 uSwim;
  uniform float uSide;
  uniform vec3 uRim;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vN;
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
    col += vec3(0.95, 0.97, 1.0) * box * 0.6;
    // the turquoise rim light, a tall strip behind to the right
    vec3 R2 = normalize(vec3(0.85, 0.1, -0.5));
    vec3 R2x = normalize(cross(vec3(0.0, 1.0, 0.0), R2));
    float strip = (1.0 - smoothstep(0.05, 0.1, abs(dot(r, R2x)))) * smoothstep(0.6, 0.85, dot(r, R2));
    col += uRim * strip * 0.9;
    return col;
  }

  vec3 sampleWorld(vec2 uv, float ca) {
    vec2 c = uv - 0.5;
    return vec3(
      texture2D(tWorld, clamp(0.5 + c * (1.0 + ca), 0.001, 0.999)).r,
      texture2D(tWorld, clamp(uv, 0.001, 0.999)).g,
      texture2D(tWorld, clamp(0.5 + c * (1.0 - ca), 0.001, 0.999)).b
    );
  }

  void main() {
    if (uOutline > 0.5 && lensInside(vUv, uSide) > 1.0) discard;
    float aspect = uRes.x / uRes.y;
    vec2 suv = gl_FragCoord.xy / uRes;

    // the world picture in lens space: the seam patch growing (log-scale) to the whole glass
    // lens space: centred on the camera's anchor at the seam, on the glass's middle at the end
    vec2 lxy = (vUv - mix(uAnchorUv, vec2(0.5), uK)) * uPlane;
    // the whole world picture covers the visor (cropped top and bottom, it is a wide glass)
    float e1x = max(uPlane.x * 0.46, uPlane.y * 0.46 * aspect);
    vec2 E1 = vec2(e1x, e1x / aspect);
    vec2 E = uE0 * pow(E1 / uE0, vec2(uK));
    vec2 luv = 0.5 + lxy / (2.0 * E);
    // convex mirror: the edges of the glass squeeze the picture; it swims with the angle
    vec2 rn = (vUv - 0.5) * 2.0;
    luv = 0.5 + (luv - 0.5) * (1.0 - 0.22 * uK * dot(rn, rn)) + uSwim;
    vec2 uv = mix(suv, luv, uB);

    // Takt 1: convex glass bulge (in picture space, so it carries on through the blend)
    vec2 pc = (uv - 0.5) * vec2(aspect, 1.0);
    float r2 = dot(pc, pc);
    float bulge = uBulge * (1.0 - uK);
    uv = 0.5 + (uv - 0.5) * (1.0 - bulge * 0.28 * r2);
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
    vec3 glass = vec3(0.012, 0.014, 0.016) + refl * mix(0.78, 1.0, fres);
    vec3 col = mix(world, glass, glassK);
    // Takt 1: the full-screen picture darkens towards its rim (the edge of the glass)
    float svig = smoothstep(0.5, 1.1, length((suv - 0.5) * vec2(aspect, 1.0)) * 1.15) * uBulge * (1.0 - uK);
    // after: the real rim of the lens
    float lvig = smoothstep(0.6, 1.0, length(rn) * 0.85) * uK;
    col *= 1.0 - svig * 0.85 - lvig * 0.35;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// the head as dots: shown above the scan line, scattered just behind it (they settle as the
// line moves on), the back side fades out, the cursor pushes them off its ray
const DOTS_VERT = /* glsl */ `
  attribute vec3 aNormal;
  attribute float aRnd;
  uniform mat4 uFitM;
  ${GLSL_PHOTO}
  uniform float uScanY;
  uniform float uScanOn;
  uniform float uTime;
  uniform float uDpr;
  uniform float uPx;
  uniform vec3 uRayO;
  uniform vec3 uRayD;
  uniform float uPush;
  uniform vec3 uRim;
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vec3 nW = normalize(mat3(modelMatrix) * aNormal);
    vec3 hp = (uFitM * vec4(position, 1.0)).xyz;
    vec3 hn = normalize(mat3(uFitM) * aNormal);
    float above = w.y - uScanY;
    float shown = uScanOn > 0.5 ? smoothstep(0.0, 0.004, above) : 0.0;
    float settle = smoothstep(0.0, 0.06, above);
    vec3 jit = vec3(fract(aRnd * 13.17), fract(aRnd * 7.31), fract(aRnd * 3.73)) - 0.5;
    w.xyz += (nW * 0.02 + jit * 0.035) * (1.0 - settle);
    w.xyz += nW * sin(uTime * 1.7 + aRnd * 31.0 + w.y * 45.0) * 0.0011;
    // the cursor: pushed away from its ray, flowing back as it leaves
    vec3 toP = w.xyz - uRayO;
    vec3 cl = uRayO + uRayD * dot(toP, uRayD);
    vec3 away = w.xyz - cl;
    float dd = length(away);
    float push = exp(-dd * dd / (0.03 * 0.03)) * uPush;
    w.xyz += (away / max(dd, 1e-4)) * push * 0.028 + nW * push * 0.012;
    vec4 mv = viewMatrix * w;
    gl_Position = projectionMatrix * mv;
    vec3 v = normalize(cameraPosition - w.xyz);
    float facing = dot(nW, v);
    shown *= smoothstep(-0.2, 0.2, facing);
    gl_PointSize = min(uPx * uDpr * (0.55 + 0.9 * aRnd) * (0.95 / -mv.z), 48.0) * step(0.001, shown);
    float key = max(dot(nW, normalize(vec3(-0.55, 0.55, 0.65))), 0.0);
    float rim = pow(1.0 - max(facing, 0.0), 2.5);
    vec3 teal = vec3(0.16, 0.27, 0.31) * (0.35 + 0.9 * key) + vec3(0.76, 0.84, 0.88) * key * key * 0.35 + uRim * rim * 0.7;
    // the photo's colours where it saw the head: a pointillist Multi (brightened: dots are sparse)
    vec2 puv = photoUv(hp);
    float pw = photoW(hn, puv);
    vec3 photo = texture2D(tPhoto, clamp(puv, 0.0, 1.0)).rgb;
    vCol = mix(teal, photo * 3.0 + vec3(0.03, 0.045, 0.05) + uRim * rim * 0.45, pw);
    vCol = max(vCol, teal * 0.5); // the silhouette always reads, even where the photo is black
    vCol += uRim * exp(-pow(above / 0.008, 2.0)) * 1.6 * uScanOn;
    vCol *= 1.0 + push * 0.8;
    vA = shown;
  }
`;

const DOTS_FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25 || vA < 0.01) discard;
    gl_FragColor = vec4(vCol * vA, 1.0);
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

export default function Studio({ state }) {
  const { gl, size } = useThree();
  const studio = useMemo(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.002, 20);
    return { scene, camera };
  }, []);
  const headGroup = useRef();
  const follow = useRef({ u: 0, v: 0, yaw: 0, pitch: 0, push: 0, lastX: 0, lastY: 0 });
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  // the real head (if its files are there); the placeholder until then / without them
  const [asset, setAsset] = useState(null);
  const fitRef = useRef();
  const scanRange = useRef([HEAD_TOP + 0.01, HEAD_BOTTOM - 0.01]);
  useEffect(() => {
    let live = true;
    loadHeadAsset().then((a) => {
      if (live && a) setAsset(a);
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
        uE0: { value: new THREE.Vector2(0.004, 0.004) },
        uPlane: { value: LENS_PLANE.clone() },
        uAnchorUv: { value: new THREE.Vector2(0.5, 0.5) },
        uSwim: { value: new THREE.Vector2() },
        uRim: rim
      },
      dots: new THREE.ShaderMaterial({
        vertexShader: DOTS_VERT,
        fragmentShader: DOTS_FRAG,
        uniforms: {
          ...scan,
          ...photo,
          uTime: { value: 0 },
          uDpr: { value: 1 },
          uPx: { value: 3.2 },
          uRayO: { value: new THREE.Vector3(0, 0, 10) },
          uRayD: { value: new THREE.Vector3(0, 0, -1) },
          uPush: { value: 0 },
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
  }, []);

  const glasses = useMemo(
    () =>
      makeGlasses(mats.frame, (side) => {
        const m = new THREE.ShaderMaterial({
          vertexShader: LENS_VERT,
          fragmentShader: LENS_FRAG,
          side: THREE.DoubleSide,
          uniforms: { ...mats.lensU, uSide: { value: side }, uOutline: { value: 1 } }
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

  // Multi's own visor (cut out of the model) as the lens: its material, the camera's anchor on
  // it (from the script's measurements, model units -> the fit), its size in lens space
  const visorAnchor = useRef();
  const visorMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: LENS_VERT,
        fragmentShader: LENS_FRAG,
        side: THREE.DoubleSide,
        uniforms: { ...mats.lensU, uSide: { value: 0 }, uOutline: { value: 0 } }
      }),
    [mats]
  );
  useEffect(() => () => visorMat.dispose(), [visorMat]);
  useEffect(() => {
    const info = asset?.visorInfo;
    const a = visorAnchor.current;
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

  useFrame((frame, dt) => {
    const s = state.current;
    if (!s.studioOn || !headGroup.current) return;
    const cam = studio.camera;
    const time = frame.clock.elapsedTime;
    const d = Math.min(dt, 0.1);
    const F = follow.current;

    // the scroll gives a target; the camera follows it on a spring (inertia, never a rail)
    const W = 7;
    const n = 4;
    for (let k = 0; k < n; k++) {
      const acc = (s.revPull - F.u) * W * W - 2 * 0.9 * W * F.v;
      F.v += acc * (d / n);
      F.u += F.v * (d / n);
    }
    const u = Math.min(Math.max(F.u, 0), 1.03);

    // the head: looks off to its right, turns to the camera as it arrives; in the hold it
    // follows the cursor
    const p = s.pointer;
    const hold = s.revHold ?? 0;
    const k = 1 - Math.exp(-d * 3);
    F.yaw += (-0.24 * (1 - smooth(0.55, 1.0, u)) + p.sx * 0.28 * hold - F.yaw) * k;
    F.pitch += (-p.sy * 0.12 * hold - F.pitch) * k;
    const hg = headGroup.current;
    hg.rotation.set(F.pitch, F.yaw + Math.sin(time * 0.31) * 0.012 * hold, 0, 'YXZ');
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
    const yaw = THREE.MathUtils.lerp(lensYaw, END_YAW, smooth(0.2, 1.0, u)) + p.sx * 0.05 * hold;
    const pitch = THREE.MathUtils.lerp(0, END_PITCH, smooth(0.25, 1.0, u)) + p.sy * 0.03 * hold;
    _dir.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const settle = smooth(0.68, 1.0, u);
    _pivot.copy(_lens).addScaledVector(_right, 0.13 * wide * settle);
    _pivot.y -= (0.03 * wide + 0.11 * (1 - wide)) * settle;
    const dist = D0 * Math.pow(D1 / D0, u);
    cam.position.copy(_pivot).addScaledVector(_dir, dist);
    // handheld: a slight drift once off the glass
    const drift = smooth(0.3, 1.0, u);
    cam.position.x += Math.sin(time * 0.43) * 0.0025 * drift;
    cam.position.y += Math.sin(time * 0.37 + 1.2) * 0.0018 * drift;
    cam.up.set(0, 1, 0);
    cam.lookAt(_pivot);
    // a roll that comes and goes in flight (none at the seam, none at the end)
    cam.rotateZ(Math.sin(Math.PI * smooth(0.04, 0.9, u)) * 4 * DEG);
    // dolly zoom: wide on the glass, long lens on the head
    cam.fov = THREE.MathUtils.lerp(FOV0, 29, smooth(0.0, 0.9, u));
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // --- the lens ---
    gl.getDrawingBufferSize(buf);
    const lu = mats.lensU;
    lu.tWorld.value = s.worldTex ?? null;
    lu.uRes.value.copy(buf);
    // the patch of glass the camera sees at the seam (half size, lens space)
    const hh0 = (D0 - LENS_BULGE) * Math.tan((FOV0 * DEG) / 2);
    lu.uE0.value.set(hh0 * aspect, hh0);
    lu.uB.value = smooth(0.0, 0.05, u);
    lu.uK.value = smooth(0.01, 0.4, u);
    lu.uBulge.value = s.revBulge;
    // the world (the last album) fades out of the glass as the head is revealed
    const worldK = 1 - smooth(0.62, 0.92, u);
    lu.uWorldK.value = worldK;
    s.lensWorld = worldK; // the Compositor stops rendering the world once it is gone
    // the reflection swims a little with the viewing angle (lens space)
    _toCam.copy(cam.position).sub(_lens).normalize();
    const lx = _toCam.dot(_right.set(Math.cos(lensYaw), 0, -Math.sin(lensYaw)));
    lu.uSwim.value.set(-lx * 0.12, -_toCam.y * 0.12).multiplyScalar(lu.uK.value);

    // the photo's projection (live in dev: window.__photoFit)
    mats.photo.uPhotoFit.value.set(PHOTO_FIT.cx, PHOTO_FIT.cy, PHOTO_FIT.k, PHOTO_FIT.size);

    // --- scan + dots ---
    const scanY = THREE.MathUtils.lerp(scanRange.current[0], scanRange.current[1], s.revScan);
    mats.head.uniforms.uScanY.value = scanY;
    mats.head.uniforms.uScanOn.value = s.revScan > 0 ? 1 : 0;
    const du = mats.dots.uniforms;
    du.uTime.value = time;
    du.uDpr.value = gl.getPixelRatio();
    // the cursor's ray, and how hard it pushes (only while it moves, fades when it rests)
    const moved = Math.abs(p.x - F.lastX) + Math.abs(p.y - F.lastY);
    F.lastX = p.x;
    F.lastY = p.y;
    F.push += ((moved > 0.0005 ? 1 : 0) * hold - F.push) * (1 - Math.exp(-d * (moved > 0.0005 ? 8 : 1.5)));
    _ndc.set(p.sx, p.sy);
    raycaster.setFromCamera(_ndc, cam);
    du.uRayO.value.copy(raycaster.ray.origin);
    du.uRayD.value.copy(raycaster.ray.direction);
    du.uPush.value = F.push;

  });

  return createPortal(
    <>
      {/* the dark studio behind */}
      <mesh position={[0.05, 0.02, -0.9]} renderOrder={-5} material={mats.back}>
        <planeGeometry args={[4, 3]} />
      </mesh>

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
            <points geometry={asset.dots} material={mats.dots} frustumCulled={false} />
          </group>
        ) : (
          <group ref={fitRef}>
            <mesh geometry={parts.head} material={mats.head} />
            <mesh geometry={parts.neck} material={mats.head} />
            <points geometry={parts.dots} material={mats.dots} frustumCulled={false} />
          </group>
        )}
        <primitive object={glasses.group} visible={!asset?.visor} />
      </group>
    </>,
    studio.scene
  );
}
