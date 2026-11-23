import {
  WALL_Z, WALL_LEFT, WALL_TOP, PITCH_X, PITCH_Y, HOLE_CELL, GLSL_TILE_STATE, GLSL_CRACKS, GROUT_LIGHT
} from '../world/calibration';
import { BEATS, FRONT_MIN, FRONT_MAX, FRONT_POW, HERO_TR_END_VH } from '../story.config';

// =====================================================================
// THE HERO, AS PART OF THE ONE STORY CANVAS
// There is no separate hero canvas any more. The room is always the 3D room (from the
// start camera it IS the photo), and the hero's 2D layers (Multi from the stacked video,
// the YOUNG MULTI type, the mouse smear, the dust) are composited in the same pass that
// dithers the whole story. One renderer, one dither, one glow: nothing to hand over.
// =====================================================================

const fx = (v) => v.toFixed(4);

export const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const GLSL_COMMON = /* glsl */ `
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

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float disintegrationField(vec2 uv) {
    float n = valueNoise(uv * 11.0) * 0.55 + valueNoise(uv * 27.0) * 0.30 + valueNoise(uv * 55.0) * 0.15;
    float edgeBias = length((uv - vec2(0.5, 0.45)) * vec2(1.15, 0.9)) * 0.42;
    return clamp((1.0 - uv.y) * 0.35 + n * 0.52 + (0.45 - edgeBias) * 0.25, 0.0, 1.0);
  }

  // CSS-like "cover" crop of the 3:2 media (photo / one half of the stacked video)
  vec2 coverScale(vec2 canvasSize, vec2 mediaSize) {
    float canvasAspect = canvasSize.x / max(canvasSize.y, 1.0);
    float mediaAspect = mediaSize.x / max(mediaSize.y, 1.0);
    vec2 scale = vec2(1.0);
    if (canvasAspect > mediaAspect) {
      scale.y = mediaAspect / canvasAspect;
    } else {
      scale.x = canvasAspect / mediaAspect;
    }
    return scale;
  }

  vec2 coverUv(vec2 uv, vec2 canvasSize, vec2 mediaSize) {
    return (uv - 0.5) * coverScale(canvasSize, mediaSize) + 0.5;
  }

  // stacked video: RGB in the top half, Multi's matte in the bottom half
  vec2 toRgbUv(vec2 uv) {
    vec2 c = clamp(uv, vec2(0.001), vec2(0.999));
    return vec2(c.x, 0.504 + c.y * 0.492);
  }

  vec2 toMatteUv(vec2 uv) {
    vec2 c = clamp(uv, vec2(0.001), vec2(0.999));
    return vec2(c.x, 0.004 + c.y * 0.492);
  }
`;

// ---------------------------------------------------------------------
// PASS 1: ping-pong fluid velocity / smudge trail under the mouse (256x256)
// ---------------------------------------------------------------------
export const TRAIL_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D u_prevTrail;
  uniform vec2 u_resolution;
  uniform vec2 u_mouse;
  uniform vec2 u_prevMouse;
  uniform vec2 u_velocity;
  uniform float u_aspect;
  uniform float u_active;

  const float ZERO = 128.0 / 255.0;

  float distToSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float denom = max(dot(ba, ba), 0.00001);
    float h = clamp(dot(pa, ba) / denom, 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    vec2 texel = 1.0 / u_resolution;

    vec4 center = texture2D(u_prevTrail, vUv);
    vec2 prevVel = (center.rg - ZERO) * 2.0;
    vec2 advectedUv = clamp(vUv - prevVel * 0.018, vec2(0.002), vec2(0.998));

    vec4 s0 = texture2D(u_prevTrail, advectedUv);
    vec4 s1 = texture2D(u_prevTrail, advectedUv + vec2(texel.x, 0.0));
    vec4 s2 = texture2D(u_prevTrail, advectedUv - vec2(texel.x, 0.0));
    vec4 s3 = texture2D(u_prevTrail, advectedUv + vec2(0.0, texel.y));
    vec4 s4 = texture2D(u_prevTrail, advectedUv - vec2(0.0, texel.y));

    vec4 diffused = s0 * 0.56 + (s1 + s2 + s3 + s4) * 0.11;

    vec2 vel = (diffused.rg - ZERO) * 0.925;
    float energy = diffused.b * 0.962;

    if (energy < 0.004) {
      energy = 0.0;
      vel = vec2(0.0);
    }

    if (u_active > 0.5) {
      vec2 p = vec2(vUv.x * u_aspect, vUv.y);
      vec2 a = vec2(u_prevMouse.x * u_aspect, u_prevMouse.y);
      vec2 b = vec2(u_mouse.x * u_aspect, u_mouse.y);

      float d = distToSegment(p, a, b);
      float speed = clamp(length(u_velocity) * 28.0, 0.18, 1.6);
      float radius = mix(0.115, 0.185, clamp(speed * 0.55, 0.0, 1.0));
      float brush = exp(-(d * d) / (radius * radius));

      vel = clamp(vel + u_velocity * brush * 5.2, vec2(-0.48), vec2(0.48));
      energy = clamp(energy + brush * (0.52 + 0.38 * speed), 0.0, 1.0);
    }

    gl_FragColor = vec4(vel + ZERO, energy, 1.0);
  }
