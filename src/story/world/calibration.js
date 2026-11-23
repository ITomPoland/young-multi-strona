// =====================================================================
// ROOM CALIBRATION: measured from public/hero-empty-room.jpg (960x640)
// =====================================================================
// Measured with a grout-line fit on the photo:
//  - back wall: 28 tile columns, px 210.75 -> 748.35 (pitch 19.2 px)
//               22 tile rows,    px   4.75 -> 434.85 (pitch 19.55 px)
//  - vanishing point / principal point ≈ (479.4, 210) px  (no camera pitch: verticals are vertical)
//  - focal length ≈ 465 px (both side walls agree, from tile foreshortening)
// The photo camera sits at the world origin looking down -Z. Projecting the photo from
// that exact camera onto this box reproduces the image 1:1 from the start position, and
// gives real parallax as soon as the 3D camera moves.

export const PHOTO = {
  width: 960,
  height: 640,
  cx: 479.4,
  cy: 210,
  f: 465
};

export const TILE_COLS = 28;
export const TILE_ROWS = 22;

// 1 tile ≈ 20 cm. Everything else follows from the photo.
export const PITCH_X = 0.2;
export const PITCH_Y = 0.2 * (19.55 / 19.2);

// Back wall depth: 19.2 px per 0.2 m at focal 465 px
export const WALL_Z = -(PHOTO.f / 19.2) * PITCH_X; // ≈ -4.844

const pxToWorldX = (px) => ((px - PHOTO.cx) / PHOTO.f) * -WALL_Z;
const pyToWorldY = (py) => ((PHOTO.cy - py) / PHOTO.f) * -WALL_Z;

export const WALL_LEFT = pxToWorldX(210.75);
export const WALL_RIGHT = WALL_LEFT + TILE_COLS * PITCH_X;
export const WALL_TOP = pyToWorldY(4.75);
export const FLOOR_Y = WALL_TOP - TILE_ROWS * PITCH_Y;
export const CEILING_Y = WALL_TOP + 0.03;

export const TILE_THICKNESS = 0.022;

// Where the wall breaks open: centre of the wall at eye level (= principal point)
export const HOLE_CENTER = { x: 0, y: 0 };
// ...in tile-cell coordinates (column, row from the top)
export const HOLE_CELL = {
  x: (HOLE_CENTER.x - WALL_LEFT) / PITCH_X,
  y: (WALL_TOP - HOLE_CENTER.y) / PITCH_Y
};

export const INNER_RADIUS = 6.2; // tiles that blow out (in tile units)
export const RING_WIDTH = 3.2; // cracked, hanging tiles around the hole

// The single sits on this tile (just off-centre so it reads as "one of them")
export const HERO_CELL = { x: Math.floor(HOLE_CELL.x) + 1, y: Math.floor(HOLE_CELL.y) - 1 };

// Plaster/brick wall behind the tiles (the tiles sit on its front face)
export const WALL_THICKNESS = 0.3;
export const SLAB_FRONT_Z = WALL_Z - TILE_THICKNESS - 0.002;
export const SLAB_BACK_Z = SLAB_FRONT_Z - WALL_THICKNESS;

// ---------------------------------------------------------------------
// HOLE OUTLINE: one ragged, closed profile (radius per angle, in tile units)
// used by the wall shader, the extruded wall slab AND the tiles, so the hole,
// its thickness and the tiles that blow out always agree. Periodic in angle
// (sum of harmonics), so there is no seam.
// ---------------------------------------------------------------------
export const HOLE_SAMPLES = 96;
export const HOLE_PROFILE_SCALE = 10; // texture stores radius / 10
export const HOLE_PROFILE = (() => {
  let seed = 90210;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const harmonics = [];
  for (let k = 2; k <= 13; k++) harmonics.push({ k, amp: (0.95 / Math.pow(k, 0.75)) * (0.5 + rnd()), ph: rnd() * Math.PI * 2 });
  const out = new Float32Array(HOLE_SAMPLES);
  for (let i = 0; i < HOLE_SAMPLES; i++) {
    const a = ((i + 0.5) / HOLE_SAMPLES - 0.5) * Math.PI * 2;
    let r = 5.4;
    for (const h of harmonics) r += h.amp * Math.sin(h.k * a + h.ph) * 0.55;
    // a few sharp chips
    if (rnd() < 0.18) r += (rnd() - 0.4) * 0.9;
    out[i] = Math.min(Math.max(r, 4.4), 7.4);
  }
  return out;
})();
export const holeAngleAt = (i) => ((i + 0.5) / HOLE_SAMPLES - 0.5) * Math.PI * 2;

