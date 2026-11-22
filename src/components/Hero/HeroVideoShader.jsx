import React, { useEffect, useRef, useState } from 'react';

const QUAD_VERT = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// PASS 1: Persistent Ping-Pong FBO Fluid Velocity & Smudge Trail
const TRAIL_FRAG = `
  precision highp float;

  varying vec2 v_uv;
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

    vec4 center = texture2D(u_prevTrail, v_uv);
    vec2 prevVel = (center.rg - ZERO) * 2.0;
    vec2 advectedUv = clamp(v_uv - prevVel * 0.018, vec2(0.002), vec2(0.998));

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
      vec2 p = vec2(v_uv.x * u_aspect, v_uv.y);
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

// PASS 2: 3-Layer Depth Room (with clean Empty Room Plate!) + Pixel-Locked Tile Morph -> ZA KAŻDYM RA2EM
const DISPLAY_FRAG = `
  precision highp float;

  varying vec2 v_uv;
  uniform sampler2D u_video;
  uniform sampler2D u_trail;
  uniform sampler2D u_text;
  uniform sampler2D u_release;
  uniform sampler2D u_emptyRoom;
  uniform vec2 u_resolution;
  uniform vec2 u_videoRes;
  uniform vec2 u_parallax;
  uniform vec2 u_targetHalf;
  uniform vec2 u_targetCenter;
  uniform float u_time;
  uniform float u_dpr;
  uniform float u_textReveal;
  uniform float u_transition;

  const float ZERO = 128.0 / 255.0;

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

  vec2 coverUv(vec2 uv, vec2 canvasSize, vec2 mediaSize) {
    float canvasAspect = canvasSize.x / max(canvasSize.y, 1.0);
    float mediaAspect = mediaSize.x / max(mediaSize.y, 1.0);
    vec2 scale = vec2(1.0);
    if (canvasAspect > mediaAspect) {
      scale.y = mediaAspect / canvasAspect;
    } else {
      scale.x = canvasAspect / mediaAspect;
    }
    return (uv - 0.5) * scale + 0.5;
  }

  vec2 toRgbUv(vec2 uv) {
    vec2 c = clamp(uv, vec2(0.001), vec2(0.999));
    return vec2(c.x, 0.504 + c.y * 0.492);
  }

  vec2 toMatteUv(vec2 uv) {
    vec2 c = clamp(uv, vec2(0.001), vec2(0.999));
    return vec2(c.x, 0.004 + c.y * 0.492);
  }

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

  // Sample background: at rest uses live video, but as soon as transition starts (or where Multi stands),
  // seamlessly switches to the 100% CLEAN EMPTY TILED ROOM so Multi NEVER reappears behind his dust!
  vec3 sampleCleanRoom(vec2 mediaUv, float emptyMix) {
    vec2 c = clamp(mediaUv, vec2(0.001), vec2(0.999));
    vec3 liveBg = texture2D(u_video, toRgbUv(c)).rgb;
    vec3 emptyBg = texture2D(u_emptyRoom, c).rgb;
    return mix(liveBg, emptyBg, emptyMix);
  }

  void main() {
    vec4 trail = texture2D(u_trail, v_uv);
    vec2 vel = (trail.rg - ZERO) * 2.0;
    float energy = clamp(trail.b, 0.0, 1.0);
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);

    vec2 smudgeOffset = -vel * (0.11 * energy + 0.04 * energy * energy);
    vec2 halfVideoRes = vec2(u_videoRes.x, u_videoRes.y * 0.5);

    // === TIMELINE ===
    // 0.00 -> 0.42 : Multi shatters into 12,288 3D dust particles, leaving the REAL EMPTY TILED ROOM!
    // 0.36 -> 0.88 : Dust swirls in 3D space & re-assembles into the ZA KAŻDYM RA2EM screening frame
    //                while the 3D empty room pushes in seamlessly to match NewSong's backdrop 1:1!
    float tr = clamp(u_transition, 0.0, 1.0);
    float emptyMix = smoothstep(0.005, 0.08, tr);

    float zoomT = clamp((tr - 0.34) / 0.56, 0.0, 1.0);
    float zoomEase = zoomT * zoomT * (3.0 - 2.0 * zoomT);

    // Gentle 3D camera push-in toward the back wall (1.0 -> 1.48x matches NewSong's 3D room plate!)
    float roomZoom = mix(1.0, 1.48, zoomEase);
    float fgZoom = 1.0 + smoothstep(0.0, 0.45, tr) * 0.12;

    vec2 roomUv = (v_uv - 0.5) / roomZoom + 0.5;
    vec2 fgUv   = (v_uv - 0.5) / fgZoom + 0.5;

    float parallaxDamp = 1.0 - smoothstep(0.04, 0.38, tr);
    vec2 roomParallax = u_parallax * 0.008 * parallaxDamp;
    vec2 textParallax = u_parallax * 0.022 * parallaxDamp;
    vec2 fgParallax   = -u_parallax * 0.012 * parallaxDamp;

    float cellPx = max(2.2, 2.7 * u_dpr);
    vec2 cellCoord = floor(gl_FragCoord.xy / cellPx);
    vec2 snappedUv = (cellCoord + 0.5) * cellPx / u_resolution;
    vec2 roomSnappedUv = (snappedUv - 0.5) / roomZoom + 0.5;
    vec2 fgSnappedUv   = (snappedUv - 0.5) / fgZoom + 0.5;

    // === LAYER 1: TILED ROOM BACKGROUND (switches to 100% empty tiled room on scroll!) ===
    vec2 dofBg = vec2(0.0026, 0.0026 * aspect);
    vec2 bgDitherUv = coverUv(roomSnappedUv + roomParallax + smudgeOffset * 0.45, u_resolution, halfVideoRes);
    vec3 bgRgbSoft = (
      sampleCleanRoom(bgDitherUv, emptyMix) * 0.36 +
      sampleCleanRoom(bgDitherUv + vec2(dofBg.x, dofBg.y), emptyMix) * 0.16 +
      sampleCleanRoom(bgDitherUv + vec2(-dofBg.x, dofBg.y), emptyMix) * 0.16 +
      sampleCleanRoom(bgDitherUv + vec2(dofBg.x, -dofBg.y), emptyMix) * 0.16 +
      sampleCleanRoom(bgDitherUv + vec2(-dofBg.x, -dofBg.y), emptyMix) * 0.16
    );
    vec3 bgDither = applyDigitalDither(bgRgbSoft, cellCoord, 0.0);

    vec2 bgRawUv = coverUv(roomUv + roomParallax + smudgeOffset, u_resolution, halfVideoRes);
    vec3 bgSmeared = vec3(0.0);
    if (energy > 0.01) {
      vec2 dir = vel * 0.08 * energy;
      vec2 chroma = (length(vel) > 0.001 ? normalize(vel) : vec2(1.0, 0.0)) * (0.010 * energy);
      for (int i = -2; i <= 2; i++) {
        float fi = float(i) * 0.45;
        vec2 tap = bgRawUv + dir * fi;
        float r = sampleCleanRoom(tap + chroma, emptyMix).r;
        float g = sampleCleanRoom(tap, emptyMix).g;
        float b = sampleCleanRoom(tap - chroma, emptyMix).b;
        bgSmeared += vec3(r, g, b);
      }
      bgSmeared = pow(max(bgSmeared / 5.0, vec3(0.0)), vec3(0.92)) * 1.12;
    } else {
      bgSmeared = (
        sampleCleanRoom(bgRawUv, emptyMix) * 0.40 +
        sampleCleanRoom(bgRawUv + vec2(dofBg.x, 0.0), emptyMix) * 0.15 +
        sampleCleanRoom(bgRawUv - vec2(dofBg.x, 0.0), emptyMix) * 0.15 +
        sampleCleanRoom(bgRawUv + vec2(0.0, dofBg.y), emptyMix) * 0.15 +
        sampleCleanRoom(bgRawUv - vec2(0.0, dofBg.y), emptyMix) * 0.15
      );
    }

    float revealMask = smoothstep(0.06, 0.58, energy);
    vec3 roomCol = mix(bgDither, bgSmeared, revealMask);

    // === LAYER 1B: BORDERLESS DOTTED ZA KAŻDYM RA2EM MONOLITH ASSEMBLED BY 3D DOTS ===
    // Zero darkening of the tiled room! Zero neon borders!
    // Dots physically assemble the dotted thumbnail first (0.36 -> 0.86); solid Bayer backdrop
    // fills in cleanly right beneath the locked dots (0.72 -> 0.90), then hands off to NewSong (> 1.0).
    float cardFormT = smoothstep(0.40, 0.84, tr);
    float handoffOut = 1.0 - smoothstep(0.99, 1.05, u_transition);
    if (cardFormT > 0.001 && handoffOut > 0.001) {
      float easeForm = cardFormT * cardFormT * (3.0 - 2.0 * cardFormT);
      float frameScale = mix(0.52, 1.0, easeForm);
      vec2 curHalf = u_targetHalf * frameScale;
      vec2 cardLocal = (v_uv - u_targetCenter) / max(curHalf, vec2(0.001));
      vec2 cardUv = cardLocal * 0.5 + 0.5;

      // Soft realistic floating drop-shadow behind the monolith on the bright tiled wall
      vec2 shadowOffset = vec2(0.0, -0.022 * easeForm);
      vec2 qs = abs(v_uv - (u_targetCenter + shadowOffset)) - curHalf * 1.01;
      float shadowDist = length(max(qs, 0.0)) + min(max(qs.x, qs.y), 0.0);
      float softShadow = exp(-max(shadowDist, 0.0) * 15.0) * smoothstep(0.62, 0.86, tr) * 0.58 * handoffOut;
      roomCol *= (1.0 - softShadow);

      if (cardUv.x >= 0.0 && cardUv.x <= 1.0 && cardUv.y >= 0.0 && cardUv.y <= 1.0) {
        // Sample on the exact Bayer cell grid so the dots match ReleaseDitherCanvas 1:1
        vec2 cardCellUv = clamp((snappedUv - u_targetCenter) / max(curHalf, vec2(0.001)) * 0.5 + 0.5, vec2(0.001), vec2(0.999));
        vec3 relRaw = texture2D(u_release, cardCellUv).rgb;
        float relLuma = smoothstep(0.05, 0.90, dot(relRaw, vec3(0.299, 0.587, 0.114)));
        float th = bayer4x4(cellCoord) - 0.5;
        float qRel = floor(clamp(relLuma * 3.0 + th * 0.85, 0.0, 3.0)) / 3.0;
        vec3 relDither = qRel < 0.5
          ? mix(vec3(0.032, 0.042, 0.050), vec3(0.165, 0.285, 0.325), qRel * 2.0)
          : mix(vec3(0.165, 0.285, 0.325), vec3(0.80, 0.88, 0.91), (qRel - 0.5) * 2.0);

        // Wait until the swirling 3D dots have formed the dotted thumbnail, then lock in 100% solid before NewSong handoff
        float condense = smoothstep(0.62, 0.84, tr);
        float noiseReveal = disintegrationField(cardUv);
        float pixelSolid = smoothstep(noiseReveal - 0.16, noiseReveal + 0.08, condense * 1.24);

        roomCol = mix(roomCol, relDither, pixelSolid * handoffOut);
      }
    }

    // === LAYER 2: GIANT WALL-TO-WALL TYPOGRAPHY SANDWICHED BEHIND MULTI ===
    float textVis = u_textReveal * (1.0 - smoothstep(0.03, 0.30, tr));
    vec2 textUv = clamp(roomUv + textParallax + smudgeOffset * 0.9, vec2(0.0), vec2(1.0));
    vec2 dofText = vec2(0.0018, 0.0018 * aspect);
    vec2 textChroma = (length(vel) > 0.001 ? normalize(vel) : vec2(1.0, 0.0)) * (0.009 * energy);

    float tSoft = (
      texture2D(u_text, textUv).a * 0.40 +
      texture2D(u_text, clamp(textUv + vec2(dofText.x, dofText.y), vec2(0.0), vec2(1.0))).a * 0.15 +
      texture2D(u_text, clamp(textUv + vec2(-dofText.x, dofText.y), vec2(0.0), vec2(1.0))).a * 0.15 +
      texture2D(u_text, clamp(textUv + vec2(dofText.x, -dofText.y), vec2(0.0), vec2(1.0))).a * 0.15 +
      texture2D(u_text, clamp(textUv + vec2(-dofText.x, -dofText.y), vec2(0.0), vec2(1.0))).a * 0.15
    );
    float tR = texture2D(u_text, clamp(textUv + textChroma, vec2(0.0), vec2(1.0))).a;
    float tB = texture2D(u_text, clamp(textUv - textChroma, vec2(0.0), vec2(1.0))).a;
    float textMask = max(tSoft, max(tR, tB) * 0.65) * textVis;

    float ditherBit = step(bayer4x4(cellCoord), 0.78);
    vec3 textDigital = vec3(0.86, 0.92, 0.95) * mix(0.78, 1.0, ditherBit);
    vec3 textLiquid = vec3(tR * 1.05, tSoft * 0.98, tB * 1.08);
    vec3 textCol = mix(textDigital, textLiquid, revealMask);

    float textShadow = texture2D(u_text, clamp(textUv + vec2(-0.005, 0.008), vec2(0.0), vec2(1.0))).a * textVis * 0.42;
    vec3 behindMulti = roomCol * (1.0 - textShadow);
    behindMulti = mix(behindMulti, textCol, textMask * 0.94);

    // === LAYER 3: CUTOUT YOUNG MULTI -> SHATTERS COMPLETELY & NEVER REAPPEARS ===
    vec2 fgRawUv = coverUv(fgUv + fgParallax + smudgeOffset * 0.72, u_resolution, halfVideoRes);
    vec2 fgDitherUv = coverUv(fgSnappedUv + fgParallax + smudgeOffset * 0.35, u_resolution, halfVideoRes);

    float matteRaw = texture2D(u_video, toMatteUv(fgRawUv)).r;
    float fgAlpha = smoothstep(0.14, 0.72, matteRaw);

    float disProg = clamp((tr - 0.01) / 0.40, 0.0, 1.0);
    float disField = disintegrationField(fgUv);
    float burnGlow = 0.0;

    if (disProg > 0.001) {
      float cutoff = disProg * 1.18;
      float alive = smoothstep(cutoff - 0.04, cutoff + 0.03, disField);
      burnGlow = smoothstep(0.11, 0.0, abs(disField - cutoff)) * fgAlpha * (1.0 - smoothstep(0.88, 1.0, disProg));
      fgAlpha *= alive;
    }
    // Hard-zero Multi once disintegration finishes so he is 100% gone
    if (tr > 0.44) {
      fgAlpha = 0.0;
      burnGlow = 0.0;
    }

    vec3 finalCol = behindMulti;
    if (fgAlpha > 0.001) {
      vec2 sharpStep = vec2(1.0 / u_videoRes.x, 1.0 / (u_videoRes.y * 0.5));
      vec3 fgCenter = texture2D(u_video, toRgbUv(fgDitherUv)).rgb;
      vec3 fgBlur = (
        texture2D(u_video, toRgbUv(fgDitherUv + vec2(sharpStep.x, 0.0))).rgb +
        texture2D(u_video, toRgbUv(fgDitherUv - vec2(sharpStep.x, 0.0))).rgb +
        texture2D(u_video, toRgbUv(fgDitherUv + vec2(0.0, sharpStep.y))).rgb +
        texture2D(u_video, toRgbUv(fgDitherUv - vec2(0.0, sharpStep.y))).rgb
      ) * 0.25;
      vec3 fgCrisp = clamp(fgCenter + (fgCenter - fgBlur) * 0.55, vec3(0.0), vec3(1.0));
      vec3 fgDither = applyDigitalDither(fgCrisp, cellCoord, 0.03);

      vec3 fgSmeared = vec3(0.0);
      if (energy > 0.01) {
        vec2 dir = vel * 0.065 * energy;
        vec2 chroma = (length(vel) > 0.001 ? normalize(vel) : vec2(1.0, 0.0)) * (0.008 * energy);
        for (int i = -2; i <= 2; i++) {
          float fi = float(i) * 0.45;
          vec2 tap = fgRawUv + dir * fi;
          float r = texture2D(u_video, toRgbUv(tap + chroma)).r;
          float g = texture2D(u_video, toRgbUv(tap)).g;
          float b = texture2D(u_video, toRgbUv(tap - chroma)).b;
          fgSmeared += vec3(r, g, b);
        }
        fgSmeared = pow(max(fgSmeared / 5.0, vec3(0.0)), vec3(0.92)) * 1.15;
      } else {
        fgSmeared = texture2D(u_video, toRgbUv(fgRawUv)).rgb;
      }

      vec3 multiCol = mix(fgDither, fgSmeared, revealMask);
      float silhouetteEdge = fgAlpha * (1.0 - fgAlpha) * 4.0;
      multiCol += vec3(0.28, 0.45, 0.52) * silhouetteEdge * textMask * 0.35;
      finalCol = mix(behindMulti, multiCol, fgAlpha);
    }

    finalCol += vec3(0.68, 0.92, 1.0) * burnGlow * 1.15;

    float scan = 0.97 + 0.03 * sin(gl_FragCoord.y * 1.4);
    float rim = smoothstep(0.04, 0.20, energy) * (1.0 - smoothstep(0.22, 0.55, energy));
    finalCol = finalCol * scan + vec3(0.32, 0.52, 0.58) * rim * 0.20;

    float grain = (hash(gl_FragCoord.xy + fract(u_time * 31.7)) - 0.5) * 0.022;
    float vig = 1.0 - smoothstep(0.45, 1.28, length((v_uv - 0.5) * vec2(1.15, 1.05)));
    finalCol = finalCol * mix(0.76, 1.0, vig) + grain;

    gl_FragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
  }
