import React, { useLayoutEffect, useRef, useState } from 'react';

const VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Aspect-corrected exact -25deg Architectural Diagonal Aperture + Liquid Silver Edge
// Pixel-matched to Gramophone's CSS skewX(-25deg) on every screen aspect ratio
const FRAGMENT_SHADER = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_progress;

  const float COS25 = 0.9063078;
  const float SIN25 = 0.4226183;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p = p * 2.05 + vec2(3.1, 1.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    float yCss = 1.0 - uv.y;

    float active = smoothstep(0.0, 0.06, u_progress) * (1.0 - smoothstep(0.90, 1.0, u_progress));
    if (active <= 0.001) {
      gl_FragColor = vec4(0.0);
      return;
    }

    float t = clamp(u_progress, 0.0, 1.0);
    float eased = t < 0.5
      ? 4.0 * t * t * t
      : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;

    // Exact corner-clearing halfWidth in aspect-corrected space (matches JS 1:1)
    float maxHalfWidth = 0.5 * aspect * COS25 + 0.5 * SIN25 + 0.08;
    float halfWidth = eased * maxHalfWidth;

    // Aspect-corrected coordinates so -25deg matches CSS skewX(-25deg) in real pixels
    float px = (uv.x - 0.5) * aspect;
    float py = yCss - 0.5;

    float dist = px * COS25 - py * SIN25;
    float along = px * SIN25 + py * COS25;

    // dEdge < 0 is INSIDE the white Discography opening; dEdge > 0 is OUTSIDE on dark NewSong
    float dEdge = abs(dist) - halfWidth;

    // 1. Clean subtle dark drop-shadow cast strictly INSIDE the white opening (no muddy gray mix)
    if (dEdge < -0.004) {
      float shadow = exp((dEdge + 0.004) * 26.0) * 0.24 * active;
      gl_FragColor = vec4(0.0, 0.0, 0.0, shadow);
      return;
    }

    // 2. Razor-sharp liquid silver edge + flowing specular sheen on/outside the parting blades
    float flow = fbm(vec2(along * 4.2, u_time * 0.28 + u_progress * 2.2));
    float razor = exp(-abs(dEdge) * 240.0);
    float sheen = exp(-max(dEdge, 0.0) * 42.0) * (0.35 + 0.65 * flow);
    float redRim = exp(-abs(dEdge - 0.010) * 110.0) * 0.28;

    // Initial crisp vertical-tilted light slit right as cut ignites (0 -> 0.16)
    float ignite = exp(-abs(dist) * 180.0) * (1.0 - smoothstep(0.04, 0.18, u_progress)) * 0.85;

    vec3 col =
      vec3(0.96, 0.97, 1.0) * (razor * 0.95 + sheen * 0.45 + ignite) +
      vec3(1.0, 0.24, 0.24) * redRim;

    float alpha = clamp(razor * 0.95 + sheen * 0.48 + redRim * 0.45 + ignite, 0.0, 1.0) * active;
    gl_FragColor = vec4(col, alpha);
  }
