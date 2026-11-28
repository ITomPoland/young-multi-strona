import React, { useEffect, useMemo } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createTeletext } from './teletext';

// =====================================================================
// S8: THE TV ROOM. The LOST MEDIA box with its price was a picture on an old CRT.
// A third scene (own camera), drawn by the Compositor while state.tvOn:
//  1. The seam: the camera starts so close that the glass covers the whole screen, and the
//     glass shows the studio's frame (state.worldTex) by SCREEN position: pixel-identical to
//     the frame before. Then the glass bulges, the CRT comes on (fisheye, scanlines, mask,
//     rounded corners) and the camera pulls back: a dark room lit only by the TV, an old set
//     on a worn painted cabinet, dirty tiles, PRL linoleum (Poly Haven, CC0: public/tv/), a
//     rabbit-ear antenna. The room is dithered like the hero; the glass stays sharp (it marks
//     its pixels raw: alpha 0.25), so the teletext reads.
//  2. Channel 1: teletext, page P100 KONTAKT (the contact; clickable through the DOM overlay,
//     which maps the pointer through the same fisheye: state.tvGlass / state.tvK).
//  3. Channel 2: the hero (the Compositor renders the hero frame into a texture), and the
//     camera flies back into the glass: where it fills the screen it IS the hero frame, the
//     director hands the screen back to the world, and the page loops.
// On phones the camera ends with the glass across the full width (teletext's 24-col page).
// =====================================================================

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// metres: the Poly Haven models at their real size
const CAB_TOP = 1.181; // painted_wooden_cabinet
const TV_H = 0.457; // Television_01 (origin at its base centre, faces +z)
// its screen, measured on the mesh (4:3): our CRT glass sits just in front of it
const GLASS = { w: 0.299, h: 0.226, x: -0.0655, y: CAB_TOP + 0.259 };
const GLASS_Z = 0.187;
const BULGE = 0.018;
const WALL_Z = -0.42;
const TV_EXPOSURE = 3.4;
const CAM_LAMP = 0.55;
const FOV = 30;
const TAN_H = Math.tan((FOV / 2) * (Math.PI / 180));
const FISHEYE = 0.14;

const GLSL_TV_LIGHT = /* glsl */ `
  uniform vec3 uGlowCol;
  uniform float uGlowI;
  uniform vec3 uGlowPos;
  uniform vec3 uCamLight; // a weak camcorder lamp on the camera (found footage): the set reads
  uniform float uCamI;
  vec3 tvLight(vec3 p, vec3 n) {
    vec3 d = uGlowPos - p;
    float r = length(d);
    vec3 l = d / max(r, 1e-4);
    float lam = max(dot(n, l), 0.0);
    // mostly forward, with a soft halo round the set (it lights the wall behind a little)
    float front = mix(0.18, 1.0, smoothstep(-0.25, 0.55, -l.z));
    vec3 direct = uGlowCol * uGlowI * lam * front * 0.75 / (0.08 + r * r * 1.6);
    vec3 spill = uGlowCol * uGlowI * 0.05 / (1.0 + r * r * 1.5);
    vec3 dc = uCamLight - p;
    float rc = length(dc);
    vec3 lamp = vec3(0.78, 0.86, 0.9) * uCamI * max(dot(n, dc / max(rc, 1e-4)), 0.0) / (0.25 + rc * rc * 0.35);
    return direct + spill + lamp;
  }
`;

