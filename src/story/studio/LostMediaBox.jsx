import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SHOWROOM_FLOOR_Y, DVD_W, DVD_H, DVD_D, DVD_CENTER_Z } from './showroomConfig';
import logoUrl from '../../assets/logoyflbiale.avif';

// =====================================================================
// S7 FLAGSHIP REVEAL: THE ATRIUM FLOOR *IS* THE 3D LOST MEDIA DVD BOX!
//  - Built at exact Atrium-floor scale (4.72 m x 6.67 m x 0.36 m) — exact 1:1.41 DVD ratio!
//  - At dvdPull == 0: lies FLAT right underneath the Atrium floor (rotX = -PI/2):
//      * Its back face sits 4 mm below Atrium floor (zero Z-fighting).
//      * Its 36 cm black molded bottom edge at z = +0.92 IS the floor edge the camera rolls 180° past!
//      * Its giant front cover (official /studio/lost-media-dvd-front.jpg) IS the surface on the other side!
//  - As dvdPull goes 0 -> 1: the camera pulls far back into dark Lost Media space while the
//    giant DVD Box lifts smoothly from flat (-90°) to a sculptural 3/4 upright showcase!
//  - Full 360° drag-to-spin, 180° Front/Back flip (revealing official back tracklist & WARNING!),
//    and hinged DVD-case open revealing the spinning iridescent LOST MEDIA CD & Clinical Booklet!
// =====================================================================

const RIM_COLOR = new THREE.Color(0.55, 0.85, 0.95);

function makeTex(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function loadRawImageTex(url, onLoad) {
  const im = new Image();
  im.onload = () => {
    const tex = new THREE.Texture(im);
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    onLoad(tex, im);
  };
  im.src = url;
  return im;
}

function drawBarcode(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  let cx = x;
  let seed = 88421;
  while (cx < x + w) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const barW = 2 + ((seed >>> 24) % 4);
    const gap = 2 + ((seed >>> 16) % 4);
    if (cx + barW <= x + w) ctx.fillRect(cx, y, barW, h);
    cx += barW + gap;
  }
}

