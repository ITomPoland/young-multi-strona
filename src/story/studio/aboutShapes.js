// =====================================================================
// "O MNIE": the shapes the head's dots pour into, one per chapter (Igloo-style: the same dots,
// reorganised by the subject of the text):
//   1 POCZĄTEK      a game pad (he started as a gamer on YouTube)
//   2 NOWA FALA     a vinyl record (the debut, #1 on OLiS); spun in the shader
//   3 YOUNG FAMILY  the YFL logo (his label), read from the logo picture
// Every shape: `count` points, metres, centred on (0, 0, 0), facing +Z, about head-sized.
// Seeded, so the dots land on the same spots every load.
// =====================================================================

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

const len2 = (x, y) => Math.hypot(x, y);
const sdCircle = (x, y, cx, cy, r) => len2(x - cx, y - cy) - r;
const sdBox = (x, y, cx, cy, hw, hh, r = 0) => {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return len2(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

// a 2D outline (sdf < 0 inside) extruded to a slab: points on its front and back faces and
// round its rim; `bump(x, y)` raises details on the front face
function slab(count, sdf, bounds, thick, bump, rand) {
  const out = new Float32Array(count * 3);
  const [x0, x1, y0, y1] = bounds;
  let k = 0;
  let guard = 0;
  while (k < count && guard < count * 400) {
    guard++;
    const x = x0 + (x1 - x0) * rand();
    const y = y0 + (y1 - y0) * rand();
    const d = sdf(x, y);
    if (d > 0) continue;
    const r = rand();
    let z;
    if (d > -0.004 && r < 0.3) {
      z = (rand() - 0.5) * thick; // the rim
    } else if (r < 0.82) {
      z = thick / 2 + bump(x, y); // the front face
    } else {
      z = -thick / 2; // the back
    }
    out[k * 3] = x;
    out[k * 3 + 1] = y;
    out[k * 3 + 2] = z;
    k++;
  }
  return out;
}

// --- 1. the game pad ---
function gamePad(count, rand) {
  const body = (x, y) => {
    const mid = sdBox(x, y, 0, 0.018, 0.098, 0.04, 0.035);
    // the grips: rounded, angled down and out
    const gl = sdBox(x, y, -0.098, -0.04, 0.034, 0.05, 0.034);
    const gr = sdBox(x, y, 0.098, -0.04, 0.034, 0.05, 0.034);
    return smin(smin(mid, gl, 0.03), gr, 0.03);
  };
  const dpad = (x, y) => Math.min(sdBox(x, y, -0.085, 0.012, 0.03, 0.009, 0.003), sdBox(x, y, -0.085, 0.012, 0.009, 0.03, 0.003));
  const buttons = (x, y) =>
    Math.min(
      sdCircle(x, y, 0.085, 0.036, 0.011),
      sdCircle(x, y, 0.085, -0.012, 0.011),
      sdCircle(x, y, 0.061, 0.012, 0.011),
      sdCircle(x, y, 0.109, 0.012, 0.011)
    );
  const sticks = (x, y) => Math.min(sdCircle(x, y, -0.04, -0.035, 0.019), sdCircle(x, y, 0.04, -0.035, 0.019));
  const bump = (x, y) => {
    // details stand 5 mm+ proud of the face: the shader colours them (z > FEATURE_Z)
    if (dpad(x, y) < 0 || buttons(x, y) < 0) return 0.012;
    const s = sticks(x, y);
    if (s < 0) return 0.018 + s * 0.3;
    return 0;
  };
  return slab(count, body, [-0.15, 0.15, -0.1, 0.07], 0.05, bump, rand);
}

// a pad dot standing proud of its face is a button, the cross or a stick (metres; the shader
// colours those)
export const PAD_FEATURE_Z = 0.025 + 0.005;

// --- 2. the vinyl: a flat disc in XY (the shader tilts and spins it); denser on the grooves ---
function vinyl(count, rand) {
  const out = new Float32Array(count * 3);
  const R = 0.15;
  let k = 0;
  while (k < count) {
    // area-uniform radius, with the grooves (fine rings) and the label's edge kept denser
    const r = R * Math.sqrt(rand());
    const a = rand() * Math.PI * 2;
    if (r < 0.007) continue; // the spindle hole
    const groove = r > 0.056 ? 0.45 + 0.55 * Math.abs(Math.sin(r * 520)) : 1;
    const band = r > 0.054 && r < 0.058 ? 0.4 : 0; // a gap between the label and the grooves
    if (rand() > groove - band) continue;
    out[k * 3] = Math.cos(a) * r;
    out[k * 3 + 1] = Math.sin(a) * r;
    out[k * 3 + 2] = (rand() - 0.5) * 0.004;
    k++;
  }
  return out;
}

// --- 3. the YFL logo, from its picture (white on black): an extruded mark ---
function logoMask(image) {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, N, N);
  const px = ctx.getImageData(0, 0, N, N).data;
  const inside = new Uint8Array(N * N);
  let minX = N, maxX = 0, minY = N, maxY = 0;
  for (let i = 0; i < N * N; i++) {
    if (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] > 3 * 128) {
      inside[i] = 1;
      const x = i % N, y = Math.floor(i / N);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return { N, inside, box: [minX, maxX + 1, minY, maxY + 1] };
}

function logo(count, rand, image) {
  if (!image) return vinyl(count, rand); // (no picture: never empty)
  const { N, inside, box } = logoMask(image);
  const W = 0.26; // metres across
  const sx = W / (box[1] - box[0]);
  const cx = (box[0] + box[1]) / 2;
  const cy = (box[2] + box[3]) / 2;
  const at = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    return ix >= 0 && iy >= 0 && ix < N && iy < N && inside[iy * N + ix] === 1;
  };
  const out = new Float32Array(count * 3);
  let k = 0;
  let guard = 0;
  const T = 0.035;
  while (k < count && guard < count * 200) {
    guard++;
    const x = box[0] + (box[1] - box[0]) * rand();
    const y = box[2] + (box[3] - box[2]) * rand();
    if (!at(x, y)) continue;
    // near an edge of the mark: some dots on its sides (the extrusion)
    const edge = !at(x + 2, y) || !at(x - 2, y) || !at(x, y + 2) || !at(x, y - 2);
    const r = rand();
    const z = edge && r < 0.35 ? (rand() - 0.5) * T : r < 0.85 ? T / 2 : -T / 2;
    out[k * 3] = (x - cx) * sx;
    out[k * 3 + 1] = -(y - cy) * sx;
    out[k * 3 + 2] = z;
    k++;
  }
  return out;
}

export function makeShapes(count, logoImage, seed = 7) {
  const rand = rng(seed);
  return { pad: gamePad(count, rand), vinyl: vinyl(count, rand), logo: logo(count, rand, logoImage) };
}
