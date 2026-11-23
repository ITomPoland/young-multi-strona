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
    black: 0,
    hover: false,
    // touch screens have no hover: the clean cover is revealed automatically in the hold
    touch: typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    pointer: { x: 0, y: 0, sx: 0, sy: 0 },
    slot: null, // DOM rect of the tile slot (px), set by StoryCanvas
    heroTile: null // filled by ensureThreeState()
  };
}