function buildCaseDetails(logoImg) {
  // 1. Molded DVD Spine (128 x 1024)
  const cSpine = document.createElement('canvas');
  cSpine.width = 128;
  cSpine.height = 1024;
  const sctx = cSpine.getContext('2d');
  sctx.fillStyle = '#090c0f';
  sctx.fillRect(0, 0, 128, 1024);
  sctx.strokeStyle = 'rgba(140, 217, 242, 0.28)';
  sctx.lineWidth = 2;
  sctx.strokeRect(14, 24, 100, 976);

  sctx.save();
  sctx.translate(64, 512);
  sctx.rotate(-Math.PI / 2);
  sctx.textAlign = 'center';
  sctx.fillStyle = '#e8f3f7';
  sctx.font = '700 44px "Antonio", sans-serif';
  sctx.fillText('YOUNG MULTI   —   LOST MEDIA', 0, 14);
  sctx.fillStyle = 'rgba(140, 217, 242, 0.78)';
  sctx.font = '600 18px "Courier New", monospace';
  sctx.fillText('YFL // DVD BOX EDITION', 0, -28);
  sctx.restore();

  if (logoImg) {
    const lw = 54;
    const lh = (logoImg.naturalHeight / Math.max(logoImg.naturalWidth, 1)) * lw;
    sctx.globalAlpha = 0.85;
    sctx.drawImage(logoImg, 64 - lw * 0.5, 924, lw, lh);
    sctx.globalAlpha = 1;
  }

  // 2. Inside Clinical Booklet (768 x 1088)
  const cBook = document.createElement('canvas');
  cBook.width = 768;
  cBook.height = 1088;
  const bctx = cBook.getContext('2d');
  bctx.fillStyle = '#0a0e12';
  bctx.fillRect(0, 0, 768, 1088);
  bctx.strokeStyle = 'rgba(140, 217, 242, 0.24)';
  bctx.lineWidth = 2;
  bctx.strokeRect(32, 32, 704, 1024);

  bctx.fillStyle = 'rgba(140, 217, 242, 0.88)';
  bctx.font = '700 22px "Courier New", monospace';
  bctx.fillText('OŚRODEK TERAPII WSPOMNIEŃ // BOOKLET', 64, 92);
  bctx.fillStyle = '#eef5f8';
  bctx.font = '700 72px "Antonio", sans-serif';
  bctx.fillText('LOST MEDIA', 64, 182);
  bctx.fillStyle = 'rgba(220, 236, 242, 0.55)';
  bctx.font = '600 19px "Courier New", monospace';
  bctx.fillText('MEMORIES AND EMOTIONS  ·  YOUNG MULTI  ·  2026', 64, 222);

  bctx.fillStyle = 'rgba(140, 217, 242, 0.35)';
  bctx.fillRect(64, 248, 640, 2);

  const tracks = [
    '01  RED ALABASTER (INTRO)',
    '06  POWER UP',
    '12  MŁODY MANSON',
    '14  AK47',
    '19  GDZIE MÓJ DOM?',
    '—   + 15 ZABEZPIECZONYCH NAGRAŃ'
  ];
  tracks.forEach((t, i) => {
    bctx.fillStyle = i < 5 ? '#eaf4f8' : 'rgba(140, 217, 242, 0.85)';
    bctx.font = '700 26px "Courier New", monospace';
    bctx.fillText(t, 64, 332 + i * 68);
    bctx.fillStyle = 'rgba(220, 236, 242, 0.10)';
    bctx.fillRect(64, 352 + i * 68, 640, 1);
  });

  bctx.fillStyle = '#b91c22';
  bctx.fillRect(64, 832, 220, 44);
  bctx.fillStyle = '#ffffff';
  bctx.font = '700 20px "Courier New", monospace';
  bctx.fillText('! WARNING', 86, 861);
  bctx.fillStyle = '#eef5f8';
  bctx.fillRect(284, 832, 420, 44);
  bctx.fillStyle = '#0b0e11';
  bctx.font = '700 17px "Courier New", monospace';
  bctx.fillText('CONSULT A DOCTOR, MR. [REDACTED]', 302, 860);

  drawBarcode(bctx, 64, 928, 220, 66, 'rgba(232, 242, 246, 0.8)');
  bctx.fillStyle = 'rgba(220, 236, 242, 0.55)';
  bctx.font = '600 18px "Courier New", monospace';
  bctx.textAlign = 'right';
  bctx.fillText('YOUNG FAMILY LABEL · POLAND', 704, 982);

  return { spine: makeTex(cSpine), booklet: makeTex(cBook) };
}

