import * as THREE from 'three';

// =====================================================================
// GPGPU PING-PONG PARTICLE PHYSICS ENGINE (Igloo-grade)
// Runs on WebGL2 FBOs (FloatType with HalfFloatType fallback):
//   - Position FBO (RGBA): xyz = head-space metres, w = scan-release life (0..1)
//   - Velocity FBO (RGBA): xyz = m/s in head space, w = smoothed energy (0..1)
//
// Forces per frame (sub-stepped for stability at any refresh rate):
//   1. Damped spring toward the active chapter target (Head -> Pad -> Vinyl -> YFL -> Head)
//      with per-particle stagger and stiffness variation.
//   2. True 3D Divergence-Free Curl Noise (Simplex 3D): subtle breathing at rest,
//      lush incompressible eddies during cursor wakes and chapter morphs.
//   3. Tactile Cursor Wake: radial repulsion + directional swipe drag + vortex swirl
//      around the 3D cursor ray in head space.
//   4. Subtle cylindrical containment field: fast flung particles curve and glide along
//      the invisible chamber boundary instead of flying off-screen.
//   5. Laser Scan Birth Impulse: crossing uScanY releases particles with an outward
//      burst + curl kick that settles organically onto Multi's face.
// =====================================================================

export const SHAPE_CENTER = new THREE.Vector3(0, -0.012, 0.045);
export const BOX_DIMS = { w: 0.235, h: 0.235, d: 0.042 }; // LOST MEDIA Collector's Box (metres)

const SIM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Compact 3D Simplex Noise (Ashima/Gustavson) + finite-difference Curl (divergence-free)
const GLSL_CURL = /* glsl */ `
  vec4 _permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 _taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod(i, 289.0);
    vec4 p = _permute(_permute(_permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0 / 7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = _taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  vec3 snoiseVec3(vec3 p) {
    return vec3(
      snoise(p),
      snoise(p + vec3(31.416, -47.853, 12.679)),
      snoise(p + vec3(-23.191, 19.723, -54.217))
    );
  }

  vec3 curlNoise(vec3 p) {
    const float e = 0.08;
    vec3 dx = vec3(e, 0.0, 0.0);
    vec3 dy = vec3(0.0, e, 0.0);
    vec3 dz = vec3(0.0, 0.0, e);
    vec3 p_x0 = snoiseVec3(p - dx);
    vec3 p_x1 = snoiseVec3(p + dx);
    vec3 p_y0 = snoiseVec3(p - dy);
    vec3 p_y1 = snoiseVec3(p + dy);
    vec3 p_z0 = snoiseVec3(p - dz);
    vec3 p_z1 = snoiseVec3(p + dz);
    float x = (p_y1.z - p_y0.z) - (p_z1.y - p_z0.y);
    float y = (p_z1.x - p_z0.x) - (p_x1.z - p_x0.z);
    float z = (p_x1.y - p_x0.y) - (p_y1.x - p_y0.x);
    return normalize(vec3(x, y, z) + vec3(1e-5));
  }
`;

