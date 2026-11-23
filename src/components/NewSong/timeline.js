// About / Smoke / Merch were tuned against the old 1250vh timeline. The discography now
// lives in the story (the album tower), so this section starts where About used to enter:
//   legacy = LEGACY_START + (1 - LEGACY_START) * progress
export const LEGACY_START = 0.6;
export const NEWSONG_SCROLL_VH = 500; // == old 1250vh * (1 - 0.6)
export const legacyToLocal = (legacy) => (legacy - LEGACY_START) / (1 - LEGACY_START);
