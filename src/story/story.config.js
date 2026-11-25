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
  { id: 'albums', vh: 350, anchor: 'dyskografia', anchorAt: 0.2 }, // S5: 4 albums + LOST MEDIA (it ends on LOST MEDIA)
  { id: 'reveal', vh: 330, anchor: 'o-mnie', anchorAt: 0.36 }, // S6: sunglasses reflection -> Multi's head -> "o mnie"
  { id: 'merch', vh: 415, anchor: 'merch', anchorAt: 0.18 } // S7: YFL -> solid LOST MEDIA Box -> Exploded View -> Selected Goods
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
export const ALBUM_COUNT = 5; // the four albums + LOST MEDIA (announced, corrupted)
// past LOST MEDIA the tower goes on: the covers come round again (only ever seen in the
// reveal, as the reflection in Multi's sunglasses), so the motion never stops
export const TOWER_PANELS = 14;
export const ORBIT_START_VH = CHAPTER_RANGES.turn[0] + (CHAPTER_RANGES.turn[1] - CHAPTER_RANGES.turn[0]) * 0.6;
export const FIRST_ALBUM_VH = CHAPTER_RANGES.albums[0] + 30;
export const ALBUM_STEP_VH = 80;
export const ALBUM_SPACING = (72 * Math.PI) / 180; // around the tower
export const ALBUM_RISE = 2.0; // metres up the tower per album

const linger = (t) => {
  const s = clamp01(t);
  return s * 0.55 + s * s * s * (s * (s * 6 - 15) + 10) * 0.45;
};

// ---------------------------------------------------------------------
// THE WHIP -> TOWER HANDOFF: the camera must never brake at the hole.
// The whip (first 60% of the turn) ends still moving: m'(1) = WHIP_END_SLOPE.
// Its spin is carried on by the camera itself (spinCarry: it overshoots the tower a few
// degrees and swings back) and its forward speed by the pull-out (TOWER_PULL), while the
// orbit round the tower picks up from rest. Speed is continuous across the handoff.
// ---------------------------------------------------------------------
export const WHIP_END_SLOPE = 1.0;
export const WHIP_VH = (CHAPTER_RANGES.turn[1] - CHAPTER_RANGES.turn[0]) * 0.6;
// cubic with m(0)=0, m'(0)=0, m(1)=1, m'(1)=WHIP_END_SLOPE (peaks ~1.33 at u=2/3, no stop)
export function whipEase(u) {
  const t = clamp01(u);
  const k = WHIP_END_SLOPE;
  return (3 - k) * t * t + (k - 2) * t * t * t;
}
// The whip turns ~(180° - the tile's own yaw) in WHIP_VH; this is its spin as it lets go
const SPIN_RATE = ((Math.PI - 0.32) * WHIP_END_SLOPE) / WHIP_VH; // rad per vh
// Extra yaw after the handoff. The camera's TOTAL heading follows one Hermite that starts
// at the whip's spin rate and slows monotonically onto album 0 (arriving with the linger's
// speed); the orbit position (albumFocus) starts from rest, and the difference is this
// overshoot: the gaze runs ahead towards album 0, then the orbit catches up. 0 from album 0 on.
export function spinCarry(storyVh) {
  if (storyVh <= ORBIT_START_VH || storyVh >= FIRST_ALBUM_VH) return 0;
  const T = FIRST_ALBUM_VH - ORBIT_START_VH;
  const t = (storyVh - ORBIT_START_VH) / T;
  const m0 = (SPIN_RATE * T) / ALBUM_SPACING; // the spin in focus units per t
  return m0 * (t * t * t - 2 * t * t + t) * ALBUM_SPACING; // h10 term: heading - orbit
}
// Pull-out from the wound: r(x) = out * (1 - (1 + c x) e^(-x / tau)), with c chosen so it
// starts at the whip's speed (v0, metres per vh) and settles without overshoot
export const TOWER_PULL = { out: 4.6, tau: 22, v0: 0.055 };
export function towerPull(storyVh) {
  const x = Math.max(storyVh - ORBIT_START_VH, 0);
  const { out, tau, v0 } = TOWER_PULL;
  const c = 1 / tau - v0 / out;
  return out * (1 - (1 + c * x) * Math.exp(-x / tau));
}

