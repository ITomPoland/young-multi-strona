// Resolves once the story canvas (which now also draws the hero) has its world loaded,
// so the preloader can lift on a finished first frame instead of a black screen.
let resolveReady;
const ready = new Promise((resolve) => {
  resolveReady = resolve;
});

export function markStoryReady() {
  resolveReady?.();
}

// waits for the canvas, but never longer than `timeoutMs` (slow network / no WebGL)
export function whenStoryReady(timeoutMs = 4000) {
  return Promise.race([ready, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}
