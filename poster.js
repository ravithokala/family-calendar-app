// @ts-check

/**
 * Draws the milestones mosaic poster (ADR-113) on a canvas, from the layout the server worked out
 * (PosterLayout): the same drawing for the preview (from the small copies) and, later, the print
 * (M52b). Everything is placed in millimetres and scaled to the canvas.
 *
 * @typedef {{ x: number, y: number, w: number, h: number }} Box
 * @typedef {Box & { file_id: string, thumb_id: string, crop: Box, low_res: boolean }} PosterPhoto
 * @typedef {Box & { kind: 'photo'|'plain', short: boolean, milestone_id: string, title: string, when: string, highlight: boolean,
 *   icon: string|null, tone: string, people: Array<{ name: string, tone: string }>, photos: PosterPhoto[] }} PosterTile
 * @typedef {{ code: string, message: string, suggest?: string }} PosterProblem
 * @typedef {{ size: string, orientation: string, width: number, height: number, margin: number, gutter: number,
 *   header: Box & { year: number, line: string }, columns: number, rows: number, tiles: PosterTile[], problems: PosterProblem[] }} Poster
 * @typedef {(photo: PosterPhoto) => Promise<CanvasImageSource & { width: number, height: number } | null>} PhotoSource
 */

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const INK = '#22252A';
const MUTED = '#70757D';
const RADIUS = 1.6; // mm

/**
 * Text cut to fit a width, over at most this many lines, with … when cut.
 * @param {CanvasRenderingContext2D} g
 * @param {string} text
 * @param {number} width
 * @param {number} lines
 * @returns {string[]}
 */
function wrap(g, text, width, lines) {
  const words = text.split(/\s+/).filter(Boolean);
  /** @type {string[]} */
  const out = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width <= width || !line) { line = next; continue; }
    out.push(line);
    line = word;
    if (out.length === lines) break;
  }
  if (out.length < lines && line) out.push(line);
  const cut = out.length === lines && out.join(' ').length < words.join(' ').length;
  let last = out[out.length - 1] ?? '';
  if (cut || g.measureText(last).width > width) {
    while (last && g.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    out[out.length - 1] = `${last.trimEnd()}…`;
  }
  return out;
}

/**
 * An image once it has loaded. The load event, not decode(): a page in the background holds decode() back.
 * @param {string} src
 * @returns {Promise<HTMLImageElement|null>}
 */
export function loaded(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** @param {CanvasRenderingContext2D} g @param {Box} b @param {number} r */
function rounded(g, b, r) {
  g.beginPath();
  g.roundRect(b.x, b.y, b.w, b.h, r);
}

/**
 * A drawn icon (the calendar's line drawings) as an image, in one colour.
 * @param {string} paths  SVG path markup (server data)
 * @param {string} colour
 * @returns {Promise<HTMLImageElement|null>}
 */
async function iconImage(paths, colour) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="${colour}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  return loaded(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
}

/**
 * Name tags in each person's colour, left to right from (x, y); returns where they end.
 * @param {CanvasRenderingContext2D} g
 * @param {PosterTile} t
 * @param {import('./views/parts.js').Theme} theme
 * @param {number} x
 * @param {number} y  the tags' top
 * @param {number} size  font size (mm)
 * @param {number} right  no further than this
 */
function tags(g, t, theme, x, y, size, right) {
  g.font = `700 ${size}px ${FONT}`;
  const pad = size * 0.35;
  for (const p of t.people) {
    const w = g.measureText(p.name).width + pad * 2;
    if (x + w > right) break;
    const tone = theme.tones[p.tone] ?? { background: '#EEE', text: INK };
    g.fillStyle = tone.background;
    rounded(g, { x, y, w, h: size * 1.35 }, size * 0.3);
    g.fill();
    g.fillStyle = tone.text;
    g.textBaseline = 'middle';
    g.fillText(p.name, x + pad, y + size * 0.7);
    x += w + pad;
  }
  return x;
}

/**
 * One tile's caption: the title (bold), then when and the name tags.
 * @param {CanvasRenderingContext2D} g
 * @param {PosterTile} t
 * @param {import('./views/parts.js').Theme} theme
 * @param {Box} area  where the caption goes
 * @param {number} size  title font size (mm)
 * @param {number} lines  title lines at most
 * @param {string} colour
 */