`;

// ---------------------------------------------------------------------
// PASS 4 (final): the whole frame. Room (3D render) -> Bayer dither, then the hero
// layers on top while they exist, then glow / scanlines / grain / vignette for all.
// ---------------------------------------------------------------------
export const COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tDust;
  uniform sampler2D tTrail;
  uniform sampler2D tVideo;
  uniform sampler2D tText;
  uniform vec2 uRes;
  uniform vec2 uMediaRes;   // stacked video size (w, 2h)
  uniform vec2 uParallax;
  uniform float uDpr;
  uniform float uTime;
  uniform float uBlack;
  uniform float uGlowTaps;
  uniform float uTr;        // hero timeline, 0 -> 0.5 (S1)
  uniform float uHero;      // 1 while the hero layers exist
  uniform float uTrailAmt;
  uniform float uTextReveal;
  uniform float uTextFront; // 0 = type behind Multi (landscape), 1 = in front (portrait / phones)
  uniform float uDustOn;
  uniform float uClean;     // 0 = dithered story look, 1 = clean image (album ring)
  varying vec2 vUv;

  const float ZERO = 128.0 / 255.0;

  ${GLSL_COMMON}

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

  // The room at a screen position: the live video plate while Multi is still standing
  // (the very first scroll), the 3D room from then on. Same camera, same frame.
  vec3 room(vec2 uv, float emptyMix, vec2 halfRes) {
    vec3 scene = ldr(uv);
    if (emptyMix > 0.999) return scene;
    vec3 live = texture2D(tVideo, toRgbUv(coverUv(uv, uRes, halfRes))).rgb;
    return mix(live, scene, emptyMix);
  }

  void main() {
    float cellPx = max(2.2, 2.7 * uDpr);
    vec2 cellCoord = floor(gl_FragCoord.xy / cellPx);
    vec2 snappedUv = (cellCoord + 0.5) * cellPx / uRes;
    vec4 centerTex = texture2D(tScene, vUv);
    float aspect = uRes.x / max(uRes.y, 1.0);
    vec2 halfRes = vec2(uMediaRes.x, uMediaRes.y * 0.5);
    // media-UV offsets (as authored for the photo) -> screen-UV offsets
    vec2 toScreen = 1.0 / coverScale(uRes, halfRes);
    float tr = clamp(uTr, 0.0, 1.0);

    // --- mouse trail ---
    vec2 vel = vec2(0.0);
    float energy = 0.0;
    if (uHero > 0.5) {
      vec4 trail = texture2D(tTrail, vUv);
      vel = (trail.rg - ZERO) * 2.0 * uTrailAmt;
      energy = clamp(trail.b, 0.0, 1.0) * uTrailAmt;
    }
    vec2 smudgeOffset = -vel * (0.11 * energy + 0.04 * energy * energy);
    float revealMask = smoothstep(0.06, 0.58, energy);

    float emptyMix = uHero > 0.5 ? smoothstep(0.005, 0.08, tr) : 1.0;
    float parallaxDamp = (1.0 - smoothstep(0.04, 0.38, tr)) * uHero;
    vec2 roomParallax = uParallax * 0.008 * parallaxDamp;
    vec2 textParallax = uParallax * 0.022 * parallaxDamp;
    vec2 fgParallax   = -uParallax * 0.012 * parallaxDamp;

    // === LAYER 1: THE ROOM (always the same pipeline, start to end) ===
    vec2 dof = vec2(0.0026, 0.0026 * aspect) * toScreen;
    vec2 bgUv = snappedUv + roomParallax + smudgeOffset * 0.45;
    vec3 soft =
      room(bgUv, emptyMix, halfRes) * 0.36 +
      room(bgUv + vec2(dof.x, dof.y), emptyMix, halfRes) * 0.16 +
      room(bgUv + vec2(-dof.x, dof.y), emptyMix, halfRes) * 0.16 +
      room(bgUv + vec2(dof.x, -dof.y), emptyMix, halfRes) * 0.16 +
      room(bgUv + vec2(-dof.x, -dof.y), emptyMix, halfRes) * 0.16;
    vec3 dithered = applyDigitalDither(soft, cellCoord, 0.0);
    // alpha < 1 marks pixels that must show raw colour (the hovered cover)
    vec3 raw = min(centerTex.rgb, vec3(1.0));
    vec3 col = mix(raw, dithered, step(0.5, centerTex.a) * (1.0 - uClean));

    // mouse smear reveals the raw, chromatic room under the cursor
    if (revealMask > 0.001) {
      vec2 rawUv = vUv + roomParallax + smudgeOffset;
      vec2 dir = vel * 0.08 * energy * toScreen;
      vec2 chroma = (length(vel) > 0.001 ? normalize(vel) : vec2(1.0, 0.0)) * (0.010 * energy) * toScreen;
      vec3 smeared = vec3(0.0);
      for (int i = -2; i <= 2; i++) {
        vec2 tap = rawUv + dir * float(i) * 0.45;
        smeared += vec3(
          room(tap + chroma, emptyMix, halfRes).r,
          room(tap, emptyMix, halfRes).g,
          room(tap - chroma, emptyMix, halfRes).b
        );
      }
      smeared = pow(max(smeared / 5.0, vec3(0.0)), vec3(0.92)) * 1.12;
      col = mix(col, smeared, revealMask);
    }

    // === LAYER 2: GIANT WALL-TO-WALL TYPOGRAPHY ===
    float textMask = 0.0;
    float textShadow = 0.0;
    vec3 textCol = vec3(0.0);
    float textBehind = 1.0 - uTextFront;
    float textVis = uHero * uTextReveal * (1.0 - smoothstep(0.03, 0.30, tr));
    if (textVis > 0.001) {
      vec2 textUv = clamp(vUv + textParallax + smudgeOffset * 0.9, vec2(0.0), vec2(1.0));
      vec2 dofText = vec2(0.0018, 0.0018 * aspect);
      vec2 textChroma = (length(vel) > 0.001 ? normalize(vel) : vec2(1.0, 0.0)) * (0.009 * energy);
      float tSoft = (
        texture2D(tText, textUv).a * 0.40 +
        texture2D(tText, clamp(textUv + vec2(dofText.x, dofText.y), vec2(0.0), vec2(1.0))).a * 0.15 +
        texture2D(tText, clamp(textUv + vec2(-dofText.x, dofText.y), vec2(0.0), vec2(1.0))).a * 0.15 +
        texture2D(tText, clamp(textUv + vec2(dofText.x, -dofText.y), vec2(0.0), vec2(1.0))).a * 0.15 +
        texture2D(tText, clamp(textUv + vec2(-dofText.x, -dofText.y), vec2(0.0), vec2(1.0))).a * 0.15
      );
      float tR = texture2D(tText, clamp(textUv + textChroma, vec2(0.0), vec2(1.0))).a;
      float tB = texture2D(tText, clamp(textUv - textChroma, vec2(0.0), vec2(1.0))).a;
      textMask = max(tSoft, max(tR, tB) * 0.65) * textVis;

      float ditherBit = step(bayer4x4(cellCoord), 0.78);
      vec3 textDigital = vec3(0.86, 0.92, 0.95) * mix(0.78, 1.0, ditherBit);
      vec3 textLiquid = vec3(tR * 1.05, tSoft * 0.98, tB * 1.08);
      textCol = mix(textDigital, textLiquid, revealMask);
      textShadow = texture2D(tText, clamp(textUv + vec2(-0.005, 0.008), vec2(0.0), vec2(1.0))).a * textVis * 0.42;

      col *= 1.0 - textShadow * textBehind;
      col = mix(col, textCol, textMask * 0.94 * textBehind);
    }

    // === LAYER 3: CUTOUT YOUNG MULTI -> SHATTERS INTO THE DUST, NEVER REAPPEARS ===
    float burnGlow = 0.0;
    if (uHero > 0.5 && tr <= 0.44) {
      float fgZoom = 1.0 + smoothstep(0.0, 0.45, tr) * 0.12;
      vec2 fgUv = (vUv - 0.5) / fgZoom + 0.5;
      vec2 fgSnappedUv = (snappedUv - 0.5) / fgZoom + 0.5;
      vec2 fgRawUv = coverUv(fgUv + fgParallax + smudgeOffset * 0.72, uRes, halfRes);
      vec2 fgDitherUv = coverUv(fgSnappedUv + fgParallax + smudgeOffset * 0.35, uRes, halfRes);

      float matteRaw = texture2D(tVideo, toMatteUv(fgRawUv)).r;
      float fgAlpha = smoothstep(0.14, 0.72, matteRaw);

      float disProg = clamp((tr - 0.01) / 0.40, 0.0, 1.0);
      if (disProg > 0.001) {
        float disField = disintegrationField(fgUv);
        float cutoff = disProg * 1.18;
        float alive = smoothstep(cutoff - 0.04, cutoff + 0.03, disField);
        burnGlow = smoothstep(0.11, 0.0, abs(disField - cutoff)) * fgAlpha * (1.0 - smoothstep(0.88, 1.0, disProg));
        fgAlpha *= alive;
      }

      if (fgAlpha > 0.001) {
        vec2 sharpStep = vec2(1.0 / uMediaRes.x, 1.0 / (uMediaRes.y * 0.5));
        vec3 fgCenter = texture2D(tVideo, toRgbUv(fgDitherUv)).rgb;
        vec3 fgBlur = (
          texture2D(tVideo, toRgbUv(fgDitherUv + vec2(sharpStep.x, 0.0))).rgb +
          texture2D(tVideo, toRgbUv(fgDitherUv - vec2(sharpStep.x, 0.0))).rgb +
          texture2D(tVideo, toRgbUv(fgDitherUv + vec2(0.0, sharpStep.y))).rgb +
          texture2D(tVideo, toRgbUv(fgDitherUv - vec2(0.0, sharpStep.y))).rgb
        ) * 0.25;
        vec3 fgCrisp = clamp(fgCenter + (fgCenter - fgBlur) * 0.55, vec3(0.0), vec3(1.0));
        vec3 fgDither = applyDigitalDither(fgCrisp, cellCoord, 0.03);

        vec3 fgSmeared = fgDither;
        if (revealMask > 0.001) {
          vec2 dir = vel * 0.065 * energy;
          vec2 chroma = (length(vel) > 0.001 ? normalize(vel) : vec2(1.0, 0.0)) * (0.008 * energy);
          fgSmeared = vec3(0.0);
          for (int i = -2; i <= 2; i++) {
            vec2 tap = fgRawUv + dir * float(i) * 0.45;
            fgSmeared += vec3(
              texture2D(tVideo, toRgbUv(tap + chroma)).r,
              texture2D(tVideo, toRgbUv(tap)).g,
              texture2D(tVideo, toRgbUv(tap - chroma)).b
            );
          }
          fgSmeared = pow(max(fgSmeared / 5.0, vec3(0.0)), vec3(0.92)) * 1.15;
        }

        vec3 multiCol = mix(fgDither, fgSmeared, revealMask);
        float silhouetteEdge = fgAlpha * (1.0 - fgAlpha) * 4.0;
        multiCol += vec3(0.28, 0.45, 0.52) * silhouetteEdge * textMask * 0.35 * textBehind;
        col = mix(col, multiCol, fgAlpha);
      }
    }
    col += vec3(0.68, 0.92, 1.0) * burnGlow * 1.15;

    // Portrait: typography composited ON TOP of Multi
    if (uTextFront > 0.5 && textVis > 0.001) {
      col *= (1.0 - textShadow * 0.9);
      col = mix(col, textCol, textMask * 0.96);
    }

    // === GLOW: HDR overflow (grout light, settled dust, light through the hole) ===
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
    col += over * vec3(0.72, 0.92, 1.0) * 0.55;

    // === FILM: scanlines, cursor rim, grain, vignette ===
    float scan = 0.97 + 0.03 * sin(gl_FragCoord.y * 1.4);
    float rim = smoothstep(0.04, 0.20, energy) * (1.0 - smoothstep(0.22, 0.55, energy));
    col = col * scan + vec3(0.32, 0.52, 0.58) * rim * 0.20;
    float grain = (hash(gl_FragCoord.xy + fract(uTime * 31.7)) - 0.5) * 0.022;
    float vig = 1.0 - smoothstep(0.45, 1.28, length((vUv - 0.5) * vec2(1.15, 1.05)));
    col = col * mix(0.76, 1.0, vig) + grain;
    col *= 1.0 - uBlack;

    // flying dust sits on top of everything (premultiplied)
    if (uDustOn > 0.5) {
      vec4 dust = texture2D(tDust, vUv);
      col = col * (1.0 - dust.a) + dust.rgb;
    }

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

// ---------------------------------------------------------------------
// THE DUST: 16,640 points. Multi shatters into dots that swirl in perspective, then
// are drawn into the grout the wall lights at the hand-off (handoffLit) on the REAL 3D wall: the
// destination is a world point projected by the story camera.
// Drawn twice from the same buffer:
//  uMode 0 (overlay): the flying dots, raw colour, on top of Multi and the type
//  uMode 1 (wall):    the settled dots, rendered INTO the 3D scene with the same HDR
//                     light as the grout glow, so they get the same dither and bloom.
//                     While the dust hands over to the wall's own grout light (uHandoff)
//                     both are the same pixels through the same pipeline.
// ---------------------------------------------------------------------
export const DUST_VERT = /* glsl */ `
  uniform sampler2D tVideo;
  uniform vec2 uRes;
  uniform vec2 uMediaRes;
  uniform float uTr;
  uniform float uTime;
  uniform float uDpr;
  uniform float uMode;

  varying vec3 vColor;
  varying float vAlpha;

  ${GLSL_COMMON}
  ${GLSL_TILE_STATE}
  ${GLSL_CRACKS}

  void hide() {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    vColor = vec3(0.0);
  }

  void main() {
    vec2 gridUv = position.xy;
    float index = position.z;

    float tr = clamp(uTr, 0.0, 1.0);
    float disProg = clamp((tr - 0.01) / 0.40, 0.0, 1.0);

    vec2 halfRes = vec2(uMediaRes.x, uMediaRes.y * 0.5);
    float fgZoom = 1.0 + smoothstep(0.0, 0.45, tr) * 0.12;
    vec2 fgUv = (gridUv - 0.5) / fgZoom + 0.5;
    vec2 mediaUv = clamp(coverUv(fgUv, uRes, halfRes), vec2(0.001), vec2(0.999));

    float matte = texture2D(tVideo, vec2(mediaUv.x, 0.004 + mediaUv.y * 0.492)).r;
    float field = disintegrationField(fgUv);
    float cutoff = disProg * 1.18;
    float age = max(0.0, (cutoff - field) * 1.65);

    if (matte < 0.24 || age <= 0.001 || tr >= 0.5 || disProg <= 0.001) {
      hide();
      return;
    }

    float r1 = hash(gridUv * 173.1);
    float r2 = hash(gridUv * 391.7);
    float r3 = hash(gridUv * 719.3);

    // Phase 1: explosive vortex in perspective space
    float burst = clamp(age, 0.0, 1.0);
    float angle = (tr * 4.8 + r3 * 6.28318) + gridUv.y * 4.6 + uTime * 0.55;
    vec2 outward = normalize(gridUv - vec2(0.5, 0.44) + vec2((r1 - 0.5) * 0.42, (r2 - 0.5) * 0.42));
    vec2 xySwirl = gridUv
      + outward * (burst * (0.26 + r3 * 0.38))
      + vec2(cos(angle), sin(angle)) * (0.055 + burst * 0.12);
    float zDepth = sin(clamp(tr * 1.45, 0.0, 1.0) * 3.14159) * (0.45 + r3 * 0.72);

    // Phase 2: drawn into the grout the wall lights up at the hand-off (handoffLit),
    // dense where that grout glows brightest
    vec2 holeCell = vec2(${fx(HOLE_CELL.x)}, ${fx(HOLE_CELL.y)});
    vec2 cell = floor(holeCell);
    for (int k = 0; k < 12; k++) {
      vec2 rr = vec2(
        fract(index * 0.7548776662 + 0.13 + float(k) * 0.3183),
        fract(index * 0.5698402909 + 0.37 + float(k) * 0.5371)
      );
      vec2 c = floor(holeCell + (rr - 0.5) * 13.0);
      float lit = handoffLit(c);
      if (fract(index * 0.3819660113 + float(k) * 0.6180339887) < lit * lit) { cell = c; break; }
    }
    float edgeSel = fract(index * 0.1234567 + 0.71);
    float along = fract(index * 0.4142135 + 0.29);
    vec2 local = edgeSel < 0.25 ? vec2(along, 0.0)
               : edgeSel < 0.5  ? vec2(along, 1.0)
               : edgeSel < 0.75 ? vec2(0.0, along)
               :                  vec2(1.0, along);
    vec3 wDest = vec3(
      ${fx(WALL_LEFT)} + (cell.x + local.x) * ${fx(PITCH_X)},
      ${fx(WALL_TOP)} - (cell.y + local.y) * ${fx(PITCH_Y)},
      ${fx(WALL_Z + 0.002)}
    );
    vec4 dc = projectionMatrix * viewMatrix * vec4(wDest, 1.0);
    vec2 destUv = dc.xy / max(dc.w, 0.0001) * 0.5 + 0.5;

    // the dot lands just as its tile's grout lights up: invert the crack-front curve
    // (story.config crackFront) for this tile, so dust and light arrive together
    float tArr = pow(clamp((crackDist(cell) - 0.2 - ${fx(FRONT_MIN)}) / ${fx(FRONT_MAX - FRONT_MIN)}, 0.0, 1.0), ${fx(1 / FRONT_POW)});
    float vhArr = min(${fx(BEATS.charge[0])} + ${fx(BEATS.charge[1] - BEATS.charge[0])} * tArr, 88.0);
    float trArr = vhArr / ${fx(HERO_TR_END_VH)} * 0.5;
    float flight = 0.2 + r3 * 0.05;
    float convergeRaw = clamp((tr - (trArr - flight)) / flight, 0.0, 1.0);
    float converge = convergeRaw * convergeRaw * (3.0 - 2.0 * convergeRaw);

    float persp = 1.0 / max(0.32, 1.0 - zDepth * 0.46 * (1.0 - converge));
    vec2 projectedSwirl = (xySwirl - 0.5) * persp + 0.5;
    float spiral = (1.0 - converge) * converge * 2.4 * (r1 - 0.5);
    vec2 toDest = destUv - projectedSwirl;
    vec2 swirlPerp = vec2(-toDest.y, toDest.x) * spiral;
    vec2 finalUv = mix(projectedSwirl, destUv, converge) + swirlPerp;

    float fadeIn = smoothstep(0.0, 0.07, age);
    float alpha = fadeIn * smoothstep(0.24, 0.60, matte);
    float settle = smoothstep(0.55, 1.0, converge);

    if (uMode < 0.5) {
      vec3 multiRgb = texture2D(tVideo, vec2(mediaUv.x, 0.504 + mediaUv.y * 0.492)).rgb;
      float birthFlash = exp(-age * 6.5);
      vec3 multiDotCol = multiRgb * 1.15 + vec3(0.10, 0.22, 0.26);
      vec3 groutGlow = vec3(0.86, 0.98, 1.0);
      vColor = mix(multiDotCol, groutGlow, converge);
      vColor = mix(vColor, vec3(0.82, 0.92, 0.95), birthFlash * 0.45);
      vAlpha = alpha * (1.0 - settle);
    } else {
      // == the wall's grout light: photo grout + GROUT_LIGHT (Room.jsx / TileWall.jsx)
      vColor = vec3(0.12, 0.15, 0.17) + ${GROUT_LIGHT};
      // each dot soaks into the grout a moment after it lands, while that grout lights up
      float soak = smoothstep(trArr + 0.004, trArr + 0.03 + r2 * 0.015, tr);
      vAlpha = alpha * settle * (1.0 - soak);
    }
    if (vAlpha < 0.004) {
      hide();
      return;
    }

    gl_Position = vec4(finalUv * 2.0 - 1.0, 0.0, 1.0);
    float cellPx = max(2.2, 2.7 * uDpr);
    float flightSize = (2.1 + r3 * 2.0) * persp * uDpr;
    gl_PointSize = clamp(mix(flightSize, cellPx * 1.05, converge), 1.4, 10.0);
  }
`;

export const DUST_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.004) discard;
    vec2 c = abs(gl_PointCoord - 0.5);
    float edge = max(c.x, c.y);
    float mask = 1.0 - smoothstep(0.36, 0.5, edge);
    gl_FragColor = vec4(vColor, vAlpha * mask);
  }
`;