`;

// PASS 3: 16,640-Dot 3D Bayer Matrix Morph System!
// Phase A (0.00 -> 0.44): Multi shatters into crisp Bayer dots swirling in 3D perspective depth
// Phase B (0.36 -> 0.88): Every dot snaps onto the exact uniform Bayer-dithered pixel grid
//                         of the ZA KAŻDYM RA2EM thumbnail, physically assembling the dotted artwork!
const PARTICLE_VERT = `
  precision highp float;

  attribute vec2 a_gridUv;
  attribute float a_index;

  uniform sampler2D u_video;
  uniform sampler2D u_release;
  uniform vec2 u_resolution;
  uniform vec2 u_videoRes;
  uniform vec2 u_targetHalf;
  uniform vec2 u_targetCenter;
  uniform float u_transition;
  uniform float u_time;
  uniform float u_dpr;

  varying vec3 v_color;
  varying float v_alpha;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

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

  vec2 coverUv(vec2 uv, vec2 canvasSize, vec2 mediaSize) {
    float canvasAspect = canvasSize.x / max(canvasSize.y, 1.0);
    float mediaAspect = mediaSize.x / max(mediaSize.y, 1.0);
    vec2 scale = vec2(1.0);
    if (canvasAspect > mediaAspect) {
      scale.y = mediaAspect / canvasAspect;
    } else {
      scale.x = canvasAspect / mediaAspect;
    }
    return (uv - 0.5) * scale + 0.5;
  }

  void main() {
    float tr = clamp(u_transition, 0.0, 1.0);
    float disProg = clamp((tr - 0.01) / 0.40, 0.0, 1.0);

    vec2 halfVideoRes = vec2(u_videoRes.x, u_videoRes.y * 0.5);
    float fgZoom = 1.0 + smoothstep(0.0, 0.45, tr) * 0.12;
    vec2 fgUv = (a_gridUv - 0.5) / fgZoom + 0.5;
    vec2 mediaUv = clamp(coverUv(fgUv, u_resolution, halfVideoRes), vec2(0.001), vec2(0.999));

    float matte = texture2D(u_video, vec2(mediaUv.x, 0.004 + mediaUv.y * 0.492)).r;
    float field = disintegrationField(fgUv);
    float cutoff = disProg * 1.18;
    float age = max(0.0, (cutoff - field) * 1.65);

    if (matte < 0.24 || age <= 0.001 || u_transition >= 1.02 || disProg <= 0.001) {
      gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
      gl_PointSize = 0.0;
      v_alpha = 0.0;
      v_color = vec3(0.0);
      return;
    }

    float r1 = hash(a_gridUv * 173.1);
    float r2 = hash(a_gridUv * 391.7);
    float r3 = hash(a_gridUv * 719.3);

    // Phase 1: 3D explosive vortex in perspective space (x, y, z)
    float burst = clamp(age, 0.0, 1.0);
    float angle = (tr * 4.8 + r3 * 6.28318) + a_gridUv.y * 4.6 + u_time * 0.55;
    vec2 outward = normalize(a_gridUv - vec2(0.5, 0.44) + vec2((r1 - 0.5) * 0.42, (r2 - 0.5) * 0.42));

    vec2 xySwirl = a_gridUv
      + outward * (burst * (0.26 + r3 * 0.38))
      + vec2(cos(angle), sin(angle)) * (0.055 + burst * 0.12);
    float zDepth = sin(clamp(tr * 1.45, 0.0, 1.0) * 3.14159) * (0.45 + r3 * 0.72);

    // Phase 2: R2 low-discrepancy quasirandom mapping so Multi's dots evenly tile the ENTIRE 16:9 thumbnail!
    vec2 targetLocalUv = vec2(
      fract(a_index * 0.7548776662 + 0.13),
      fract(a_index * 0.5698402909 + 0.37)
    );

    float cardFormT = smoothstep(0.40, 0.84, tr);
    float frameScale = mix(0.52, 1.0, cardFormT * cardFormT * (3.0 - 2.0 * cardFormT));
    vec2 rawTargetUv = u_targetCenter + (targetLocalUv * 2.0 - 1.0) * (u_targetHalf * frameScale);

    // Snap landing dots to the EXACT Bayer 4x4 pixel grid of the screen!
    float cellPx = max(2.2, 2.7 * u_dpr);
    vec2 targetCell = floor(rawTargetUv * u_resolution / cellPx);
    vec2 targetPosUv = (targetCell + 0.5) * cellPx / u_resolution;

    // Stagger arrival slightly by radial distance + jitter so the dotted thumbnail builds organically
    float radialDelay = length(targetLocalUv - 0.5) * 0.12;
    float convergeRaw = clamp((tr - (0.34 + r3 * 0.13 + radialDelay)) / 0.40, 0.0, 1.0);
    float converge = convergeRaw * convergeRaw * (3.0 - 2.0 * convergeRaw);

    // 10% of dots stay as airy ambient room dust floating freely in 3D space
    float isAmbientMote = step(0.90, r3);
    vec2 ambientPos = fract(vec2(r1 + u_time * 0.011 * (r2 - 0.5), r2 + u_time * 0.016 * (0.4 + r1 * 0.6)));
    vec2 destUv = mix(targetPosUv, ambientPos, isAmbientMote);

    float persp = 1.0 / max(0.32, 1.0 - zDepth * 0.46 * (1.0 - converge));
    vec2 projectedSwirl = (xySwirl - 0.5) * persp + 0.5;
    vec2 finalUv = mix(projectedSwirl, destUv, converge);

    // Compute exact Bayer 4x4 dotted color of ZA KAŻDYM RA2EM at this dot's grid cell!
    vec3 multiRgb = texture2D(u_video, vec2(mediaUv.x, 0.504 + mediaUv.y * 0.492)).rgb;
    vec3 relRaw = texture2D(u_release, clamp(targetLocalUv, vec2(0.001), vec2(0.999))).rgb;
    float relLuma = smoothstep(0.05, 0.90, dot(relRaw, vec3(0.299, 0.587, 0.114)));
    float qRel = floor(clamp(relLuma * 3.0 + (bayer4x4(targetCell) - 0.5) * 0.85, 0.0, 3.0)) / 3.0;
    vec3 relBayerCol = qRel < 0.5
      ? mix(vec3(0.032, 0.042, 0.050), vec3(0.165, 0.285, 0.325), qRel * 2.0)
      : mix(vec3(0.165, 0.285, 0.325), vec3(0.80, 0.88, 0.91), (qRel - 0.5) * 2.0);

    float birthFlash = exp(-age * 6.5);
    vec3 multiDotCol = multiRgb * 1.15 + vec3(0.10, 0.22, 0.26);
    vec3 assembledCol = mix(relBayerCol, vec3(0.72, 0.86, 0.90), isAmbientMote * 0.7);
    v_color = mix(multiDotCol, assembledCol, converge);
    v_color = mix(v_color, vec3(0.82, 0.92, 0.95), birthFlash * 0.45);

    gl_Position = vec4(finalUv * 2.0 - 1.0, 0.0, 1.0);
    // Size starts larger in 3D perspective flight, then snaps cleanly to exact Bayer dot size on landing!
    float flightSize = (2.1 + r3 * 2.0) * persp * u_dpr;
    float landedDotSize = mix(cellPx * 1.18, cellPx * 0.85, isAmbientMote);
    gl_PointSize = clamp(mix(flightSize, landedDotSize, converge), 1.6, 10.0);

    // Stay 100% solid through assembly into the dotted thumbnail, then dissolve seamlessly into NewSong
    float fadeIn = smoothstep(0.0, 0.07, age);
    float fadeOut = mix(1.0 - smoothstep(0.86, 0.96, tr), (1.0 - smoothstep(0.90, 1.01, u_transition)) * 0.42, isAmbientMote);
    v_alpha = fadeIn * fadeOut * smoothstep(0.24, 0.60, matte);
  }
