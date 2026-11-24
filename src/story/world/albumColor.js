// =====================================================================
// One colour per album, read from its cover once at load: the average of the cover's
// pixels weighted towards the saturated, bright ones (so a white background or a dark
// photo does not win), then lifted to a clear, light tone that reads as light in the dark.
// A cover with almost no colour (LOST MEDIA's black and white) falls back to the cold
// light of the room, the grout light.
// =====================================================================

export const ROOM_LIGHT = [0.62, 0.8, 0.9];

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-5) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, max > 0 ? d / max : 0, max];
}

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

export function albumColor(image) {
  try {
    const N = 32;
    const c = document.createElement('canvas');
    c.width = N;
    c.height = N;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, N, N);
    const px = ctx.getImageData(0, 0, N, N).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let wSum = 0;
    for (let i = 0; i < px.length; i += 4) {
      const pr = px[i] / 255;
      const pg = px[i + 1] / 255;
      const pb = px[i + 2] / 255;
      const [, s, v] = rgbToHsv(pr, pg, pb);
      const w = s * s * v;
      r += pr * w;
      g += pg * w;
      b += pb * w;
      wSum += w;
    }
    if (wSum < N * N * 0.008) return ROOM_LIGHT; // e.g. TAD: green type on white is ~0.015
    const [h, s] = rgbToHsv(r / wSum, g / wSum, b / wSum);
    return hsvToRgb(h, Math.min(Math.max(s * 1.15, 0.45), 0.85), 0.92);
  } catch {
    return ROOM_LIGHT;
  }
}

export const cssColor = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(', ')})`;