const DVD_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vN;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vLocal = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// Clearcoat DVD-case plastic sleeve shader (looks crisp both grazing flat close-up AND upright!)
const DVD_SLEEVE_FRAG = /* glsl */ `
  uniform sampler2D tMap;
  uniform float uHasMap;
  uniform float uGloss;
  uniform vec2 uLightUv;
  uniform vec3 uRim;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec2 vUv;

  vec3 toShowPos(vec3 w) { return vec3(-w.x, ${SHOWROOM_FLOOR_Y.toFixed(3)} - w.y, w.z); }
  vec3 toShowDir(vec3 d) { return vec3(-d.x, -d.y, d.z); }

  float h12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x),
      mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec3 p = toShowPos(vWorld);
    vec3 n = normalize(toShowDir(vN));
    vec3 v = normalize(toShowPos(cameraPosition) - p);

    // Subtle polypropylene wrap wave so studio light glides smoothly across the cover surface
    float r1 = vn(vUv * vec2(4.2, 5.5));
    float r2 = vn(vUv * vec2(4.2, 5.5) + vec2(0.06, 0.0));
    float r3 = vn(vUv * vec2(4.2, 5.5) + vec2(0.0, 0.06));
    vec3 coatN = normalize(n + vec3((r2 - r1) * 0.30, (r3 - r1) * 0.30, 0.0) * uGloss);

    // Three-point clinical studio light (overhead key + camera-side fill so both flat & upright views read clearly!)
    vec3 Lkey = normalize(vec3(-0.32 + (uLightUv.x - 0.5) * 0.6, 0.68 + (uLightUv.y - 0.5) * 0.4, 0.72));
    vec3 Lcam = normalize(v + vec3(0.0, 0.25, 0.15));
    float key = max(dot(n, Lkey), 0.0);
    float camLit = max(dot(n, Lcam), 0.0);
    float fres = pow(1.0 - max(dot(coatN, v), 0.0), 3.0);

    vec3 Hkey = normalize(Lkey + v);
    vec3 Hcam = normalize(Lcam + v);
    float clearcoat = pow(max(dot(coatN, Hkey), 0.0), 62.0) * 0.52 * uGloss
                    + pow(max(dot(coatN, Hcam), 0.0), 34.0) * 0.16 * uGloss;

    vec3 albedo = uHasMap > 0.5 ? texture2D(tMap, vUv).rgb : vec3(0.022, 0.028, 0.034);
    vec2 e = min(vUv, 1.0 - vUv);
    float bev = 1.0 - smoothstep(0.002, 0.014, min(e.x, e.y));

    vec3 col = albedo * (0.42 + 0.56 * key + 0.34 * camLit);
    col += vec3(0.90, 0.96, 1.0) * clearcoat;
    col += uRim * (fres * 0.38 * uGloss + bev * 0.22);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Spinning iridescent grooved LOST MEDIA CD seated inside the hinged DVD Box
// During S7->S8 exit (uExit: 0 -> 1): ejects forward, spins up like an optical turbine,
// gets scanned by a crimson/cyan reading laser, and ignites its center hole into the portal!
const CD_FRAG = /* glsl */ `
  uniform sampler2D tCover;
  uniform float uHasCover;
  uniform float uSpin;
  uniform float uExit;
  uniform float uTime;
  uniform float uRadius;
  uniform vec3 uRim;
  uniform float uPortal; // S8: the hole is a window onto the hero frame
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vN;

  vec3 toShowPos(vec3 w) { return vec3(-w.x, ${SHOWROOM_FLOOR_Y.toFixed(3)} - w.y, w.z); }
  vec3 toShowDir(vec3 d) { return vec3(-d.x, -d.y, d.z); }

  void main() {
    float r = length(vLocal.xy) / max(uRadius, 0.001);
    if (r < 0.13) {
      // the centre hole is a window onto the first screen of the site: it is only MARKED here
      // (alpha 0.75) and the compositor draws the live hero into it (Multi, the room, the
      // dither) in screen space, so where the camera lands it IS the hero frame
      if (uPortal < 0.001) discard;
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.75);
      return;
    }

    vec3 p = toShowPos(vWorld);
    vec3 n = normalize(toShowDir(vN));
    vec3 v = normalize(toShowPos(cameraPosition) - p);
    float ang = atan(vLocal.y, vLocal.x);
    float worldAng = ang - uSpin;
    float viewAng = atan(v.y, v.x);

    float isLabel = 1.0 - smoothstep(0.35, 0.375, r);
    // Transparent polycarbonate clamping hub (r: 0.13..0.24) catches razor-sharp cyan/laser light during breach
    float isHub = 1.0 - smoothstep(0.22, 0.245, r);
    float innerRim = exp(-pow((r - 0.142) / 0.018, 2.0));
    float ring = 1.0 - smoothstep(0.008, 0.026, abs(r - 0.385));
    float outerRim = exp(-pow((r - 0.985) / 0.018, 2.0));

    float grooves = 0.5 + 0.5 * sin(r * 175.0 + uExit * 16.0);
    float fineTracks = 0.5 + 0.5 * sin(r * 420.0 - uTime * 8.0 * uExit);
    float aniso = pow(abs(cos(worldAng - viewAng + 0.65)), mix(14.0, 6.0, uExit));
    float phase = worldAng * (2.2 + 2.5 * uExit) + r * 11.0 + dot(n, v) * 4.8;
    vec3 irid = 0.5 + 0.5 * cos(phase + vec3(0.0, 1.9, 3.6));

    // Optical reading laser sweeps inward from outer grooves toward the center hole as exit builds
    float laserOn = smoothstep(0.18, 0.42, uExit) * (1.0 - smoothstep(0.86, 1.0, uExit));
    float scanR = mix(0.92, 0.145, smoothstep(0.20, 0.78, uExit));
    float laserBand = exp(-pow((r - scanR) / 0.035, 2.0)) * laserOn;
    float dataPulse = step(0.55, sin(worldAng * 18.0 + r * 95.0 - uTime * 22.0)) * laserBand;
    vec3 laserCol = mix(vec3(0.95, 0.16, 0.22), vec3(0.55, 0.92, 1.0), 0.35 + 0.45 * dataPulse);

    // Center aperture ignition as camera approaches the spinning hole
    float portalGlow = smoothstep(0.32, 0.88, uExit);

    vec3 disc = vec3(0.042, 0.052, 0.064) * (0.82 + 0.32 * grooves + 0.14 * fineTracks * uExit)
              + mix(vec3(0.84, 0.95, 1.0), irid, 0.52 + 0.34 * uExit) * aniso * (0.88 + 0.95 * uExit)
              + uRim * (ring * 0.58 + outerRim * (0.25 + 0.85 * uExit));

    vec2 luv = vLocal.xy / (uRadius * 0.76) + 0.5;
    vec3 cover = uHasCover > 0.5 ? texture2D(tCover, clamp(luv, 0.0, 1.0)).rgb : vec3(0.10, 0.18, 0.22);
    // Clamping hub looks like smoked glass polycarbonate catching cyan + crimson reflections
    vec3 hubCol = vec3(0.05, 0.08, 0.10) + irid * aniso * 0.45 + uRim * innerRim * (0.65 + 2.2 * portalGlow);
    vec3 col = mix(disc, cover * (1.12 - 0.25 * uExit), isLabel * (1.0 - isHub));
    col = mix(col, hubCol, isHub * 0.88);
    col += laserCol * (laserBand * 1.45 + dataPulse * 1.15);
    col += vec3(0.75, 0.96, 1.0) * innerRim * portalGlow * 2.1;
    col += vec3(0.95, 0.18, 0.24) * exp(-pow((r - 0.175) / 0.012, 2.0)) * portalGlow * 1.15;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Additive 3D holographic optical laser rings & segmented data telemetry arcs orbiting the spinning CD