export function albumFocus(storyVh) {
  if (storyVh <= ORBIT_START_VH) return -1;
  if (storyVh < FIRST_ALBUM_VH) {
    // Hermite: leaves the hole from rest (the spin is carried by spinCarry), arrives on
    // album 0 at exactly the speed the linger starts with -> no kink anywhere
    const t = clamp01((storyVh - ORBIT_START_VH) / (FIRST_ALBUM_VH - ORBIT_START_VH));
    const m1 = (0.55 * (FIRST_ALBUM_VH - ORBIT_START_VH)) / ALBUM_STEP_VH;
    const h00 = 2 * t * t * t - 3 * t * t + 1;
    const h11 = t * t * t - t * t;
    return -h00 + m1 * h11;
  }
  const u = (storyVh - FIRST_ALBUM_VH) / ALBUM_STEP_VH;
  const i = Math.floor(u);
  // past the last album (LOST MEDIA) the orbit simply goes on up the tower, past the covers
  // coming round again: the reveal (S6) starts while the world is still moving, and Multi's
  // sunglasses keep reflecting it
  return i + linger(u - i);
}

// ---------------------------------------------------------------------
// THE REVEAL (S6): the tower was a reflection in Multi's sunglasses.
//  switch: the screen becomes the lens (pixel-identical: the lens shows the world 1:1)
//  -> the picture bulges like convex glass, darkens at the rim, a glint crosses it
//  pull:   the camera pulls back off the lens (eases in from rest, peaks early, long brake):
//          glasses, face, head; it starts while the picture is still bulging
//  scan:   a laser line runs down the head; behind it the head turns into dots
//  hold:   the head, alive (cursor) -> black at the end
// ---------------------------------------------------------------------
export const REVEAL = (() => {
  const [a, b] = CHAPTER_RANGES.reveal;
  // the albums chapter ends exactly on LOST MEDIA: the screen turns into the glass right there
  return { switch: a + 4, pull: [a + 14, a + 88], scan: [a + 80, a + 116], hold: [a + 116, b - 14], end: b };
})();

// S7: SELECTED GOODS. YFL particles pour DIRECTLY into the LOST MEDIA Collector's Box
// (zero detour back to head = brisk, punchy scroll!), reverse laser turns it solid,
// slipcase opens into 3D Exploded View, then smoothly scrolls through the 4 archival drops.
export const MERCH_COUNT = 4; // 0: LOST MEDIA BOX, 1: STEALTH ERA TEE, 2: PATCH HOODIE, 3: EMBOSSED HOODIE
export const MERCH = (() => {
  const [a, b] = CHAPTER_RANGES.merch;
  const firstItemVh = a + 76;
  const itemStepVh = 68;
  const lastItemVh = firstItemVh + (MERCH_COUNT - 1) * itemStepVh;
  return {
    start: a,
    morphToBox: [a - 28, a - 2], // YFL logo -> LOST MEDIA Box (uMorph: 3 -> 4)
    materialize: [a - 4, a + 26], // reverse turquoise laser sweeps UP: particles -> solid box
    explode: [a + 28, a + 66], // 3D exploded view: slipcase shifts, iridescent disc slides out
    firstItemVh,
    itemStepVh,
    uiIn: [a + 18, a + 38],
    uiOut: [lastItemVh + 32, lastItemVh + 48],
    black: [lastItemVh + 38, lastItemVh + 68],
    end: b,
    // Focus cursor 0..3 with subtle linger on each product (same feel as the album tower)
    focus(vh) {
      if (vh <= firstItemVh) return 0;
      const u = (vh - firstItemVh) / itemStepVh;
      const clamped = Math.min(u, MERCH_COUNT - 1);
      const i = Math.floor(clamped);
      if (i >= MERCH_COUNT - 1) return MERCH_COUNT - 1;
      return i + linger(clamped - i);
    },
    vhForItem(idx) {
      return firstItemVh + idx * itemStepVh;
    }
  };
})();

// "O MNIE" (S6 hold): the scan's read-out. Absolute story-vh.
// ABOUT.morph(vh): 0 head, 1 pad, 2 vinyl, 3 YFL logo, 4 LOST MEDIA box (direct from YFL!).
export const ABOUT = (() => {
  const h = REVEAL.hold[0];
  const chapters = [
    [h + 14, h + 62],
    [h + 62, h + 110],
    [h + 110, h + 160]
  ];
  const stats = [h + 156, h + 176];
  // 0->1 pad, 1->2 vinyl, 2->3 YFL logo, 3->4 LOST MEDIA box
  const steps = [...chapters.map((c) => c[0]).map((v) => [v - 7, v + 11]), MERCH.morphToBox];
  return {
    intro: [h - 12, h + 8], // "scan complete", the name decodes
    chapters,
    stats,
    out: [MERCH.morphToBox[0] - 4, MERCH.morphToBox[0] + 10], // "o mnie" HUD leaves as YFL pours into Box
    morph(vh) {
      let m = 0;
      steps.forEach(([a, b]) => {
        m += Math.min(Math.max((vh - a) / (b - a), 0), 1);
      });
      return m;
    },
    // the chapter on now (-1: none), for the overlay's index
    chapterAt(vh) {
      return chapters.findIndex(([a, b]) => vh >= a - 2 && vh < b - 2);
    }
  };
})();

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