`;

const PARTICLE_FRAG = `
  precision highp float;
  varying vec3 v_color;
  varying float v_alpha;

  void main() {
    if (v_alpha <= 0.01) discard;
    vec2 c = abs(gl_PointCoord - 0.5);
    float edge = max(c.x, c.y);
    // Crisp Bayer pixel-dot shape
    float mask = 1.0 - smoothstep(0.36, 0.5, edge);
    gl_FragColor = vec4(v_color, v_alpha * mask);
  }
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vertSrc, fragSrc) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vert || !frag) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function createTrailTarget(gl, size) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const initData = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size * 4; i += 4) {
    initData[i] = 128;
    initData[i + 1] = 128;
    initData[i + 2] = 0;
    initData[i + 3] = 255;
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, initData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { fbo, tex };
}

function renderTypographyCanvas(width, height) {
  const canvas = document.createElement('canvas');
  const aspect = Math.max(width / Math.max(height, 1), 0.45);
  const cw = 2048;
  const ch = Math.max(768, Math.round(cw / aspect));
  canvas.width = cw;
  canvas.height = ch;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const fitFontSize = (text, fontDecl, targetWidth, maxHeight) => {
    ctx.font = fontDecl.replace('SIZE', '200');
    const measured = Math.max(ctx.measureText(text).width, 1);
    const byWidth = (targetWidth / measured) * 200;
    return Math.round(Math.min(byWidth, maxHeight));
  };

  const isPortrait = aspect < 0.85;

  if (isPortrait) {
    const youngSize = fitFontSize('YOUNG', '700 SIZEpx "Antonio", sans-serif', cw * 0.94, ch * 0.34);
    ctx.font = `700 ${youngSize}px "Antonio", sans-serif`;
    ctx.fillText('YOUNG', cw * 0.5, ch * 0.34);

    const multiSize = fitFontSize('MULTI', '400 SIZEpx "Bernoru", "Antonio", sans-serif', cw * 0.92, ch * 0.18);
    ctx.font = `400 ${multiSize}px "Bernoru", "Antonio", sans-serif`;
    ctx.fillText('MULTI', cw * 0.5, ch * 0.62);
  } else {
    const youngSize = fitFontSize('YOUNG', '700 SIZEpx "Antonio", sans-serif', cw * 0.94, ch * 0.66);
    ctx.font = `700 ${youngSize}px "Antonio", sans-serif`;
    ctx.fillText('YOUNG', cw * 0.5, ch * 0.36);

    const multiSize = fitFontSize('MULTI', '400 SIZEpx "Bernoru", "Antonio", sans-serif', cw * 0.90, ch * 0.28);
    ctx.font = `400 ${multiSize}px "Bernoru", "Antonio", sans-serif`;
    ctx.fillText('MULTI', cw * 0.5, ch * 0.72);
  }

  return canvas;
}

