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

// Resolves once EVERYTHING the story will draw is ready on the GPU: every shader compiled
// (the hidden tower and the studio included) and every texture / model uploaded, so the first
// scroll never stalls on a compile (Compositor runs the warm-up once the studio's head and
// shapes are in). Also capped by `timeoutMs`.
let resolveWarm;
const warm = new Promise((resolve) => {
  resolveWarm = resolve;
});

export function markStoryWarm() {
  resolveWarm?.();
}

export function whenStoryWarm(timeoutMs = 9000) {
  return Promise.race([warm, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}