const LASER_HALO_FRAG = /* glsl */ `
  uniform float uExit;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    // (kept clear of the CD's centre hole, r 0.094 here: it is the window onto the hero, S8)
    if (r < 0.095 || r > 1.0) discard;

    float ang = atan(p.y, p.x);
    float on = smoothstep(0.18, 0.44, uExit) * (1.0 - smoothstep(0.92, 1.0, uExit));
    if (on < 0.002) discard;

    // Three precision optical telemetry rings spinning in opposite directions
    float r1 = exp(-pow((r - 0.78) / 0.009, 2.0)) * smoothstep(0.1, 0.35, sin(ang * 3.0 - uTime * 3.2));
    float r2 = exp(-pow((r - 0.88) / 0.007, 2.0)) * smoothstep(0.25, 0.55, sin(ang * 6.0 + uTime * 4.5));
    float r3 = exp(-pow((r - 0.95) / 0.006, 2.0)) * smoothstep(-0.2, 0.2, cos(ang * 2.0 - uTime * 1.9));

    // Sweeping optical laser beam across the disc radius
    float beamAng = mod(uTime * 2.6, 6.2831853) - 3.1415926;
    float dAng = abs(atan(sin(ang - beamAng), cos(ang - beamAng)));
    float beam = exp(-pow(dAng / 0.022, 2.0)) * smoothstep(0.12, 0.22, r) * (1.0 - smoothstep(0.74, 0.84, r));

    // Center aperture ignition halo
    float core = exp(-pow((r - 0.115) / 0.028, 2.0)) * smoothstep(0.35, 0.88, uExit);

    vec3 cyan = vec3(0.55, 0.90, 1.0);
    vec3 crimson = vec3(0.98, 0.18, 0.24);
    vec3 col = cyan * (r1 * 0.95 + r3 * 0.65 + core * 1.85)
             + crimson * (r2 * 0.95 + beam * 1.35 + core * 0.45);
    float alpha = clamp((r1 + r2 + r3 * 0.8 + beam + core) * on, 0.0, 1.0);
    gl_FragColor = vec4(col * on, alpha);
  }
`;

