import React, { useEffect, useRef, useState } from 'react';

const QUAD_VERT = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// PASS 1: Crisp Ping-Pong FBO Brush & Fluid Trail for Revealing the Real Cover
const TRAIL_FRAG = `
  precision highp float;

  varying vec2 v_uv;
  uniform sampler2D u_prevTrail;
  uniform vec2 u_resolution;
  uniform vec2 u_mouse;
  uniform vec2 u_prevMouse;
  uniform vec2 u_velocity;
  uniform float u_aspect;
  uniform float u_hover;
  uniform float u_moving;

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
    vec2 advectedUv = clamp(v_uv - prevVel * 0.009, vec2(0.002), vec2(0.998));

    vec4 s0 = texture2D(u_prevTrail, advectedUv);
    vec4 s1 = texture2D(u_prevTrail, advectedUv + vec2(texel.x, 0.0));
    vec4 s2 = texture2D(u_prevTrail, advectedUv - vec2(texel.x, 0.0));
    vec4 s3 = texture2D(u_prevTrail, advectedUv + vec2(0.0, texel.y));
    vec4 s4 = texture2D(u_prevTrail, advectedUv - vec2(0.0, texel.y));

    // Tight diffusion so the brush stays well-defined and never floods the whole cover
    vec4 diffused = s0 * 0.72 + (s1 + s2 + s3 + s4) * 0.07;
    vec2 vel = (diffused.rg - ZERO) * 0.88;
    float energy = diffused.b * 0.935;

    if (energy < 0.004) {
      energy = 0.0;
      vel = vec2(0.0);
    }

    if (u_hover > 0.01) {
      vec2 p = vec2(v_uv.x * u_aspect, v_uv.y);
      vec2 a = vec2(u_prevMouse.x * u_aspect, u_prevMouse.y);
      vec2 b = vec2(u_mouse.x * u_aspect, u_mouse.y);

      float d = u_moving > 0.5 ? distToSegment(p, a, b) : length(p - b);
      float speed = clamp(length(u_velocity) * 20.0, 0.0, 1.2);

      // Tight, refined spotlight brush (~18-23% height radius) — crisp & controllable
      float radius = mix(0.165, 0.22, clamp(speed * 0.5, 0.0, 1.0));
      float brush = smoothstep(radius * 1.45, radius * 0.25, d) * u_hover;

      if (u_moving > 0.5) {
        vel = clamp(vel + u_velocity * brush * 2.6, vec2(-0.35), vec2(0.35));
      }
      energy = clamp(max(energy, brush * 1.05), 0.0, 1.0);
    }

    gl_FragColor = vec4(vel + ZERO, energy, 1.0);
  }
`;