const WORLD_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// the models, the wall and the floor: their own textures (colour, normal, AO/rough/metal),
// lit only by the TV (diffuse + a soft specular), graded toward the story's cold grey
const PROP_FRAG = /* glsl */ `
  ${GLSL_TV_LIGHT}
  uniform sampler2D tDiff;
  uniform sampler2D tNor;
  uniform sampler2D tArm;
  uniform float uPlanar; // 0 = mesh UVs, 1 = wall (world xy), 2 = floor (world xz)
  uniform float uTile;   // metres per texture repeat (planar)
  uniform float uTint;   // colour -> the story's grey-teal
  uniform float uBright;
  uniform vec4 uCut;   // world x0, x1, y0, y1: the TV model's own screen is cut out here...
  uniform float uCutZ; // ...in front of this z (our CRT glass takes its place)
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec2 vUv;

  vec3 perturb(vec3 n, vec3 pos, vec2 uv, vec3 m) {
    vec3 dp1 = dFdx(pos);
    vec3 dp2 = dFdy(pos);
    vec2 duv1 = dFdx(uv);
    vec2 duv2 = dFdy(uv);
    vec3 dp2perp = cross(dp2, n);
    vec3 dp1perp = cross(n, dp1);
    vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
    vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
    float invmax = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
    return normalize(mat3(T * invmax, B * invmax, n) * m);
  }

  void main() {
    if (uCut.y > uCut.x && vWorld.z > uCutZ && vWorld.x > uCut.x && vWorld.x < uCut.y && vWorld.y > uCut.z && vWorld.y < uCut.w) discard;
    vec2 uv = vUv;
    if (uPlanar > 1.5) uv = vec2(vWorld.x, -vWorld.z) / uTile;
    else if (uPlanar > 0.5) uv = vWorld.xy / uTile;
    vec3 albedo = texture2D(tDiff, uv).rgb;
    vec3 arm = texture2D(tArm, uv).rgb;
    vec3 n = perturb(normalize(vN), vWorld, uv, texture2D(tNor, uv).rgb * 2.0 - 1.0);
    if (!gl_FrontFacing) n = -n;
    float lum = dot(albedo, vec3(0.299, 0.587, 0.114));
    albedo = mix(albedo, vec3(lum) * vec3(0.84, 0.98, 1.04), uTint);

    vec3 light = tvLight(vWorld, n);
    vec3 l = normalize(uGlowPos - vWorld);
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 h = normalize(l + v);
    float rough = clamp(arm.g, 0.08, 1.0);
    float spec = pow(max(dot(n, h), 0.0), mix(80.0, 6.0, rough)) * (1.0 - rough) * (0.2 + 0.8 * arm.b);
    vec3 col = albedo * (light * arm.r + 0.035) * uBright + light * spec * 0.6;
    // the dark eats everything a few metres from the set
    col *= smoothstep(4.5, 0.7, length(vWorld - uGlowPos));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const PLASTIC_FRAG = /* glsl */ `
  ${GLSL_TV_LIGHT}
  uniform vec3 uBase;
  uniform float uRim;
  varying vec3 vWorld;
  varying vec3 vN;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 col = uBase + tvLight(vWorld, n) * uBase * 6.0;
    col += uGlowCol * uGlowI * fres * uRim * 0.05;
    // a soft top light so the silhouette reads in the dark
    col += uBase * max(n.y, 0.0) * 0.6 + vec3(0.02, 0.03, 0.035) * fres * 0.5;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const GLASS_VERT = /* glsl */ `
  uniform float uBulge;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    vec2 n = uv * 2.0 - 1.0;
    p.z += uBulge * (1.0 - n.x * n.x) * (1.0 - n.y * n.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const GLASS_FRAG = /* glsl */ `
  uniform sampler2D tA; // channel 0: the studio frame (the LOST MEDIA box)
  uniform sampler2D tB; // channel 1: teletext
  uniform sampler2D tC; // channel 2: the hero frame
  uniform vec2 uRes;
  uniform float uAspect; // the viewport's (A and C are rendered at it)
  uniform float uChan;   // 0..2, fractional while switching
  uniform float uMap;    // 0 = screen space (the seams), 1 = the glass's own picture
  uniform float uCrt;    // CRT look 0..1 (0 at the seams)
  uniform float uK;      // fisheye
  uniform float uLines;  // scanlines over the glass height
  uniform float uTime;
  varying vec2 vUv;

  float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec2 barrel(vec2 uv, float k) {
    vec2 p = uv * 2.0 - 1.0;
    p *= 1.0 + k * (p.yx * p.yx);
    return p * 0.5 + 0.5;
  }
  // a viewport-shaped picture laid into the 4:3 glass: wide screens "cover" it (the sides go),
  // tall phones show the whole frame as an upright strip (nothing important is cropped)
  vec2 coverMap(vec2 g) {
    float ga = 4.0 / 3.0;
    return vec2(0.5 + (g.x - 0.5) * ga / uAspect, g.y);
  }

  void main() {
    vec2 scr = gl_FragCoord.xy / uRes;
    vec2 g = barrel(vUv, uK * uCrt);

    // channel switching: static, a rolling picture, a flash
    float t1 = clamp(uChan, 0.0, 1.0);
    float t2 = clamp(uChan - 1.0, 0.0, 1.0);
    float nz = max(pow(sin(3.14159 * t1), 0.6), pow(sin(3.14159 * t2), 0.6));
    vec2 gr = g;
    gr.y = fract(gr.y + nz * nz * 0.45 * sin(uTime * 5.3));
    gr.x += nz * 0.03 * sin(gr.y * 40.0 + uTime * 30.0);

    vec2 cm = coverMap(gr);
    vec2 uvAC = mix(scr, cm, uMap);
    // (outside the upright strip: black, fading in with the glass mapping)
    float strip = mix(1.0, step(0.0, cm.x) * step(cm.x, 1.0), uMap);
    vec3 col;
    if (uChan < 0.5) col = texture2D(tA, clamp(uvAC, 0.0, 1.0)).rgb * strip;
    else if (uChan < 1.5) col = texture2D(tB, gr).rgb;
    else col = texture2D(tC, clamp(uvAC, 0.0, 1.0)).rgb * strip;

    float st = h21(floor(gl_FragCoord.xy / 2.0) + floor(uTime * 50.0) * 17.0);
    float band = smoothstep(0.9, 1.0, sin(gr.y * 9.0 + uTime * 11.0));
    col = mix(col, vec3(st) * (0.7 + 0.4 * band), clamp(nz * 1.1, 0.0, 0.95));

    // the CRT
    float lineP = 0.5 + 0.5 * sin(g.y * 3.14159 * 2.0 * uLines);
    col *= mix(1.0, 0.72 + 0.28 * lineP, uCrt);
    float m = mod(floor(gl_FragCoord.x), 3.0);
    vec3 mask = vec3(m < 0.5 ? 1.0 : 0.8, (m > 0.5 && m < 1.5) ? 1.0 : 0.8, m > 1.5 ? 1.0 : 0.8);
    col *= mix(vec3(1.0), mask, 0.55 * uCrt);
    vec2 q = g * 2.0 - 1.0;
    vec2 dd = abs(q) - vec2(0.86);
    float sdf = length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0) - 0.14;
    float shape = 1.0 - smoothstep(-0.03, 0.0, sdf);
    float vig = 1.0 - smoothstep(0.45, 1.45, length(q * vec2(0.85, 1.0)));
    col *= mix(1.0, shape * mix(0.55, 1.0, vig), uCrt);
    col *= 1.0 + 0.1 * uCrt;
    // the curved glass catches the room
    vec2 vq = vUv * 2.0 - 1.0;
    float refl = smoothstep(1.1, 0.0, length(vq - vec2(-0.5, 0.6))) * 0.06;
    float rim = smoothstep(0.75, 1.0, max(abs(vq.x), abs(vq.y))) * 0.03;
    col += vec3(0.7, 0.82, 0.88) * (refl + rim) * uCrt;
    gl_FragColor = vec4(col, 0.25); // (alpha < 0.5: the composite shows these pixels raw)
  }
