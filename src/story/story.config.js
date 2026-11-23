// =====================================================================
// STORY TIMELINE: single source of truth (see docs/storytelling/SCENARIUSZ.md §2)
// =====================================================================
// Every length is in `vh` of scroll. The story section starts at the very top of the page
// (it overlaps the sticky Hero), so "story vh" == window.scrollY expressed in vh.
//
// The motion is ONE continuous piece: no phase waits for the previous one to finish.
//   dust gathers -> its grout lights up tile by tile while the cracks already spread ->
//   burst (light pulse through the room) -> the camera catches the single's tile in the
//   air as time slows down -> living bullet time -> the whip through the hole ->
//   behind the wall the hole is one window of a dark cylinder: the camera keeps turning
//   from it to the albums hung on the same cylinder, and the dither gives way to a clean image.

export const STORY_CHAPTERS = [
  { id: 'dissolve', vh: 100 }, // S1: Multi turns to dust that is drawn into the grout
  { id: 'explode', vh: 75 }, // S2: charge peaks, burst, the camera catches the tile
  { id: 'single', vh: 145, anchor: 'nowa-piosenka', anchorAt: 0.15 }, // S3: bullet time + the single
  { id: 'turn', vh: 140 }, // S4: speed ramp, through the hole, 180° -> the room seen from behind
  { id: 'albums', vh: 360, anchor: 'dyskografia', anchorAt: 0.2 } // S5: the album ring -> black
];

// Key moments (absolute story-vh)
export const BEATS = {
  charge: [50, 115], // the crack front grows from the first settled dust to the burst
  burst: 115, // the wall gives
  pulseVh: 42, // the light pulse crosses the whole room in this much scroll
  caught: 180, // the camera has caught the single's tile; time is slowed right down
  textIn: [168, 190] // the single's title / meta come in as the camera arrives
};

// Absolute [start, end] in story-vh for every chapter
export const CHAPTER_RANGES = (() => {
  const out = {};
  let cursor = 0;
  for (const c of STORY_CHAPTERS) {
    out[c.id] = [cursor, cursor + c.vh];
    cursor += c.vh;
  }
  return out;
})();

export const STORY_SCROLL_VH = STORY_CHAPTERS.reduce((sum, c) => sum + c.vh, 0);

// The hero lives in the same canvas as the rest of the story (one renderer, one dither).
// Its layers (Multi, the type, the mouse smear, the dust) run on a 0 -> 0.5 clock over S1.
export const HERO_TR_END_VH = 97;
// No-WebGL fallback only: when the plain cover background fades in
export const FALLBACK_FADE_VH = [86, 96];

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);

// Hero clock (0 -> 0.5) for a given story-vh value
export function heroTr(storyVh) {
  return clamp01(storyVh / HERO_TR_END_VH) * 0.5;
}

// ---------------------------------------------------------------------
// CRACK FRONT: one accelerating curve from the first settled dust to the burst.
// A tile's grout is lit by smoothstep(cd - 1.5, cd + 0.4, front) (cd = crackDist), so:
//  front <= FRONT_MIN : nothing lit (the hero frame is the untouched photo)
//  front == 2.64      : the tiles the dust was drawn into (at ~85vh)
//  front == FRONT_MAX : the full crack star right at the burst
// The dust shader inverts the same curve so every dot lands as its tile lights up.
// ---------------------------------------------------------------------
export const FRONT_MIN = -1.5;
export const FRONT_MAX = 8.64;
export const FRONT_POW = 1.447;

export function crackFront(storyVh) {
  const t = clamp01((storyVh - BEATS.charge[0]) / (BEATS.charge[1] - BEATS.charge[0]));
  return FRONT_MIN + (FRONT_MAX - FRONT_MIN) * Math.pow(t, FRONT_POW);
}

