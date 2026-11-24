// =====================================================================
// THE ALBUM SCENE STATE, shared by the DOM (AlbumsOverlay / AlbumScene) and the 3D panel
// (Tower). Clicking an album sets target = 1; the panel flies onto the view and becomes the
// backdrop while the tracklist comes in. Lives on the story state (state.current.scene).
//
// `open` is a damped SPRING towards the target, not a fixed tween: it sets off softly,
// gathers speed, overshoots a hair and settles, like a sheet of paper that is picked up and
// laid down. Flipping the target mid-way just pulls it back from wherever it is.
// A second value chases `open`: their gap is the "pull", so the surface bulges from the
// click point as it sets off and settles as the move slows.
// `dir` eases between 1 (opening) and 0 (closing): the panel shader uses it to make the
// clicked point lead on the way out and arrive first on the way back.
// =====================================================================

const W = 6.2; // spring frequency (rad/s): ~1.1 s to settle
const ZETA = 0.74; // a touch under critical: a small, soft overshoot

export function ensureScene(s) {
  if (!s.scene) {
    s.scene = { index: -1, target: 0, open: 0, vel: 0, chase: 0, pull: 0, dir: 1, ndc: null, uv: null };
  }
  return s.scene;
}

export function requestOpen(s, index, ndcX = 0, ndcY = 0) {
  const sc = ensureScene(s);
  sc.index = index;
  sc.target = 1;
  sc.ndc = [ndcX, ndcY];
  sc.uv = null; // resolved by a raycast on the next frame
}

export function requestClose(s) {
  ensureScene(s).target = 0;
}

export function stepScene(sc, dt) {
  // a few sub-steps keep the spring stable at low frame rates
  const n = 4;
  const h = dt / n;
  for (let k = 0; k < n; k++) {
    const acc = (sc.target - sc.open) * W * W - 2 * ZETA * W * sc.vel;
    sc.vel += acc * h;
    sc.open += sc.vel * h;
  }
  sc.dir += (sc.target - sc.dir) * (1 - Math.exp(-dt * 6));
  sc.chase += (sc.open - sc.chase) * (1 - Math.exp(-dt * 5));
  sc.pull = sc.open - sc.chase;
  const rest = Math.abs(sc.target - sc.open) < 0.0005 && Math.abs(sc.vel) < 0.002 && Math.abs(sc.pull) < 0.0005;
  if (rest) {
    sc.open = sc.target;
    sc.vel = 0;
    sc.pull = 0;
    if (!sc.target) sc.index = -1;
  }
}