// Shared target-shape evaluator (used by both velocity and position/reset passes)
const GLSL_TARGET = /* glsl */ `
  uniform sampler2D tTarget0; // head+visor (head-space metres), w = rnd
  uniform sampler2D tTarget1; // pad (relative to uShapeC), w = feat
  uniform sampler2D tTarget2; // vinyl (flat XY, relative to uShapeC), w = norm radius
  uniform sampler2D tTarget3; // YFL logo (relative to uShapeC), w = edge
  uniform sampler2D tTarget4; // LOST MEDIA Collector's Box (relative to uShapeC), w = edgeMask
  uniform vec3 uShapeC;
  uniform float uMorph;
  uniform float uTime;
  uniform float uSpin;
  uniform vec2 uBoxRot;

  vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
  vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }

  vec3 evalShape(float i, vec3 p0, vec3 p1, vec3 p2, vec3 p3, vec3 p4) {
    if (i < 0.5) return p0;
    float sway = sin(uTime * 0.45 + i * 1.7) * 0.22;
    if (i < 1.5) return uShapeC + rotY(rotX(p1, -0.22 + sin(uTime * 0.6) * 0.05), sway);
    if (i < 2.5) return uShapeC + rotY(rotX(rotZ(p2, uSpin), -0.62), sway * 0.5);
    if (i < 3.5) return uShapeC + rotY(rotX(p3, -0.08), sway);
    return uShapeC + rotY(rotX(p4, uBoxRot.x), uBoxRot.y);
  }

  // Returns target position (xyz) and morph flight factor (w: 0 at rest, 1 mid-morph)
  vec4 computeTarget(vec2 uv) {
    vec4 d0 = texture2D(tTarget0, uv);
    vec3 p1 = texture2D(tTarget1, uv).xyz;
    vec3 p2 = texture2D(tTarget2, uv).xyz;
    vec3 p3 = texture2D(tTarget3, uv).xyz;
    vec3 p4 = texture2D(tTarget4, uv).xyz;
    float rnd = d0.w;

    float m = clamp(uMorph, 0.0, 4.0);
    float seg = min(floor(m), 3.0);
    // Staggered peel-off wave: height + per-particle randomness so shapes unravel organically
    float wave = clamp(rnd * 0.65 + (0.22 - d0.y) * 0.85, 0.0, 1.0);
    float lt = smoothstep(0.0, 1.0, clamp((m - seg - wave * 0.44) / 0.56, 0.0, 1.0));
    float fly = sin(3.14159265 * lt);

    vec3 a = evalShape(seg, d0.xyz, p1, p2, p3, p4);
    vec3 b = evalShape(seg + 1.0, d0.xyz, p1, p2, p3, p4);
    vec3 target = mix(a, b, lt);
    // Gentle mid-flight orbital arc around the chamber axis
    target = uShapeC + rotY(target - uShapeC, fly * (0.85 + rnd * 1.15));
    return vec4(target, fly);
  }
`;