function caption(g, t, theme, area, size, lines, colour) {
  const pad = size * 0.5;
  g.font = `700 ${size}px ${FONT}`;
  g.fillStyle = colour;
  g.textBaseline = 'top';
  const title = wrap(g, t.title, area.w - pad * 2, lines);
  title.forEach((l, i) => g.fillText(l, area.x + pad, area.y + pad + i * size * 1.18));
  const small = size * 0.78;
  const y = area.y + pad + title.length * size * 1.18 + size * 0.15;
  g.font = `600 ${small}px ${FONT}`;
  g.fillStyle = colour === INK ? MUTED : colour;
  g.fillText(t.when, area.x + pad, y + small * 0.2);
  tags(g, t, theme, area.x + pad + g.measureText(t.when).width + small * 0.6, y, small * 0.9, area.x + area.w - pad);
}

/** Title size for a tile, from its shorter side (mm). @param {PosterTile} t */
const titleSize = (t) => Math.max(2.4, Math.min(t.highlight ? 6 : 4.4, Math.min(t.w, t.short ? t.h * 2 : t.h) * 0.075));

/**
 * @param {CanvasRenderingContext2D} g
 * @param {PosterTile} t
 * @param {import('./views/parts.js').Theme} theme
 * @param {PhotoSource} source
 */
async function photoTile(g, t, theme, source) {
  for (const p of t.photos) {
    const img = await source(p);
    g.save();
    rounded(g, p, RADIUS);
    g.clip();
    if (img) {
      g.drawImage(img, p.crop.x * img.width, p.crop.y * img.height, p.crop.w * img.width, p.crop.h * img.height, p.x, p.y, p.w, p.h);
    } else {
      g.fillStyle = '#E3E5E8';
      g.fillRect(p.x, p.y, p.w, p.h);
    }
    g.restore();
  }
  // The caption strip across the bottom of the cover (the largest photo on a highlight with several).
  const size = titleSize(t);
  const height = size * (1.18 * 2 + 1.6);
  const cover = t.photos[0] ?? t;
  const strip = { x: cover.x, y: cover.y + cover.h - height, w: cover.w, h: height };
  g.save();
  rounded(g, cover, RADIUS);
  g.clip();
  g.fillStyle = 'rgba(255, 255, 255, 0.9)';
  g.fillRect(strip.x, strip.y, strip.w, strip.h);
  g.restore();
  caption(g, t, theme, strip, size, 2, INK);
}

/**
 * A milestone without a photo: its colour, its icon, its caption.
 * @param {CanvasRenderingContext2D} g
 * @param {PosterTile} t
 * @param {import('./views/parts.js').Theme} theme
 */
async function plainTile(g, t, theme) {
  const tone = theme.tones[t.tone] ?? { background: '#F4F5F7', text: INK };
  g.fillStyle = tone.background;
  rounded(g, t, RADIUS);
  g.fill();
  const size = titleSize(t);
  const paths = t.icon ? theme.icons[t.icon] : undefined;
  const iconSide = paths ? Math.min(t.h * (t.short ? 0.55 : 0.32), t.w * 0.3) : 0;
  if (paths) {
    const img = await iconImage(paths, tone.text);
    if (img) g.drawImage(img, t.x + size * 0.5, t.y + (t.short ? (t.h - iconSide) / 2 : size * 0.6), iconSide, iconSide);
  }
  const area = t.short
    ? { x: t.x + (iconSide ? iconSide + size * 0.4 : 0), y: t.y + Math.max(0, (t.h - size * 4) / 2), w: t.w - (iconSide ? iconSide + size * 0.4 : 0), h: t.h }
    : { x: t.x, y: t.y + t.h - size * (1.18 * 3 + 1.6), w: t.w, h: size * 5 };
  caption(g, t, theme, area, size, t.short ? 2 : 3, tone.text);
}

/**
 * Draws the whole poster.
 * @param {HTMLCanvasElement} canvas  sized already, to the page's shape
 * @param {Poster} poster
 * @param {import('./views/parts.js').Theme} theme
 * @param {PhotoSource} source  each photo's image (the small copy for a preview)
 */
export async function drawPoster(canvas, poster, theme, source) {
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const scale = canvas.width / poster.width;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, poster.width, poster.height);
  // The header: the year, and the line if there is one.
  const h = poster.header;
  g.fillStyle = INK;
  g.textBaseline = 'middle';
  g.font = `800 ${h.h * 0.62}px ${FONT}`;
  const year = String(h.year);
  g.fillText(year, h.x, h.y + h.h / 2);
  if (h.line) {
    const at = h.x + g.measureText(year).width + h.h * 0.35;
    g.font = `500 ${h.h * 0.3}px ${FONT}`;
    g.fillStyle = MUTED;
    g.fillText(wrap(g, h.line, h.x + h.w - at, 1)[0] ?? '', at, h.y + h.h / 2 + h.h * 0.06);
  }
  for (const t of poster.tiles) {
    if (t.kind === 'photo') await photoTile(g, t, theme, source);
    else await plainTile(g, t, theme);
  }
}
