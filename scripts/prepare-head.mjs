// =====================================================================
// Prepares Multi's head for the reveal (S6) from a raw image-to-3D model (.glb).
//
//   node scripts/prepare-head.mjs <raw.glb> [outDir] [targetTriangles] [dots]
//
// 1. the SOLID head: the mesh simplified with meshoptimizer (it ships with three) to
//    targetTriangles (default 150k), normals recomputed -> <outDir>/multi-head.glb
// 2. the DOTS: points sampled on the FULL-resolution surface (area-weighted, seeded),
//    with normals, so the dots keep every detail of the dreads -> <outDir>/multi-head-dots.bin
//    Denser on the head than on the shoulders: below SHOULDER_Y (model units) a triangle
//    counts SHOULDER_WEIGHT of its area.
//    format: "MHD1" | u32 count | f32 min[3] | f32 max[3] | count x (i16 pos[3], i16 nrm[3])
//
// 3. the VISOR: Multi's Balenciaga shield as a clean glass mesh (the lens: the reflection is
//    shown on it). Its outline is traced on the portrait (VISOR_TRACE, photo px; the model was
//    generated from that photo and lines up with it, PHOTO_REG); its surface is a smooth
//    polynomial fitted (robustly, so the dreads in front drop out) to the model's frontmost
//    depth inside that outline, lifted just proud of the model's own visor. UVs by arc length
//    (u) and height (v); a second set carries each vertex's distance to the edge (the bevel).
//    The AI's own visor shell is removed from the head and the dots (dreads in front stay).
//    The camera's anchor (ANCHOR_PX) and the glass's size are in the node's extras.
//
// Coordinates are kept as they are in the source model; Studio.jsx fits them to the head.
// Only plain, uncompressed glTF input is read (positions, optional normals, indices).
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';

const [, , inPath, outDir = 'public/studio', targetArg = '150000', dotsArg = '120000'] = process.argv;
if (!inPath) {
  console.error('usage: node scripts/prepare-head.mjs <raw.glb> [outDir] [targetTriangles] [dots]');
  process.exit(1);
}
const TARGET_TRIS = Number(targetArg);
const SHOULDER_Y = Number(process.env.SHOULDER_Y ?? 0.02); // where the head ends (Meshy bust)
const SHOULDER_WEIGHT = 0.3;
const DOTS = Number(dotsArg);

// ---------------- read the glb ----------------
function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a .glb');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart);
  const accessor = (i, Type, comps) => {
    const a = json.accessors[i];
    const bv = json.bufferViews[a.bufferView];
    if (bv.byteStride && bv.byteStride !== comps * Type.BYTES_PER_ELEMENT) throw new Error('interleaved data is not supported');
    const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const copy = new Type(a.count * comps);
    const src = new Type(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + copy.byteLength));
    copy.set(src);
    return copy;
  };
  const prim = json.meshes[0].primitives[0];
  if (json.meshes.length > 1 || json.meshes[0].primitives.length > 1) console.warn('note: only the first mesh/primitive is used');
  const pos = accessor(prim.attributes.POSITION, Float32Array, 3);
  const nrm = prim.attributes.NORMAL !== undefined ? accessor(prim.attributes.NORMAL, Float32Array, 3) : null;
  const ia = json.accessors[prim.indices];
  const IType = ia.componentType === 5125 ? Uint32Array : ia.componentType === 5123 ? Uint16Array : Uint8Array;
  const idx = Uint32Array.from(accessor(prim.indices, IType, 1));
  return { pos, nrm, idx };
}

// ---------------- helpers ----------------
function computeNormals(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; // area-weighted
    for (const k of [a, b, c]) {
      n[k] += nx;
      n[k + 1] += ny;
      n[k + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

function bounds(pos) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k]);
      max[k] = Math.max(max[k], pos[i + k]);
    }
  }
  return { min, max };
}