const SIM_VEL_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tPos;
  uniform sampler2D tVel;
  uniform sampler2D tMeta; // xyz = head normal, w = isVisor
  uniform float uDt;
  uniform float uReset;
  uniform float uScanY;    // in head-local Y
  uniform float uScanOn;
  uniform float uHold;
  uniform vec3 uRayO;      // cursor ray origin (head-local)
  uniform vec3 uRayD;      // cursor ray dir (head-local, normalized)
  uniform vec3 uSwipeVel;  // cursor 3D velocity (head-local m/s)
  uniform float uCursorOn; // 0..1 active interaction weight
  uniform float uCursorSpd;// 0..1+ normalized swipe speed
  uniform float uMorphVel; // abs rate of morph change (scroll burst)
  ${GLSL_TARGET}
  ${GLSL_CURL}

  void main() {
    vec4 d0 = texture2D(tTarget0, vUv);
    vec4 meta = texture2D(tMeta, vUv);
    float rnd = d0.w;

    if (uReset > 0.5) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }

    float above = d0.y - uScanY;
    // Below scan line (or scan not started): locked to solid head, zero velocity
    if (uScanOn < 0.5 || above <= 0.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }

    vec4 posData = texture2D(tPos, vUv);
    vec4 velData = texture2D(tVel, vUv);
    vec3 pos = posData.xyz;
    float life = posData.w;
    vec3 vel = velData.xyz;

    // Exact frame the laser crosses this particle: energetic scan-release burst
    if (life < 0.001) {
      vec3 n = normalize(meta.xyz + vec3(0.0, 0.0, 1e-4));
      vec3 jit = vec3(
        fract(rnd * 13.17) - 0.5,
        fract(rnd * 7.31) - 0.5,
        fract(rnd * 3.73) - 0.5
      );
      vec3 burst = n * (0.22 + 0.34 * rnd) + jit * 0.28 + vec3(0.0, 0.06, 0.0);
      gl_FragColor = vec4(burst, 0.85);
      return;
    }

    vec4 tgt = computeTarget(vUv);
    vec3 targetPos = tgt.xyz;
    float fly = tgt.w;

    // Two populations (Igloo / Bricelab secret):
    //   ~90% core form particles: crisp portrait/shape with visible surface-tangential fluid flow
    //   ~10% aura drifters: soft spring, constantly peeling off into 3D curl currents & bokeh, drifting back
    // As particles condense into the S7 Collector's Box (uMorph -> 4), drifters pull in tight for crisp solid handoff!
    float boxLock = smoothstep(3.35, 3.96, uMorph);
    float isDrifter = smoothstep(0.885, 0.915, rnd) * (1.0 - boxLock);

    // 1. Damped spring attraction toward target shape
    //    Loosens mid-morph (and for aura drifters), stiffens cleanly on Box condensation
    float springJitter = 0.76 + 0.48 * rnd;
    float restK = mix(mix(22.0, 2.6, isDrifter), 36.0, boxLock);
    float baseK = mix(restK, 8.0, fly) * springJitter;
    vec3 toTarget = targetPos - pos;
    vec3 acc = toTarget * baseK;

    // 2. 3D Divergence-Free Curl Noise (always alive, even with hands off the mouse)
    float speed = length(vel);
    vec3 nSurf = normalize(meta.xyz + vec3(0.0, 0.0, 1e-4));
    float edgeMask = smoothstep(0.035, 0.16, length(d0.xy - vec2(0.0, 0.01)));
    float holdW = (0.35 + 0.65 * uHold) * (1.0 - boxLock * 0.88);

    // Slow travelling current wave rolling softly upward through the cloud
    float waveBreath = 0.55 + 0.45 * sin(uTime * 1.05 - pos.y * 13.0 + pos.x * 5.0);
    float curlFreq = mix(4.4, 3.2, max(fly, isDrifter * 0.6));
    vec3 curl = curlNoise(pos * curlFreq + vec3(uTime * 0.24, -uTime * 0.32, uTime * 0.16));

    // Core particles flow mostly TANGENTIAL to the surface at rest -> visibly alive WITHOUT blurring the face!
    vec3 curlTang = curl - nSurf * dot(curl, nSurf);
    float tangMix = (1.0 - fly) * (1.0 - isDrifter) * (1.0 - smoothstep(0.08, 0.35, speed)) * 0.78;
    vec3 flowDir = mix(curl, curlTang, tangMix);

    float coreIdle = (0.11 + 0.17 * edgeMask) * waveBreath * holdW;
    float drifterIdle = (0.20 + 0.28 * edgeMask) * holdW;
    float restCurl = mix(coreIdle, drifterIdle, isDrifter);
    float flyCurl = (0.95 + 0.65 * rnd) * fly + min(uMorphVel, 1.5) * 0.32 * fly;
    float wakeCurl = smoothstep(0.05, 0.55, speed) * 0.55;
    acc += flowDir * (restCurl + flyCurl + wakeCurl);

    // Subtle upward thermal buoyancy + slow orbital drift for the 10% aura drifters
    if (isDrifter > 0.01 && fly < 0.5) {
      vec3 relD = pos - uShapeC;
      vec3 orbitD = normalize(vec3(-relD.z, 0.0, relD.x) + vec3(1e-4, 0.0, 0.0));
      acc += (vec3(0.0, 0.028, 0.0) + orbitD * (0.04 + 0.05 * edgeMask)) * isDrifter * (1.0 - fly) * holdW;
    }

    // Subtle mid-flight swirl torque around vertical axis
    if (fly > 0.01) {
      vec3 rel = pos - uShapeC;
      vec3 tangent = normalize(vec3(-rel.z, 0.0, rel.x) + vec3(1e-4, 0.0, 0.0));
      acc += tangent * fly * (0.55 + 0.5 * rnd);
    }

    // 3. Tactile 3D Cursor Wake (repulsion + directional swipe drag + vortex swirl)
    if (uCursorOn > 0.001) {
      float tRay = dot(pos - uRayO, uRayD);
      vec3 cl = uRayO + uRayD * tRay;
      vec3 away = pos - cl;
      float dist = length(away);
      float radius = mix(0.058, 0.095, clamp(uCursorSpd, 0.0, 1.0));
      float falloff = exp(-(dist * dist) / (radius * radius));
      if (falloff > 0.002) {
        vec3 awayDir = away / max(dist, 1e-4);
        // Gentle hover breathing push + strong energetic push when moving
        float pushAmp = (0.28 + 2.35 * uCursorSpd) * uCursorOn;
        acc += awayDir * falloff * pushAmp;
        // Directional swipe wake: drags particles along the cursor motion
        acc += uSwipeVel * falloff * 2.4 * uCursorOn;
        // Vortex swirl around the cursor ray (feels like stirring smoke/ferrofluid)
        vec3 vortex = cross(uRayD, awayDir);
        acc += vortex * falloff * (0.45 + 1.8 * uCursorSpd) * uCursorOn * (rnd > 0.5 ? 1.0 : -0.65);
      }
    }

    // 4. Soft cylindrical containment field (keeps wildly flung particles gliding inside chamber)
    vec3 cRel = pos - uShapeC;
    float radXZ = length(cRel.xz);
    float maxR = 0.27;
    if (radXZ > maxR) {
      vec2 radialDir = cRel.xz / max(radXZ, 1e-4);
      float over = radXZ - maxR;
      acc.xz -= radialDir * over * 48.0;
      // Convert outward momentum into gentle tangential glide along the field boundary
      vec2 tang = vec2(-radialDir.y, radialDir.x);
      acc.xz += tang * over * 8.0;
    }

    // Integrate velocity with frame-rate independent exponential damping
    vel += acc * uDt;
    float baseDrag = mix(6.0, 2.6, isDrifter);
    float drag = mix(baseDrag, 3.5, clamp(fly * 0.8 + smoothstep(0.15, 0.9, speed) * 0.4, 0.0, 1.0));
    vel *= exp(-drag * uDt);

    // Safety speed cap (prevents runaway on sudden tab switches)
    float newSpeed = length(vel);
    if (newSpeed > 2.2) vel *= 2.2 / newSpeed;

    // Smoothed kinetic energy for shading / HDR bloom (drifters carry a gentle ambient glint)
    float rawEnergy = clamp(max(newSpeed - 0.025, 0.0) * 2.0 + fly * 0.45 + isDrifter * smoothstep(0.03, 0.18, newSpeed) * 0.28, 0.0, 1.0);
    float energy = mix(velData.w, rawEnergy, clamp(uDt * 9.0, 0.0, 1.0));

    gl_FragColor = vec4(vel, energy);
  }
