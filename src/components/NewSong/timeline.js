// Smoke / Merch were tuned against the old 1250vh timeline. The discography and "o mnie" now
// live in the story, so this section starts just before the smoke used to come in:
//   legacy = LEGACY_START + (1 - LEGACY_START) * progress
export const LEGACY_START = 0.74;
export const NEWSONG_SCROLL_VH = 325; // == old 1250vh * (1 - 0.74)
export const legacyToLocal = (legacy) => (legacy - LEGACY_START) / (1 - LEGACY_START);