// mulberry32: a seeded RNG, so the dots are the same on every run
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------- write a minimal glb (one node + mesh per part) ----------------
function writeGlb(file, parts) {
  const pad4 = (n) => (n + 3) & ~3;
  const chunks = [];
  const views = [];
  const accessors = [];
  let off = 0;
  const addView = (arr, target) => {
    views.push({ buffer: 0, byteOffset: off, byteLength: arr.byteLength, target });
    chunks.push({ arr, off });
    off = pad4(off + arr.byteLength);
    return views.length - 1;
  };
  const meshes = [];
  const nodes = [];
  for (const part of parts) {
    const { min, max } = bounds(part.pos);
    const attributes = {};
    accessors.push({ bufferView: addView(part.pos, 34962), componentType: 5126, count: part.pos.length / 3, type: 'VEC3', min, max });
    attributes.POSITION = accessors.length - 1;
    accessors.push({ bufferView: addView(part.nrm, 34962), componentType: 5126, count: part.nrm.length / 3, type: 'VEC3' });
    attributes.NORMAL = accessors.length - 1;
    if (part.uv) {
      accessors.push({ bufferView: addView(part.uv, 34962), componentType: 5126, count: part.uv.length / 2, type: 'VEC2' });
      attributes.TEXCOORD_0 = accessors.length - 1;
    }
    if (part.uv2) {
      // one value per vertex, carried as a VEC2 (glTF texture coordinates are pairs)
      const pair = new Float32Array(part.uv2.length * 2);
      part.uv2.forEach((e, i) => (pair[i * 2] = e));
      accessors.push({ bufferView: addView(pair, 34962), componentType: 5126, count: part.uv2.length, type: 'VEC2' });
      attributes.TEXCOORD_1 = accessors.length - 1;
    }
    accessors.push({ bufferView: addView(part.idx, 34963), componentType: 5125, count: part.idx.length, type: 'SCALAR' });
    meshes.push({ name: part.name, primitives: [{ attributes, indices: accessors.length - 1, mode: 4 }] });
    nodes.push({ mesh: meshes.length - 1, name: part.name, ...(part.extras ? { extras: part.extras } : {}) });
  }
  const bin = Buffer.alloc(off);
  for (const c of chunks) Buffer.from(c.arr.buffer, c.arr.byteOffset, c.arr.byteLength).copy(bin, c.off);
  const json = {
    asset: { version: '2.0', generator: 'young-multi prepare-head' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    buffers: [{ byteLength: bin.length }],
    bufferViews: views,
    accessors
  };
  let jsonBuf = Buffer.from(JSON.stringify(json));
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length) - jsonBuf.length, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
  const ch = (len, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(len, 0);
    h.writeUInt32LE(type, 4);
    return h;
  };
  fs.writeFileSync(file, Buffer.concat([header, ch(jsonBuf.length, 0x4e4f534a), jsonBuf, ch(bin.length, 0x004e4942), bin]));
}

// ---------------- the visor ----------------
// The model was generated from the portrait, and it lines up with it: seen from the front
// (orthographic, no turn) model (x, y) -> photo pixel (cx + x k, cy - y k). So the glass's
// OUTLINE is traced on the photo (where the shield really is, dreads or not) and its SURFACE
// is fitted to the model (how it wraps round the face).
const PHOTO_REG = { cx: 914, cy: 1107, k: 1580 }; // the 2000 px portrait (public/studio/multi-portrait.jpg)
// Multi's Balenciaga shield on the portrait (photo px): straight top, near-vertical sides,
// rounded corners, a bottom edge that rises to a notch over the nose
const VISOR_TRACE = {
  left: 502,
  right: 1432,
  top: 594,
  rTop: 22,
  rBottom: 38,
  bottom: [
    [502, 1150], [560, 1162], [620, 1149], [680, 1124], [740, 1104], [800, 1088], [850, 1079], [893, 1076],
    [937, 1079], [985, 1092], [1020, 1110], [1080, 1128], [1160, 1149], [1260, 1162], [1340, 1153], [1432, 1135]
  ]
};
const ANCHOR_PX = [760, 960]; // the camera's start on the glass (photo px): over the left eye, clear of the dreads
const GLASS_GAP = 0.004; // model units the glass stands proud of the model's own visor (~1 mm)