`;

const SIM_POS_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tPos;
  uniform sampler2D tVel;
  uniform float uDt;
  uniform float uReset;
  uniform float uScanY;
  uniform float uScanOn;
  ${GLSL_TARGET}

  void main() {
    vec4 d0 = texture2D(tTarget0, vUv);

    if (uReset > 0.5) {
      float aboveR = d0.y - uScanY;
      if (uScanOn < 0.5 || aboveR <= 0.0) {
        gl_FragColor = vec4(d0.xyz, 0.0);
      } else {
        vec4 tgtR = computeTarget(vUv);
        gl_FragColor = vec4(tgtR.xyz, 1.0);
      }
      return;
    }

    float above = d0.y - uScanY;
    if (uScanOn < 0.5 || above <= 0.0) {
      gl_FragColor = vec4(d0.xyz, 0.0);
      return;
    }

    vec4 posData = texture2D(tPos, vUv);
    vec3 vel = texture2D(tVel, vUv).xyz;
    vec3 pos = posData.xyz;
    float life = posData.w;

    // On first frame after laser passes, start exactly at head surface
    if (life < 0.001) {
      pos = d0.xyz;
    }

    pos += vel * uDt;
    float nextLife = min(max(life, 0.005) + uDt * 2.8, 1.0);

    gl_FragColor = vec4(pos, nextLife);
  }
`;

function makeDataTexture(data, size) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function detectSimFloatType(gl) {
  const isWebGL2 = gl.capabilities.isWebGL2;
  if (isWebGL2 && gl.extensions.has('EXT_color_buffer_float')) return THREE.FloatType;
  if (gl.extensions.has('EXT_color_buffer_half_float') || isWebGL2) return THREE.HalfFloatType;
  return null;
}

