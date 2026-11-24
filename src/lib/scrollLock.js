// One switch for the page scroll. SmoothScroll registers its Lenis instance here; anything
// that needs the wheel for itself (the album scene's tracklist) locks the page while open.
// Locking stops Lenis and blocks the native wheel / touch / scroll keys. It never sets
// overflow: hidden on <html>: that breaks position: sticky and the story would scroll away.
let lenis = null;
let locks = 0;

const KEYS = new Set([' ', 'PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp']);
const block = (e) => {
  if (e.cancelable) e.preventDefault();
};
const blockKeys = (e) => {
  const tag = e.target?.tagName;
  if (KEYS.has(e.key) && tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
};

export function registerLenis(instance) {
  lenis = instance;
}

export function lockScroll() {
  locks += 1;
  if (locks === 1) {
    lenis?.stop();
    window.addEventListener('wheel', block, { passive: false });
    window.addEventListener('touchmove', block, { passive: false });
    window.addEventListener('keydown', blockKeys);
  }
}

export function unlockScroll() {
  locks = Math.max(0, locks - 1);
  if (locks === 0) {
    lenis?.start();
    window.removeEventListener('wheel', block);
    window.removeEventListener('touchmove', block);
    window.removeEventListener('keydown', blockKeys);
  }
}
