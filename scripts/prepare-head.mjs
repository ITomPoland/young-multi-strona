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
// 3. the VISOR: Multi's shield as a clean glass mesh in the exact shape of the model's visor
//    (the lens: the reflection is shown on it). A smooth surface z = a + b x^2 + c y + d y^2 is
//    fitted (robustly) to the frontmost points of the visor's clear strip; the visor's OUTLINE
//    is read row by row (where the frontmost surface lies on that glass; under the dreads it
//    carries the last clear row on); a fresh grid is built inside that outline ON the fitted
//    surface (perfectly smooth, whatever the AI made), with UVs by arc length (u) and height
//    (v). The AI's own visor shell inside the outline is removed from the head and the dots
//    (dreads in front of it are kept). The camera's anchor goes on the glass's lower part,
//    clear of the dreads. Its data (anchor, normal, anchor UV, size) is in the node's extras.
//    The band can be moved with VISOR_Y0 / VISOR_Y1 (model units) if a new model needs it.
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
// where the visor is cut (y, model units: from its bottom rim up under the dreads) and the
// clean, uncovered strip its surface is fitted to (measured on the Meshy model: the visor's
// bottom rim is at y ~0, dreads hang over it from y ~0.22, it reaches |x| ~0.36)
const VISOR_BAND = [Number(process.env.VISOR_Y0 ?? 0.0), Number(process.env.VISOR_Y1 ?? 0.4)];
const VISOR_FIT = { y: [0.02, 0.21], x: 0.34 };
const ANCHOR_V = 0.35; // the camera's anchor, up the visor (0 = bottom)
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
// least squares for z = c0 + c1 x^2 + c2 y + c3 y^2
function fitSurface(pos, ids) {
  const A = Array.from({ length: 4 }, () => new Float64Array(4));
  const r = new Float64Array(4);
  for (const i of ids) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    const f = [1, x * x, y, y * y];
    for (let a = 0; a < 4; a++) {
      r[a] += f[a] * z;
      for (let b = 0; b < 4; b++) A[a][b] += f[a] * f[b];
    }
  }
  // gaussian elimination
  for (let c = 0; c < 4; c++) {
    let piv = c;
    for (let k = c + 1; k < 4; k++) if (Math.abs(A[k][c]) > Math.abs(A[piv][c])) piv = k;
    [A[c], A[piv]] = [A[piv], A[c]];
    [r[c], r[piv]] = [r[piv], r[c]];
    for (let k = c + 1; k < 4; k++) {
      const m = A[k][c] / A[c][c];
      for (let b = c; b < 4; b++) A[k][b] -= m * A[c][b];
      r[k] -= m * r[c];
    }
  }
  const x = new Float64Array(4);
  for (let c = 3; c >= 0; c--) {
    let v = r[c];
    for (let b = c + 1; b < 4; b++) v -= A[c][b] * x[b];
    x[c] = v / A[c][c];
  }
  return x;
}
const zFit = (c, x, y) => c[0] + c[1] * x * x + c[2] * y + c[3] * y * y;
function nFit(c, x, y) {
  const nx = -2 * c[1] * x;
  const ny = -(c[2] + 2 * c[3] * y);
  const l = Math.hypot(nx, ny, 1);
  return [nx / l, ny / l, 1 / l];
}
const pct = (arr, q) => {
  const a = Float64Array.from(arr).sort();
  return a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))];
};

function findVisor(pos, nrm) {
  // only the FRONTMOST point of each small (x, y) cell: the model also has surfaces behind the
  // visor (the face under it, its inner side), which must not pull the fit back
  const CELL = 0.008;
  const front = new Map();
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1];
    if (y <= VISOR_FIT.y[0] || y >= VISOR_FIT.y[1] || Math.abs(x) >= VISOR_FIT.x) continue;
    const key = Math.floor(x / CELL) * 100000 + Math.floor(y / CELL);
    const best = front.get(key);
    if (best === undefined || pos[i + 2] > pos[best + 2]) front.set(key, i);
  }
  // (the AI's visor is a thin double shell: its normals may point either way, so |n| is used)
  let ids = [...front.values()].filter((i) => Math.abs(nrm[i + 2]) > 0.75 && Math.abs(nrm[i + 1]) < 0.35 && pos[i + 2] > 0.55);
  if (ids.length < 500) throw new Error(`visor: only ${ids.length} candidate points; adjust VISOR_Y0/VISOR_Y1`);
  let c = fitSurface(pos, ids);
  for (const thr of [0.03, 0.015, 0.008]) {
    ids = ids.filter((i) => Math.abs(pos[i + 2] - zFit(c, pos[i], pos[i + 1])) < thr);
    c = fitSurface(pos, ids);
  }
  return { c, y0: VISOR_BAND[0], y1: VISOR_BAND[1], inliers: ids.length };
}