// PASS 2: Crisp Bayer 4x4 Cold-Teal Dots -> Ordered Pixel-by-Pixel Dissolve into Sharp Real Cover!
const DISPLAY_FRAG = `
  precision highp float;

  varying vec2 v_uv;
  uniform sampler2D u_image;
  uniform sampler2D u_trail;
  uniform vec2 u_resolution;
  uniform float u_dpr;

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

  void main() {
    vec4 trail = texture2D(u_trail, v_uv);
    vec2 vel = (trail.rg - ZERO) * 2.0;
    float energy = clamp(trail.b, 0.0, 1.0);

    // Exact same Bayer cell size as HeroVideoShader so scroll handoff is 1:1 pixel-identical
    float cellPx = max(2.2, 2.7 * u_dpr);
    vec2 cellCoord = floor(gl_FragCoord.xy / cellPx);
    vec2 snappedUv = clamp((cellCoord + 0.5) * cellPx / u_resolution, vec2(0.001), vec2(0.999));

    // Bayer 4x4 dotted cold-teal cover (untouched areas stay 100% pure crisp dots!)
    vec3 ditherSrc = texture2D(u_image, snappedUv).rgb;
    float rawLuma = dot(ditherSrc, vec3(0.299, 0.587, 0.114));
    float contrastLuma = smoothstep(0.05, 0.90, rawLuma);
    float bayerVal = bayer4x4(cellCoord);
    float levels = 3.0;
    float q = floor(clamp(contrastLuma * levels + (bayerVal - 0.5) * 0.85, 0.0, levels)) / levels;

    vec3 colDark = vec3(0.032, 0.042, 0.050);
    vec3 colMid  = vec3(0.165, 0.285, 0.325);
    vec3 colHigh = vec3(0.80, 0.88, 0.91);

    vec3 digitalCol = q < 0.5
      ? mix(colDark, colMid, q * 2.0)
      : mix(colMid, colHigh, (q - 0.5) * 2.0);

    // Ordered Bayer pixel-by-pixel reveal mask: dots cleanly pop away into sharp real color!
    float revealStrength = smoothstep(0.06, 0.82, energy);
    float edgeBand = revealStrength * (1.0 - revealStrength) * 4.0;
    float orderedMask = smoothstep(bayerVal - 0.14, bayerVal + 0.14, revealStrength * 1.12 - 0.06);
    float revealMask = mix(orderedMask, revealStrength, 0.25);

    // Crystal-sharp original cover inside the reveal window (tiny liquid ripple ONLY on the dissolving edge)
    vec2 subtleRipple = -vel * (0.018 * edgeBand);
    vec2 uvReal = clamp(v_uv + subtleRipple, vec2(0.001), vec2(0.999));
    vec3 realCover = texture2D(u_image, uvReal).rgb;

    vec3 finalCol = mix(digitalCol, realCover, revealMask);

    // Whisper-subtle icy catchlight right along the dissolving Bayer dots
    finalCol += vec3(0.36, 0.62, 0.70) * edgeBand * 0.14;

    // Scanline fades out inside the revealed real cover so the artwork looks crisp and true-to-life
    float scan = mix(0.97 + 0.03 * sin(gl_FragCoord.y * 1.4), 1.0, revealMask);
    gl_FragColor = vec4(clamp(finalCol * scan, 0.0, 1.0), 1.0);
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

function ReleaseDitherCanvas({ src, alt }) {
  const canvasRef = useRef(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      setFallback(true);
      return;
    }

    const trailProg = createProgram(gl, QUAD_VERT, TRAIL_FRAG);
    const displayProg = createProgram(gl, QUAD_VERT, DISPLAY_FRAG);
    if (!trailProg || !displayProg) {
      setFallback(true);
      return;
    }

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const TRAIL_SIZE = 256;
    let readTarget = createTrailTarget(gl, TRAIL_SIZE);
    let writeTarget = createTrailTarget(gl, TRAIL_SIZE);

    const imgTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, imgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([10, 15, 18, 255]));

    let disposed = false;
    let imageReady = false;
    let idleFramesLeft = 0;

    const tPosLoc = gl.getAttribLocation(trailProg, 'a_position');
    const tPrevTrail = gl.getUniformLocation(trailProg, 'u_prevTrail');
    const tRes = gl.getUniformLocation(trailProg, 'u_resolution');
    const tMouse = gl.getUniformLocation(trailProg, 'u_mouse');
    const tPrevMouse = gl.getUniformLocation(trailProg, 'u_prevMouse');
    const tVel = gl.getUniformLocation(trailProg, 'u_velocity');
    const tAspect = gl.getUniformLocation(trailProg, 'u_aspect');
    const tHover = gl.getUniformLocation(trailProg, 'u_hover');
    const tMoving = gl.getUniformLocation(trailProg, 'u_moving');

    const dPosLoc = gl.getAttribLocation(displayProg, 'a_position');
    const dImage = gl.getUniformLocation(displayProg, 'u_image');
    const dTrail = gl.getUniformLocation(displayProg, 'u_trail');
    const dRes = gl.getUniformLocation(displayProg, 'u_resolution');
    const dDpr = gl.getUniformLocation(displayProg, 'u_dpr');

    const pointer = {
      x: 0.5, y: 0.5, prevX: 0.5, prevY: 0.5,
      targetX: 0.5, targetY: 0.5,
      initialized: false,
      isInside: false,
      hoverVal: 0,
      movingFrames: 0
    };

    let rafId = null;
    let isRunning = false;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.75);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const draw = () => {
      resize();

      const targetHover = pointer.isInside ? 1.0 : 0.0;
      pointer.hoverVal += (targetHover - pointer.hoverVal) * 0.18;
      if (Math.abs(targetHover - pointer.hoverVal) < 0.002) {
        pointer.hoverVal = targetHover;
      }

      pointer.prevX = pointer.x;
      pointer.prevY = pointer.y;
      pointer.x += (pointer.targetX - pointer.x) * 0.42;
      pointer.y += (pointer.targetY - pointer.y) * 0.42;
      const vx = pointer.x - pointer.prevX;
      const vy = pointer.y - pointer.prevY;
      const isMoving = pointer.movingFrames > 0 ? 1.0 : 0.0;
      if (pointer.movingFrames > 0) pointer.movingFrames--;

      // Pass 1: Trail FBO
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
      gl.uniform1f(tHover, pointer.hoverVal);
      gl.uniform1f(tMoving, isMoving);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      const tmp = readTarget;
      readTarget = writeTarget;
      writeTarget = tmp;

      // Pass 2: Display
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(displayProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(dPosLoc);
      gl.vertexAttribPointer(dPosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, imgTex);
      gl.uniform1i(dImage, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, readTarget.tex);
      gl.uniform1i(dTrail, 1);

      gl.uniform2f(dRes, canvas.width, canvas.height);
      gl.uniform1f(dDpr, dpr);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (pointer.isInside || pointer.hoverVal > 0.005 || idleFramesLeft > 0) {
        if (idleFramesLeft > 0) idleFramesLeft--;
        rafId = requestAnimationFrame(draw);
      } else {
        isRunning = false;
      }
    };

    const wake = (frames = 120) => {
      idleFramesLeft = Math.max(idleFramesLeft, frames);
      if (!isRunning && imageReady) {
        isRunning = true;
        rafId = requestAnimationFrame(draw);
      }
    };

    const img = new Image();
    img.src = src;
    img.onload = () => {
      if (disposed) return;
      gl.bindTexture(gl.TEXTURE_2D, imgTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      imageReady = true;
      wake(4);
    };

    const updatePointerFromEvent = (clientX, clientY, isEnter = false) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const ny = Math.min(1, Math.max(0, 1.0 - (clientY - rect.top) / rect.height));
      if (!pointer.initialized || isEnter) {
        pointer.x = pointer.prevX = pointer.targetX = nx;
        pointer.y = pointer.prevY = pointer.targetY = ny;
        pointer.initialized = true;
      } else {
        pointer.targetX = nx;
        pointer.targetY = ny;
      }
      pointer.isInside = true;
      pointer.movingFrames = 6;
      wake(120);
    };

    const onPointerEnter = (e) => updatePointerFromEvent(e.clientX, e.clientY, true);
    const onPointerMove = (e) => updatePointerFromEvent(e.clientX, e.clientY, false);
    const onPointerLeave = () => {
      pointer.isInside = false;
      pointer.initialized = false;
      wake(140);
    };
    const onResize = () => { resize(); wake(3); };

    canvas.addEventListener('pointerenter', onPointerEnter, { passive: true });
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerenter', onPointerEnter);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('resize', onResize);
      gl.deleteTexture(imgTex);
      gl.deleteTexture(readTarget.tex);
      gl.deleteTexture(writeTarget.tex);
      gl.deleteFramebuffer(readTarget.fbo);
      gl.deleteFramebuffer(writeTarget.fbo);
      gl.deleteBuffer(quadBuffer);
      gl.deleteProgram(trailProg);
      gl.deleteProgram(displayProg);
    };
  }, [src]);

  if (fallback) {
    return <img src={src} alt={alt} className="poster-video-img" width="1280" height="720" />;
  }

  return (
    <canvas
      ref={canvasRef}
      className="poster-video-canvas"
      role="img"
      aria-label={alt}
    />
  );
}

export default ReleaseDitherCanvas;