const pxToModel = (px, py) => [(px - PHOTO_REG.cx) / PHOTO_REG.k, (PHOTO_REG.cy - py) / PHOTO_REG.k];

// the outline in model units: x range, and per x the glass's bottom and top (corners rounded)
function makeOutline() {
  const T = VISOR_TRACE;
  const xl = pxToModel(T.left, 0)[0];
  const xr = pxToModel(T.right, 0)[0];
  const top = pxToModel(0, T.top)[1];
  const rT = T.rTop / PHOTO_REG.k;
  const rB = T.rBottom / PHOTO_REG.k;
  const pts = T.bottom.map(([px, py]) => pxToModel(px, py));
  // Catmull-Rom through the traced bottom (x is monotone)
  const bottomRaw = (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      if (x <= pts[i + 1][0]) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        const h = p2[0] - p1[0];
        const t = (x - p1[0]) / h;
        const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0] || 1)) * h;
        const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0] || 1)) * h;
        const t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
      }
    }
    return pts[pts.length - 1][1];
  };
  const corner = (x, r) => {
    const d = Math.max(xl + r - x, x - (xr - r), 0);
    return r - Math.sqrt(Math.max(r * r - d * d, 0));
  };
  const bottom = (x) => bottomRaw(x) + corner(x, rB);
  const topAt = (x) => top - corner(x, rT);
  let ymin = Infinity;
  for (let k = 0; k <= 400; k++) ymin = Math.min(ymin, bottom(xl + ((xr - xl) * k) / 400));
  const inside = (x, y, m = 0) => x > xl + m && x < xr - m && y > bottom(x) + m && y < topAt(x) - m;
  return { xl, xr, top, ymin, bottom, topAt, inside };
}

// the model's frontmost surface, as a depth map over the outline (z-buffered triangles)
function frontDepth(pos, idx, o, cell = 0.004) {
  const x0 = o.xl - 0.02, y0 = o.ymin - 0.02;
  const W = Math.ceil((o.xr + 0.02 - x0) / cell), H = Math.ceil((o.top + 0.02 - y0) / cell);
  const z = new Float64Array(W * H).fill(-Infinity);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ax = (pos[a] - x0) / cell, ay = (pos[a + 1] - y0) / cell;
    const bx = (pos[b] - x0) / cell, by = (pos[b + 1] - y0) / cell;
    const cx = (pos[c] - x0) / cell, cy = (pos[c + 1] - y0) / cell;
    const minx = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxx = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const miny = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxy = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    if (minx > maxx || miny > maxy) continue;
    const d = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(d) < 1e-12) continue;
    for (let y = miny; y <= maxy; y++) {
      for (let x = minx; x <= maxx; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w1 = ((px - ax) * (cy - ay) - (cx - ax) * (py - ay)) / d;
        const w2 = ((bx - ax) * (py - ay) - (px - ax) * (by - ay)) / d;
        const w0 = 1 - w1 - w2;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const zz = w0 * pos[a + 2] + w1 * pos[b + 2] + w2 * pos[c + 2];
        const k = y * W + x;
        if (zz > z[k]) z[k] = zz;
      }
    }
  }
  return { z, W, H, x0, y0, cell };
}

