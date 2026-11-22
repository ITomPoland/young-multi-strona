import React, { useLayoutEffect, useRef, useState } from 'react';

const VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Synchronized WebGL Liquid Chrome + Chromatic Rift Frontier Ribbon
// Transparent above (shows Hero) AND transparent below (reveals live NewSong underneath!)
const FRAGMENT_SHADER = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_progress;
  uniform vec2 u_mouse;

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
    float a = 0.52;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = rot * p * 2.05 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  // Matches JS analyticalWave(x, progress, time) pixel-for-pixel
  float analyticalWave(float x, float progress, float time) {
    float edge = mix(-0.18, 1.18, progress);
    float env = sin(clamp(progress, 0.0, 1.0) * 3.14159265);
    float amp = env * 0.068;
    float w =
      sin(x * 5.2 + time * 1.35) * 0.50 +
      sin(x * 11.7 - time * 1.85 + 1.3) * 0.30 +
      cos(x * 21.3 + time * 2.30 - 0.7) * 0.20;
    float arch = (1.0 - abs(x - 0.5) * 1.6) * 0.045 * env;
    return edge + w * amp + arch;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 3.0;

    // Subtle mouse disturbance near the molten frontier
    vec2 m = (u_mouse - 0.5) * vec2(aspect, 1.0) * 3.0;
    float mDist = length(p - m);
    float mouseRipple = exp(-mDist * 2.2) * sin(mDist * 8.0 - u_time * 3.0) * 0.025;

    // High-frequency organic fBm tendrils hugging the exact analytical wave
    float t = u_time * 0.45;
    vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(4.2, -t * 0.8)));
    float turb = fbm(p + 2.2 * q + vec2(1.4, -t));

    float baseY = analyticalWave(uv.x, u_progress, u_time);
    float detailOffset = (turb - 0.5) * 0.065 + mouseRipple;
    float d = uv.y - (baseY + detailOffset);

    // Active envelope fades cleanly to 0 at progress=0 and progress=1
    float activeMask = smoothstep(0.0, 0.06, u_progress) * (1.0 - smoothstep(0.92, 1.0, u_progress));

    // Opaque obsidian ribbon hiding the exact polygon seam (transparent above AND below!)
    float coreDark = exp(-pow(d / 0.042, 2.0));
    // Soft smoky shadow trailing just underneath & ahead of the seam
    float smokeTrail = exp(-pow((d + 0.028) / 0.085, 2.0)) * (0.45 + 0.55 * turb);

    // Molten liquid-chrome specular ridge tracing the leading crest
    float chromeRidge = exp(-abs(d - 0.012) * 52.0) * (0.55 + 0.75 * pow(turb, 1.8));
    float razorCrest = exp(-abs(d - 0.014) * 140.0);

    // Subtle RGB chromatic prism split on the crest
    float redFringe = exp(-abs(d - 0.024) * 58.0) * 0.85;
    float cyanFringe = exp(-abs(d + 0.002) * 62.0) * 0.50;

    vec3 obsidian = vec3(0.025, 0.025, 0.028);
    vec3 chrome = vec3(0.94, 0.96, 1.0) * (chromeRidge * 0.85 + razorCrest * 0.95);
    vec3 prism = vec3(redFringe * 0.95, cyanFringe * 0.35, cyanFringe * 0.90);

    vec3 col = obsidian * (coreDark + smokeTrail * 0.7) + (chrome + prism * 0.65);

    float alpha = clamp(
      max(coreDark * 0.98, max(smokeTrail * 0.75, max(chromeRidge * 0.9, redFringe * 0.6))),
      0.0,
      1.0
    ) * activeMask;

    gl_FragColor = vec4(col, alpha);
  }
`;

// Identical analytical wave in JS so the DOM clip-path matches the WebGL ribbon pixel-for-pixel
function analyticalWave(x, progress, time) {
  const clamped = Math.max(0, Math.min(1, progress));
  const edge = -0.18 + 1.36 * clamped;
  const env = Math.sin(clamped * Math.PI);
  const amp = env * 0.068;
  const w =
    Math.sin(x * 5.2 + time * 1.35) * 0.50 +
    Math.sin(x * 11.7 - time * 1.85 + 1.3) * 0.30 +
    Math.cos(x * 21.3 + time * 2.30 - 0.7) * 0.20;
  const arch = (1.0 - Math.abs(x - 0.5) * 1.6) * 0.045 * env;
  return edge + w * amp + arch;
}

function buildWaveClipPath(progress, time) {
  const steps = 32;
  const pts = ['0% 100%'];
  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    const glY = analyticalWave(x, progress, time);
    const cssY = Math.max(0, Math.min(100, (1 - glY) * 100));
    pts.push(`${(x * 100).toFixed(2)}% ${cssY.toFixed(2)}%`);
  }
  pts.push('100% 100%');
  return `polygon(${pts.join(', ')})`;
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

function HeroWebGLTransition({ progress, targetRef }) {
  const canvasRef = useRef(null);
  const [webglFailed, setWebglFailed] = useState(false);

    useLayoutEffect(() => {
      const canvas = canvasRef.current;
      const gl = canvas?.getContext('webgl', {
        alpha: true,
        antialias: false,
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
      let uMouse = null;

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
            uMouse = gl.getUniformLocation(program, 'u_mouse');

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
      window.addEventListener('resize', resize);

      const mouseTarget = { x: 0.5, y: 0.5 };
      const mouseCurrent = { x: 0.5, y: 0.5 };
      const handleMouseMove = (e) => {
        mouseTarget.x = e.clientX / Math.max(window.innerWidth, 1);
        mouseTarget.y = 1.0 - e.clientY / Math.max(window.innerHeight, 1);
      };
      window.addEventListener('mousemove', handleMouseMove, { passive: true });

      let rafId = null;
      let isRunning = false;
      let latestProgress = progress.get();
      const startTime = performance.now();

      const applyFrame = (now) => {
        const elapsed = (now - startTime) * 0.001;
        const el = targetRef?.current;

        if (el) {
          if (latestProgress <= 0.001) {
            el.style.clipPath = 'inset(100% 0% 0% 0%)';
          } else if (latestProgress >= 0.999) {
            el.style.clipPath = 'none';
          } else {
            el.style.clipPath = buildWaveClipPath(latestProgress, elapsed);
          }
        }

        if (gl && program) {
          resize();
          mouseCurrent.x += (mouseTarget.x - mouseCurrent.x) * 0.08;
          mouseCurrent.y += (mouseTarget.y - mouseCurrent.y) * 0.08;

          gl.clear(gl.COLOR_BUFFER_BIT);
          if (latestProgress > 0.001 && latestProgress < 0.999) {
            gl.uniform2f(uRes, canvas.width, canvas.height);
            gl.uniform1f(uTime, elapsed);
            gl.uniform1f(uProg, latestProgress);
            gl.uniform2f(uMouse, mouseCurrent.x, mouseCurrent.y);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          }
        }

        if (latestProgress > 0.001 && latestProgress < 0.999) {
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

      const unsubProgress = progress.on('change', (v) => {
        latestProgress = v;
        kickLoop();
      });

      // Apply synchronously before first paint to prevent any flash over Hero
      applyFrame(startTime);

      return () => {
        unsubProgress();
        window.removeEventListener('resize', resize);
        window.removeEventListener('mousemove', handleMouseMove);
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
        className="hero-webgl-frontier"
        aria-hidden="true"
      />
    );
  }

export default HeroWebGLTransition;