// Pack head + visor geometry into back-to-front sorted head-space metres arrays of length count
export function packHeadParticles(headGeo, visorGeo, fitMatrix, count) {
  const hPos = headGeo.getAttribute('position');
  const hNor = headGeo.getAttribute('aNormal');
  const hRnd = headGeo.getAttribute('aRnd');
  const vPos = visorGeo?.getAttribute('position');
  const vNor = visorGeo?.getAttribute('aNormal');
  const vRnd = visorGeo?.getAttribute('aRnd');

  const hTotal = hPos.count;
  const vTotal = vPos ? vPos.count : 0;
  const vCount = vTotal > 0 ? Math.min(vTotal, Math.round(count * 0.075)) : 0;
  const hCount = count - vCount;

  const normalMat = new THREE.Matrix3().getNormalMatrix(fitMatrix);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  // Temp storage so we can sort back-to-front by Z (clean painter's order for soft optical bokeh!)
  const tmpPos = new Float32Array(count * 3);
  const tmpNor = new Float32Array(count * 3);
  const tmpRnd = new Float32Array(count);
  const tmpVis = new Uint8Array(count);
  const order = new Int32Array(count);

  const pushPoint = (idx, posAttr, norAttr, rndAttr, srcIdx, isVisor) => {
    p.fromBufferAttribute(posAttr, srcIdx).applyMatrix4(fitMatrix);
    n.fromBufferAttribute(norAttr, srcIdx).applyMatrix3(normalMat).normalize();
    tmpPos[idx * 3] = p.x;
    tmpPos[idx * 3 + 1] = p.y;
    tmpPos[idx * 3 + 2] = p.z;
    tmpNor[idx * 3] = n.x;
    tmpNor[idx * 3 + 1] = n.y;
    tmpNor[idx * 3 + 2] = n.z;
    // Keep independent per-particle randomness (golden ratio fallback if missing)
    tmpRnd[idx] = rndAttr ? rndAttr.getX(srcIdx) : (idx * 0.6180339887) % 1;
    tmpVis[idx] = isVisor ? 1 : 0;
    order[idx] = idx;
  };

  for (let i = 0; i < hCount; i++) {
    const src = Math.floor((i * hTotal) / hCount);
    pushPoint(i, hPos, hNor, hRnd, src, false);
  }
  for (let i = 0; i < vCount; i++) {
    const src = Math.floor((i * vTotal) / vCount);
    pushPoint(hCount + i, vPos, vNor, vRnd, src, true);
  }

  // Sort ascending by Z (back-to-front in head space) so front facial dots composite over neck/dreads
  order.sort((a, b) => tmpPos[a * 3 + 2] - tmpPos[b * 3 + 2]);

  const target0 = new Float32Array(count * 4);
  const meta = new Float32Array(count * 4);
  for (let k = 0; k < count; k++) {
    const src = order[k];
    target0[k * 4] = tmpPos[src * 3];
    target0[k * 4 + 1] = tmpPos[src * 3 + 1];
    target0[k * 4 + 2] = tmpPos[src * 3 + 2];
    target0[k * 4 + 3] = tmpRnd[src];
    meta[k * 4] = tmpNor[src * 3];
    meta[k * 4 + 1] = tmpNor[src * 3 + 1];
    meta[k * 4 + 2] = tmpNor[src * 3 + 2];
    meta[k * 4 + 3] = tmpVis[src];
  }

  return { target0, meta };
}

// Pack a 3D shape array (Float32Array of count*3 in metres) into RGBA Float32Array
export function packShapeTexture(arr, count, scale = 0.86, wFn = null) {
  const out = new Float32Array(count * 4);
  for (let k = 0; k < count; k++) {
    const x = arr[k * 3] * scale;
    const y = arr[k * 3 + 1] * scale;
    const z = arr[k * 3 + 2] * scale;
    out[k * 4] = x;
    out[k * 4 + 1] = y;
    out[k * 4 + 2] = z;
    out[k * 4 + 3] = wFn ? wFn(x, y, z, k) : 0;
  }
  return out;
}