// the glass surface: z = sum c_i f_i(x, y), a smooth wrap (asymmetric terms allowed: the face
// on the photo is turned a little)
const TERMS = [() => 1, (x) => x, (x) => x * x, (x) => x * x * x, (x) => x * x * x * x, (x, y) => y, (x, y) => y * y, (x, y) => x * y, (x, y) => x * x * y];
const DTERMS_X = [() => 0, () => 1, (x) => 2 * x, (x) => 3 * x * x, (x) => 4 * x * x * x, () => 0, () => 0, (x, y) => y, (x, y) => 2 * x * y];
const DTERMS_Y = [() => 0, () => 0, () => 0, () => 0, () => 0, () => 1, (x, y) => 2 * y, (x) => x, (x) => x * x];
function solve(A, r) {
  const n = r.length;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let k = c + 1; k < n; k++) if (Math.abs(A[k][c]) > Math.abs(A[piv][c])) piv = k;
    [A[c], A[piv]] = [A[piv], A[c]];
    [r[c], r[piv]] = [r[piv], r[c]];
    for (let k = c + 1; k < n; k++) {
      const m = A[k][c] / A[c][c];
      for (let b = c; b < n; b++) A[k][b] -= m * A[c][b];
      r[k] -= m * r[c];
    }
  }
  const x = new Float64Array(n);
  for (let c = n - 1; c >= 0; c--) {
    let v = r[c];
    for (let b = c + 1; b < n; b++) v -= A[c][b] * x[b];
    x[c] = v / A[c][c];
  }
  return x;
}
function fitGlass(samples) {
  const n = TERMS.length;
  const A = Array.from({ length: n }, () => new Float64Array(n));
  const r = new Float64Array(n);
  for (const [x, y, z] of samples) {
    const f = TERMS.map((t) => t(x, y));
    for (let a = 0; a < n; a++) {
      r[a] += f[a] * z;
      for (let b = 0; b < n; b++) A[a][b] += f[a] * f[b];
    }
  }
  return solve(A, r);
}
const glassZ = (c, x, y) => TERMS.reduce((s, t, i) => s + c[i] * t(x, y), 0);
function glassN(c, x, y) {
  const dx = DTERMS_X.reduce((s, t, i) => s + c[i] * t(x, y), 0);
  const dy = DTERMS_Y.reduce((s, t, i) => s + c[i] * t(x, y), 0);
  const l = Math.hypot(dx, dy, 1);
  return [-dx / l, -dy / l, 1 / l];
}

function findVisor(pos, idx) {
  const o = makeOutline();
  const dm = frontDepth(pos, idx, o);
  const all = [];
  for (let j = 0; j < dm.H; j++) {
    for (let i = 0; i < dm.W; i++) {
      const z = dm.z[j * dm.W + i];
      const x = dm.x0 + (i + 0.5) * dm.cell, y = dm.y0 + (j + 0.5) * dm.cell;
      if (Number.isFinite(z) && o.inside(x, y, 0.012)) all.push([x, y, z]);
    }
  }
  let samples = all;
  let c = fitGlass(samples);
  // robust: the dreads hanging in front (and dents) drop out
  for (const thr of [0.06, 0.03, 0.015, 0.008]) {
    samples = all.filter(([x, y, z]) => Math.abs(z - glassZ(c, x, y)) < thr);
    c = fitGlass(samples);
  }
  // stand proud of the model's own visor everywhere it is not covered by a dread
  const res = all.map(([x, y, z]) => z - glassZ(c, x, y)).filter((d) => d < 0.03).sort((a, b) => a - b);
  const lift = res[Math.floor(res.length * 0.985)] + GLASS_GAP;
  c[0] += lift;
  return { c, o, inliers: samples.length, cells: all.length, lift };
}

// arc length along x on the glass (at a given height), as a lookup
function arcTable(v, x0, x1, y, steps = 2000) {
  const t = new Float64Array(steps + 1);
  const dx = (x1 - x0) / steps;
  for (let k = 1; k <= steps; k++) {
    const x = x0 + (k - 0.5) * dx;
    const dz = glassZ(v.c, x + dx / 2, y) - glassZ(v.c, x - dx / 2, y);
    t[k] = t[k - 1] + Math.hypot(dx, dz);
  }
  return { t, x0, dx, total: t[steps], at: (x) => {
    const f = Math.min(Math.max((x - x0) / dx, 0), steps);
    const k = Math.min(Math.floor(f), steps - 1);
    return t[k] + (t[k + 1] - t[k]) * (f - k);
  } };
}

