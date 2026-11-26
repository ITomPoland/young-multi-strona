// Mutable per-frame state shared by the director, the 3D scene and the DOM overlay.
// Lives in a ref: nothing here triggers React re-renders.
// NOTE: no three.js import here. This module is part of the initial bundle; the
// three.js parts (hero tile pose) are attached lazily by StoryCanvas (storyThree.js).

export function createStoryState() {
  return {
    vh: 0,
    active: true,
    tr: 0, // hero clock 0 -> 0.5 (Multi dissolves, dust into the grout)
    pulse: 0, // burst light pulse through the room 0 -> 1
    albumFocus: -1, // album ring: -1 = the hole, i = album i
    ring: 0, // 1 once the album ring can be seen (from the turn on)
    clean: 0, // 0 = dithered story look, 1 = clean image (album ring)
    heroStart: false, // preloader done: the hero type reveals
    video: null, // the stacked hero video element (Multi + matte)
    crack: 0,
    burst: 0,
    single: 0,
    turn: 0,
    plunge: 0, // derived 0 -> 1 edge-pass progress (used for Atrium hide)
    dvdJourney: 0, // S6->S7 ONE single continuous scroll journey 0 -> 1 (zero brake/stop!)
    studioJourney: 0, // spring-smoothed continuous journey shared by Studio camera & LostMediaBox
    dvdPull: 0, // derived 0 -> 1 pullback readiness (loupe, drag, UI)
    cdExit: 0, // S7->S8 VFX sequence: case opens -> CD ejects -> laser scan -> dive through CD center hole (0 -> 1)
    studioExit: 0, // spring-smoothed cdExit shared by camera, CD, laser, warp tunnel & compositor VFX
    warp: 0, // radial zoom-blur + prismatic CD dispersion intensity during CD center-hole breach (0 -> 1)
    breach: 0, // subtle edge-pass chromatic accent (0 -> 1 -> 0)
    bside: 0, // kept 0 for consistent dark Lost Media film grade
    dvdFlip: 0, // 0 = front lab cover, 1 = flipped 180° to official back cover (tracklist & warnings)
    dvdOpen: 0, // 0 = closed DVD case, 1 = hinged cover swung open revealing CD + booklet
    merchDrag: { active: false, dx: 0, dy: 0 }, // 360° drag-to-inspect rotation offset in S7
    black: 0,
    hover: false,
    // touch screens have no hover: the clean cover is revealed automatically in the hold
    touch: typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    pointer: { x: 0, y: 0, sx: 0, sy: 0 },
    slot: null, // DOM rect of the tile slot (px), set by StoryCanvas
    heroTile: null // filled by ensureThreeState()
  };
}