// Computes the EXACT pixel-locked screen-space rectangle of NewSong's floating monolith (.poster-monolith-slot)
// Desktop uses an organic asymmetric editorial placement (left: 36%, top: 49%); tablet/mobile centers cleanly.
function computeTargetFrameRect(vw, vh) {
  let framePxW;
  let centerX;
  let topRatio;

  if (vw <= 768) {
    framePxW = vw * 0.88;
    centerX = 0.5;
    topRatio = 0.39;
  } else if (vw <= 1024) {
    framePxW = Math.min(vw * 0.72, 620);
    centerX = 0.5;
    topRatio = 0.42;
  } else {
    framePxW = Math.min(vw * 0.50, 760);
    centerX = 0.36;
    topRatio = 0.49;
  }

  const framePxH = framePxW * (9 / 16);
  const halfW = (framePxW / Math.max(vw, 1)) * 0.5;
  const halfH = (framePxH / Math.max(vh, 1)) * 0.5;
  // WebGL UV Y=0 is bottom, Y=1 is top -> convert CSS topRatio to WebGL UV
  const centerY = 1.0 - topRatio;

  return { halfW, halfH, centerX, centerY };
}

function HeroVideoShader({ startAnimation = false, transitionProgress }) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const startAnimRef = useRef(startAnimation);
  const transitionRef = useRef(0);
  const [fallbackMode, setFallbackMode] = useState(false);

  useEffect(() => {
    startAnimRef.current = startAnimation;
  }, [startAnimation]);

  useEffect(() => {
    if (!transitionProgress) return;
    transitionRef.current = transitionProgress.get();
    return transitionProgress.on('change', (v) => {
      transitionRef.current = v;
    });
  }, [transitionProgress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      setFallbackMode(true);
      return;
    }

    const trailProg = createProgram(gl, QUAD_VERT, TRAIL_FRAG);
    const displayProg = createProgram(gl, QUAD_VERT, DISPLAY_FRAG);
    if (!trailProg || !displayProg) {
      setFallbackMode(true);
      return;
    }

    const supportsVertexTex = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) >= 2;
    const particleProg = supportsVertexTex ? createProgram(gl, PARTICLE_VERT, PARTICLE_FRAG) : null;

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const GRID_X = 160;
    const GRID_Y = 104;
    const PARTICLE_COUNT = GRID_X * GRID_Y;
    let particleBuffer = null;
    if (particleProg) {
      // Interleaved: [u, v, index] (3 floats per particle) for R2 quasirandom uniform thumbnail dot-grid assembly
      const gridData = new Float32Array(PARTICLE_COUNT * 3);
      let ptr = 0;
      let idx = 0;
      for (let y = 0; y < GRID_Y; y++) {
        for (let x = 0; x < GRID_X; x++) {
          gridData[ptr++] = (x + 0.5) / GRID_X;
          gridData[ptr++] = (y + 0.5) / GRID_Y;
          gridData[ptr++] = idx++;
        }
      }
      particleBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, gridData, gl.STATIC_DRAW);
    }

    const TRAIL_SIZE = 256;
    let readTarget = createTrailTarget(gl, TRAIL_SIZE);
    let writeTarget = createTrailTarget(gl, TRAIL_SIZE);

    const createSimpleTex = (initRgba) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(initRgba));
      return tex;
    };

    const mediaTex = createSimpleTex([12, 16, 19, 255]);
    const textTex = createSimpleTex([0, 0, 0, 0]);
    const releaseTex = createSimpleTex([10, 16, 20, 255]);
    const emptyRoomTex = createSimpleTex([14, 28, 34, 255]);

    let mediaW = 960;
    let mediaH = 1280;
    let isDisposed = false;

    const uploadTypographyTexture = () => {
      if (isDisposed) return;
      const textCanvas = renderTypographyCanvas(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
      gl.bindTexture(gl.TEXTURE_2D, textTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
    };

    uploadTypographyTexture();
    if (document.fonts) {
      Promise.all([
        document.fonts.load('700 200px "Antonio"'),
        document.fonts.load('400 200px "Bernoru"'),
        document.fonts.ready
      ]).then(uploadTypographyTexture).catch(() => {});
    }

    const loadTexImage = (src, tex, onDone) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        if (isDisposed) return;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        if (onDone) onDone(img);
      };
    };

    loadTexImage('/hero-poster-stacked.jpg', mediaTex, (img) => {
      if (video.readyState < 2) {
        mediaW = img.naturalWidth || 960;
        mediaH = img.naturalHeight || 1280;
      }
    });
    loadTexImage('/release-cover.jpg', releaseTex);
    loadTexImage('/hero-empty-room.jpg', emptyRoomTex);

    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.play().catch(() => {});

    // Uniform locations — Pass 1 (Trail)
    const tPosLoc = gl.getAttribLocation(trailProg, 'a_position');
    const tPrevTrail = gl.getUniformLocation(trailProg, 'u_prevTrail');
    const tRes = gl.getUniformLocation(trailProg, 'u_resolution');
    const tMouse = gl.getUniformLocation(trailProg, 'u_mouse');
    const tPrevMouse = gl.getUniformLocation(trailProg, 'u_prevMouse');
    const tVel = gl.getUniformLocation(trailProg, 'u_velocity');
    const tAspect = gl.getUniformLocation(trailProg, 'u_aspect');
    const tActive = gl.getUniformLocation(trailProg, 'u_active');

    // Uniform locations — Pass 2 (Room + Empty Plate + Target Screen + Multi)
    const dPosLoc = gl.getAttribLocation(displayProg, 'a_position');
    const dVideo = gl.getUniformLocation(displayProg, 'u_video');
    const dTrail = gl.getUniformLocation(displayProg, 'u_trail');
    const dText = gl.getUniformLocation(displayProg, 'u_text');
    const dRelease = gl.getUniformLocation(displayProg, 'u_release');
    const dEmptyRoom = gl.getUniformLocation(displayProg, 'u_emptyRoom');
    const dRes = gl.getUniformLocation(displayProg, 'u_resolution');
    const dVideoRes = gl.getUniformLocation(displayProg, 'u_videoRes');
    const dParallax = gl.getUniformLocation(displayProg, 'u_parallax');
    const dTargetHalf = gl.getUniformLocation(displayProg, 'u_targetHalf');
    const dTargetCenter = gl.getUniformLocation(displayProg, 'u_targetCenter');
    const dTime = gl.getUniformLocation(displayProg, 'u_time');
    const dDpr = gl.getUniformLocation(displayProg, 'u_dpr');
    const dTextReveal = gl.getUniformLocation(displayProg, 'u_textReveal');
    const dTransition = gl.getUniformLocation(displayProg, 'u_transition');

    // Uniform locations — Pass 3 (16,640 3D Dots -> Bayer Dotted ZA KAŻDYM RA2EM Thumbnail)
    const pGridLoc = particleProg ? gl.getAttribLocation(particleProg, 'a_gridUv') : -1;
    const pIdxLoc = particleProg ? gl.getAttribLocation(particleProg, 'a_index') : -1;
    const pVideo = particleProg ? gl.getUniformLocation(particleProg, 'u_video') : null;
    const pRelease = particleProg ? gl.getUniformLocation(particleProg, 'u_release') : null;
    const pRes = particleProg ? gl.getUniformLocation(particleProg, 'u_resolution') : null;
    const pVideoRes = particleProg ? gl.getUniformLocation(particleProg, 'u_videoRes') : null;
    const pTargetHalf = particleProg ? gl.getUniformLocation(particleProg, 'u_targetHalf') : null;
    const pTargetCenter = particleProg ? gl.getUniformLocation(particleProg, 'u_targetCenter') : null;
    const pTransition = particleProg ? gl.getUniformLocation(particleProg, 'u_transition') : null;
    const pTime = particleProg ? gl.getUniformLocation(particleProg, 'u_time') : null;
    const pDpr = particleProg ? gl.getUniformLocation(particleProg, 'u_dpr') : null;

    const pointer = {
      x: 0.5, y: 0.5, prevX: 0.5, prevY: 0.5,
      targetX: 0.5, targetY: 0.5,
      parallaxX: 0, parallaxY: 0,
      initialized: false, activeFrames: 0
    };

    const updatePointer = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = (clientX - rect.left) / rect.width;
      const ny = 1.0 - (clientY - rect.top) / rect.height;

      if (!pointer.initialized) {
        pointer.x = pointer.prevX = pointer.targetX = nx;
        pointer.y = pointer.prevY = pointer.targetY = ny;
        pointer.initialized = true;
      } else {
        pointer.targetX = nx;
        pointer.targetY = ny;
      }
      pointer.activeFrames = 6;

      if (video.paused && transitionRef.current <= 0.48) {
        video.play().catch(() => {});
      }
    };

    const onMouseMove = (e) => updatePointer(e.clientX, e.clientY);
    const onTouchMove = (e) => {
      if (e.touches && e.touches[0]) {
        updatePointer(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });

    let dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    let targetRect = computeTargetFrameRect(window.innerWidth, window.innerHeight);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const cw = canvas.clientWidth || window.innerWidth;
      const ch = canvas.clientHeight || window.innerHeight;
      targetRect = computeTargetFrameRect(cw, ch);
      const w = Math.max(1, Math.floor(cw * dpr));
      const h = Math.max(1, Math.floor(ch * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    const onResize = () => {
      resize();
      uploadTypographyTexture();
    };
    resize();
    window.addEventListener('resize', onResize);

    let rafId = null;
    let textReveal = 0;
    const startTime = performance.now();

    const render = (now) => {
      rafId = requestAnimationFrame(render);

      // Keep Hero's bright live Bayer-dithered tiled room running cleanly behind NewSong until Discography covers viewport
      const heroVisible = window.scrollY < window.innerHeight * 3.65;
      if (!heroVisible) {
        if (!video.paused) video.pause();
        return;
      }

      const tr = transitionRef.current;

      // Once Multi has completely dissolved into dots (tr > 0.48), pause video decoding (saves CPU/GPU while keeping live room!)
      if (tr > 0.48) {
        if (!video.paused) video.pause();
      } else if (video.paused && video.readyState >= 2) {
        video.play().catch(() => {});
      }

      resize();
      const elapsed = (now - startTime) * 0.001;

      if (tr <= 0.48 && video.readyState >= 2 && video.videoWidth > 0) {
        mediaW = video.videoWidth;
        mediaH = video.videoHeight;
        gl.bindTexture(gl.TEXTURE_2D, mediaTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      }

      const targetReveal = startAnimRef.current ? 1.0 : 0.0;
      textReveal += (targetReveal - textReveal) * 0.06;

      pointer.prevX = pointer.x;
      pointer.prevY = pointer.y;
      pointer.x += (pointer.targetX - pointer.x) * 0.35;
      pointer.y += (pointer.targetY - pointer.y) * 0.35;
      pointer.parallaxX += ((pointer.targetX - 0.5) - pointer.parallaxX) * 0.06;
      pointer.parallaxY += ((pointer.targetY - 0.5) - pointer.parallaxY) * 0.06;

      const vx = pointer.x - pointer.prevX;
      const vy = pointer.y - pointer.prevY;
      const isActive = pointer.activeFrames > 0 ? 1.0 : 0.0;
      if (pointer.activeFrames > 0) pointer.activeFrames--;

      // --- PASS 1: Update Ping-Pong Smudge Trail FBO ---
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeTarget.fbo);
      gl.viewport(0, 0, TRAIL_SIZE, TRAIL_SIZE);
      gl.useProgram(trailProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(tPosLoc);
      gl.vertexAttribPointer(tPosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readTarget.tex);
      gl.uniform1i(tPrevTrail, 0);
      gl.uniform2f(tRes, TRAIL_SIZE, TRAIL_SIZE);
      gl.uniform2f(tMouse, pointer.x, pointer.y);
      gl.uniform2f(tPrevMouse, pointer.prevX, pointer.prevY);
      gl.uniform2f(tVel, vx, vy);
      gl.uniform1f(tAspect, canvas.width / Math.max(canvas.height, 1));
      gl.uniform1f(tActive, isActive);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      const tmp = readTarget;
      readTarget = writeTarget;
      writeTarget = tmp;

      // --- PASS 2: Empty Room + Pixel-Locked Materializing ZA KAŻDYM RA2EM + Disintegrating Multi ---
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(displayProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(dPosLoc);
      gl.vertexAttribPointer(dPosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mediaTex);
      gl.uniform1i(dVideo, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, readTarget.tex);
      gl.uniform1i(dTrail, 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, textTex);
      gl.uniform1i(dText, 2);

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, releaseTex);
      gl.uniform1i(dRelease, 3);

      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, emptyRoomTex);
      gl.uniform1i(dEmptyRoom, 4);

      gl.uniform2f(dRes, canvas.width, canvas.height);
      gl.uniform2f(dVideoRes, mediaW, mediaH);
      gl.uniform2f(dParallax, pointer.parallaxX, pointer.parallaxY);
      gl.uniform2f(dTargetHalf, targetRect.halfW, targetRect.halfH);
      gl.uniform2f(dTargetCenter, targetRect.centerX, targetRect.centerY);
      gl.uniform1f(dTime, elapsed);
      gl.uniform1f(dDpr, dpr);
      gl.uniform1f(dTextReveal, textReveal);
      gl.uniform1f(dTransition, tr);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // --- PASS 3: 16,640 3D Dots Shattering Multi -> Physically Assembling Dotted ZA KAŻDYM RA2EM Thumbnail ---
      if (particleProg && particleBuffer && tr > 0.01 && tr < 1.02) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(particleProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
        gl.enableVertexAttribArray(pGridLoc);
        gl.vertexAttribPointer(pGridLoc, 2, gl.FLOAT, false, 12, 0);
        if (pIdxLoc >= 0) {
          gl.enableVertexAttribArray(pIdxLoc);
          gl.vertexAttribPointer(pIdxLoc, 1, gl.FLOAT, false, 12, 8);
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, mediaTex);
        gl.uniform1i(pVideo, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, releaseTex);
        gl.uniform1i(pRelease, 1);

        gl.uniform2f(pRes, canvas.width, canvas.height);
        gl.uniform2f(pVideoRes, mediaW, mediaH);
        gl.uniform2f(pTargetHalf, targetRect.halfW, targetRect.halfH);
        gl.uniform2f(pTargetCenter, targetRect.centerX, targetRect.centerY);
        gl.uniform1f(pTransition, tr);
        gl.uniform1f(pTime, elapsed);
        gl.uniform1f(pDpr, dpr);

        gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);
        if (pIdxLoc >= 0) gl.disableVertexAttribArray(pIdxLoc);
        gl.disable(gl.BLEND);
      }
    };

    rafId = requestAnimationFrame(render);

    return () => {
      isDisposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('resize', onResize);
      gl.deleteTexture(mediaTex);
      gl.deleteTexture(textTex);
      gl.deleteTexture(releaseTex);
      gl.deleteTexture(emptyRoomTex);
      gl.deleteTexture(readTarget.tex);
      gl.deleteTexture(writeTarget.tex);
      gl.deleteFramebuffer(readTarget.fbo);
      gl.deleteFramebuffer(writeTarget.fbo);
      gl.deleteBuffer(quadBuffer);
      if (particleBuffer) gl.deleteBuffer(particleBuffer);
      gl.deleteProgram(trailProg);
      gl.deleteProgram(displayProg);
      if (particleProg) gl.deleteProgram(particleProg);
    };
  }, []);

  return (
    <>
      <video
        ref={videoRef}
        src="/hero-stacked.mp4"
        poster="/hero-poster-stacked.jpg"
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
        className={fallbackMode ? 'hero-video-fallback' : 'hero-video-source'}
        aria-hidden="true"
      />
      {!fallbackMode && (
        <canvas
          ref={canvasRef}
          className="hero-shader-canvas"
          aria-hidden="true"
        />
      )}
    </>
  );
}

export default HeroVideoShader;
