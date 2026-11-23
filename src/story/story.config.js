// =====================================================================
// STORY TIMELINE: single source of truth (see docs/storytelling/SCENARIUSZ.md §2)
// =====================================================================
// Every length is in `vh` of scroll. The story section starts at the very top of the page
// (it overlaps the sticky Hero), so "story vh" == window.scrollY expressed in vh.
//
// Phase 1 implements S1–S4 (the 180° turn ends on the room seen from behind, then
// hands over to the existing discography). Later phases append chapters here.

export const STORY_CHAPTERS = [
  { id: 'dissolve', vh: 100 }, // S1: Multi turns to dust that draws the grout, 3D takes over
  { id: 'explode', vh: 110 }, // S2: grout glows -> cracks -> wall bursts, camera punches in and starts turning
  { id: 'single', vh: 190, anchor: 'nowa-piosenka', anchorAt: 0.55 }, // S3: tile flies past, bullet time + HOLD
  { id: 'turn', vh: 140 } // S4: speed ramp, through the hole, 180° -> the room seen from behind -> black
];

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

// Hand-off from the 2D hero canvas to the 3D story canvas (inside the `dissolve` chapter)
export const HERO_TR_END_VH = 97; // hero keeps rendering (dust on the grout) until the 3D canvas covers it
export const CANVAS_FADE_VH = [86, 96]; // story canvas cross-fades in over the identical frame

// Local 0..1 progress of a chapter for a given story-vh value
export function chapterProgress(id, storyVh) {
  const [a, b] = CHAPTER_RANGES[id];
  return Math.min(Math.max((storyVh - a) / (b - a), 0), 1);
}

// Scroll position (in vh) of a menu anchor that lives inside the story
export function anchorVh(anchorId) {
  const chapter = STORY_CHAPTERS.find((c) => c.anchor === anchorId);
  if (!chapter) return null;
  const [a, b] = CHAPTER_RANGES[chapter.id];
  return a + (b - a) * (chapter.anchorAt ?? 0);
}
