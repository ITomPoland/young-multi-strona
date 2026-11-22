import React, { useEffect, useRef } from 'react';

// Lightweight 3D-projected floating dust motes continuing Multi's disintegration dust inside the NewSong room
function AmbientDust({ mouseX, mouseY }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const COUNT = window.innerWidth < 768 ? 42 : 78;
    const motes = Array.from({ length: COUNT }, (_, i) => {
      const seed = (i + 1) * 137.508;
      const rand = (offset) => {
        const x = Math.sin(seed + offset) * 43758.5453;
        return x - Math.floor(x);
      };
      return {
        x: rand(1.1) * 2 - 1,
        y: rand(2.3) * 2 - 1,
        z: 0.25 + rand(3.7) * 1.15,
        vx: (rand(4.9) - 0.5) * 0.00045,
        vy: -0.00025 - rand(5.3) * 0.00055,
        vz: (rand(6.1) - 0.5) * 0.0006,
        size: 1.0 + rand(7.7) * 2.1,
        phase: rand(8.9) * Math.PI * 2,
        tint: rand(9.4) > 0.45 ? '178, 214, 224' : '116, 168, 182'
      };
    });

    let rafId = null;
    let smoothMx = 0;
    let smoothMy = 0;

    const render = (now) => {
      rafId = requestAnimationFrame(render);

      // Pause drawing if NewSong panel is scrolled past
      const maxScroll = window.innerHeight * 3.8;
      if (window.scrollY > maxScroll || window.scrollY < window.innerHeight * 0.9) {
        return;
      }

      const targetMx = mouseX ? mouseX.get() : 0;
      const targetMy = mouseY ? mouseY.get() : 0;
      smoothMx += (targetMx - smoothMx) * 0.05;
      smoothMy += (targetMy - smoothMy) * 0.05;

      ctx.clearRect(0, 0, width, height);
      const t = now * 0.001;

      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        m.x += m.vx + Math.sin(t * 0.45 + m.phase) * 0.00018;
        m.y += m.vy;
        m.z += m.vz;

        if (m.y < -1.25) m.y = 1.25;
        if (m.x < -1.35) m.x = 1.35;
        if (m.x > 1.35) m.x = -1.35;
        if (m.z < 0.22) { m.z = 0.22; m.vz = Math.abs(m.vz); }
        if (m.z > 1.45) { m.z = 1.45; m.vz = -Math.abs(m.vz); }

        const persp = 1.0 / (0.45 + m.z * 0.72);
        const px = (0.5 + (m.x - smoothMx * (0.28 / m.z)) * 0.52 * persp) * width;
        const py = (0.5 + (m.y - smoothMy * (0.22 / m.z)) * 0.52 * persp) * height;

        if (px < -10 || px > width + 10 || py < -10 || py > height + 10) continue;

        const r = Math.max(0.7, m.size * persp * 0.75);
        const twinkle = 0.65 + 0.35 * Math.sin(t * 1.4 + m.phase);
        const depthAlpha = Math.min(1, Math.max(0.08, (1.48 - m.z) * 0.52));
        const alpha = depthAlpha * twinkle * 0.65;

        ctx.fillStyle = `rgba(${m.tint}, ${alpha.toFixed(3)})`;
        ctx.fillRect(px - r * 0.5, py - r * 0.5, r, r);
      }
    };

    rafId = requestAnimationFrame(render);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [mouseX, mouseY]);

  return (
    <canvas
      ref={canvasRef}
      className="ambient-dust-canvas"
      aria-hidden="true"
    />
  );
}

export default AmbientDust;
