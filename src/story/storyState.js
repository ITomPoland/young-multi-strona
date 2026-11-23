// Mutable per-frame state shared by the director, the 3D scene and the DOM overlay.
// Lives in a ref: nothing here triggers React re-renders.
// NOTE: no three.js import here. This module is part of the initial bundle; the
// three.js parts (hero tile pose) are attached lazily by StoryCanvas (storyThree.js).

export function createStoryState() {
  return {
    vh: 0,
    active: true,
    canvasOpacity: 0,
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
