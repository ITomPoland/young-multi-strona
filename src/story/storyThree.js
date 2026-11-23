import * as THREE from 'three';
import { WALL_Z, WALL_LEFT, WALL_TOP, PITCH_X, PITCH_Y, TILE_THICKNESS, HERO_CELL } from './world/calibration';

// =====================================================================
// THE SINGLE'S TILE: two tiles still glued together (2:1, close to the 16:9 cover),
// pulled out of cells HERO_CELL and HERO_CELL + (1, 0).
//
// It is NOT steered. It flies on the same ballistic rule as every other tile
// (position = rest + v·t − g·t², constant spin, same burst clock with the same
// bullet time), so it travels WITH its neighbours. Its launch velocity is just
// chosen so that, at the bullet-time moment, it passes close to the camera's path.
// The camera comes to it, not the other way round.
// =====================================================================

export const REST_CENTER = new THREE.Vector3(
  WALL_LEFT + (HERO_CELL.x + 1) * PITCH_X,
  WALL_TOP - (HERO_CELL.y + 0.5) * PITCH_Y,
  WALL_Z - TILE_THICKNESS * 0.5
);
export const REST_SIZE = new THREE.Vector3(PITCH_X * 2 - PITCH_X * 0.06, PITCH_Y * 0.94, TILE_THICKNESS);

const GRAVITY = 0.32; // same as TileWall
export const HERO_DELAY = 0.1; // leaves with the first wave of the shockwave
export const HERO_HOLD_T = 1.03; // burst clock value in the middle of the bullet-time hold
const HOLD_POS = new THREE.Vector3(-0.12, 0.02, -3.05); // where it hangs in the air at that moment
const HOLD_ROT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0.32, 0.05));

const tlHold = HERO_HOLD_T - HERO_DELAY;
const LAUNCH_V = HOLD_POS.clone()
  .sub(REST_CENTER)
  .add(new THREE.Vector3(0, GRAVITY * tlHold * tlHold, 0))
  .divideScalar(tlHold);

// constant spin: one full extra turn on the way, landing on HOLD_ROT at the hold
const SPIN_AXIS = new THREE.Vector3(0, 1, 0);
let spinAngle = 2 * Math.acos(Math.min(1, Math.abs(HOLD_ROT.w)));
{
  const sinHalf = Math.sqrt(Math.max(0, 1 - HOLD_ROT.w * HOLD_ROT.w));
  if (sinHalf > 1e-5) {
    SPIN_AXIS.set(HOLD_ROT.x / sinHalf, HOLD_ROT.y / sinHalf, HOLD_ROT.z / sinHalf);
    if (HOLD_ROT.w < 0) SPIN_AXIS.negate();
  }
}
spinAngle += Math.PI * 2;
const SPIN_RATE = spinAngle / tlHold;

// Pose of the tile for a given burst clock value (pure function: scroll back = fly back)
export function heroTileAt(burst, outPos, outQuat) {
  const tl = Math.max(0, burst - HERO_DELAY);
  outPos.copy(REST_CENTER).addScaledVector(LAUNCH_V, tl);
  outPos.y -= GRAVITY * tl * tl;
  outQuat.setFromAxisAngle(SPIN_AXIS, SPIN_RATE * tl);
  return tl;
}

// Attach the three.js-backed parts of the story state (lazy chunk only)
export function ensureThreeState(state) {
  if (state.heroTile) return state;
  state.heroTile = {
    visible: true,
    position: REST_CENTER.clone(),
    quaternion: new THREE.Quaternion(),
    scale: REST_SIZE.clone(),
    restCenter: REST_CENTER.clone(),
    restSize: REST_SIZE.clone(),
    reveal: 0
  };
  state.camPos = new THREE.Vector3();
  return state;
}