export default function LostMediaBox({ state }) {
  const groupRef = useRef();
  const caseRef = useRef();
  const doorRef = useRef();
  const discRigRef = useRef();
  const discRef = useRef();
  const haloRef = useRef();

  const [frontTex, setFrontTex] = useState(null);
  const [backTex, setBackTex] = useState(null);
  const [logoImg, setLogoImg] = useState(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let live = true;
    let tFront = null;
    let tBack = null;

    loadRawImageTex('/studio/lost-media-dvd-front.jpg', (tex) => {
      if (!live) {
        tex.dispose();
        return;
      }
      tFront = tex;
      setFrontTex(tex);
    });

    loadRawImageTex('/studio/lost-media-dvd-back.jpg', (tex) => {
      if (!live) {
        tex.dispose();
        return;
      }
      tBack = tex;
      setBackTex(tex);
    });

    const imLogo = new Image();
    imLogo.onload = () => live && setLogoImg(imLogo);
    imLogo.src = logoUrl;

    if (document.fonts) {
      Promise.all([document.fonts.load('700 72px "Antonio"'), document.fonts.ready])
        .then(() => live && setFontsReady(true))
        .catch(() => {});
    }
    return () => {
      live = false;
      tFront?.dispose();
      tBack?.dispose();
    };
  }, []);

  const details = useMemo(() => {
    void fontsReady;
    return buildCaseDetails(logoImg);
  }, [logoImg, fontsReady]);
  useEffect(
    () => () => {
      details.spine.dispose();
      details.booklet.dispose();
    },
    [details]
  );

  const cdRadius = DVD_W * 0.41; // 1.93 m (proportional to 4.72 m wide room-scale DVD case!)

  const mats = useMemo(() => {
    const shared = {
      uLightUv: { value: new THREE.Vector2(0.5, 0.55) },
      uRim: { value: RIM_COLOR }
    };
    const makeMat = (map, gloss = 1.0) =>
      new THREE.ShaderMaterial({
        vertexShader: DVD_VERT,
        fragmentShader: DVD_SLEEVE_FRAG,
        uniforms: {
          ...shared,
          tMap: { value: map },
          uHasMap: { value: map ? 1 : 0 },
          uGloss: { value: gloss }
        }
      });

    const front = makeMat(frontTex, 1.15);
    const back = makeMat(backTex, 1.10);
    const spine = makeMat(details.spine, 0.90);
    const booklet = makeMat(details.booklet, 0.30);
    const shell = makeMat(null, 0.65);
    const disc = new THREE.ShaderMaterial({
      vertexShader: DVD_VERT,
      fragmentShader: CD_FRAG,
      side: THREE.DoubleSide,
      uniforms: {
        tCover: { value: frontTex },
        uHasCover: { value: frontTex ? 1 : 0 },
        uSpin: { value: 0 },
        uExit: { value: 0 },
        uTime: { value: 0 },
        uRadius: { value: cdRadius },
        uRim: { value: RIM_COLOR },
        uPortal: { value: 0 }
      }
    });
    const laserHalo = new THREE.ShaderMaterial({
      vertexShader: DVD_VERT,
      fragmentShader: LASER_HALO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uExit: { value: 0 },
        uTime: { value: 0 }
      }
    });

    return {
      shared,
      front,
      back,
      spine,
      booklet,
      shell,
      disc,
      laserHalo,
      backShellMats: [shell, spine, shell, shell, shell, back],
      doorMats: [shell, shell, shell, shell, front, booklet]
    };
  }, [frontTex, backTex, details, cdRadius]);

  useEffect(
    () => () => {
      mats.front.dispose();
      mats.back.dispose();
      mats.spine.dispose();
      mats.booklet.dispose();
      mats.shell.dispose();
      mats.disc.dispose();
      mats.laserHalo.dispose();
    },
    [mats]
  );

  const smoothPose = useRef({ rx: -Math.PI / 2, ry: 0, open: 0, shiftX: 0, spinAngle: 0 });

  useFrame((frame, dt) => {
    const s = state.current;
    const g = groupRef.current;
    if (!g) return;

    const j = s.studioJourney ?? s.dvdJourney ?? 0;
    const ex = s.studioExit ?? s.cdExit ?? 0;
    const visible = Boolean(s.studioOn && j > 0.004);
    g.visible = visible;
    if (!visible) return;

    const d = Math.min(dt, 0.08);
    const time = frame.clock.elapsedTime;
    const p = s.pointer;
    const drag = s.merchDrag ?? { dx: 0, dy: 0 };
    const flip = s.dvdFlip ?? 0;
    const open = s.dvdOpen ?? 0;

    // 1. Flat floor phase (j <= 0.50): lies strictly flat at rotX = -PI/2 directly under Atrium floor!
    //    Camera sweeps closely OVER the giant front cover at j = 0.50 (100% occluding the clinic behind it!).
    // 2. Continuous lift (j: 0.50 -> 0.97): seamlessly rises upright as camera pulls back to full 3D DVD Box!
    // 3. Hidden Track #21 Exit (ex: 0 -> 1): case opens wide & drifts back into shadow while the CD
    //    magnetically ejects forward, spins up like an optical turbine, gets laser-scanned, and centers
    //    its glowing hole straight onto the oncoming camera lens!
    const standT = THREE.MathUtils.smoothstep(j, 0.50, 0.97);
    const holdT = THREE.MathUtils.smoothstep(j, 0.76, 1.0);
    const exitFadeCtrl = 1 - THREE.MathUtils.smoothstep(ex, 0.0, 0.28);
    const sp = smoothPose.current;

    // Force-open the DVD case smoothly as exit begins (and undo back-flip if user was inspecting back cover)
    const exitOpen = THREE.MathUtils.smoothstep(ex, 0.0, 0.34);
    const targetOpen = Math.max(open * holdT * exitFadeCtrl, exitOpen);
    const activeFlip = flip * holdT * exitFadeCtrl;

    const targetRx =
      THREE.MathUtils.lerp(-Math.PI / 2, 0.03, standT) +
      (Math.sin(time * 0.48) * 0.016 - p.sy * 0.12 + drag.dy) * holdT * exitFadeCtrl;
    const baseRy = (open > 0.5 ? 0.06 : -0.14) * standT * exitFadeCtrl + activeFlip * Math.PI;
    const targetRy = baseRy + (Math.sin(time * 0.36) * 0.042 + p.sx * 0.24 + drag.dx) * holdT * exitFadeCtrl;
    const targetShiftX = open * holdT * exitFadeCtrl * 1.15;

    const k = 1 - Math.exp(-d * 7.0);
    sp.rx += (targetRx - sp.rx) * k;
    sp.ry += (targetRy - sp.ry) * k;
    sp.open += (targetOpen - sp.open) * (1 - Math.exp(-d * 6.0));
    sp.shiftX += (targetShiftX - sp.shiftX) * k;

    // Base upright position of the whole rig
    const posY = THREE.MathUtils.lerp(-DVD_D * 0.5, 0.20, standT) + Math.sin(time * 0.9) * 0.10 * holdT * exitFadeCtrl;
    g.position.set(sp.shiftX, posY, DVD_CENTER_Z);
    g.rotation.set(sp.rx, sp.ry, 0, 'YXZ');

    // Case shell gently recedes & tilts away into darkness once the CD ejects forward
    const caseRecede = THREE.MathUtils.smoothstep(ex, 0.18, 0.78);
    if (caseRef.current) {
      caseRef.current.position.set(-caseRecede * 1.85, -caseRecede * 0.55, -caseRecede * 6.2);
      caseRef.current.rotation.set(caseRecede * 0.26, -caseRecede * 0.52, caseRecede * 0.12);
    }

    // CD magnetic ejection & gyroscopic turbine flight straight onto camera center axis (x=0, y=0.20, z=DVD_CENTER_Z+4.8)
    const ejectT = THREE.MathUtils.smoothstep(ex, 0.12, 0.58);
    const gyroArc = Math.sin(ejectT * Math.PI); // dynamic mid-air tilt that catches iridescent highlights before locking flat!
    if (discRigRef.current) {
      discRigRef.current.position.set(
        THREE.MathUtils.lerp(0.10, 0.0, ejectT),
        gyroArc * 0.32,
        THREE.MathUtils.lerp(0.124, 4.80, ejectT)
      );
      discRigRef.current.rotation.set(
        -gyroArc * 0.46,
        gyroArc * 0.52,
        0
      );
    }

    // Exponentially accelerating CD turbine spin during exit!
    const spinSpeed = 0.85 * Math.max(sp.open, 0.0) + Math.pow(ex, 1.5) * 14.5;
    sp.spinAngle += spinSpeed * d;
    if (discRef.current) {
      discRef.current.rotation.z = -sp.spinAngle;
    }

    mats.shared.uLightUv.value.set(0.5 + p.sx * 0.42, 0.55 + p.sy * 0.35);
    mats.disc.uniforms.uSpin.value = sp.spinAngle;
    mats.disc.uniforms.uExit.value = ex;
    mats.disc.uniforms.uTime.value = time;
    const du = mats.disc.uniforms;
    du.uPortal.value = s.portal ?? 0;
    // where the hole really is (the studio camera lands on its axis, S8)
    if (discRef.current) {
      discRef.current.updateWorldMatrix(true, false);
      s.cdHole = discRef.current.getWorldPosition(s.cdHole ?? new THREE.Vector3());
    }
    mats.laserHalo.uniforms.uExit.value = ex;
    mats.laserHalo.uniforms.uTime.value = time;

    if (haloRef.current) {
      haloRef.current.visible = ex > 0.16 && ex < 0.93; // (out of the way of the landing camera)
    }
    if (doorRef.current) {
      doorRef.current.rotation.y = -sp.open * 2.02;
    }
  });

  return (
    <group ref={groupRef} position={[0, -DVD_D * 0.5, DVD_CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      {/* DVD Case shell + hinged front door (recedes gracefully once the CD ejects during S7->S8!) */}
      <group ref={caseRef}>
        {/* Molded black polypropylene back tray + official back cover & spine (z: -0.18 -> +0.12) */}
        <mesh position={[0, 0, -0.03]} material={mats.backShellMats} renderOrder={2}>
          <boxGeometry args={[DVD_W, DVD_H, DVD_D - 0.06]} />
        </mesh>
        {/* Rounded DVD spine outer strip (full 36 cm thickness along left hinge) */}
        <mesh position={[-DVD_W * 0.5, 0, 0]} material={mats.spine} renderOrder={3}>
          <boxGeometry args={[0.10, DVD_H, DVD_D]} />
        </mesh>
        {/* Molded central CD rosette spindle seated flush under the closed front cover */}
        <mesh position={[0.10, 0, 0.108]} rotation={[Math.PI / 2, 0, 0]} material={mats.shell} renderOrder={3}>
          <cylinderGeometry args={[0.30, 0.36, 0.04, 28]} />
        </mesh>

        {/* Hinged front cover pivoting around the left spine (-DVD_W/2): z: +0.13 -> +0.18 (exact 1 cm DVD case seam!) */}
        <group ref={doorRef} position={[-DVD_W * 0.5, 0, DVD_D * 0.5 - 0.025]}>
          <mesh position={[DVD_W * 0.5, 0, 0]} material={mats.doorMats} renderOrder={4}>
            <boxGeometry args={[DVD_W, DVD_H, 0.05]} />
          </mesh>
        </group>
      </group>

      {/* Independent CD Rig: stays seated in the tray during inspection, magnetically ejects forward during S7->S8! */}
      <group ref={discRigRef} position={[0.10, 0, 0.124]}>
        <mesh ref={discRef} material={mats.disc} renderOrder={5}>
          <circleGeometry args={[cdRadius, 96]} />
        </mesh>
        {/* Holographic 3D optical laser telemetry rings & sweeping scan beam around the spinning CD */}
        <mesh ref={haloRef} position={[0, 0, 0.06]} material={mats.laserHalo} renderOrder={6} visible={false}>
          <planeGeometry args={[cdRadius * 2.75, cdRadius * 2.75]} />
        </mesh>
      </group>
    </group>
  );
}
