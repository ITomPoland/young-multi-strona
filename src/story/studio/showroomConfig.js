// Shared architectural dimensions: the S6 Atrium floor IS the reverse side of the physical 3D LOST MEDIA DVD Box!
// Atrium footprint (4.72 m x 6.67 m) naturally matches a real DVD case's exact 1:1.41 aspect ratio.

export const ATRIUM_FLOOR_Y = -0.68;
export const SLAB_THICKNESS = 0.36; // Physical thickness of the giant DVD Box (real 15:190 ratio scaled to 6.67 m!)
export const SHOWROOM_FLOOR_Y = ATRIUM_FLOOR_Y - SLAB_THICKNESS - 0.004; // -1.044 m (4mm clear of Atrium floor = zero Z-fighting)

export const HALL_BACK_Z = -5.75;
export const HALL_FRONT_Z = 0.92; // Front bottom edge of the giant DVD Box (z = +0.92 m)
export const HALL_SIDE_X = 2.35;

export const PLINTH_R = 0.285;
export const PLINTH_H = 0.445;
export const PLINTH_Z = 0.035;

// Exact room-scale 3D DVD Box dimensions (bolted directly beneath Atrium floor!)
export const DVD_W = 4.72; // Matches HALL_SIDE_X * 2 = 4.70 m
export const DVD_H = HALL_FRONT_Z - HALL_BACK_Z; // 6.67 m (exact 1:1.41 DVD case ratio!)
export const DVD_D = SLAB_THICKNESS; // 0.36 m
export const DVD_CENTER_Z = (HALL_BACK_Z + HALL_FRONT_Z) * 0.5; // -2.415 m