// Sample the 6 faces + crisp edges of the LOST MEDIA Collector's Box (metres, centered at 0,0,0)
// Returns RGBA Float32Array: xyz = box local metres, w = edgeMask (1 along edges/artwork frame, 0 interior)
export function makeBoxParticles(count, seed = 42) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const hw = BOX_DIMS.w * 0.5;
  const hh = BOX_DIMS.h * 0.5;
  const hd = BOX_DIMS.d * 0.5;
  const out = new Float32Array(count * 4);

  for (let k = 0; k < count; k++) {
    const r = rand();
    let x = 0;
    let y = 0;
    let z = 0;
    let edge = 0;
    if (r < 0.12) {
      // Dedicated crisp silhouette points along the 12 chamfered edges of the collector's box
      const eIdx = Math.floor(rand() * 12);
      const t = (rand() - 0.5) * 2;
      if (eIdx < 4) {
        x = t * hw;
        y = (eIdx & 1 ? 1 : -1) * hh;
        z = (eIdx & 2 ? 1 : -1) * hd;
      } else if (eIdx < 8) {
        const j = eIdx - 4;
        x = (j & 1 ? 1 : -1) * hw;
        y = t * hh;
        z = (j & 2 ? 1 : -1) * hd;
      } else {
        const j = eIdx - 8;
        x = (j & 1 ? 1 : -1) * hw;
        y = (j & 2 ? 1 : -1) * hh;
        z = t * hd;
      }
      edge = 1.0;
    } else if (r < 0.62) {
      // Front face (artwork & embossed typography)
      x = (rand() - 0.5) * BOX_DIMS.w;
      y = (rand() - 0.5) * BOX_DIMS.h;
      z = hd;
      const inFrame = Math.abs(Math.abs(x) - hw * 0.72) < 0.004 || Math.abs(Math.abs(y) - hh * 0.72) < 0.004;
      edge = inFrame && Math.abs(x) <= hw * 0.74 && Math.abs(y) <= hh * 0.74 ? 0.85 : 0.0;
    } else if (r < 0.80) {
      // Back face
      x = (rand() - 0.5) * BOX_DIMS.w;
      y = (rand() - 0.5) * BOX_DIMS.h;
      z = -hd;
    } else if (r < 0.90) {
      // Left / right spines
      x = rand() < 0.5 ? -hw : hw;
      y = (rand() - 0.5) * BOX_DIMS.h;
      z = (rand() - 0.5) * BOX_DIMS.d;
      edge = 0.45;
    } else {
      // Top / bottom edges
      x = (rand() - 0.5) * BOX_DIMS.w;
      y = rand() < 0.5 ? -hh : hh;
      z = (rand() - 0.5) * BOX_DIMS.d;
      edge = 0.45;
    }
    out[k * 4] = x;
    out[k * 4 + 1] = y;
    out[k * 4 + 2] = z;
    out[k * 4 + 3] = edge;
  }
  return out;
}

