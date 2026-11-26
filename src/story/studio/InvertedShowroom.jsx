import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import LostMediaBox from './LostMediaBox';
import { SHOWROOM_FLOOR_Y, DVD_CENTER_Z } from './showroomConfig';

// =====================================================================
// S7: DARK LOST MEDIA STUDIO VOID (THE FLOOR ITSELF IS THE DVD BOX!)
// Zero separate water floor and zero separate slab — the Atrium's floor
// literally IS the reverse side of the giant 3D LOST MEDIA DVD Box!
//  - Moody 360° dark obsidian Lost Media backdrop with cold teal studio glow
//  - Subtle cold turquoise atmospheric dust motes around the DVD Box
//  - 360° pointer drag-to-inspect controller once pulled back
// =====================================================================

const SHOW_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform float uPull;
  uniform float uExit;
  varying vec3 vWorld;
  vec3 toShowPos(vec3 w) { return vec3(-w.x, ${SHOWROOM_FLOOR_Y.toFixed(3)} - w.y, w.z); }

  void main() {
    vec3 p = toShowPos(vWorld);
    vec3 dir = normalize(p - vec3(0.0, 0.0, ${DVD_CENTER_Z.toFixed(3)}));

    // Deep Lost Media obsidian void with a centered cold teal clinical backlight + optical laser pulse during exit
    vec3 base = vec3(0.004, 0.006, 0.009);
    float r2 = dot(dir.xy - vec2(0.0, 0.02), dir.xy - vec2(0.0, 0.02));
    float backGlow = exp(-r2 * 3.0) * smoothstep(-0.2, -0.85, dir.z);
    float horizGlow = exp(-pow(dir.y * 2.8, 2.0)) * 0.35;
    float laserHalo = exp(-r2 * 10.0) * smoothstep(-0.2, -0.85, dir.z) * smoothstep(0.2, 0.85, uExit);
    vec3 col = base + vec3(0.028, 0.066, 0.080) * (backGlow * 1.2 + horizGlow * 0.45) * (0.35 + 0.65 * uPull);
    col += mix(vec3(0.08, 0.24, 0.30), vec3(0.32, 0.05, 0.07), 0.28) * laserHalo;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const MOTES_VERT = /* glsl */ `
  attribute float aRnd;
  uniform float uTime;
  uniform float uDpr;
  uniform float uIntensity;
  uniform float uExit;
  varying float vA;
  varying float vTint;
  void main() {
    vec3 p = position;
    float t = uTime * (0.14 + 0.12 * aRnd) + aRnd * 62.83;
    p.x += sin(t * 0.8 + p.z * 0.35) * 0.35;
    p.y += cos(t * 0.7 + p.x * 0.35) * 0.35;
    p.z += sin(t * 0.6 + p.y * 0.35) * 0.35;

    // During CD exit (uExit > 0): motes swirl into a high-speed optical warp tunnel rushing past the lens!
    float warp = smoothstep(0.18, 0.92, uExit);
    if (warp > 0.001) {
      float ang = aRnd * 6.2831853 + uTime * (0.65 + 1.8 * warp) * (aRnd > 0.5 ? 1.0 : -1.0);
      float rad = 1.6 + fract(aRnd * 7.31) * 5.2;
      vec3 tunnelPos = vec3(
        cos(ang) * rad,
        0.20 + sin(ang) * rad,
        ${DVD_CENTER_Z.toFixed(3)} + mod(aRnd * 18.0 + uTime * 7.5 * warp + uExit * 14.0, 18.0) - 2.0
      );
      p = mix(p, tunnelPos, warp);
    }

    vec4 w = modelMatrix * vec4(p, 1.0);
    vec4 mv = viewMatrix * w;
    gl_Position = projectionMatrix * mv;

    float twinkle = 0.45 + 0.55 * sin(uTime * (1.5 + 2.0 * aRnd) + aRnd * 37.0);
    vA = uIntensity * twinkle * (0.36 + 0.58 * warp);
    vTint = step(0.76, aRnd) * warp;
    gl_PointSize = clamp((1.5 + 2.6 * aRnd) * uDpr * ((8.5 + 7.5 * warp) / max(-mv.z, 0.8)), 1.0, 9.5) * step(0.01, vA);
  }
`;

const MOTES_FRAG = /* glsl */ `
  varying float vA;
  varying float vTint;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5 || vA < 0.01) discard;
    float soft = 1.0 - smoothstep(0.08, 0.5, r);
    vec3 col = mix(vec3(0.55, 0.86, 0.96), vec3(0.98, 0.22, 0.28), vTint);
    gl_FragColor = vec4(col, vA * soft);
  }
`;

function createVoidMotes(count = 160) {
  const pos = new Float32Array(count * 3);
  const rnd = new Float32Array(count);
  let seed = 7331;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() - 0.5) * 14.0;
    pos[i * 3 + 1] = (rand() - 0.5) * 10.0;
    pos[i * 3 + 2] = DVD_CENTER_Z + (rand() - 0.5) * 12.0;
    rnd[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  return g;
}

export default function InvertedShowroom({ state }) {
  const { gl } = useThree();
  const rootRef = useRef();

  // 360° Drag-to-Inspect pointer handlers once pulled back from the cover surface
  useEffect(() => {
    const dom = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e) => {
      if ((state.current.studioJourney ?? state.current.dvdJourney ?? 0) < 0.7) return;
      if ((state.current.studioExit ?? state.current.cdExit ?? 0) > 0.08) return;
      if (e.target && e.target.closest && e.target.closest('a, button, .story-merch-dock, .header-container')) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      if (state.current.merchDrag) state.current.merchDrag.active = true;
    };

    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (state.current.merchDrag) {
        state.current.merchDrag.dx += dx * 0.0085;
        state.current.merchDrag.dy = THREE.MathUtils.clamp(state.current.merchDrag.dy + dy * 0.0055, -0.55, 0.55);
      }
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      if (state.current.merchDrag) state.current.merchDrag.active = false;
    };

    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    return () => {
      void dom;
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [gl, state]);

  const mats = useMemo(
    () => ({
      sky: new THREE.ShaderMaterial({
        vertexShader: SHOW_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uPull: { value: 0 }, uExit: { value: 0 } }
      }),
      motes: new THREE.ShaderMaterial({
        vertexShader: MOTES_VERT,
        fragmentShader: MOTES_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uDpr: { value: 1 },
          uIntensity: { value: 0 },
          uExit: { value: 0 }
        }
      })
    }),
    []
  );

  const motesGeo = useMemo(() => createVoidMotes(160), []);

  useEffect(
    () => () => {
      mats.sky.dispose();
      mats.motes.dispose();
      motesGeo.dispose();
    },
    [mats, motesGeo]
  );

  useFrame((frame, dt) => {
    const s = state.current;
    const root = rootRef.current;
    if (!root) return;

    const j = s.studioJourney ?? s.dvdJourney ?? 0;
    const ex = s.studioExit ?? s.cdExit ?? 0;
    const pull = THREE.MathUtils.clamp((j - 0.48) / 0.52, 0, 1);
    const visible = Boolean(s.studioOn && j > 0.004);
    root.visible = visible;
    if (!visible) return;

    const d = Math.min(dt, 0.1);
    if (s.merchDrag && !s.merchDrag.active) {
      const decay = Math.exp(-d * 3.4);
      s.merchDrag.dx *= decay;
      s.merchDrag.dy *= decay;
    }

    mats.sky.uniforms.uPull.value = pull;
    mats.sky.uniforms.uExit.value = ex;
    mats.motes.uniforms.uTime.value = frame.clock.elapsedTime;
    mats.motes.uniforms.uDpr.value = frame.gl.getPixelRatio();
    mats.motes.uniforms.uIntensity.value = THREE.MathUtils.smoothstep(pull, 0.18, 0.88);
    mats.motes.uniforms.uExit.value = ex;
  });

  return (
    <group
      ref={rootRef}
      name="InvertedBSideShowroom"
      position={[0, SHOWROOM_FLOOR_Y, 0]}
      rotation={[0, 0, Math.PI]}
      visible={false}
    >
      {/* Dark Lost Media obsidian 360° studio backdrop */}
      <mesh position={[0, 0, DVD_CENTER_Z]} material={mats.sky} renderOrder={-4}>
        <sphereGeometry args={[48, 32, 24]} />
      </mesh>

      {/* Subtle clinical teal dust motes floating in the dark void */}
      <points geometry={motesGeo} material={mats.motes} frustumCulled={false} renderOrder={4} />

      {/* THE FLOOR ITSELF: Room-scale 3D LOST MEDIA DVD Box bolted directly beneath S6 Atrium! */}
      <LostMediaBox state={state} />
    </group>
  );
}
