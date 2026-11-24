import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// =====================================================================
// Multi's real head, prepared by scripts/prepare-head.mjs:
//   /studio/multi-head.glb       the solid head (simplified)
//   /studio/multi-head-dots.bin  the dots, sampled on the full-resolution model
//   /studio/multi-portrait.jpg   the photo, projected onto both from the front (PHOTO_FIT)
// The files are not in git (likeness / photo rights not cleared yet): when they are missing,
// loadHeadAsset() resolves to null and the studio keeps its placeholder head.
//
// HEAD_FIT places the model (in its own coordinates) on the studio head: centre of the
// head at the origin, metres, face to +Z, eyes at EYE_Y, the code-built shield in front.
// In dev it can be tuned live: window.__headFit (then call window.__applyHeadFit()).
// =====================================================================

// Measured on the Meshy model (scratch analysis of its front-facing surface): its visor spans
// y 0.06..0.36 (centre 0.21) with its front at z ~0.72, lips just below, chin ~-0.25.
// Scale 0.25 gives a real-size head (dread tips to chin ~27 cm) and a ~7.5 cm tall visor;
// the offset puts the model's visor 3 mm behind the code-built shield (SHIELD in headParts).
export const HEAD_FIT = {
  scale: 0.25, // model units -> metres
  position: [0, 0.008 - 0.25 * 0.21, 0.115 - 0.25 * 0.72], // metres, after scaling
  rotation: [0, 0, 0] // radians (X, Y, Z)
};

// The photo's projection onto the head (head space: metres, eyes at EYE_Y, face to +Z):
// photo pixel = (cx + x * k, cy - (y - EYE_Y) * k), orthographic along -Z (a long lens).
// Calibrated on the visor: in the 2400 px photo it runs y 477..890 (centre 684, 413 px) and
// is ~7.5 cm tall on the fitted model -> k ~ 5500 px/m; the face's centre line is x ~1190.
export const PHOTO_FIT = { cx: 1190, cy: 684, k: 5500, size: 2400 };

function parseDots(buf) {
  const view = new DataView(buf);
  const tag = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (tag !== 'MHD1') throw new Error('not a head dots file');
  const count = view.getUint32(4, true);
  const min = [0, 1, 2].map((i) => view.getFloat32(8 + i * 4, true));
  const max = [0, 1, 2].map((i) => view.getFloat32(20 + i * 4, true));
  const q = new Int16Array(buf, 32, count * 6);
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const rnd = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    for (let d = 0; d < 3; d++) {
      pos[k * 3 + d] = min[d] + ((q[k * 6 + d] + 32768) / 65535) * (max[d] - min[d]);
      nrm[k * 3 + d] = q[k * 6 + 3 + d] / 32767;
    }
    // a fixed per-dot random (golden-ratio sequence: even, and the same every load)
    rnd[k] = (k * 0.6180339887) % 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aNormal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  return g;
}

function loadPhoto(url) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = THREE.NoColorSpace; // raw values, like every other picture in the story
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.anisotropy = 8;
        resolve(t);
      },
      undefined,
      () => resolve(null) // no photo: the head keeps its plain shading
    );
  });
}

export async function loadHeadAsset(base = '/studio') {
  try {
    const [gltf, dotsBuf, photo] = await Promise.all([
      new GLTFLoader().loadAsync(`${base}/multi-head.glb`),
      fetch(`${base}/multi-head-dots.bin`).then((r) => {
        if (!r.ok) throw new Error(`dots ${r.status}`);
        return r.arrayBuffer();
      }),
      loadPhoto(`${base}/multi-portrait.jpg`)
    ]);
    // MultiHead: the head; MultiVisor: Multi's own visor, cut out by the script (the lens)
    let head = null;
    let visor = null;
    let visorInfo = null;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'MultiVisor') {
        visor = o.geometry;
        visorInfo = o.userData?.visor ?? null;
      } else if (!head) head = o.geometry;
    });
    if (!head) throw new Error('no mesh in multi-head.glb');
    return { head, visor: visorInfo ? visor : null, visorInfo, dots: parseDots(dotsBuf), photo };
  } catch (e) {
    if (import.meta.env.DEV) console.info('[studio] real head not available, using the placeholder:', e.message);
    return null;
  }
}