`;

const GLOW_A = new THREE.Color(0.35, 0.55, 0.62);
const GLOW_B = new THREE.Color(0.32, 0.45, 0.95);
const GLOW_C = new THREE.Color(0.32, 0.5, 0.56);
const _look = new THREE.Vector3();
const _corner = new THREE.Vector3();

export default function TvRoom({ state }) {
  const { gl, size } = useThree();
  const tv = useMemo(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 30);
    return { scene, camera };
  }, []);
  const ttx = useMemo(() => createTeletext(), []);
  const ttxTex = useMemo(() => {
    const t = new THREE.CanvasTexture(ttx.canvas);
    t.colorSpace = THREE.NoColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    return t;
  }, [ttx]);

  const mats = useMemo(() => {
    const light = {
      uGlowCol: { value: new THREE.Color(0.35, 0.55, 0.62) },
      uGlowI: { value: 1 },
      uGlowPos: { value: new THREE.Vector3(GLASS.x, GLASS.y, GLASS_Z + 0.05) },
      uCamLight: { value: new THREE.Vector3() },
      uCamI: { value: 0 }
    };
    const mk = (frag, extra = {}) =>
      new THREE.ShaderMaterial({ vertexShader: WORLD_VERT, fragmentShader: frag, uniforms: { ...light, ...extra } });
    const prop = (planar, tile, tint, bright) =>
      mk(PROP_FRAG, {
        tDiff: { value: null },
        tNor: { value: null },
        tArm: { value: null },
        uPlanar: { value: planar },
        uTile: { value: tile },
        uTint: { value: tint },
        uBright: { value: bright },
        uCut: { value: new THREE.Vector4(0, 0, 0, 0) },
        uCutZ: { value: 0 }
      });
    return {
      light,
      prop,
      wall: prop(1, 2.26, 0.75, 2.6), // dirty_tiles: 2.26 m per repeat (dark red: lifted)
      floor: prop(2, 1.99, 0.7, 1.0), // old_linoleum_flooring_01: 1.99 m
      metal: mk(PLASTIC_FRAG, { uBase: { value: new THREE.Color(0.09, 0.1, 0.11) }, uRim: { value: 3 } }),
      knob: mk(PLASTIC_FRAG, { uBase: { value: new THREE.Color(0.04, 0.04, 0.042) }, uRim: { value: 1.5 } }),
      glass: new THREE.ShaderMaterial({
        vertexShader: GLASS_VERT,
        fragmentShader: GLASS_FRAG,
        uniforms: {
          tA: { value: null },
          tB: { value: ttxTex },
          tC: { value: null },
          uRes: { value: new THREE.Vector2(1, 1) },
          uAspect: { value: 1 },
          uChan: { value: 0 },
          uMap: { value: 0 },
          uCrt: { value: 0 },
          uK: { value: FISHEYE },
          uLines: { value: 160 },
          uTime: { value: 0 },
          uBulge: { value: 0 }
        }
      })
    };
  }, [ttxTex]);

  const geos = useMemo(() => ({ glass: new THREE.PlaneGeometry(GLASS.w, GLASS.h, 40, 30) }), []);

  // the Poly Haven set (CC0, public/tv/): loaded in the background, the page never waits for
  // it (the room is at the very end of the story); every mesh gets the TV-lit prop shader
  const [props, setProps] = React.useState(null);
  useEffect(() => {
    let alive = true;
    const raw = (t, repeat) => {
      if (!t) return t;
      t.colorSpace = THREE.NoColorSpace;
      t.anisotropy = 8;
      if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
      return t;
    };
    const texLoader = new THREE.TextureLoader();
    const tex = (f) => new Promise((ok) => texLoader.load(`/tv/textures/${f}`, (t) => ok(raw(t, true)), undefined, () => ok(null)));
    const gltf = new GLTFLoader();
    const model = (f, tint, bright, cut) =>
      gltf.loadAsync(f).then((g) => {
        g.scene.traverse((o) => {
          if (!o.isMesh) return;
          const src = o.material;
          const m = mats.prop(0, 1, tint, bright);
          m.uniforms.tDiff.value = raw(src.map);
          m.uniforms.tNor.value = raw(src.normalMap);
          m.uniforms.tArm.value = raw(src.roughnessMap || src.metalnessMap);
          if (cut) {
            m.uniforms.uCut.value.set(GLASS.x - GLASS.w / 2, GLASS.x + GLASS.w / 2, GLASS.y - GLASS.h / 2, GLASS.y + GLASS.h / 2);
            m.uniforms.uCutZ.value = 0.12;
          }
          o.material = m;
          src.dispose();
        });
        return g.scene;
      });
    Promise.all([
      model('/tv/models/Television_01/Television_01_1k.gltf', 0.55, 1.25, true),
      model('/tv/models/painted_wooden_cabinet/painted_wooden_cabinet_1k.gltf', 0.6, 1.1),
      tex('dirty_tiles_diff_1k.jpg'),
      tex('dirty_tiles_nor_gl_1k.jpg'),
      tex('dirty_tiles_arm_1k.jpg'),
      tex('old_linoleum_flooring_01_diff_1k.jpg'),
      tex('old_linoleum_flooring_01_nor_gl_1k.jpg'),
      tex('old_linoleum_flooring_01_arm_1k.jpg')
    ])
      .then(([tvScene, cabScene, wd, wn, wa, fd, fn, fa]) => {
        if (!alive) return;
        mats.wall.uniforms.tDiff.value = wd;
        mats.wall.uniforms.tNor.value = wn;
        mats.wall.uniforms.tArm.value = wa;
        mats.floor.uniforms.tDiff.value = fd;
        mats.floor.uniforms.tNor.value = fn;
        mats.floor.uniforms.tArm.value = fa;
        setProps({ tv: tvScene, cabinet: cabScene });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mats]);

  // compile the room's shaders as soon as it is complete (no hitch when it first shows)
  useEffect(() => {
    if (!props) return;
    requestAnimationFrame(() => gl.compileAsync?.(tv.scene, tv.camera).catch(() => {}));
  }, [props, gl, tv]);

  // hand the scene + camera to the Compositor; the teletext's hit test to the DOM overlay
  useEffect(() => {
    const s = state.current;
    s.tv = tv;
    s.ttxHit = ttx.hitTest;
    if (!s.ttx) s.ttx = { hover: null, copied: null };
    return () => {
      if (s.tv === tv) s.tv = null;
    };
  }, [state, tv, ttx]);

  // teletext is drawn in VT323: redraw once the font is in
  const redraw = useMemo(() => ({ key: '', fontReady: false }), []);
  useEffect(() => {
    document.fonts?.load('40px "VT323"').then(() => {
      redraw.fontReady = true;
      redraw.key = '';
    });
  }, [redraw]);

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose?.());
      Object.values(geos).forEach((g) => g.dispose());
      ttxTex.dispose();
    },
    [mats, geos, ttxTex]
  );

  const buf = useMemo(() => new THREE.Vector2(), []);

  useFrame((frame) => {
    const s = state.current;
    if (!s.tvOn) return;
    const time = frame.clock.elapsedTime;
    const cam = tv.camera;
    const aspect = size.width / Math.max(size.height, 1);
    const pull = s.tvPull ?? 0;
    const dive = s.tvDive ?? 0;
    const chan = s.tvChan ?? 0;
    const p = s.pointer;

    // --- camera: from the glass (the seam) out to the room, and back in for the hero ---
    const d0 = 0.9 * Math.min(GLASS.h / 2 / TAN_H, GLASS.w / 2 / (TAN_H * aspect));
    const dWide = 1.55;
    const dNarrow = (GLASS.w / 0.97) / (2 * TAN_H * aspect); // glass across the full width
    const wideK = smooth(0.8, 1.15, aspect);
    // reading teletext: the glass about half the screen height (wide screens)
    const read = s.tvRead ?? 0;
    const dRead = GLASS.h / (0.52 * 2 * TAN_H);
    const d1 = THREE.MathUtils.lerp(dNarrow, THREE.MathUtils.lerp(dWide, Math.max(dRead, Math.min(dWide, dRead)), read), wideK);
    const out = smooth(0, 1, pull) * (1 - smooth(0, 1, dive));
    const d = d0 * Math.pow(d1 / d0, out);
    // the hold framing: the TV and its cabinet (wide) / the glass centred (narrow)
    const holdX = THREE.MathUtils.lerp(GLASS.x, THREE.MathUtils.lerp(0.0, GLASS.x, read), wideK);
    const holdY = THREE.MathUtils.lerp(GLASS.y, THREE.MathUtils.lerp(CAB_TOP + 0.17, GLASS.y + 0.01, read), wideK);
    // (the cursor sways the camera a little; hardly at all while reading, or the lines would
    // slide out from under the pointer)
    const hold = smooth(0.6, 1, pull) * (1 - smooth(0, 0.4, dive)) * (1 - 0.85 * (s.tvRead ?? 0));
    _look.set(
      THREE.MathUtils.lerp(GLASS.x, holdX, out) + p.sx * 0.03 * hold,
      THREE.MathUtils.lerp(GLASS.y, holdY, out) + p.sy * 0.02 * hold,
      GLASS_Z
    );
    cam.position.set(_look.x, _look.y, GLASS_Z + d);
    cam.up.set(0, 1, 0);
    cam.lookAt(_look);
    cam.fov = FOV;
    cam.aspect = aspect;
    cam.near = Math.max(0.004, d * 0.2);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // the camcorder lamp rides on the camera, a little up and left; it comes up as we pull back
    mats.light.uCamLight.value.set(cam.position.x - 0.25, cam.position.y + 0.3, cam.position.z);
    mats.light.uCamI.value = CAM_LAMP * smooth(0.3, 0.9, pull) * (1 - smooth(0.0, 0.6, dive));

    // --- the glass ---
    gl.getDrawingBufferSize(buf);
    const u = mats.glass.uniforms;
    const crt = Math.min(smooth(0.02, 0.45, pull), 1 - smooth(0.55, 0.985, dive));
    u.uCrt.value = crt;
    u.uMap.value = Math.min(smooth(0.02, 0.5, pull), 1 - smooth(0.5, 0.99, dive));
    u.uBulge.value = BULGE * Math.min(smooth(0.0, 0.4, pull), 1 - smooth(0.5, 0.99, dive));
    u.uChan.value = chan;
    u.uTime.value = time;
    u.uRes.value.copy(buf);
    u.uAspect.value = aspect;
    u.tA.value = s.worldTex ?? null;
    u.tC.value = s.heroTex ?? null;

    // where the glass is on screen (CSS px), for the teletext's clicks; scanlines to suit
    const pts = [];
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      _corner.set(GLASS.x + (cx * GLASS.w) / 2, GLASS.y + (cy * GLASS.h) / 2, GLASS_Z).project(cam);
      pts.push((_corner.x * 0.5 + 0.5) * size.width, (0.5 - _corner.y * 0.5) * size.height);
    }
    s.tvGlass = pts;
    s.tvK = FISHEYE * crt;
    const glassPxH = Math.abs(pts[5] - pts[1]) * (buf.y / Math.max(size.height, 1));
    u.uLines.value = THREE.MathUtils.clamp(glassPxH / 3.2, 70, 200);

    // --- the TV's light in the room (the picture's colour, a little flicker) ---
    const L = mats.light;
    if (chan < 1) L.uGlowCol.value.copy(GLOW_A).lerp(GLOW_B, smooth(0.45, 0.55, chan));
    else L.uGlowCol.value.copy(GLOW_B).lerp(GLOW_C, smooth(1.45, 1.55, chan));
    const nz = Math.max(Math.sin(Math.PI * clamp01(chan)), Math.sin(Math.PI * clamp01(chan - 1)));
    // (exposure: the room is dithered like the hero, so it has to sit in the dither's mid-tones)
    L.uGlowI.value = TV_EXPOSURE * (1 + Math.sin(time * 13.1) * 0.03 + Math.sin(time * 3.7) * 0.02 + nz * 0.5) * (0.4 + 0.6 * smooth(0.05, 0.5, pull));

    // --- teletext: redraw when something on the page changes ---
    if (chan > 0.3 && chan < 1.7) {
      const narrow = aspect < 0.9;
      const clock = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
      const key = `${narrow}|${clock}|${s.ttx?.hover}|${s.ttx?.copied}|${redraw.fontReady}`;
      if (key !== redraw.key) {
        redraw.key = key;
        ttx.draw({ narrow, clock, hover: s.ttx?.hover, copied: s.ttx?.copied });
        ttxTex.needsUpdate = true;
      }
    }
  });

  return createPortal(
    <>
      {/* the room: PRL linoleum and the dirty tiled wall, lit only by the TV */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={mats.floor}>
        <planeGeometry args={[10, 10]} />
      </mesh>
      <mesh position={[0, 2.5, WALL_Z]} material={mats.wall}>
        <planeGeometry args={[10, 5]} />
      </mesh>

      {/* the worn cabinet and the old set on it */}
      {props && <primitive object={props.cabinet} />}
      {props && <primitive object={props.tv} position={[0, CAB_TOP, 0]} />}
      <mesh position={[GLASS.x, GLASS.y, GLASS_Z]} geometry={geos.glass} material={mats.glass} />

      {/* rabbit ears */}
      <mesh position={[0, CAB_TOP + TV_H + 0.015, -0.08]} material={mats.knob}>
        <sphereGeometry args={[0.03, 24, 12]} />
      </mesh>
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[sd * 0.1, CAB_TOP + TV_H + 0.21, -0.08]} rotation={[0, 0, -sd * 0.5]} material={mats.metal}>
          <cylinderGeometry args={[0.003, 0.005, 0.45, 8]} />
        </mesh>
      ))}
    </>,
    tv.scene
  );
}
