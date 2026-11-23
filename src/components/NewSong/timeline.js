// The discography/About/Merch components were tuned against the old 1350vh timeline
// where the discography started at 0.24. The new section keeps that tuning by remapping:
//   legacy = LEGACY_START + (1 - LEGACY_START) * progress
export const LEGACY_START = 0.24;
export const NEWSONG_SCROLL_VH = 950; // == old 1250vh * (1 - 0.24)
export const legacyToLocal = (legacy) => (legacy - LEGACY_START) / (1 - LEGACY_START);