// the glass: columns across the outline, each from its bottom to its top, on the fitted surface.
// UV: u by arc length, v by height (both linear: the lens shader maps the world by them).
// Per vertex also its distance to the glass's edge (model units), for the shader's bevel.
function visorGrid(v, nx = 180, ny = 64) {
  const { o } = v;
  const arc = arcTable(v, o.xl, o.xr, (o.ymin + o.top) / 2);
  const pos = [], nrm = [], uv = [], edge = [], idx = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      // denser towards the sides, where the rounded corners are
      const s = i / nx;
      const x = o.xl + (o.xr - o.xl) * (0.35 * (0.5 - 0.5 * Math.cos(Math.PI * s)) + 0.65 * s);
      const yb = o.bottom(x), yt = o.topAt(x);
      // rows denser at the bottom and top edges too
      const tj = j / ny;
      const y = yb + (yt - yb) * (0.3 * (0.5 - 0.5 * Math.cos(Math.PI * tj)) + 0.7 * tj);
      pos.push(x, y, glassZ(v.c, x, y));
      nrm.push(...glassN(v.c, x, y));
      uv.push(arc.at(x) / arc.total, (y - o.ymin) / (o.top - o.ymin));
      edge.push(Math.min(x - o.xl, o.xr - x, y - yb, yt - y));
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + nx + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return { pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), uv: Float32Array.from(uv), edge: Float32Array.from(edge), idx: Uint32Array.from(idx), arc };
}

// the AI's visor shell: inside the outline, at or just behind the glass (dreads stand out)
function inVisorShell(v, x, y, z) {
  if (!v.o.inside(x, y, -0.006)) return false;
  const d = z - glassZ(v.c, x, y);
  return d > -0.06 && d < 0.012;
}

// ---------------- run ----------------
const t0 = Date.now();
const src = readGlb(inPath);
const srcNrm = src.nrm ?? computeNormals(src.pos, src.idx);
console.log(`source: ${(src.idx.length / 3).toLocaleString()} triangles, ${(src.pos.length / 3).toLocaleString()} vertices`);
const box = bounds(src.pos);
console.log('bounds', box.min.map((v) => v.toFixed(3)), box.max.map((v) => v.toFixed(3)));

const visor = findVisor(src.pos, src.idx);
console.log(`visor: outline x ${visor.o.xl.toFixed(3)}..${visor.o.xr.toFixed(3)}, y ${visor.o.ymin.toFixed(3)}..${visor.o.top.toFixed(3)}; surface from ${visor.inliers}/${visor.cells} cells, lifted ${visor.lift.toFixed(4)}`);

// 1. the solid head
await MeshoptSimplifier.ready;
const [simpIdx, err] = MeshoptSimplifier.simplify(src.idx, src.pos, 3, TARGET_TRIS * 3, 0.02, []);
// keep only the vertices still used, renumbered
const remap = new Int32Array(src.pos.length / 3).fill(-1);
let used = 0;
for (let i = 0; i < simpIdx.length; i++) if (remap[simpIdx[i]] < 0) remap[simpIdx[i]] = used++;
const outPos = new Float32Array(used * 3);
for (let v = 0; v < remap.length; v++) {
  const r = remap[v];
  if (r >= 0) outPos.set(src.pos.subarray(v * 3, v * 3 + 3), r * 3);
}
const outIdx = new Uint32Array(simpIdx.length);
for (let i = 0; i < simpIdx.length; i++) outIdx[i] = remap[simpIdx[i]];
const outNrm = computeNormals(outPos, outIdx);

// the visor: a clean grid on the fitted glass, inside the photo's outline
const grid = visorGrid(visor);
// the head without the AI's visor shell
const headTris = [];
for (let t = 0; t < outIdx.length; t += 3) {
  const tri = [outIdx[t], outIdx[t + 1], outIdx[t + 2]];
  const shell = tri.every((v) => inVisorShell(visor, outPos[v * 3], outPos[v * 3 + 1], outPos[v * 3 + 2]));
  if (!shell) headTris.push(...tri);
}
const [ax, ay] = pxToModel(...ANCHOR_PX);
const visorExtras = {
  anchor: [ax, ay, glassZ(visor.c, ax, ay)],
  normal: glassN(visor.c, ax, ay),
  anchorUv: [grid.arc.at(ax) / grid.arc.total, (ay - visor.o.ymin) / (visor.o.top - visor.o.ymin)],
  size: [grid.arc.total, visor.o.top - visor.o.ymin] // model units: arc length x height
};
fs.mkdirSync(outDir, { recursive: true });
const glbPath = path.join(outDir, 'multi-head.glb');
writeGlb(glbPath, [
  { name: 'MultiHead', pos: outPos, nrm: outNrm, idx: Uint32Array.from(headTris) },
  { name: 'MultiVisor', pos: grid.pos, nrm: grid.nrm, uv: grid.uv, uv2: grid.edge, idx: grid.idx, extras: { visor: visorExtras } }
]);
console.log(`solid: ${(headTris.length / 3).toLocaleString()} head + ${(grid.idx.length / 3).toLocaleString()} visor triangles (error ${err.toFixed(4)}) -> ${glbPath} ${(fs.statSync(glbPath).size / 1e6).toFixed(1)} MB`);
console.log('visor', JSON.stringify(visorExtras, (k, v) => (typeof v === 'number' ? +v.toFixed(4) : v)));