`;

const COS25 = 0.9063078;
const SIN25 = 0.4226183;

  // Aspect-corrected 4-point -25deg parallelogram matching GLSL pixel-for-pixel
  function buildDiagonalApertureClip(progress, aspect) {
    const t = Math.max(0, Math.min(1, progress));
    if (t <= 0.002) return 'inset(50% 50% 50% 50%)';
    if (t >= 0.995) return 'none';

    const eased = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const safeAspect = Math.max(aspect || 1, 0.25);
    const maxHalfWidth = 0.5 * safeAspect * COS25 + 0.5 * SIN25 + 0.08;
    const halfWidth = eased * maxHalfWidth;

    // Solve ((u - 0.5)*aspect)*COS25 - (y - 0.5)*SIN25 = ±halfWidth for u at y=0 and y=1
    const xAt = (y, side) => {
      const u = 0.5 + ((side * halfWidth + (y - 0.5) * SIN25) / COS25) / safeAspect;
      return (u * 100).toFixed(3);
    };

    return `polygon(${xAt(0, -1)}% 0%, ${xAt(0, 1)}% 0%, ${xAt(1, 1)}% 100%, ${xAt(1, -1)}% 100%)`;
  }

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

  function GlitchTearWebGL({ progress, targetRef }) {
    const canvasRef = useRef(null);
    const [webglFailed, setWebglFailed] = useState(false);

      useLayoutEffect(() => {
        const canvas = canvasRef.current;
        const gl = canvas?.getContext('webgl', {
          alpha: true,
          antialias: true,
          depth: false,
          stencil: false,
          powerPreference: 'high-performance',
          premultipliedAlpha: false
        });

        let program = null;
        let buffer = null;
        let vert = null;
        let frag = null;
        let uRes = null;
        let uTime = null;
        let uProg = null;

        if (gl) {
          vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
          frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
          if (vert && frag) {
            program = gl.createProgram();
            gl.attachShader(program, vert);
            gl.attachShader(program, frag);
            gl.linkProgram(program);
            if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
              gl.useProgram(program);
              buffer = gl.createBuffer();
              gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
              gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
                gl.STATIC_DRAW
              );
              const posLoc = gl.getAttribLocation(program, 'a_position');
              gl.enableVertexAttribArray(posLoc);
              gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

              uRes = gl.getUniformLocation(program, 'u_resolution');
              uTime = gl.getUniformLocation(program, 'u_time');
              uProg = gl.getUniformLocation(program, 'u_progress');

              gl.enable(gl.BLEND);
              gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
              gl.clearColor(0, 0, 0, 0);
            } else {
              program = null;
              setWebglFailed(true);
            }
          } else {
            setWebglFailed(true);
          }
        } else {
          setWebglFailed(true);
        }

        const resize = () => {
          if (!canvas || !gl) return;
          const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
          const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
          const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            gl.viewport(0, 0, w, h);
          }
        };
        resize();

        let rafId = null;
        let isRunning = false;
        let latestProgress = progress.get();
        const startTime = performance.now();

        const applyFrame = (now) => {
          const elapsed = (now - startTime) * 0.001;
          const el = targetRef?.current;
          const aspect = (el?.clientWidth || window.innerWidth) / Math.max(el?.clientHeight || window.innerHeight, 1);

          if (el) {
            if (latestProgress <= 0.002) {
              el.style.clipPath = 'inset(50% 50% 50% 50%)';
              el.style.visibility = 'hidden';
            } else if (latestProgress >= 0.995) {
              el.style.clipPath = 'none';
              el.style.visibility = 'visible';
            } else {
              el.style.visibility = 'visible';
              el.style.clipPath = buildDiagonalApertureClip(latestProgress, aspect);
            }
          }

          if (gl && program) {
            resize();
            gl.clear(gl.COLOR_BUFFER_BIT);
            if (latestProgress > 0.002 && latestProgress < 0.995) {
              gl.uniform2f(uRes, canvas.width, canvas.height);
              gl.uniform1f(uTime, elapsed);
              gl.uniform1f(uProg, latestProgress);
              gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
          }

          if (latestProgress > 0.002 && latestProgress < 0.995) {
            rafId = requestAnimationFrame(applyFrame);
          } else {
            isRunning = false;
          }
        };

        const kickLoop = () => {
          if (!isRunning) {
            isRunning = true;
            rafId = requestAnimationFrame(applyFrame);
          }
        };

        const handleResize = () => {
          resize();
          applyFrame(performance.now());
        };
        window.addEventListener('resize', handleResize);

        const unsub = progress.on('change', (v) => {
          latestProgress = v;
          kickLoop();
        });

        // Sync synchronously before first paint to prevent flash of Discography over NewSong
        applyFrame(startTime);

        return () => {
          unsub();
          window.removeEventListener('resize', handleResize);
          if (rafId) cancelAnimationFrame(rafId);
          if (gl) {
            if (buffer) gl.deleteBuffer(buffer);
            if (program) gl.deleteProgram(program);
            if (vert) gl.deleteShader(vert);
            if (frag) gl.deleteShader(frag);
          }
        };
      }, [progress, targetRef]);

      if (webglFailed) return null;

      return (
        <canvas
          ref={canvasRef}
          className="glitch-tear-canvas"
          aria-hidden="true"
        />
      );
    }

export default GlitchTearWebGL;
