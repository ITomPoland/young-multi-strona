import * as THREE from 'three';
import {
  HOLE_PROFILE, HOLE_SAMPLES, HOLE_PROFILE_SCALE, holeAngleAt, HOLE_CENTER,
  PITCH_X, WALL_LEFT, WALL_RIGHT, FLOOR_Y, CEILING_Y, WALL_THICKNESS, SLAB_FRONT_Z
} from './calibration';

// 1D texture with the hole radius per angle (shared by every shader that needs the hole)
let holeTexture = null;
export function getHoleTexture() {
  if (holeTexture) return holeTexture;
  const data = new Uint8Array(HOLE_SAMPLES * 4);
  for (let i = 0; i < HOLE_SAMPLES; i++) {
    const v = Math.round((HOLE_PROFILE[i] / HOLE_PROFILE_SCALE) * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  holeTexture = new THREE.DataTexture(data, HOLE_SAMPLES, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  holeTexture.wrapS = THREE.RepeatWrapping;
  holeTexture.wrapT = THREE.ClampToEdgeWrapping;
  holeTexture.magFilter = THREE.LinearFilter;
  holeTexture.minFilter = THREE.LinearFilter;
  holeTexture.colorSpace = THREE.NoColorSpace;
  holeTexture.needsUpdate = true;
  return holeTexture;
}

// The wall itself: a 30 cm slab (tile adhesive + plaster + brick) with the final hole
// cut through it. Its front cap carries the photo/grout, the hole sides are the broken
// edge you fly past, the back cap is what you see after the 180° turn.
export function createWallSlabGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(WALL_LEFT, FLOOR_Y);
  shape.lineTo(WALL_RIGHT, FLOOR_Y);
  shape.lineTo(WALL_RIGHT, CEILING_Y);
  shape.lineTo(WALL_LEFT, CEILING_Y);
  shape.lineTo(WALL_LEFT, FLOOR_Y);

  const hole = new THREE.Path();
  for (let i = 0; i <= HOLE_SAMPLES; i++) {
    const k = i % HOLE_SAMPLES;
    const a = holeAngleAt(k);
    const r = HOLE_PROFILE[k] * PITCH_X;
    const x = HOLE_CENTER.x + Math.cos(a) * r;
    const y = HOLE_CENTER.y + Math.sin(a) * r;
    if (i === 0) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: WALL_THICKNESS,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1
  });
  // extrude goes 0 -> +depth; put the front cap on SLAB_FRONT_Z
  geo.translate(0, 0, SLAB_FRONT_Z - WALL_THICKNESS);
  geo.computeVertexNormals();
  return geo;
}

