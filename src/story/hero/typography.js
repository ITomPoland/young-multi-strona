// YOUNG / MULTI lockup drawn into a canvas, composited by the story's compositor pass.
// (moved from the old HeroVideoShader, unchanged)


// Portrait / narrow screens put the typography IN FRONT of Multi (he fills the frame there),
// landscape keeps it sandwiched BEHIND him.
const TEXT_FRONT_MAX_ASPECT = 1.0;
// Phones in landscape are still phones: Multi fills the frame there too.
const PHONE_SHORT_SIDE_PX = 500;
export const isTextFront = (w, h) =>
  w / Math.max(h, 1) < TEXT_FRONT_MAX_ASPECT || Math.min(w, h) <= PHONE_SHORT_SIDE_PX;

export function renderTypographyCanvas(width, height) {
  const canvas = document.createElement('canvas');
  const aspect = Math.max(width / Math.max(height, 1), 0.42);
  const cw = 2048;
  const ch = Math.max(768, Math.round(cw / aspect));
  canvas.width = cw;
  canvas.height = ch;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';

  const YOUNG_FONT = '700 SIZEpx "Antonio", sans-serif';
  const MULTI_FONT = '400 SIZEpx "Bernoru", "Antonio", sans-serif';

  const fitFontSize = (text, fontDecl, targetWidth, maxHeight) => {
    ctx.font = fontDecl.replace('SIZE', '200');
    const measured = Math.max(ctx.measureText(text).width, 1);
    const byWidth = (targetWidth / measured) * 200;
    return Math.round(Math.min(byWidth, maxHeight));
  };

  // Real ink bounds (cap height / descent) so lines can be stacked tightly, font-agnostic
  const inkBox = (text, fontDecl, size) => {
    ctx.font = fontDecl.replace('SIZE', String(size));
    const m = ctx.measureText(text);
    const ascent = m.actualBoundingBoxAscent || size * 0.72;
    const descent = m.actualBoundingBoxDescent || 0;
    return { ascent, descent, height: ascent + descent };
  };

  if (aspect < TEXT_FRONT_MAX_ASPECT) {
    // === STACKED POSTER LOCKUP (phones, tablets in portrait) ===
    // Both words share the same optical width, stacked tight, sitting over Multi's body
    // (his face is in the upper third on portrait crops) and clear of the bottom fan banner.
    const sideMargin = cw * 0.06;
    const targetW = cw - sideMargin * 2;
    const youngSize = fitFontSize('YOUNG', YOUNG_FONT, targetW, ch * 0.2);
    const multiSize = fitFontSize('MULTI', MULTI_FONT, targetW, ch * 0.09);
    const young = inkBox('YOUNG', YOUNG_FONT, youngSize);
    const multi = inkBox('MULTI', MULTI_FONT, multiSize);
    const gap = young.height * 0.07;
    const blockH = young.height + gap + multi.height;

    // Fluid anchor: 0.42 aspect (tall phone) -> block centre at 66%; 1.0 (square) -> 58%
    const t = Math.min(Math.max((aspect - 0.42) / 0.58, 0), 1);
    const centerY = ch * (0.66 - 0.08 * t);
    const top = centerY - blockH / 2;

    ctx.textBaseline = 'alphabetic';
    ctx.font = YOUNG_FONT.replace('SIZE', String(youngSize));
    ctx.fillText('YOUNG', cw * 0.5, top + young.ascent);
    ctx.font = MULTI_FONT.replace('SIZE', String(multiSize));
    ctx.fillText('MULTI', cw * 0.5, top + young.height + gap + multi.ascent);
  } else {
    // === WALL-TO-WALL LANDSCAPE LOCKUP (behind Multi) ===
    // Fitted from real ink metrics so MULTI never slides under YOUNG or the bottom
    // fan banner, from 4:3 laptops to 21:9 monitors and landscape phones.
    let youngSize = fitFontSize('YOUNG', YOUNG_FONT, cw * 0.94, ch * 0.66);
    let multiSize = fitFontSize('MULTI', MULTI_FONT, cw * 0.9, ch * 0.28);
    let young = inkBox('YOUNG', YOUNG_FONT, youngSize);
    let multi = inkBox('MULTI', MULTI_FONT, multiSize);
    const gap = () => young.height * 0.06;
    const maxBlock = ch * 0.8; // top ~7% header, bottom ~13% banner
    const block = young.height + gap() + multi.height;
    if (block > maxBlock) {
      const k = maxBlock / block;
      youngSize = Math.floor(youngSize * k);
      multiSize = Math.floor(multiSize * k);
      young = inkBox('YOUNG', YOUNG_FONT, youngSize);
      multi = inkBox('MULTI', MULTI_FONT, multiSize);
    }
    const blockH = young.height + gap() + multi.height;
    const top = Math.max(ch * 0.07, ch * 0.47 - blockH / 2);

    ctx.textBaseline = 'alphabetic';
    ctx.font = YOUNG_FONT.replace('SIZE', String(youngSize));
    ctx.fillText('YOUNG', cw * 0.5, top + young.ascent);
    ctx.font = MULTI_FONT.replace('SIZE', String(multiSize));
    ctx.fillText('MULTI', cw * 0.5, top + young.height + gap() + multi.ascent);
  }

  return canvas;
}