// Shared GLSL: world position -> photo UV (projection from the photo camera)
export const GLSL_PHOTO_PROJECTION = /* glsl */ `
  vec2 photoUv(vec3 p) {
    float z = max(-p.z, 0.05);
    float px = ${PHOTO.cx.toFixed(2)} + (p.x / z) * ${PHOTO.f.toFixed(2)};
    float py = ${PHOTO.cy.toFixed(2)} - (p.y / z) * ${PHOTO.f.toFixed(2)};
    return clamp(vec2(px / ${PHOTO.width.toFixed(1)}, 1.0 - py / ${PHOTO.height.toFixed(1)}), vec2(0.001), vec2(0.999));
  }
`;

// Shared GLSL: deterministic per-tile state, used by BOTH the tiles and the wall behind them
// so the plaster / hole always matches exactly which tiles are gone.
export const GLSL_TILE_STATE = /* glsl */ `
  float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  // radial distance of a cell from the hole centre, jittered so the hole is ragged
  float cellRadius(vec2 cell) {
    vec2 d = (cell + 0.5 - vec2(${HOLE_CELL.x.toFixed(3)}, ${HOLE_CELL.y.toFixed(3)})) * vec2(1.0, ${(PITCH_Y / PITCH_X).toFixed(4)});
    return length(d) + (tHash(cell * 1.37 + 3.1) - 0.5) * 2.4;
  }

  // 0 = outer (stays), 1 = ring (cracks / hangs), 2 = inner (blows out)
  float cellZone(float r) {
    if (r < ${INNER_RADIUS.toFixed(2)}) return 2.0;
    if (r < ${(INNER_RADIUS + RING_WIDTH).toFixed(2)}) return 1.0;
    return 0.0;
  }

  // shockwave: inner tiles leave in order of distance
  float cellDelay(vec2 cell, float r) {
    return max(r, 0.0) * 0.042 + tHash(cell * 2.91 + 7.7) * 0.05;
  }
`;

// Surfaces the photo never saw (near / behind the start camera, the front wall) reuse a
// band of tiles that IS in the photo, so the room still reads as tiled from any angle.
export const GLSL_PHOTO_WRAPPED = /* glsl */ `
  vec2 photoUvWrapped(vec3 p) {
    float band = 2.0; // 10 tiles deep, visible in the photo on walls and floor
    float zMax = ${WALL_Z.toFixed(4)} + band;
    if (p.z > zMax) p.z = ${WALL_Z.toFixed(4)} + mod(p.z - ${WALL_Z.toFixed(4)}, band);
    return photoUv(p);
  }
`;

// Hole outline lookup (needs: uniform sampler2D uHole;)
export const GLSL_HOLE = /* glsl */ `
  float holeRadius(float ang) {
    return texture2D(uHole, vec2(ang / 6.2831853 + 0.5, 0.5)).r * ${HOLE_PROFILE_SCALE.toFixed(1)};
  }
`;

// Impact cracks: star-shaped spread from the centre (rays), used by the 3D wall AND by
// the hero dust, which lands exactly on the grout of the first cracked tiles.
export const GLSL_CRACKS = /* glsl */ `
  float crackDist(vec2 cell) {
    vec2 d = cell + 0.5 - vec2(${HOLE_CELL.x.toFixed(3)}, ${HOLE_CELL.y.toFixed(3)});
    float ang = atan(d.y, d.x);
    float rays = 0.62 + 0.75 * abs(sin(ang * 2.5 + 1.3)) * (0.6 + 0.4 * abs(sin(ang * 4.0 + 0.4)));
    return length(d) * rays + tHash(cell * 9.13 + 1.7) * 1.1;
  }
`;
