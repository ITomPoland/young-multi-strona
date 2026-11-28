// =====================================================================
// S8: the contact as a teletext page ("P100 KONTAKT"), drawn into a canvas that the CRT's
// glass shows. A real teletext grid: one monospace cell per character (glyphs stretched to
// fill the cell, chunky like the real thing), single and double height rows, 8 colours,
// coloured background bands and the four Fastext keys at the bottom.
// Phones get a 24-column layout (bigger cells) so it stays readable on a narrow TV.
// Every clickable thing is a rectangle in grid cells (hitTest), shared with the DOM overlay.
// =====================================================================

export const TTX_W = 1536;
export const TTX_H = 1152;

const C = {
  black: '#05070a',
  red: '#ff3b3b',
  green: '#3dff6e',
  yellow: '#ffe83d',
  blue: '#2a3dff',
  magenta: '#ff47e6',
  cyan: '#3dfff2',
  white: '#f2f6f8'
};

export const TTX_ACTIONS = {
  booking: { copy: 'booking@yfl.pl' },
  biznes: { copy: 'biznes@yfl.pl' },
  ig: { href: 'https://www.instagram.com/youngmulti/' },
  yt: { href: 'https://www.youtube.com/channel/UCiP6-9NHJ36BCxUWL-gNKYg' },
  sp: { href: 'https://open.spotify.com/artist/5CkZIA3WpaEFxp0wSjMzRI' },
  shop: { href: 'https://sklep.yfl.pl/' }
};

// the page: rows of { r, h (1|2), bg?, cells: [{ c, text, fg, action? }] }
function layout(narrow, clock, copied) {
  const cols = narrow ? 24 : 40;
  const rows = narrow ? 18 : 22;
  const L = [];
  const mail = (id, v) => (copied === id ? 'SKOPIOWANO ✓' : v);
  const dots = (label, page, width) => label + ' ' + '.'.repeat(Math.max(1, width - label.length - page.length - 2)) + ' ' + page;
  if (!narrow) {
    L.push({ r: 0, h: 1, cells: [
      { c: 1, text: 'P100', fg: C.white },
      { c: 7, text: 'YFL·TXT', fg: C.cyan },
      { c: 16, text: 'KONTAKT', fg: C.white },
      { c: 31, text: clock, fg: C.yellow }
    ] });
    L.push({ r: 2, h: 2, bg: C.blue, cells: [
      { c: 2, text: 'KONTAKT', fg: C.yellow },
      { c: 28, text: 'TRACK 21', fg: C.white }
    ] });
    L.push({ r: 5, h: 1, cells: [{ c: 2, text: 'BOOKING · KONCERTY', fg: C.cyan }] });
    L.push({ r: 6, h: 2, cells: [
      { c: 2, text: mail('booking', 'booking@yfl.pl'), fg: C.yellow, action: 'booking' },
      { c: 31, text: '[KOPIUJ]', fg: C.white, action: 'booking' }
    ] });
    L.push({ r: 9, h: 1, cells: [{ c: 2, text: 'BIZNES · WSPÓŁPRACE', fg: C.cyan }] });
    L.push({ r: 10, h: 2, cells: [
      { c: 2, text: mail('biznes', 'biznes@yfl.pl'), fg: C.yellow, action: 'biznes' },
      { c: 31, text: '[KOPIUJ]', fg: C.white, action: 'biznes' }
    ] });
    L.push({ r: 13, h: 1, cells: [{ c: 2, text: dots('INSTAGRAM', '101', 36), fg: C.white, action: 'ig' }] });
    L.push({ r: 14, h: 1, cells: [{ c: 2, text: dots('YOUTUBE', '102', 36), fg: C.white, action: 'yt' }] });
    L.push({ r: 15, h: 1, cells: [{ c: 2, text: dots('SPOTIFY', '103', 36), fg: C.white, action: 'sp' }] });
    L.push({ r: 16, h: 1, cells: [{ c: 2, text: dots('SKLEP.YFL.PL', '104', 36), fg: C.white, action: 'shop' }] });
    L.push({ r: 18, h: 1, cells: [{ c: 2, text: 'LOST MEDIA · 11.12.2026 · YOUNG FAMILY LABEL', fg: C.magenta }] });
    L.push({ r: 20, h: 1, fastext: true, cells: [
      { c: 0, w: 10, text: 'MAIL', bg: C.red, fg: C.black, action: 'booking' },
      { c: 10, w: 10, text: 'IG', bg: C.green, fg: C.black, action: 'ig' },
      { c: 20, w: 10, text: 'YT', bg: C.yellow, fg: C.black, action: 'yt' },
      { c: 30, w: 10, text: 'SKLEP', bg: C.cyan, fg: C.black, action: 'shop' }
    ] });
    L.push({ r: 21, h: 1, cells: [{ c: 2, text: 'STRONA FANOWSKA · SCROLL = DALEJ', fg: C.white }] });
  } else {
    L.push({ r: 0, h: 1, cells: [
      { c: 1, text: 'P100', fg: C.white },
      { c: 6, text: 'YFL', fg: C.cyan },
      { c: 15, text: clock, fg: C.yellow }
    ] });
    L.push({ r: 1, h: 2, bg: C.blue, cells: [{ c: 1, text: 'KONTAKT', fg: C.yellow }, { c: 15, text: 'TR 21', fg: C.white }] });
    L.push({ r: 4, h: 1, cells: [{ c: 1, text: 'BOOKING·KONCERTY', fg: C.cyan }, { c: 18, text: 'KOPIUJ', fg: C.white, action: 'booking' }] });
    L.push({ r: 5, h: 2, cells: [{ c: 1, text: mail('booking', 'booking@yfl.pl'), fg: C.yellow, action: 'booking' }] });
    L.push({ r: 8, h: 1, cells: [{ c: 1, text: 'BIZNES·WSPÓŁPR.', fg: C.cyan }, { c: 18, text: 'KOPIUJ', fg: C.white, action: 'biznes' }] });
    L.push({ r: 9, h: 2, cells: [{ c: 1, text: mail('biznes', 'biznes@yfl.pl'), fg: C.yellow, action: 'biznes' }] });
    L.push({ r: 12, h: 1, cells: [{ c: 1, text: dots('INSTAGRAM', '101', 22), fg: C.white, action: 'ig' }] });
    L.push({ r: 13, h: 1, cells: [{ c: 1, text: dots('YOUTUBE', '102', 22), fg: C.white, action: 'yt' }] });
    L.push({ r: 14, h: 1, cells: [{ c: 1, text: dots('SPOTIFY', '103', 22), fg: C.white, action: 'sp' }] });
    L.push({ r: 15, h: 1, cells: [{ c: 1, text: dots('SKLEP', '104', 22), fg: C.white, action: 'shop' }] });
    L.push({ r: 17, h: 1, fastext: true, cells: [
      { c: 0, w: 6, text: 'MAIL', bg: C.red, fg: C.black, action: 'booking' },
      { c: 6, w: 6, text: 'IG', bg: C.green, fg: C.black, action: 'ig' },
      { c: 12, w: 6, text: 'YT', bg: C.yellow, fg: C.black, action: 'yt' },
      { c: 18, w: 6, text: 'SKLEP', bg: C.cyan, fg: C.black, action: 'shop' }
    ] });
  }
  return { cols, rows, lines: L };
}

