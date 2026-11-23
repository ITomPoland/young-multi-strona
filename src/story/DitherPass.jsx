import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PHOTO } from './world/calibration';

// =====================================================================
// Global post-process: the hero's look (Bayer 4x4, 3 levels, teal palette, DoF taps,
// scanlines, grain, vignette) applied to the whole 3D story. Same maths as
// HeroVideoShader's DISPLAY pass, so the 2D -> 3D hand-off frame is identical.
// Extras: HDR overflow becomes a warm glow (light through the cracks / hole), and
// alpha < 1 marks pixels that should show raw colour (hovered cover).
// =====================================================================

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tScene;
  uniform vec2 uRes;
  uniform vec2 uDof;
  uniform float uDpr;
  uniform float uTime;
  uniform float uBlack;
  uniform float uGlowTaps;
  varying vec2 vUv;

  float bayer4x4(vec2 cell) {
    vec2 p = mod(floor(cell), 4.0);
    int idx = int(p.y) * 4 + int(p.x);
    if (idx == 0)  return 0.0  / 16.0;
    if (idx == 1)  return 8.0  / 16.0;
    if (idx == 2)  return 2.0  / 16.0;
    if (idx == 3)  return 10.0 / 16.0;
    if (idx == 4)  return 12.0 / 16.0;
    if (idx == 5)  return 4.0  / 16.0;
    if (idx == 6)  return 14.0 / 16.0;
    if (idx == 7)  return 6.0  / 16.0;
    if (idx == 8)  return 3.0  / 16.0;
    if (idx == 9)  return 11.0 / 16.0;
    if (idx == 10) return 1.0  / 16.0;
    if (idx == 11) return 9.0  / 16.0;
    if (idx == 12) return 15.0 / 16.0;
    if (idx == 13) return 7.0  / 16.0;
    if (idx == 14) return 13.0 / 16.0;
    return 5.0 / 16.0;
  }

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  vec3 applyDigitalDither(vec3 rgb, vec2 cellCoord, float boost) {
    float rawLuma = dot(rgb, vec3(0.299, 0.587, 0.114));
    float contrastLuma = smoothstep(0.035, 0.68, rawLuma) + boost;
    float threshold = bayer4x4(cellCoord) - 0.5;
    float levels = 3.0;
    float quantized = floor(clamp(contrastLuma * levels + threshold * 0.88, 0.0, levels)) / levels;
    vec3 colDark = vec3(0.032, 0.040, 0.048);
    vec3 colMid  = vec3(0.155, 0.275, 0.315);
    vec3 colHigh = vec3(0.76, 0.84, 0.88);
    return quantized < 0.5
      ? mix(colDark, colMid, quantized * 2.0)
      : mix(colMid, colHigh, (quantized - 0.5) * 2.0);
  }

  vec3 ldr(vec2 uv) { return min(texture2D(tScene, clamp(uv, vec2(0.0005), vec2(0.9995))).rgb, vec3(1.0)); }

  void main() {
    float cellPx = max(2.2, 2.7 * uDpr);
    vec2 cellCoord = floor(gl_FragCoord.xy / cellPx);
    vec2 snappedUv = (cellCoord + 0.5) * cellPx / uRes;

    vec4 centerTex = texture2D(tScene, vUv);
    float ditherMask = centerTex.a;

    vec3 soft =
      ldr(snappedUv) * 0.36 +
      ldr(snappedUv + vec2(uDof.x, uDof.y)) * 0.16 +
      ldr(snappedUv + vec2(-uDof.x, uDof.y)) * 0.16 +
      ldr(snappedUv + vec2(uDof.x, -uDof.y)) * 0.16 +
      ldr(snappedUv + vec2(-uDof.x, -uDof.y)) * 0.16;
    vec3 dithered = applyDigitalDither(soft, cellCoord, 0.0);

    vec3 raw = min(centerTex.rgb, vec3(1.0));
    vec3 col = mix(raw, dithered, step(0.5, ditherMask));

    // HDR overflow -> warm bloom-ish glow (cheap: a ring of taps)
    vec3 over = max(centerTex.rgb - 1.0, 0.0);
    if (uGlowTaps > 0.5) {
      vec2 px = 1.0 / uRes;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.785398;
        vec2 o = vec2(cos(a), sin(a));
        over += max(texture2D(tScene, vUv + o * px * 9.0 * uDpr).rgb - 1.0, 0.0) * 0.32;
        over += max(texture2D(tScene, vUv + o * px * 22.0 * uDpr).rgb - 1.0, 0.0) * 0.16;
      }
    }
    col += over * vec3(0.72, 0.92, 1.0) * 0.55; // cold glow: the grout / room light, no sun

    float scan = 0.97 + 0.03 * sin(gl_FragCoord.y * 1.4);
    col *= scan;
    float grain = (hash(gl_FragCoord.xy + fract(uTime * 31.7)) - 0.5) * 0.022;
    float vig = 1.0 - smoothstep(0.45, 1.28, length((vUv - 0.5) * vec2(1.15, 1.05)));
    col = col * mix(0.76, 1.0, vig) + grain;
    col *= 1.0 - uBlack;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

export default function DitherPass({ state, glow = true }) {
  const { gl, scene, camera, size } = useThree();

  const target = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter
    });
    return rt;
  }, []);

  const post = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: target.texture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uDof: { value: new THREE.Vector2(0.0026, 0.0026) },
        uDpr: { value: 1 },
        uTime: { value: 0 },
        uBlack: { value: 0 },
        uGlowTaps: { value: glow ? 1 : 0 }
      }
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    const postScene = new THREE.Scene();
    postScene.add(quad);
    const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { material, postScene, postCam, quad };
  }, [target, glow]);

  useEffect(() => () => {
    target.dispose();
    post.material.dispose();
    post.quad.geometry.dispose();
  }, [target, post]);

  const buf = useMemo(() => new THREE.Vector2(), []);

  useFrame((frame) => {
    if (!state.current.active) return;
    gl.getDrawingBufferSize(buf);
    if (target.width !== buf.x || target.height !== buf.y) target.setSize(buf.x, buf.y);

    const u = post.material.uniforms;
    u.uRes.value.copy(buf);
    u.uDpr.value = gl.getPixelRatio();
    u.uTime.value = frame.clock.elapsedTime;
    u.uBlack.value = state.current.black;

    // Hero DoF taps are 0.0026 in photo-UV space -> convert to screen UV for the cover crop
    const aspect = size.width / Math.max(size.height, 1);
    const photoAspect = PHOTO.width / PHOTO.height;
    const sx = aspect > photoAspect ? 1 : aspect / photoAspect;
    const sy = aspect > photoAspect ? photoAspect / aspect : 1;
    u.uDof.value.set(0.0026 / sx, (0.0026 * aspect) / sy);

    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 1);
    gl.clear(true, true, true);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    gl.render(post.postScene, post.postCam);
  }, 1);

  return null;
}
