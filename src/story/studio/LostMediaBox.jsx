import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BOX_DIMS, SHAPE_CENTER } from './particleSim';
import logoUrl from '../../assets/logoyflbiale.avif';

// =====================================================================
// S7 ARTIFACT: LOST MEDIA COLLECTOR'S EDITION BOX + EXPLODED DISC
// Materializes bottom-to-top out of Multi's living GPGPU particles via
// a reverse turquoise clinical laser scan, then opens in an Awwwards-style
// 3D Exploded View revealing the archival tray and iridescent grooved disc.
// =====================================================================

const RIM_COLOR = new THREE.Color(0.55, 0.85, 0.95);

function makeCanvasTex(canvas, srgb = false) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// Draw deterministic crisp archival barcode
function drawBarcode(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  let cx = x;
  let seed = 918273;
  while (cx < x + w) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const barW = 2 + ((seed >>> 24) % 5);
    const gap = 2 + ((seed >>> 16) % 4);
    if (cx + barW <= x + w) ctx.fillRect(cx, y, barW, h);
    cx += barW + gap;
  }
}

// Build 1024x1024 front cover + spot-UV foil mask, spine, and back archival textures
function buildBoxTextures(coverImg, logoImg) {
  const S = 1024;

  // --- 1. FRONT COVER (color) + FRONT FOIL MASK (spot-UV gloss) ---
  const cFront = document.createElement('canvas');
  cFront.width = S;
  cFront.height = S;
  const ctx = cFront.getContext('2d');

  const cFoil = document.createElement('canvas');
  cFoil.width = S;
  cFoil.height = S;
  const fctx = cFoil.getContext('2d');

  // Matte obsidian archival card base
  ctx.fillStyle = '#090c0f';
  ctx.fillRect(0, 0, S, S);
  fctx.fillStyle = '#000000';
  fctx.fillRect(0, 0, S, S);

  // Fine card stock grain
  for (let i = 0; i < 6500; i++) {
    const gx = ((i * 7919) % S);
    const gy = ((i * 104729) % S);
    const a = 0.015 + ((i * 31) % 10) * 0.0025;
    ctx.fillStyle = i % 2 === 0 ? `rgba(210,230,240,${a})` : `rgba(0,0,0,${a * 1.4})`;
    ctx.fillRect(gx, gy, 2, 2);
  }

  // Outer clinical hairline frame
  ctx.strokeStyle = 'rgba(180, 212, 224, 0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(42, 42, S - 84, S - 84);
  fctx.strokeStyle = '#999999';
  fctx.lineWidth = 3;
  fctx.strokeRect(42, 42, S - 84, S - 84);

  // Top clinical archive header
  ctx.fillStyle = 'rgba(186, 224, 238, 0.72)';
  ctx.font = '600 19px "Courier New", monospace';
  ctx.fillText('KLINIKA LOST MEDIA  //  LM-001', 68, 86);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(140, 217, 242, 0.9)';
  ctx.fillText('ARCHIVE EDITION', S - 68, 86);
  ctx.textAlign = 'left';

  // Central photographic artwork (/release-cover.jpg) framed crisply
  const artX = 112;
  const artY = 128;
  const artW = S - 224;
  const artH = 510;
  ctx.save();
  ctx.beginPath();
  ctx.rect(artX, artY, artW, artH);
  ctx.clip();
  if (coverImg) {
    const imgRatio = coverImg.naturalWidth / Math.max(coverImg.naturalHeight, 1);
    const boxRatio = artW / artH;
    let dw = artW;
    let dh = artH;
    let dx = artX;
    let dy = artY;
    if (imgRatio > boxRatio) {
      dw = artH * imgRatio;
      dx = artX - (dw - artW) * 0.5;
    } else {
      dh = artW / imgRatio;
      dy = artY - (dh - artH) * 0.5;
    }
    ctx.drawImage(coverImg, dx, dy, dw, dh);
    // Subtle archival vignette & cool clinical grade over artwork
    const grad = ctx.createLinearGradient(0, artY, 0, artY + artH);
    grad.addColorStop(0, 'rgba(6, 12, 16, 0.20)');
    grad.addColorStop(0.5, 'rgba(6, 12, 16, 0.04)');
    grad.addColorStop(1, 'rgba(6, 10, 13, 0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(artX, artY, artW, artH);
  } else {
    const g = ctx.createLinearGradient(artX, artY, artX + artW, artY + artH);
    g.addColorStop(0, '#13242c');
    g.addColorStop(1, '#070a0d');
    ctx.fillStyle = g;
    ctx.fillRect(artX, artY, artW, artH);
  }
  ctx.restore();

  // Artwork glossy UV coat + razor border
  fctx.fillStyle = '#585858';
  fctx.fillRect(artX, artY, artW, artH);
  ctx.strokeStyle = 'rgba(205, 232, 242, 0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(artX, artY, artW, artH);
  fctx.strokeStyle = '#ffffff';
  fctx.lineWidth = 4;
  fctx.strokeRect(artX, artY, artW, artH);

  // Embossed display title: LOST MEDIA (in both color & high-gloss metallic foil!)
  ctx.fillStyle = '#edf5f8';
  ctx.font = '700 132px "Antonio", Impact, sans-serif';
  ctx.fillText('LOST MEDIA', 68, 772);
  fctx.fillStyle = '#ffffff';
  fctx.font = '700 132px "Antonio", Impact, sans-serif';
  fctx.fillText('LOST MEDIA', 68, 772);

  // Horizontal archival rule
  ctx.fillStyle = 'rgba(140, 217, 242, 0.45)';
  ctx.fillRect(68, 804, S - 136, 2);
  fctx.fillStyle = '#cccccc';
  fctx.fillRect(68, 804, S - 136, 3);

  // Bottom clinical specs + barcode + YFL logo
  ctx.fillStyle = 'rgba(220, 234, 240, 0.85)';
  ctx.font = '700 28px "Antonio", sans-serif';
  ctx.fillText('YOUNG MULTI', 68, 856);
  ctx.fillStyle = 'rgba(168, 198, 210, 0.68)';
  ctx.font = '500 18px "Courier New", monospace';
  ctx.fillText('COLLECTOR EDITION  ·  11.12.2026', 68, 892);
  ctx.fillText('YOUNG FAMILY LABEL  ·  WARSAW', 68, 922);

  drawBarcode(ctx, S - 300, 834, 152, 62, 'rgba(220, 238, 244, 0.78)');
  drawBarcode(fctx, S - 300, 834, 152, 62, '#dddddd');
  ctx.fillStyle = 'rgba(168, 198, 210, 0.55)';
  ctx.font = '500 14px "Courier New", monospace';
  ctx.fillText('5 902026 111201', S - 296, 916);

  if (logoImg) {
    const lh = 58;
    const lw = (logoImg.naturalWidth / Math.max(logoImg.naturalHeight, 1)) * lh;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(logoImg, S - 68 - lw, 842, lw, lh);
    ctx.globalAlpha = 1;
    fctx.drawImage(logoImg, S - 68 - lw, 842, lw, lh);
  }

  // --- 2. SPINE TEXTURE (256 x 1024) ---
  const cSpine = document.createElement('canvas');
  cSpine.width = 256;
  cSpine.height = S;
  const sctx = cSpine.getContext('2d');
  sctx.fillStyle = '#080b0e';
  sctx.fillRect(0, 0, 256, S);
  sctx.strokeStyle = 'rgba(140, 217, 242, 0.35)';
  sctx.lineWidth = 3;
  sctx.strokeRect(18, 24, 220, S - 48);
  sctx.save();
  sctx.translate(128, S / 2);
  sctx.rotate(-Math.PI / 2);
  sctx.textAlign = 'center';
  sctx.fillStyle = '#e8f3f7';
  sctx.font = '700 46px "Antonio", sans-serif';
  sctx.fillText('YOUNG MULTI  —  LOST MEDIA', 0, 14);
  sctx.fillStyle = 'rgba(140, 217, 242, 0.85)';
  sctx.font = '600 22px "Courier New", monospace';
  sctx.fillText('YFL-LM001  ·  11.12.2026', 0, -34);
  sctx.restore();

  // --- 3. BACK COVER TEXTURE (1024 x 1024) ---
  const cBack = document.createElement('canvas');
  cBack.width = S;
  cBack.height = S;
  const bctx = cBack.getContext('2d');
  bctx.fillStyle = '#080b0e';
  bctx.fillRect(0, 0, S, S);
  bctx.strokeStyle = 'rgba(180, 212, 224, 0.18)';
  bctx.lineWidth = 2;
  bctx.strokeRect(42, 42, S - 84, S - 84);
  bctx.fillStyle = 'rgba(140, 217, 242, 0.78)';
  bctx.font = '600 22px "Courier New", monospace';
  bctx.fillText('OŚRODEK TERAPII INWAZYJNEJ // KLINIKA LOST MEDIA', 74, 110);
  bctx.fillStyle = 'rgba(220, 234, 240, 0.72)';
  bctx.font = '500 20px "Courier New", monospace';
  const rows = [
    '01  [ARCHIWUM ZABEZPIECZONE]',
    '02  ZA KAŻDYM RA2EM  (FT. JULA)',
    '03  [TAŚMA USZKODZONA // 11.12.2026]',
    '04  [REKONSTRUKCJA W TOKU]',
    '05  [BRAK DANYCH]',
    '06  [ZAPIS KLINICZNY]'
  ];
  rows.forEach((r, idx) => {
    bctx.fillText(r, 74, 240 + idx * 54);
    bctx.fillStyle = 'rgba(180, 212, 224, 0.12)';
    bctx.fillRect(74, 256 + idx * 54, S - 148, 1);
    bctx.fillStyle = idx === 1 ? 'rgba(140, 217, 242, 0.95)' : 'rgba(220, 234, 240, 0.52)';
  });
  drawBarcode(bctx, 74, 830, 240, 68, 'rgba(220, 238, 244, 0.65)');
  bctx.fillStyle = 'rgba(168, 198, 210, 0.55)';
  bctx.font = '500 18px "Courier New", monospace';
  bctx.fillText('NO. 0001 / 2026  ·  YFL STORE', 74, 926);

  return {
    frontColor: makeCanvasTex(cFront, false),
    frontFoil: makeCanvasTex(cFoil, false),
    spine: makeCanvasTex(cSpine, false),
    back: makeCanvasTex(cBack, false)
  };
}

// ---------------- shaders ----------------
const BOX_VERT = /* glsl */ `
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

const BOX_FRAG = /* glsl */ `
  uniform sampler2D tMap;
  uniform sampler2D tFoil;
  uniform float uHasFoil;
  uniform float uBoxScanY;
  uniform float uBoxScanOn;
  uniform float uTime;
  uniform vec3 uRim;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vN;
  varying vec2 vUv;

  void main() {
    // Reverse laser scan: solid materializes BELOW uBoxScanY as the line sweeps UP
    float below = uBoxScanY - vLocal.y;
    if (uBoxScanOn < 0.5 || below < 0.0) discard;

    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vWorld);

    vec3 albedo = texture2D(tMap, vUv).rgb;
    float foil = uHasFoil > 0.5 ? texture2D(tFoil, vUv).r : 0.08;

    // Subtle 1mm chamfer edge highlight around every face so edges catch studio softbox light
    vec2 edgeD = min(vUv, 1.0 - vUv);
    float bevel = 1.0 - smoothstep(0.004, 0.022, min(edgeD.x, edgeD.y));

    // Studio three-point lighting (softbox key + overhead skylight + cool turquoise rim)
    vec3 Lkey = normalize(vec3(-0.45, 0.65, 0.72));
    vec3 Lfill = normalize(vec3(0.68, -0.15, 0.52));
    float key = max(dot(n, Lkey), 0.0);
    float fill = max(dot(n, Lfill), 0.0);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.8);

    // Metallic spot-UV foil specular + matte archival card sheen
    vec3 Hkey = normalize(Lkey + v);
    vec3 Hfill = normalize(Lfill + v);
    float matteSpec = pow(max(dot(n, Hkey), 0.0), 22.0) * 0.14;
    float foilSpec = pow(max(dot(n, Hkey), 0.0), 86.0) * foil * 1.45
                   + pow(max(dot(n, Hfill), 0.0), 54.0) * foil * 0.55;

    vec3 col = albedo * (0.28 + 0.88 * key + 0.26 * fill);
    col += vec3(0.84, 0.92, 0.96) * matteSpec;
    col += mix(vec3(0.88, 0.95, 1.0), uRim * 1.25, 0.42) * foilSpec;
    col += vec3(0.62, 0.78, 0.86) * bevel * (0.14 + 0.32 * key + 0.25 * rim);
    col += uRim * rim * (0.32 + 0.35 * foil);

    // Reverse laser scan front: blazing HDR turquoise beam + trailing wireframe grid
    float band = exp(-pow(below / 0.0042, 2.0));
    float trail = exp(-below / 0.024) * smoothstep(0.0, 0.002, below);
    vec2 g = abs(fract(vUv * 18.0 - 0.5) - 0.5);
    float grid = 1.0 - smoothstep(0.0, 0.055, min(g.x, g.y));
    // Fade the laser cleanly once the scan has finished past the top of the box
    float activeLine = 1.0 - smoothstep(${(BOX_DIMS.h * 0.5 + 0.004).toFixed(4)}, ${(BOX_DIMS.h * 0.5 + 0.022).toFixed(4)}, uBoxScanY);
    col += uRim * (band * 3.6 + trail * (0.25 + grid * 0.95)) * activeLine;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Physical iridescent grooved LOST MEDIA disc (slides out in Exploded View)