// ---------------------------------------------------------------------
// BURST CLOCK ("story time" of the debris): integrated from a speed that never stops.
// Impact -> the debris flies at full speed -> eases (exponentially) into slow motion,
// reaching it as the camera catches the tile -> keeps drifting slowly through the hold.
// The turn adds its own speed ramp on top (StoryDirector). Continuous speed = no stops.
// ---------------------------------------------------------------------
const SLOW_DRIFT = 0.1; // burst units of slow drift between `caught` and the turn
const TAU = 16; // vh: how fast the burst decays into slow motion
const LUT_STEP = 0.25;
const BURST_LUT = (() => {
  const B = BEATS.burst;
  const turnStart = CHAPTER_RANGES.turn[0];
  const vSlow = SLOW_DRIFT / (turnStart - BEATS.caught);
  const ramp = (vh) => {
    const t = clamp01((vh - B) / 2.5);
    return t * t * (3 - 2 * t);
  };
  // v(vh) = ramp * (vSlow + A * exp(-(vh - B) / TAU)); A chosen so burst(caught) == 1
  let i1 = 0;
  let i2 = 0;
  for (let vh = B; vh < BEATS.caught; vh += LUT_STEP) {
    const r = ramp(vh + LUT_STEP / 2);
    i1 += r * vSlow * LUT_STEP;
    i2 += r * Math.exp(-(vh + LUT_STEP / 2 - B) / TAU) * LUT_STEP;
  }
  const A = (1 - i1) / i2;
  const n = Math.ceil((STORY_SCROLL_VH + 20) / LUT_STEP);
  const lut = new Float32Array(n + 1);
  let acc = 0;
  for (let k = 1; k <= n; k++) {
    const vh = (k - 0.5) * LUT_STEP;
    if (vh > B) acc += ramp(vh) * (vSlow + A * Math.exp(-(vh - B) / TAU)) * LUT_STEP;
    lut[k] = acc;
  }
  return lut;
})();

export function burstClock(storyVh) {
  const x = Math.max(storyVh, 0) / LUT_STEP;
  const k = Math.min(Math.floor(x), BURST_LUT.length - 2);
  const f = Math.min(x - k, 1);
  return BURST_LUT[k] + (BURST_LUT[k + 1] - BURST_LUT[k]) * f;
}

// ---------------------------------------------------------------------
// ALBUM TOWER (S5): no stop at the hole. The orbit starts while the turn is still
// finishing (ORBIT_START_VH) and flies on: away from the hole, up, around the tower.
// albumFocus: -1 = the hole, i = album i on the spiral, continuing a bit past the last.
// Between albums the speed eases down to ~55% (a linger) but never to zero.
// ---------------------------------------------------------------------
export const ALBUM_COUNT = 4;
export const ORBIT_START_VH = CHAPTER_RANGES.turn[0] + (CHAPTER_RANGES.turn[1] - CHAPTER_RANGES.turn[0]) * 0.6;
export const FIRST_ALBUM_VH = CHAPTER_RANGES.albums[0] + 30;
export const ALBUM_STEP_VH = 80;
export const ALBUM_SPACING = (72 * Math.PI) / 180; // around the tower
export const ALBUM_RISE = 2.0; // metres up the tower per album

const linger = (t) => {
  const s = clamp01(t);
  return s * 0.55 + s * s * s * (s * (s * 6 - 15) + 10) * 0.45;
};

export function albumFocus(storyVh) {
  if (storyVh <= ORBIT_START_VH) return -1;
  if (storyVh < FIRST_ALBUM_VH) {
    // leaves the hole already moving (half linear), eases onto the first album
    const t = (storyVh - ORBIT_START_VH) / (FIRST_ALBUM_VH - ORBIT_START_VH);
    const s = clamp01(t);
    return -1 + (s * 0.5 + (1 - Math.pow(1 - s, 2)) * 0.5);
  }
  const u = (storyVh - FIRST_ALBUM_VH) / ALBUM_STEP_VH;
  const i = Math.floor(u);
  if (i >= ALBUM_COUNT - 1) return ALBUM_COUNT - 1 + (u - (ALBUM_COUNT - 1)) * 0.55; // keeps flying
  return i + linger(u - i);
}

// Local 0..1 progress of a chapter for a given story-vh value
export function chapterProgress(id, storyVh) {
  const [a, b] = CHAPTER_RANGES[id];
  return clamp01((storyVh - a) / (b - a));
}

// Scroll position (in vh) of a menu anchor that lives inside the story
export function anchorVh(anchorId) {
  const chapter = STORY_CHAPTERS.find((c) => c.anchor === anchorId);
  if (!chapter) return null;
  const [a, b] = CHAPTER_RANGES[chapter.id];
  return a + (b - a) * (chapter.anchorAt ?? 0);
}