// 2. the dots, from the full surface
const nTri = src.idx.length / 3;
const cdf = new Float64Array(nTri);
let total = 0;
for (let t = 0; t < nTri; t++) {
  const a = src.idx[t * 3] * 3;
  const b = src.idx[t * 3 + 1] * 3;
  const c = src.idx[t * 3 + 2] * 3;
  const p = src.pos;
  const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
  const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
  const cy = (p[a + 1] + p[b + 1] + p[c + 1]) / 3;
  // the visor is glass, not dots
  const onVisor = [a, b, c].every((k) => inVisorShell(visor, p[k], p[k + 1], p[k + 2]));
  const w = onVisor ? 0 : cy < SHOULDER_Y ? SHOULDER_WEIGHT : 1;
  total += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) * w;
  cdf[t] = total;
}
const rand = rng(1338);
const dotPos = new Float32Array(DOTS * 3);
const dotNrm = new Float32Array(DOTS * 3);
for (let k = 0; k < DOTS; k++) {
  const x = rand() * total;
  let lo = 0;
  let hi = nTri - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  let r1 = rand();
  let r2 = rand();
  if (r1 + r2 > 1) {
    r1 = 1 - r1;
    r2 = 1 - r2;
  }
  const w0 = 1 - r1 - r2;
  const ia = src.idx[lo * 3] * 3;
  const ib = src.idx[lo * 3 + 1] * 3;
  const ic = src.idx[lo * 3 + 2] * 3;
  let nl = 0;
  for (let d = 0; d < 3; d++) {
    dotPos[k * 3 + d] = src.pos[ia + d] * w0 + src.pos[ib + d] * r1 + src.pos[ic + d] * r2;
    dotNrm[k * 3 + d] = srcNrm[ia + d] * w0 + srcNrm[ib + d] * r1 + srcNrm[ic + d] * r2;
    nl += dotNrm[k * 3 + d] ** 2;
  }
  nl = Math.sqrt(nl) || 1;
  for (let d = 0; d < 3; d++) dotNrm[k * 3 + d] /= nl;
}
// quantise: positions to int16 inside the bounds, normals to int16 in [-1, 1]
const db = bounds(dotPos);
const head = Buffer.alloc(4 + 4 + 24);
head.write('MHD1', 0, 'ascii');
head.writeUInt32LE(DOTS, 4);
[...db.min, ...db.max].forEach((v, i) => head.writeFloatLE(v, 8 + i * 4));
const q = new Int16Array(DOTS * 6);
for (let k = 0; k < DOTS; k++) {
  for (let d = 0; d < 3; d++) {
    const span = db.max[d] - db.min[d] || 1;
    q[k * 6 + d] = Math.round(((dotPos[k * 3 + d] - db.min[d]) / span) * 65535 - 32768);
    q[k * 6 + 3 + d] = Math.round(Math.max(-1, Math.min(1, dotNrm[k * 3 + d])) * 32767);
  }
}
const dotsPath = path.join(outDir, 'multi-head-dots.bin');
fs.writeFileSync(dotsPath, Buffer.concat([head, Buffer.from(q.buffer)]));
console.log(`dots: ${DOTS.toLocaleString()} -> ${dotsPath} ${(fs.statSync(dotsPath).size / 1e6).toFixed(2)} MB`);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