// below this height the visor is clear; above it dreads hang over it (model units)
const VISOR_CLEAR_Y = 0.22;

// arc length along x on the fitted surface (at the visor's middle height), as a lookup
function arcTable(v, x0, x1, steps = 2000) {
  const t = new Float64Array(steps + 1);
  const dx = (x1 - x0) / steps;
  for (let k = 1; k <= steps; k++) {
    const x = x0 + (k - 0.5) * dx;
    t[k] = t[k - 1] + Math.hypot(1, 2 * v.c[1] * x) * dx;
  }
  return { t, x0, dx, total: t[steps], at: (x) => {
    const f = Math.min(Math.max((x - x0) / dx, 0), steps);
    const k = Math.min(Math.floor(f), steps - 1);
    return t[k] + (t[k + 1] - t[k]) * (f - k);
  } };
}

// the visor's outline: per row (y), the span [xl, xr] round x = 0 where the frontmost surface
// lies on the fitted glass; rows under the dreads carry the last clear span on
function visorOutline(v, pos) {
  const CELL = 0.01;
  const y0 = -0.03;
  const y1 = VISOR_BAND[1];
  const rows = Math.round((y1 - y0) / CELL);
  const cols = Math.round(1.0 / CELL); // x in [-0.5, 0.5]
  const front = new Float64Array(rows * cols).fill(-Infinity);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1];
    if (y < y0 || y >= y1 || x < -0.5 || x >= 0.5) continue;
    const k = Math.floor((y - y0) / CELL) * cols + Math.floor((x + 0.5) / CELL);
    if (pos[i + 2] > front[k]) front[k] = pos[i + 2];
  }
  const spans = [];
  let last = null;
  for (let r = 0; r < rows; r++) {
    const y = y0 + (r + 0.5) * CELL;
    const on = (c) => {
      const f = front[r * cols + c];
      if (!Number.isFinite(f)) return false;
      const d = f - zFit(v.c, x0(c), y);
      // on the glass (its ridge included); under the dreads anything at or in front of it
      return y > VISOR_CLEAR_Y ? d > -0.035 : d > -0.035 && d < 0.06;
    };
    const x0 = (c) => -0.5 + (c + 0.5) * CELL;
    const mid = Math.floor(cols / 2);
    let start = -1;
    for (let k = 0; k <= 10 && start < 0; k++) {
      if (on(mid - k)) start = mid - k;
      else if (on(mid + k)) start = mid + k;
    }
    if (start < 0) {
      spans.push(y > VISOR_CLEAR_Y && last ? { y, ...last } : null);
      continue;
    }
    let l = start;
    let rr = start;
    // walk out, allowing 2-cell gaps
    while (l > 0 && (on(l - 1) || (l > 2 && on(l - 2)) || (l > 3 && on(l - 3)))) l--;
    while (rr < cols - 1 && (on(rr + 1) || (rr < cols - 2 && on(rr + 2)) || (rr < cols - 3 && on(rr + 3)))) rr++;
    let span = { xl: -0.5 + l * CELL, xr: -0.5 + (rr + 1) * CELL };
    if (y > VISOR_CLEAR_Y && last) span = { xl: Math.max(span.xl, last.xl), xr: Math.min(span.xr, last.xr) };
    if (y <= VISOR_CLEAR_Y) last = span;
    spans.push({ y, ...span });
  }
  // keep the main run of rows with a real width, smooth the edges (median of 5 rows)
  const good = spans.map((sp) => sp && sp.xr - sp.xl > 0.25);
  let bestA = 0, bestB = -1, a = -1;
  for (let r = 0; r <= rows; r++) {
    if (r < rows && good[r]) {
      if (a < 0) a = r;
    } else if (a >= 0) {
      if (r - 1 - a > bestB - bestA) {
        bestA = a;
        bestB = r - 1;
      }
      a = -1;
    }
  }
  const run = spans.slice(bestA, bestB + 1);
  const med = (arr) => arr.slice().sort((p, q) => p - q)[Math.floor(arr.length / 2)];
  return run.map((sp, i) => {
    const win = run.slice(Math.max(0, i - 2), Math.min(run.length, i + 3));
    return { y: sp.y, xl: med(win.map((w) => w.xl)), xr: med(win.map((w) => w.xr)) };
  });
}

// interpolate the outline at height y
function spanAt(outline, y) {
  if (y <= outline[0].y) return outline[0];
  const last = outline[outline.length - 1];
  if (y >= last.y) return last;
  for (let i = 1; i < outline.length; i++) {
    if (y <= outline[i].y) {
      const a = outline[i - 1], b = outline[i];
      const t = (y - a.y) / (b.y - a.y);
      return { y, xl: a.xl + (b.xl - a.xl) * t, xr: a.xr + (b.xr - a.xr) * t };
    }
  }
  return last;
}

