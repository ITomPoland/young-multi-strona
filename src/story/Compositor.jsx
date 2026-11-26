import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FULLSCREEN_VERT, TRAIL_FRAG, COMPOSITE_FRAG, DUST_VERT, DUST_FRAG } from './hero/heroShaders';
import { isTextFront, renderTypographyCanvas } from './hero/typography';
import { markStoryWarm } from './storyReady';

const _proj = new THREE.Matrix4();

// THE WARM-UP: every shader of both scenes compiled (hidden objects too: the tower before the
// turn, the studio before the reveal) and every texture / model uploaded, off-screen, into a
// target of the same type as the real ones (so the programs match). Hidden objects are shown
// only for the synchronous part (no real frame ever sees them).
const _warmCam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
_warmCam.position.set(0, 0, 0.6);
_warmCam.lookAt(0, 0, 0);
_warmCam.updateMatrixWorld();
function showHidden(scene, into) {
  scene.traverse((o) => {
    if (!o.visible) {
      o.visible = true;
      into.push(o);
    }
  });
  return into;
}
async function warmUp(gl, scene, camera, studio, dustScene) {
  const rt = new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType });
  const prev = gl.getRenderTarget();
  let hidden = showHidden(studio, showHidden(scene, []));
  gl.setRenderTarget(rt);
  const compiling = Promise.all([
    gl.compileAsync(scene, camera),
    gl.compileAsync(studio, _warmCam),
    gl.compileAsync(dustScene, camera) // the hero's flying dust (its own pass, first scroll)
  ]);
  gl.setRenderTarget(prev);
  hidden.forEach((o) => (o.visible = false));
  try {
    await compiling;
  } catch {
    /* compiled synchronously on the first draw below */
  }
  hidden = showHidden(studio, showHidden(scene, []));
  gl.setRenderTarget(rt);
  gl.render(scene, camera);
  gl.render(studio, _warmCam);
  gl.render(dustScene, camera);
  gl.setRenderTarget(prev);
  hidden.forEach((o) => (o.visible = false));
  rt.dispose();
}

// =====================================================================
// The ONE render pipeline of the story, from the first frame of the hero to the end:
//  1. mouse trail (ping-pong, hero only)
//  2. the 3D world -> HDR target (incl. the settled dust, as part of the wall)
//     from the reveal on (S6): the world -> its own target (the reflection in the lens),
//     and the studio (Multi's head, the glasses) -> the HDR target instead
//  3. the flying dust -> its own target (hero only)
//  4. composite: Bayer dither of the room + the hero layers + glow + film -> screen
// =====================================================================

const TRAIL_SIZE = 256;
const GRID_X = 160;
const GRID_Y = 104;

function rawTexture(tex) {
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  return tex;
}

function solidTexture(r, g, b, a) {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1);
  rawTexture(t);
  t.needsUpdate = true;
  return t;
}

function createDustGeometry() {
  // [u, v, index] per point (stored in `position` so three knows the draw count)
  const data = new Float32Array(GRID_X * GRID_Y * 3);
  let p = 0;
  let idx = 0;
  for (let y = 0; y < GRID_Y; y++) {
    for (let x = 0; x < GRID_X; x++) {
      data[p++] = (x + 0.5) / GRID_X;
      data[p++] = (y + 0.5) / GRID_Y;
      data[p++] = idx++;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data, 3));
  return geo;
}

