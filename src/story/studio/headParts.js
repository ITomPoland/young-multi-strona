import * as THREE from 'three';

// =====================================================================
// S6 parts, all built in code (no assets yet):
//  - a PLACEHOLDER head: a sphere bent into a head (jaw, flatter face, a nose), to be
//    replaced by the real .glb (same origin: the centre of the head, metres, +Z = face)
//  - the neck
//  - the sunglasses: Multi's Balenciaga shield, one wide visor wrapped round the face
//    (an analytic outline, so the lens shader cuts the glass exactly), a top bar, temples.
//    The visor is a separate mesh with UV 0..1 over the glass: the world is shown there.
// =====================================================================

const HEAD = { w: 0.078, h: 0.112, d: 0.098 }; // semi-axes, metres
export const HEAD_TOP = HEAD.h;
export const HEAD_BOTTOM = -0.235;
export const EYE_Y = 0.008;

const smooth = (a, b, v) => {
  const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export function makeHeadGeometry() {
  const g = new THREE.SphereGeometry(1, 160, 120);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let { x, y, z } = v;
    const jaw = smooth(-1.0, 0.2, y); // 0 at the chin
    x *= 0.72 + 0.28 * jaw;
    z *= 0.84 + 0.16 * jaw;
    if (z > 0) z *= 0.9; // a flatter face
    else z *= 1.05; // a rounder back
    // brow ridge and cheekbones
    z += 0.05 * Math.exp(-(((y - 0.18) / 0.08) ** 2)) * Math.max(z, 0) ** 2;
    // the nose
    const nose = Math.exp(-((x / 0.12) ** 2 + ((y + 0.12) / 0.2) ** 2)) * Math.max(z, 0) ** 6;
    z += 0.2 * nose;
    // lips / chin
    z += 0.04 * Math.exp(-((x / 0.25) ** 2 + ((y + 0.52) / 0.1) ** 2)) * Math.max(z, 0) ** 3;
    pos.setXYZ(i, x * HEAD.w, y * HEAD.h, z * HEAD.d);
  }
  g.computeVertexNormals();
  return g;
}

export function makeNeckGeometry() {
  const g = new THREE.CylinderGeometry(0.046, 0.056, 0.14, 64, 6, true);
  g.translate(0, -0.165, -0.012);
  return g;
}

// ---------------- the shield (Multi's Balenciaga visor) ----------------
// ONE wide visor across both eyes, wrapped round the face on a cylinder (axis vertical,
// SHIELD.R behind its front), with a gentle vertical curve, rounded corners and a notch
// for the nose. The glass's UV runs 0..1 along the arc (u) and up (v); the outline is
// analytic so the lens shader can cut it exactly. A thin bar along the top, and temples.
export const SHIELD = { w: 0.172, h: 0.074, R: 0.115, z: 0.118, sag: 0.005 }; // metres (w = arc length), sized to Multi's visor
export const LENS_PLANE = new THREE.Vector2(SHIELD.w, SHIELD.h); // the glass in lens space (arc, height)
export const LENS_BULGE = 0; // the anchor sits on the glass's surface
const CORNER_EXP = 7.0; // superellipse: a rectangle with soft corners
const NOSE = { depth: 0.42, width: 0.14 }; // the notch, in normalised units

// GLSL: inside test on the visor's UV (> 1 outside). `side` is unused (one glass).
export const GLSL_LENS_INSIDE = /* glsl */ `
  float lensInside(vec2 uv, float side) {
    vec2 q = (uv - 0.5) * 2.0;
    float d = pow(abs(q.x), ${CORNER_EXP.toFixed(1)}) + pow(abs(q.y), ${CORNER_EXP.toFixed(1)});
    float notch = -1.0 + ${NOSE.depth.toFixed(2)} * exp(-pow(q.x / ${NOSE.width.toFixed(2)}, 2.0));
    return q.y < notch ? 2.0 : d;
  }
`;

// a point on the visor at normalised (u, v) in [-1, 1], head space
function shieldPoint(u, v, out = new THREE.Vector3()) {
  const th = (u * SHIELD.w) / 2 / SHIELD.R;
  const y = EYE_Y + (v * SHIELD.h) / 2;
  const z = SHIELD.z - SHIELD.R + SHIELD.R * Math.cos(th) - SHIELD.sag * v * v;
  return out.set(SHIELD.R * Math.sin(th), y, z);
}

function shieldGeometry() {
  const nu = 96;
  const nv = 28;
  const pos = [];
  const uv = [];
  const idx = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = (i / nu) * 2 - 1;
      const v = (j / nv) * 2 - 1;
      shieldPoint(u, v, p);
      pos.push(p.x, p.y, p.z);
      uv.push(i / nu, j / nv);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + nu + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tube(points, radius, closed, material) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, closed ? 160 : 64, radius, 10, closed);
  return new THREE.Mesh(geo, material);
}

// builds the visor; lensMaterial(side) gives the glass its material
export function makeGlasses(frameMaterial, lensMaterial) {
  const group = new THREE.Group();
  const lens = new THREE.Mesh(shieldGeometry(), lensMaterial(0));
  group.add(lens);
  // the top bar, just above and proud of the glass, across its whole width
  const top = [];
  for (let k = 0; k <= 24; k++) {
    const u = (k / 24) * 1.96 - 0.98;
    const p = shieldPoint(u, 1.0);
    p.y += 0.0012;
    p.z += 0.0016;
    top.push(p);
  }
  group.add(tube(top, 0.0019, false, frameMaterial));
  // temples: from the visor's ends back along the side of the head to the ear
  for (const side of [1, -1]) {
    const start = shieldPoint(side * 0.99, 0.82);
    const p1 = new THREE.Vector3(side * 0.08, start.y + 0.001, start.z - 0.04);
    const p2 = new THREE.Vector3(side * 0.083, start.y - 0.003, -0.012);
    const p3 = new THREE.Vector3(side * 0.079, start.y - 0.022, -0.04);
    group.add(tube([start, p1, p2, p3], 0.0016, false, frameMaterial));
  }
  // the camera's anchor: the middle of the glass, facing out (+Z in head space)
  const anchor = new THREE.Object3D();
  shieldPoint(0, 0, anchor.position); // = UV (0.5, 0.5): the lens-space origin of the reflection
  group.add(anchor);
  return {
    group,
    lens,
    anchor,
    dispose() {
      group.traverse((o) => o.geometry?.dispose());
    }
  };
}