// a grid ON the fitted glass, inside the outline (rows follow the outline's span)
function visorGrid(v, outline, nx = 96, ny = 40) {
  const yb = outline[0].y - 0.005;
  const yt = outline[outline.length - 1].y + 0.005;
  let xmin = Infinity, xmax = -Infinity;
  for (const sp of outline) {
    xmin = Math.min(xmin, sp.xl);
    xmax = Math.max(xmax, sp.xr);
  }
  const arc = arcTable(v, xmin, xmax);
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  for (let j = 0; j <= ny; j++) {
    const y = yb + ((yt - yb) * j) / ny;
    const sp = spanAt(outline, y);
    for (let i = 0; i <= nx; i++) {
      const x = sp.xl + ((sp.xr - sp.xl) * i) / nx;
      pos.push(x, y, zFit(v.c, x, y) + 0.004); // just proud of whatever the AI left
      nrm.push(...nFit(v.c, x, y));
      uv.push(arc.at(x) / arc.total, (y - yb) / (yt - yb));
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + nx + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return { pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), uv: Float32Array.from(uv), idx: Uint32Array.from(idx), yb, yt, arc, xmin, xmax };
}

// the AI's visor shell: inside the outline and close to the glass (dreads stand further out)
function inVisorShell(v, outline, x, y, z) {
  if (y < outline[0].y - 0.01 || y > outline[outline.length - 1].y + 0.01) return false;
  const sp = spanAt(outline, y);
  if (x < sp.xl - 0.01 || x > sp.xr + 0.01) return false;
  const d = z - zFit(v.c, x, y);
  return d > -0.05 && d < 0.035;
}

// ---------------- run ----------------
const t0 = Date.now();
const src = readGlb(inPath);
const srcNrm = src.nrm ?? computeNormals(src.pos, src.idx);
console.log(`source: ${(src.idx.length / 3).toLocaleString()} triangles, ${(src.pos.length / 3).toLocaleString()} vertices`);
const box = bounds(src.pos);
console.log('bounds', box.min.map((v) => v.toFixed(3)), box.max.map((v) => v.toFixed(3)));

const visor = findVisor(src.pos, srcNrm);
console.log(`visor surface: z = ${visor.c[0].toFixed(3)} + ${visor.c[1].toFixed(3)} x^2 + ${visor.c[2].toFixed(3)} y + ${visor.c[3].toFixed(3)} y^2, y ${visor.y0.toFixed(3)}..${visor.y1.toFixed(3)} (${visor.inliers} inliers)`);

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

// the visor: outline from the full model, a clean grid on the fitted glass
const outline = visorOutline(visor, src.pos);
const grid = visorGrid(visor, outline);
console.log(`visor outline: y ${grid.yb.toFixed(3)}..${grid.yt.toFixed(3)}, x ${grid.xmin.toFixed(3)}..${grid.xmax.toFixed(3)}`);
// the head without the AI's visor shell
const headTris = [];
for (let t = 0; t < outIdx.length; t += 3) {
  const tri = [outIdx[t], outIdx[t + 1], outIdx[t + 2]];
  const shell = tri.every((v) => inVisorShell(visor, outline, outPos[v * 3], outPos[v * 3 + 1], outPos[v * 3 + 2]));
  if (!shell) headTris.push(...tri);
}
const ANCHOR_X = 0; // the middle of the glass
const ax = ANCHOR_X;
const ay = grid.yb + ANCHOR_V * (grid.yt - grid.yb);
const anchorSpan = spanAt(outline, ay);
const visorExtras = {
  anchor: [ax, ay, zFit(visor.c, ax, ay) + 0.004],
  normal: nFit(visor.c, ax, ay),
  anchorUv: [grid.arc.at(ax) / grid.arc.total, ANCHOR_V],
  size: [grid.arc.total, grid.yt - grid.yb], // model units: arc length x height
  anchorSpan: [anchorSpan.xl, anchorSpan.xr]
};
fs.mkdirSync(outDir, { recursive: true });
const glbPath = path.join(outDir, 'multi-head.glb');
writeGlb(glbPath, [
  { name: 'MultiHead', pos: outPos, nrm: outNrm, idx: Uint32Array.from(headTris) },
  { name: 'MultiVisor', pos: grid.pos, nrm: grid.nrm, uv: grid.uv, idx: grid.idx, extras: { visor: visorExtras } }
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
  const onVisor = [a, b, c].every((k) => inVisorShell(visor, outline, p[k], p[k + 1], p[k + 2]));
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