const DISC_VERT = /* glsl */ `
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

const DISC_FRAG = /* glsl */ `
  uniform sampler2D tCover;
  uniform float uHasCover;
  uniform float uTime;
  uniform float uSpin;
  uniform vec3 uRim;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vN;
  varying vec2 vUv;

  void main() {
    // Disc lies in local XY plane (rotated cylinder cap)
    float r = length(vLocal.xy);
    // Center spindle hole
    if (r < 0.008) discard;

    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vWorld);
    float ang = atan(vLocal.y, vLocal.x);

    // Inner artwork label (r < 0.039 m) vs outer grooved obsidian-metallic disc
    float isLabel = 1.0 - smoothstep(0.0385, 0.0398, r);
    float clampRing = 1.0 - smoothstep(0.001, 0.0028, abs(r - 0.041));
    float outerRim = smoothstep(0.101, 0.1055, r);

    // Fine concentric grooves + anisotropic specular sheen bands (stationary in studio light as disc spins)
    float grooves = 0.5 + 0.5 * sin(r * 980.0);
    float viewAng = atan(v.y, v.x);
    float worldAng = ang - uSpin;
    float aniso = pow(abs(cos(worldAng - viewAng + 0.65)), 16.0);
    float aniso2 = pow(abs(cos(worldAng + viewAng - 1.1)), 28.0);

    // Subtle cold thin-film diffraction rainbow glint along the anisotropic band
    float phase = worldAng * 2.0 + r * 34.0 + dot(n, v) * 5.0;
    vec3 irid = 0.5 + 0.5 * cos(phase + vec3(0.0, 1.8, 3.4));
    irid = mix(vec3(0.75, 0.90, 0.98), irid, 0.42);

    vec3 discCol = vec3(0.028, 0.034, 0.040) * (0.85 + 0.3 * grooves);
    discCol += irid * aniso * (0.55 + 0.35 * grooves);
    discCol += vec3(0.85, 0.95, 1.0) * aniso2 * 0.48;
    discCol += vec3(0.65, 0.82, 0.90) * clampRing * 0.55;
    discCol += uRim * outerRim * 0.42;

    // Label artwork from /release-cover.jpg
    vec2 luv = vLocal.xy / 0.078 + 0.5;
    vec3 cover = uHasCover > 0.5 ? texture2D(tCover, clamp(luv, 0.0, 1.0)).rgb : vec3(0.16, 0.28, 0.34);
    float key = max(dot(n, normalize(vec3(-0.45, 0.65, 0.72))), 0.0);
    vec3 labelCol = cover * (0.35 + 0.85 * key);

    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 col = mix(discCol, labelCol, isLabel) + uRim * rim * 0.35;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function LostMediaBox({ state, boxPoseRef }) {
  const groupRef = useRef();
  const sleeveRef = useRef();
  const trayRef = useRef();
  const discRef = useRef();

  const [coverImg, setCoverImg] = useState(null);
  const [logoImg, setLogoImg] = useState(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let live = true;
    const imCover = new Image();
    imCover.onload = () => live && setCoverImg(imCover);
    imCover.src = '/release-cover.jpg';

    const imLogo = new Image();
    imLogo.onload = () => live && setLogoImg(imLogo);
    imLogo.src = logoUrl;

    if (document.fonts) {
      Promise.all([document.fonts.load('700 132px "Antonio"'), document.fonts.ready])
        .then(() => live && setFontsReady(true))
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, []);

  const coverTex = useMemo(() => {
    if (!coverImg) return null;
    const t = new THREE.Texture(coverImg);
    t.colorSpace = THREE.NoColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }, [coverImg]);
  useEffect(() => () => coverTex?.dispose(), [coverTex]);

  const textures = useMemo(() => {
    void fontsReady;
    return buildBoxTextures(coverImg, logoImg);
  }, [coverImg, logoImg, fontsReady]);
  useEffect(
    () => () => {
      textures.frontColor.dispose();
      textures.frontFoil.dispose();
      textures.spine.dispose();
      textures.back.dispose();
    },
    [textures]
  );

  const mats = useMemo(() => {
    const sharedScan = {
      uBoxScanY: { value: -BOX_DIMS.h },
      uBoxScanOn: { value: 0 },
      uTime: { value: 0 },
      uRim: { value: RIM_COLOR }
    };
    const makeFace = (map, foil = null) =>
      new THREE.ShaderMaterial({
        vertexShader: BOX_VERT,
        fragmentShader: BOX_FRAG,
        side: THREE.FrontSide,
        uniforms: {
          ...sharedScan,
          tMap: { value: map },
          tFoil: { value: foil },
          uHasFoil: { value: foil ? 1 : 0 }
        }
      });

    // BoxGeometry face order: +x (right), -x (left spine), +y (top), -y (bottom), +z (front), -z (back)
    const frontMat = makeFace(textures.frontColor, textures.frontFoil);
    const backMat = makeFace(textures.back, null);
    const spineMat = makeFace(textures.spine, null);

    // Dark anodized archival inner tray (self-lit studio shader, no scene lights required)
    const trayMat = new THREE.ShaderMaterial({
      vertexShader: BOX_VERT,
      fragmentShader: /* glsl */ `
        uniform vec3 uRim;
        varying vec3 vWorld;
        varying vec3 vN;
        varying vec2 vUv;
        void main() {
          vec3 n = normalize(vN);
          vec3 v = normalize(cameraPosition - vWorld);
          float key = max(dot(n, normalize(vec3(-0.45, 0.65, 0.72))), 0.0);
          float rim = pow(1.0 - max(dot(n, v), 0.0), 2.8);
          vec2 e = min(vUv, 1.0 - vUv);
          float bev = 1.0 - smoothstep(0.006, 0.025, min(e.x, e.y));
          vec3 col = vec3(0.028, 0.036, 0.044) * (0.4 + 0.9 * key) + vec3(0.55, 0.72, 0.80) * bev * 0.22 + uRim * rim * 0.35;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      uniforms: { uRim: sharedScan.uRim }
    });

    const discMat = new THREE.ShaderMaterial({
      vertexShader: DISC_VERT,
      fragmentShader: DISC_FRAG,
      side: THREE.DoubleSide,
      uniforms: {
        tCover: { value: coverTex },
        uHasCover: { value: coverTex ? 1 : 0 },
        uTime: sharedScan.uTime,
        uSpin: { value: 0 },
        uRim: sharedScan.uRim
      }
    });

    return {
      sharedScan,
      boxMats: [spineMat, spineMat, spineMat, spineMat, frontMat, backMat],
      frontMat,
      backMat,
      spineMat,
      trayMat,
      discMat
    };
  }, [textures, coverTex]);

  useEffect(
    () => () => {
      mats.frontMat.dispose();
      mats.backMat.dispose();
      mats.spineMat.dispose();
      mats.trayMat.dispose();
      mats.discMat.dispose();
    },
    [mats]
  );

  // Smooth spring for Exploded View motion
  const expRef = useRef(0);

  useFrame((frame, dt) => {
    const s = state.current;
    const g = groupRef.current;
    if (!g) return;
    if (!s.studioOn) {
      g.visible = false;
      return;
    }

    const boxScan = s.boxScan ?? 0;
    const boxExplode = s.boxExplode ?? 0;
    const merchFocus = s.merchFocus ?? 0;
    const d = Math.min(dt, 0.1);
    const time = frame.clock.elapsedTime;

    // Box glides off the gallery stage to the left/depth once user scrolls past item 0 -> 1..3
    const railOff = Math.max(0, merchFocus);
    g.visible = boxScan > 0.002 && railOff < 1.55;
    if (!g.visible) {
      expRef.current = 0;
      return;
    }

    // Smooth gallery rail translation (item 0 sits at SHAPE_CENTER, glides left into depth shadow)
    const easeOff = railOff * railOff * (3 - 2 * Math.min(railOff, 1));
    g.position.set(
      SHAPE_CENTER.x - railOff * 0.56,
      SHAPE_CENTER.y - railOff * 0.03,
      SHAPE_CENTER.z - Math.min(railOff, 1.5) * 0.34
    );
    const sOut = Math.max(0.45, 1 - railOff * 0.28);
    g.scale.setScalar(sOut);

    // Exact shared rotation with the GPGPU particle box (0.1 mm pixel-locked handoff!)
    const pose = boxPoseRef.current;
    g.rotation.set(pose.rx, pose.ry - easeOff * 0.38, 0, 'YXZ');

    // Reverse scan line sweeps UP from bottom (-H/2 - 0.015) to top (+H/2 + 0.025)
    const scanY = THREE.MathUtils.lerp(-BOX_DIMS.h * 0.5 - 0.014, BOX_DIMS.h * 0.5 + 0.026, boxScan);
    mats.sharedScan.uBoxScanY.value = scanY;
    mats.sharedScan.uBoxScanOn.value = boxScan > 0.002 ? 1 : 0;
    mats.sharedScan.uTime.value = time;

    // Exploded View: once solid materialization finishes, sleeve shifts gently left & disc slides out right
    const expTarget = boxScan > 0.92 ? boxExplode : 0;
    expRef.current += (expTarget - expRef.current) * (1 - Math.exp(-d * 6.5));
    const e = expRef.current;

    if (sleeveRef.current) {
      sleeveRef.current.position.x = -0.042 * e;
      sleeveRef.current.position.z = 0.006 * e;
    }
    if (trayRef.current) {
      trayRef.current.visible = e > 0.01;
      trayRef.current.position.x = 0.022 * e;
      trayRef.current.position.z = -0.004 * e;
    }
    if (discRef.current) {
      discRef.current.visible = e > 0.01;
      discRef.current.position.x = 0.108 * e;
      discRef.current.position.z = 0.006 * e;
      discRef.current.rotation.z = -time * 0.75 * e;
      mats.discMat.uniforms.uSpin.value = time * 0.75;
    }
  });

  return (
    <group ref={groupRef} position={[SHAPE_CENTER.x, SHAPE_CENTER.y, SHAPE_CENTER.z]} visible={false}>
      {/* Main Collector's Slipcase Box */}
      <mesh ref={sleeveRef} material={mats.boxMats} renderOrder={3}>
        <boxGeometry args={[BOX_DIMS.w, BOX_DIMS.h, BOX_DIMS.d]} />
      </mesh>

      {/* Archival Inner Tray (slides out during Exploded View) */}
      <mesh ref={trayRef} material={mats.trayMat} visible={false} renderOrder={2}>
        <boxGeometry args={[BOX_DIMS.w * 0.93, BOX_DIMS.h * 0.93, BOX_DIMS.d * 0.62]} />
      </mesh>

      {/* Physical Iridescent Grooved LOST MEDIA Disc (lies in XY plane, spins gently) */}
      <mesh ref={discRef} material={mats.discMat} visible={false} renderOrder={2}>
        <circleGeometry args={[0.106, 72]} />
      </mesh>
    </group>
  );
}