// grid rectangles of everything clickable: { action, c0, c1, r0, r1 }
function actionRects(page) {
  const out = [];
  for (const line of page.lines) {
    for (const cell of line.cells) {
      if (!cell.action) continue;
      const w = cell.w ?? [...cell.text].length;
      out.push({ action: cell.action, c0: cell.c, c1: cell.c + w, r0: line.r, r1: line.r + line.h });
    }
  }
  return out;
}

export function createTeletext() {
  const canvas = document.createElement('canvas');
  canvas.width = TTX_W;
  canvas.height = TTX_H;
  const ctx = canvas.getContext('2d');
  let page = layout(false, '--:--:--', null);
  let rects = actionRects(page);

  const draw = ({ narrow, clock, hover, copied }) => {
    page = layout(narrow, clock, copied);
    rects = actionRects(page);
    const cw = TTX_W / page.cols;
    const ch = TTX_H / page.rows;
    ctx.fillStyle = C.black;
    ctx.fillRect(0, 0, TTX_W, TTX_H);
    ctx.textBaseline = 'alphabetic';
    for (const line of page.lines) {
      const y0 = line.r * ch;
      const hh = line.h * ch;
      if (line.bg) {
        ctx.fillStyle = line.bg;
        ctx.fillRect(0, y0, TTX_W, hh);
      }
      for (const cell of line.cells) {
        const chars = [...cell.text];
        const w = cell.w ?? chars.length;
        const isHover = hover && cell.action === hover;
        let fg = cell.fg;
        if (cell.bg || isHover) {
          ctx.fillStyle = isHover && !cell.bg ? fg : cell.bg;
          if (isHover && cell.bg) ctx.fillStyle = C.white;
          ctx.fillRect(cell.c * cw, y0, w * cw, hh);
          fg = isHover && !cell.bg ? C.black : cell.fg;
        }
        // glyphs: VT323 stretched to fill the cell (teletext's chunky look), double height = 2x tall
        const size = ch * 1.18;
        ctx.font = `${size.toFixed(1)}px "VT323", "Courier New", monospace`;
        const off = cell.w ? Math.floor((w - chars.length) / 2) : 0;
        ctx.fillStyle = fg;
        for (let i = 0; i < chars.length; i++) {
          const gw = ctx.measureText(chars[i]).width || size * 0.5;
          const sx = (cw * 0.92) / gw;
          ctx.save();
          ctx.translate((cell.c + off + i) * cw + cw * 0.04, y0 + hh - ch * 0.2 * line.h);
          ctx.scale(Math.min(sx, 2.2), line.h);
          ctx.fillText(chars[i], 0, 0);
          ctx.restore();
        }
      }
    }
  };

  // u, v: 0..1 over the page (v from the top) -> action id or null
  const hitTest = (u, v) => {
    const c = u * page.cols;
    const r = v * page.rows;
    for (const q of rects) if (c >= q.c0 && c < q.c1 && r >= q.r0 && r < q.r1) return q.action;
    return null;
  };

  return { canvas, draw, hitTest };
}

// the CRT's fisheye (same as the glass shader): glass UV -> picture UV. The DOM overlay maps
// the pointer through it so clicks land on the right teletext line.
export function tvBarrel(u, v, k) {
  const px = u * 2 - 1;
  const py = v * 2 - 1;
  const qx = px * (1 + k * py * py);
  const qy = py * (1 + k * px * px);
  return [qx * 0.5 + 0.5, qy * 0.5 + 0.5];
}