export default function Compositor({ state, glow = true }) {
  const { gl, scene, camera, size } = useThree();
  const supportsDust = gl.capabilities.maxVertexTextures > 0;

  // ---------- render targets ----------
  const targets = useMemo(() => {
    const sceneRT = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter
    });
    const dustRT = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter
    });
    const trailOpts = {
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping
    };
    const trailA = new THREE.WebGLRenderTarget(TRAIL_SIZE, TRAIL_SIZE, trailOpts);
    const trailB = new THREE.WebGLRenderTarget(TRAIL_SIZE, TRAIL_SIZE, trailOpts);
    // first read: "no velocity, no energy"
    const init = new Uint8Array(TRAIL_SIZE * TRAIL_SIZE * 4);
    for (let i = 0; i < init.length; i += 4) {
      init[i] = 128;
      init[i + 1] = 128;
      init[i + 2] = 0;
      init[i + 3] = 255;
    }
    const trailInit = new THREE.DataTexture(init, TRAIL_SIZE, TRAIL_SIZE);
    rawTexture(trailInit);
    trailInit.needsUpdate = true;
    // the world as seen in Multi's sunglasses (S6)
    const worldRT = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter
    });
    return { sceneRT, dustRT, trailA, trailB, trailInit, worldRT };
  }, []);

  // the studio's lens samples this
  useEffect(() => {
    state.current.worldTex = targets.worldRT.texture;
  }, [state, targets]);

  // ---------- media: stacked video (Multi + matte), poster, typography ----------
  const media = useMemo(
    () => ({
      fallback: solidTexture(12, 16, 19, 255),
      poster: null,
      video: null,
      videoTex: null,
      text: solidTexture(0, 0, 0, 0),
      res: new THREE.Vector2(960, 1280)
    }),
    []
  );

  // ---------- passes ----------
  const passes = useMemo(() => {
    const quadGeo = new THREE.PlaneGeometry(2, 2);
    const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const trailMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: TRAIL_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        u_prevTrail: { value: targets.trailInit },
        u_resolution: { value: new THREE.Vector2(TRAIL_SIZE, TRAIL_SIZE) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_prevMouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_velocity: { value: new THREE.Vector2() },
        u_aspect: { value: 1 },
        u_active: { value: 0 }
      }
    });
    const trailScene = new THREE.Scene();
    const trailQuad = new THREE.Mesh(quadGeo, trailMat);
    trailQuad.frustumCulled = false;
    trailScene.add(trailQuad);

    const compMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: targets.sceneRT.texture },
        tDust: { value: targets.dustRT.texture },
        tTrail: { value: targets.trailInit },
        tVideo: { value: media.fallback },
        tText: { value: media.text },
        uRes: { value: new THREE.Vector2(1, 1) },
        uMediaRes: { value: media.res },
        uParallax: { value: new THREE.Vector2() },
        uDpr: { value: 1 },
        uTime: { value: 0 },
        uBlack: { value: 0 },
        uGlowTaps: { value: 1 }, // (set every frame from `glow`: see below)
        uTr: { value: 0 },
        uHero: { value: 1 },
        uTrailAmt: { value: 1 },
        uTextReveal: { value: 0 },
        uTextFront: { value: 0 },
        uDustOn: { value: 0 },
        uClean: { value: 0 },
        uBreach: { value: 0 },
        uWarp: { value: 0 },
        uInvert: { value: 0 },
        uLoupe: { value: new THREE.Vector4(0.5, 0.5, 0, 0.125) },
        uRewind: { value: 0 },
        uPortal: { value: 0 },
        uHole: { value: new THREE.Vector3(0.5, 0.5, 1) }
      }
    });
    const compScene = new THREE.Scene();
    const compQuad = new THREE.Mesh(quadGeo, compMat);
    compQuad.frustumCulled = false;
    compScene.add(compQuad);

    // dust: one buffer, two materials (flying overlay / settled-in-the-wall)
    const dustGeo = createDustGeometry();
    const dustUniforms = {
      tVideo: { value: media.fallback },
      uRes: { value: new THREE.Vector2(1, 1) },
      uMediaRes: { value: media.res },
      uTr: { value: 0 },
      uTime: { value: 0 },
      uDpr: { value: 1 }
    };
    const makeDustMat = (mode) =>
      new THREE.ShaderMaterial({
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        uniforms: { ...dustUniforms, uMode: { value: mode } },
        transparent: true,
        depthTest: false,
        depthWrite: false
      });
    const dustOverlay = new THREE.Points(dustGeo, makeDustMat(0));
    dustOverlay.frustumCulled = false;
    const dustScene = new THREE.Scene();
    dustScene.add(dustOverlay);
    const dustWall = new THREE.Points(dustGeo, makeDustMat(1));
    dustWall.frustumCulled = false;
    dustWall.renderOrder = 10; // after the wall
    dustWall.visible = false;

    return { quadGeo, orthoCam, trailMat, trailScene, compMat, compScene, dustGeo, dustUniforms, dustOverlay, dustScene, dustWall };
    // NOT on `glow`: the quality tier is settled as the preloader ends, and rebuilding the passes
    // then would drop their warmed-up programs (recompiled on the first scroll)
  }, [targets, media]);

  // the settled dust lives in the 3D world, on the wall
  useEffect(() => {
    scene.add(passes.dustWall);
    return () => scene.remove(passes.dustWall);
  }, [scene, passes]);

  // ---------- video + poster ----------
  useEffect(() => {
    let disposed = false;
    new THREE.TextureLoader().load('/hero-poster-stacked.jpg', (tex) => {
      if (disposed) {
        tex.dispose();
        return;
      }
      media.poster = rawTexture(tex);
      if (tex.image?.naturalWidth) media.res.set(tex.image.naturalWidth, tex.image.naturalHeight);
    });
    return () => {
      disposed = true;
      media.poster?.dispose();
      media.videoTex?.dispose();
    };
  }, [media]);

  // ---------- typography (re-drawn for the viewport's aspect, and once fonts are in) ----------
  useEffect(() => {
    let disposed = false;
    const draw = () => {
      if (disposed) return;
      const canvas = renderTypographyCanvas(size.width || window.innerWidth, size.height || window.innerHeight);
      const tex = rawTexture(new THREE.CanvasTexture(canvas));
      const old = media.text;
      media.text = tex;
      passes.compMat.uniforms.tText.value = tex;
      old.dispose();
    };
    draw();
    if (document.fonts) {
      Promise.all([
        document.fonts.load('700 200px "Antonio"'),
        document.fonts.load('400 200px "Bernoru"'),
        document.fonts.ready
      ])
        .then(draw)
        .catch(() => {});
    }
    return () => {
      disposed = true;
    };
  }, [size.width, size.height, media, passes]);

  // ---------- pointer (trail + parallax) ----------
  const pointer = useRef({
    x: 0.5, y: 0.5, prevX: 0.5, prevY: 0.5, targetX: 0.5, targetY: 0.5,
    parallaxX: 0, parallaxY: 0, initialized: false, activeFrames: 0
  });
  useEffect(() => {
    const p = pointer.current;
    const update = (clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = (clientX - rect.left) / rect.width;
      const ny = 1.0 - (clientY - rect.top) / rect.height;
      if (!p.initialized) {
        p.x = p.prevX = p.targetX = nx;
        p.y = p.prevY = p.targetY = ny;
        p.initialized = true;
      } else {
        p.targetX = nx;
        p.targetY = ny;
      }
      p.activeFrames = 6;
      // mobile browsers may refuse autoplay until the first interaction
      const v = state.current.video;
      if (v && v.paused && state.current.tr <= 0.48) v.play().catch(() => {});
    };
    const onMouse = (e) => update(e.clientX, e.clientY);
    const onTouch = (e) => {
      if (e.touches && e.touches[0]) update(e.touches[0].clientX, e.touches[0].clientY);
    };
    window.addEventListener('mousemove', onMouse, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('touchmove', onTouch);
    };
  }, [gl, state]);

  useEffect(
    () => () => {
      targets.sceneRT.dispose();
      targets.dustRT.dispose();
      targets.trailA.dispose();
      targets.trailB.dispose();
      targets.trailInit.dispose();
      targets.worldRT.dispose();
      passes.trailMat.dispose();
      passes.compMat.dispose();
      passes.dustOverlay.material.dispose();
      passes.dustWall.material.dispose();
      passes.dustGeo.dispose();
      passes.quadGeo.dispose();
      media.fallback.dispose();
      media.text.dispose();
    },
    [targets, passes, media]
  );

  const buf = useMemo(() => new THREE.Vector2(), []);
  const trailState = useRef({ read: null, write: null });
  const textReveal = useRef(0);
  const textHide = useRef(0);
  const loupeStr = useRef(0);
  const worldWarm = useRef(false);
  const warm = useRef({ done: 0, busy: false });

  useFrame((frame) => {
    const s = state.current;
    if (!s.active) return;

    gl.getDrawingBufferSize(buf);
    if (targets.sceneRT.width !== buf.x || targets.sceneRT.height !== buf.y) {
      targets.sceneRT.setSize(buf.x, buf.y);
      targets.dustRT.setSize(buf.x, buf.y);
      targets.worldRT.setSize(buf.x, buf.y);
      // allocated now, not on their first use (the dust's first scroll, the reveal)
      for (const rt of [targets.dustRT, targets.worldRT]) {
        gl.setRenderTarget(rt);
        gl.clear(true, true, true);
      }
      gl.setRenderTarget(null);
    }

    const tr = s.tr;
    const studio = s.studioOn && s.studio;
    // the hero layers belong to the world on screen: not while the studio has the screen (the
    // CD exit already shows the first room, but only through the hole)
    const heroOn = tr < 0.5 && !studio;
    // S8: ...except inside the CD's centre hole, which shows the live hero frame
    const portal = studio && tr < 0.5 ? s.portal ?? 0 : 0;
    const time = frame.clock.elapsedTime;
    const dpr = gl.getPixelRatio();

    // --- video: wire the texture once it has frames, decode only while Multi exists ---
    const video = s.video;
    if (video && !media.videoTex && video.readyState >= 2 && video.videoWidth > 0) {
      media.videoTex = rawTexture(new THREE.VideoTexture(video));
    }
    if (video) {
      if (tr > 0.48) {
        if (!video.paused) video.pause();
      } else if (video.paused && video.readyState >= 2) {
        video.play().catch(() => {});
      }
    }
    const mediaTex = media.videoTex || media.poster || media.fallback;
    if (media.videoTex && video?.videoWidth) media.res.set(video.videoWidth, video.videoHeight);

    // --- pointer smoothing (same constants as the original hero) ---
    const p = pointer.current;
    p.prevX = p.x;
    p.prevY = p.y;
    p.x += (p.targetX - p.x) * 0.35;
    p.y += (p.targetY - p.y) * 0.35;
    p.parallaxX += (p.targetX - 0.5 - p.parallaxX) * 0.06;
    p.parallaxY += (p.targetY - 0.5 - p.parallaxY) * 0.06;
    const pointerActive = p.activeFrames > 0 ? 1 : 0;
    if (p.activeFrames > 0) p.activeFrames--;

    textReveal.current += ((s.heroStart ? 1 : 0) - textReveal.current) * 0.06;
    // S8: the type stays down in the echo; after a jump back to the top it rises again
    // (scroll-driven in the echo; a soft rise after a jump to the top)
    textHide.current += ((s.echoText ?? 0) - textHide.current) * (s.vh > 100 ? 0.3 : 0.06);

    // --- 1. trail ---
    const ts = trailState.current;
    if (heroOn || portal > 0) {
      if (!ts.write) ts.write = targets.trailA;
      const tu = passes.trailMat.uniforms;
      tu.u_prevTrail.value = ts.read ? ts.read.texture : targets.trailInit;
      tu.u_mouse.value.set(p.x, p.y);
      tu.u_prevMouse.value.set(p.prevX, p.prevY);
      tu.u_velocity.value.set(p.x - p.prevX, p.y - p.prevY);
      tu.u_aspect.value = buf.x / Math.max(buf.y, 1);
      tu.u_active.value = pointerActive;
      gl.setRenderTarget(ts.write);
      gl.render(passes.trailScene, passes.orthoCam);
      const done = ts.write;
      ts.write = done === targets.trailA ? targets.trailB : targets.trailA;
      ts.read = done;
    }

    // --- dust uniforms (both copies) ---
    const dustOn = supportsDust && heroOn && tr > 0.01;
    const du = passes.dustUniforms;
    du.tVideo.value = mediaTex;
    du.uRes.value.copy(buf);
    du.uTr.value = tr;
    du.uTime.value = time;
    du.uDpr.value = dpr;
    // (the settled dust is part of the world: also seen through the CD hole)
    passes.dustWall.visible = supportsDust && tr > 0.01 && tr < 0.5;

    // --- the warm-up (once the studio is complete; again if it changes) ---
    const W = warm.current;
    if (s.studio && s.studioPrep && W.done !== s.studioPrep && !W.busy) {
      W.busy = true;
      const ver = s.studioPrep;
      warmUp(gl, scene, camera, s.studio.scene, passes.dustScene).finally(() => {
        W.busy = false;
        W.done = ver;
        markStoryWarm();
      });
    }

    // --- 2. the world (from the reveal on: into the lens, and the studio onto the screen) ---
    // the lens's target is first bound long before the seam (its framebuffer allocated then)
    if (!worldWarm.current && s.studio) {
      worldWarm.current = true;
      gl.setRenderTarget(targets.worldRT);
      gl.clear(true, true, true);
    }
    // once the world has faded out of the glass, it is not drawn at all
    if (!studio || (s.lensWorld ?? 1) > 0.001) {
      gl.setRenderTarget(studio ? targets.worldRT : targets.sceneRT);
      gl.setClearColor(0x000000, 1);
      gl.clear(true, true, true);
      // in the lens the world texture holds only the part of the world on the visible glass
      // (Studio sets lensRect: centre + half size in the world camera's NDC): the same off-axis
      // frustum, re-cut to that rect
      const rect = studio ? s.lensRect : null;
      if (rect) {
        _proj.copy(camera.projectionMatrix);
        const e = camera.projectionMatrix.elements;
        e[0] /= rect[2];
        e[8] = (e[8] + rect[0]) / rect[2];
        e[5] /= rect[3];
        e[9] = (e[9] + rect[1]) / rect[3];
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      }
      gl.render(scene, camera);
      if (rect) {
        camera.projectionMatrix.copy(_proj);
        camera.projectionMatrixInverse.copy(_proj).invert();
      }
    }
    if (studio) {
      gl.setRenderTarget(targets.sceneRT);
      gl.clear(true, true, true);
      gl.render(s.studio.scene, s.studio.camera);
    }

    // --- 3. flying dust ---
    if (dustOn) {
      gl.setRenderTarget(targets.dustRT);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, false, false);
      gl.render(passes.dustScene, camera);
      gl.setClearColor(0x000000, 1);
    }

    // --- 4. composite ---
    const u = passes.compMat.uniforms;
    u.uRes.value.copy(buf);
    u.uDpr.value = dpr;
    u.uTime.value = time;
    u.uBlack.value = s.black;
    u.uGlowTaps.value = glow ? 1 : 0;
    u.uTr.value = tr;
    u.uHero.value = heroOn ? 1 : 0;
    u.uTrailAmt.value = 1 - THREE.MathUtils.smoothstep(tr, 0.42, 0.5);
    u.tTrail.value = ts.read ? ts.read.texture : targets.trailInit;
    u.tVideo.value = mediaTex;
    u.uParallax.value.set(p.parallaxX, p.parallaxY);
    u.uTextReveal.value = textReveal.current * (1 - textHide.current);
    u.uTextFront.value = isTextFront(size.width, size.height) ? 1 : 0;
    u.uDustOn.value = dustOn ? 1 : 0;
    u.uClean.value = s.clean;
    u.uBreach.value = s.breach ?? 0;
    u.uWarp.value = s.warp ?? 0;
    u.uInvert.value = s.bside ?? 0;
    u.uRewind.value = s.rewind ?? 0;
    u.uPortal.value = portal;
    if (s.hole) u.uHole.value.set(s.hole[0], s.hole[1], s.hole[2]);

    // 3D Crystal Magnifying Loupe: active on desktop over the centered LOST MEDIA DVD Box stage
    // Automatically retracts near side HUD flanks, top header, bottom floating dock, while dragging, or during CD exit
    const wide = size.width / Math.max(size.height, 1) > 1.05;
    const inStage =
      !s.touch &&
      (s.studioJourney ?? s.dvdJourney ?? 0) > 0.78 &&
      (s.studioExit ?? s.cdExit ?? 0) < 0.04 &&
      (s.black ?? 0) < 0.25 &&
      p.initialized &&
      !s.merchDrag?.active &&
      p.x > (wide ? 0.24 : 0.08) &&
      p.x < (wide ? 0.76 : 0.92) &&
      p.y > 0.18 &&
      p.y < 0.84;
    const loupeTarget = inStage ? 1 : 0;
    loupeStr.current += (loupeTarget - loupeStr.current) * 0.14;
    u.uLoupe.value.set(p.x, p.y, loupeStr.current, 0.115);

    gl.setRenderTarget(null);
    gl.render(passes.compScene, passes.orthoCam);
  }, 1);

  return null;
}