export function createParticleSim(gl, size) {
  const floatType = detectSimFloatType(gl);
  if (!floatType) return null;

  const count = size * size;
  const rtOpts = {
    type: floatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false
  };

  const posA = new THREE.WebGLRenderTarget(size, size, rtOpts);
  const posB = new THREE.WebGLRenderTarget(size, size, rtOpts);
  const velA = new THREE.WebGLRenderTarget(size, size, rtOpts);
  const velB = new THREE.WebGLRenderTarget(size, size, rtOpts);

  const empty = new Float32Array(count * 4);
  const tTarget0 = makeDataTexture(empty, size);
  const tTarget1 = makeDataTexture(new Float32Array(count * 4), size);
  const tTarget2 = makeDataTexture(new Float32Array(count * 4), size);
  const tTarget3 = makeDataTexture(new Float32Array(count * 4), size);
  const tTarget4 = makeDataTexture(makeBoxParticles(count, 42), size);
  const tMeta = makeDataTexture(new Float32Array(count * 4), size);

  const shared = {
    tTarget0: { value: tTarget0 },
    tTarget1: { value: tTarget1 },
    tTarget2: { value: tTarget2 },
    tTarget3: { value: tTarget3 },
    tTarget4: { value: tTarget4 },
    uShapeC: { value: SHAPE_CENTER.clone() },
    uMorph: { value: 0 },
    uTime: { value: 0 },
    uSpin: { value: 0 },
    uBoxRot: { value: new THREE.Vector2(0.08, -0.32) },
    uDt: { value: 1 / 60 },
    uReset: { value: 1 },
    uScanY: { value: 1 },
    uScanOn: { value: 0 }
  };

  const velMat = new THREE.ShaderMaterial({
    vertexShader: SIM_VERT,
    fragmentShader: SIM_VEL_FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      ...shared,
      tPos: { value: posA.texture },
      tVel: { value: velA.texture },
      tMeta: { value: tMeta },
      uHold: { value: 0 },
      uRayO: { value: new THREE.Vector3(0, 0, 10) },
      uRayD: { value: new THREE.Vector3(0, 0, -1) },
      uSwipeVel: { value: new THREE.Vector3() },
      uCursorOn: { value: 0 },
      uCursorSpd: { value: 0 },
      uMorphVel: { value: 0 }
    }
  });

  const posMat = new THREE.ShaderMaterial({
    vertexShader: SIM_VERT,
    fragmentShader: SIM_POS_FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      ...shared,
      tPos: { value: posA.texture },
      tVel: { value: velB.texture }
    }
  });

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const velScene = new THREE.Scene();
  const velMesh = new THREE.Mesh(quadGeo, velMat);
  velMesh.frustumCulled = false;
  velScene.add(velMesh);

  const posScene = new THREE.Scene();
  const posMesh = new THREE.Mesh(quadGeo, posMat);
  posMesh.frustumCulled = false;
  posScene.add(posMesh);

  // Render geometry: one vertex per texel, carrying its FBO UV in `aSimUv`
  const uvArr = new Float32Array(count * 2);
  const posDummy = new Float32Array(count * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      uvArr[i * 2] = (x + 0.5) / size;
      uvArr[i * 2 + 1] = (y + 0.5) / size;
    }
  }
  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute('position', new THREE.BufferAttribute(posDummy, 3));
  pointsGeo.setAttribute('aSimUv', new THREE.BufferAttribute(uvArr, 2));

  let ping = 0;

  function setTargetData(idx, data) {
    const tex = [tTarget0, tTarget1, tTarget2, tTarget3, tMeta, tTarget4][idx];
    tex.image.data.set(data);
    tex.needsUpdate = true;
  }

  function runPass(renderer, dt, reset = false) {
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    const readPos = ping === 0 ? posA : posB;
    const writePos = ping === 0 ? posB : posA;
    const readVel = ping === 0 ? velA : velB;
    const writeVel = ping === 0 ? velB : velA;

    shared.uDt.value = dt;
    shared.uReset.value = reset ? 1 : 0;

    // 1. Velocity pass
    velMat.uniforms.tPos.value = readPos.texture;
    velMat.uniforms.tVel.value = readVel.texture;
    renderer.setRenderTarget(writeVel);
    renderer.render(velScene, orthoCam);

    // 2. Position pass (reads freshly integrated velocity)
    posMat.uniforms.tPos.value = readPos.texture;
    posMat.uniforms.tVel.value = writeVel.texture;
    renderer.setRenderTarget(writePos);
    renderer.render(posScene, orthoCam);

    ping = 1 - ping;

    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
  }

  function step(renderer, dt, reset = false) {
    if (reset) {
      // Write clean initial state into BOTH ping-pong pairs so either read is valid
      runPass(renderer, 0, true);
      runPass(renderer, 0, true);
      return;
    }
    // 2 sub-steps on large dt (> 25ms) keeps spring & curl noise rock-steady at 30–144 Hz
    const clamped = Math.min(Math.max(dt, 0.001), 0.05);
    const steps = clamped > 0.022 ? 2 : 1;
    const h = clamped / steps;
    for (let s = 0; s < steps; s++) {
      runPass(renderer, h, false);
    }
  }

  return {
    size,
    count,
    pointsGeo,
    shared,
    velUniforms: velMat.uniforms,
    textures: { tTarget0, tTarget1, tTarget2, tTarget3, tTarget4, tMeta },
    get posTex() {
      return (ping === 0 ? posA : posB).texture;
    },
    get velTex() {
      return (ping === 0 ? velA : velB).texture;
    },
    setTargetData,
    step,
    dispose() {
      posA.dispose();
      posB.dispose();
      velA.dispose();
      velB.dispose();
      tTarget0.dispose();
      tTarget1.dispose();
      tTarget2.dispose();
      tTarget3.dispose();
      tTarget4.dispose();
      tMeta.dispose();
      velMat.dispose();
      posMat.dispose();
      quadGeo.dispose();
      pointsGeo.dispose();
    }
  };
}
