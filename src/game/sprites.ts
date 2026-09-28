/**
 * Procedural chibi characters (ZEP-style proportions: big head, small body).
 * Drawn pixel by pixel on a 16×20 grid, outlined, cached per look/dir/frame.
 * No external images — everything is generated here.
 */

export type Dir = 'down' | 'up' | 'left' | 'right';

export interface Look {
  skin: number;
  hair: number; // style
  hairColor: number;
  shirt: number;
  pants: number;
}

export const SKINS = ['#ffe0c4', '#f7cba4', '#e0ad84', '#b27a52', '#7a5238'];
export const HAIR_STYLES = ['Short', 'Long', 'Spiky', 'Buns'];
export const HAIR_COLORS = ['#2b2230', '#5a3a24', '#a0652e', '#e8c25a', '#d65a5a', '#4a6fd1', '#e58fc2', '#f4f1ea'];
export const SHIRTS = ['#ef5b5b', '#f5a524', '#f7d64a', '#4cc38a', '#3fa7e0', '#6c63ff', '#e573c7', '#f2f2f2', '#39405a'];
export const PANTS = ['#3a4a6b', '#2d2d35', '#6b4a3a', '#4a6b5a'];

const W = 16;
const H = 20;
export const SPRITE_SCALE = 3;
/** Rendered sprite size in world px (outline adds 1 art-px each side). */
export const SPRITE_W = (W + 2) * SPRITE_SCALE;
export const SPRITE_H = (H + 2) * SPRITE_SCALE;

export function encodeLook(l: Look): string {
  return [l.skin, l.hair, l.hairColor, l.shirt, l.pants].join('-');
}

/** Parse an untrusted look string; anything invalid falls back to the name hash. */
export function decodeLook(s: unknown, fallbackName = ''): Look {
  if (typeof s === 'string' && /^\d{1,2}(-\d{1,2}){4}$/.test(s)) {
    const [skin, hair, hairColor, shirt, pants] = s.split('-').map(Number);
    return {
      skin: skin % SKINS.length,
      hair: hair % HAIR_STYLES.length,
      hairColor: hairColor % HAIR_COLORS.length,
      shirt: shirt % SHIRTS.length,
      pants: pants % PANTS.length,
    };
  }
  return lookFromName(fallbackName);
}

export function lookFromName(name: string): Look {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return {
    skin: h % 3,
    hair: (h >>> 3) % HAIR_STYLES.length,
    hairColor: (h >>> 5) % HAIR_COLORS.length,
    shirt: (h >>> 8) % SHIRTS.length,
    pants: (h >>> 11) % PANTS.length,
  };
}

export function randomLook(): Look {
  const r = (n: number) => Math.floor(Math.random() * n);
  return { skin: r(3), hair: r(HAIR_STYLES.length), hairColor: r(HAIR_COLORS.length), shirt: r(SHIRTS.length), pants: r(PANTS.length) };
}

/* ───────────────────────── drawing ───────────────────────── */

type Grid = (string | null)[][];

function blank(): Grid {
  return Array.from({ length: H }, () => Array<string | null>(W).fill(null));
}

function rect(g: Grid, x: number, y: number, w: number, h: number, c: string) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    if (yy >= 0 && yy < H && xx >= 0 && xx < W) g[yy][xx] = c;
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
  const r = f(n >> 16), gr = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (gr << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * frame: 0 = standing, 1 / 2 = the two walking steps.
 * 'right' is drawn as 'left' and mirrored by the caller.
 */
function drawGrid(look: Look, dir: Exclude<Dir, 'right'>, frame: number): Grid {
  const g = blank();
  const skin = SKINS[look.skin];
  const hair = HAIR_COLORS[look.hairColor];
  const hairDk = shade(hair, -35);
  const shirt = SHIRTS[look.shirt];
  const shirtDk = shade(shirt, -40);
  const pants = PANTS[look.pants];
  const shoe = '#3b2f2f';
  const eye = '#2a2230';
  const bob = frame === 0 ? 0 : 1; // body dips on each step

  // ── legs ──
  const lLift = frame === 1 ? 1 : 0;
  const rLift = frame === 2 ? 1 : 0;
  if (dir === 'left') {
    const front = frame === 1 ? 2 : frame === 2 ? -2 : 0;
    rect(g, 6 + front, 15, 3, 3, pants); rect(g, 6 + front, 18, 3, 1, shoe);
    rect(g, 7 - front, 15, 3, 3, shade(pants, -20)); rect(g, 7 - front, 18, 3, 1, shoe);
  } else {
    rect(g, 5, 15, 3, 3 - lLift, pants); rect(g, 5, 18 - lLift, 3, 1, shoe);
    rect(g, 8, 15, 3, 3 - rLift, pants); rect(g, 8, 18 - rLift, 3, 1, shoe);
  }

  // ── body ──
  const by = 10 + bob;
  rect(g, 4, by, 8, 5, shirt);
  rect(g, 4, by + 4, 8, 1, shirtDk);
  if (dir === 'left') {
    const swing = frame === 1 ? -1 : frame === 2 ? 1 : 0;
    rect(g, 7 + swing, by + 1, 2, 3, shirtDk);
    rect(g, 7 + swing, by + 4, 2, 1, skin);
  } else {
    const ls = frame === 1 ? 1 : 0;
    const rs = frame === 2 ? 1 : 0;
    rect(g, 3, by + 1 + ls, 1, 2, shirtDk); rect(g, 3, by + 3 + ls, 1, 1, skin);
    rect(g, 12, by + 1 + rs, 1, 2, shirtDk); rect(g, 12, by + 3 + rs, 1, 1, skin);
    if (dir === 'down') rect(g, 7, by, 2, 1, shade(shirt, 30)); // collar
  }

  // ── head (rounded 10×9) ──
  const hy = bob;
  const headRows: Array<[number, number]> = [[5, 6], [4, 8], [3, 10], [3, 10], [3, 10], [3, 10], [3, 10], [3, 10], [4, 8]];
  headRows.forEach(([x, w], i) => rect(g, x, hy + 1 + i, w, 1, skin));

  // ── hair by style ──
  const style = look.hair;
  if (dir === 'up') {
    headRows.forEach(([x, w], i) => rect(g, x, hy + 1 + i, w, 1, i < 7 ? hair : skin));
    rect(g, 4, hy + 7, 8, 1, hairDk);
    if (style === 1) { rect(g, 3, hy + 7, 10, 4, hair); rect(g, 4, hy + 10, 8, 1, hairDk); }
  } else {
    rect(g, 5, hy + 1, 6, 1, hair);
    rect(g, 4, hy + 2, 8, 1, hair);
    rect(g, 3, hy + 3, 10, 1, hair);
    if (dir === 'down') {
      if (style === 2) { rect(g, 3, hy + 4, 10, 1, hair); rect(g, 4, hy + 5, 1, 1, hair); rect(g, 7, hy + 5, 2, 1, hair); rect(g, 11, hy + 5, 1, 1, hair); }
      else { rect(g, 3, hy + 4, 3, 1, hair); rect(g, 10, hy + 4, 3, 1, hair); rect(g, 6, hy + 4, 4, 1, hairDk); }
      rect(g, 3, hy + 5, 1, style === 1 ? 7 : 2, hair);
      rect(g, 12, hy + 5, 1, style === 1 ? 7 : 2, hair);
      if (style === 1) { rect(g, 2, hy + 6, 1, 6, hairDk); rect(g, 13, hy + 6, 1, 6, hairDk); }
    } else {
      // facing left: hair covers the back (right side) of the head
      rect(g, 3, hy + 4, 3, 1, hair);
      rect(g, 8, hy + 4, 5, 4, hair);
      rect(g, 11, hy + 8, 2, 1, hairDk);
      if (style === 1) rect(g, 10, hy + 8, 4, 4, hair);
      if (style === 2) rect(g, 3, hy + 4, 4, 1, hairDk);
    }
    if (style === 2) { rect(g, 4, hy, 1, 1, hair); rect(g, 7, hy, 2, 1, hair); rect(g, 10, hy, 1, 1, hair); }
    if (style === 3) {
      if (dir === 'down') { rect(g, 1, hy + 1, 3, 3, hair); rect(g, 12, hy + 1, 3, 3, hair); }
      else rect(g, 11, hy, 3, 3, hair);
    }
  }
  if (dir === 'up' && style === 3) { rect(g, 1, hy + 1, 3, 3, hair); rect(g, 12, hy + 1, 3, 3, hair); }
  if (dir === 'up' && style === 2) { rect(g, 4, hy, 1, 1, hair); rect(g, 7, hy, 2, 1, hair); rect(g, 10, hy, 1, 1, hair); }

  // ── face ──
  if (dir === 'down') {
    rect(g, 5, hy + 6, 1, 2, eye); rect(g, 10, hy + 6, 1, 2, eye);
    rect(g, 5, hy + 6, 1, 1, '#5a5070');
    rect(g, 4, hy + 8, 1, 1, '#ff9aa2'); rect(g, 11, hy + 8, 1, 1, '#ff9aa2');
    rect(g, 7, hy + 8, 2, 1, '#d9786f');
  } else if (dir === 'left') {
    rect(g, 4, hy + 6, 1, 2, eye);
    rect(g, 4, hy + 8, 2, 1, '#ff9aa2');
    rect(g, 3, hy + 7, 1, 1, shade(skin, -25)); // nose
  }
  return g;
}

function outline(g: Grid): Grid {
  // Pad by 1 and add a dark outline around the silhouette.
  const out: Grid = Array.from({ length: H + 2 }, () => Array<string | null>(W + 2).fill(null));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y + 1][x + 1] = g[y][x];
  const O = '#2a2233';
  const filled = (x: number, y: number) => y >= 0 && y < H + 2 && x >= 0 && x < W + 2 && out[y][x] !== null && out[y][x] !== O;
  for (let y = 0; y < H + 2; y++) for (let x = 0; x < W + 2; x++) {
    if (out[y][x] === null && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) out[y][x] = O;
  }
  return out;
}

const cache = new Map<string, HTMLCanvasElement>();

/** Sprite canvas at world scale for one look / direction / walk frame. */
export function getSprite(look: Look, dir: Dir, frame: number): HTMLCanvasElement {
  const key = `${encodeLook(look)}|${dir}|${frame}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = outline(drawGrid(look, dir === 'right' ? 'left' : dir, frame));
  const c = document.createElement('canvas');
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const ctx = c.getContext('2d')!;
  const flip = dir === 'right';
  for (let y = 0; y < H + 2; y++) for (let x = 0; x < W + 2; x++) {
    const col = g[y][x];
    if (!col) continue;
    ctx.fillStyle = col;
    const dx = flip ? W + 1 - x : x;
    ctx.fillRect(dx * SPRITE_SCALE, y * SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE);
  }
  cache.set(key, c);
  return c;
}

/** Draw a character with its feet centred on (x, y). */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  look: Look,
  dir: Dir,
  frame: number,
  x: number,
  y: number,
  lift = 0,
) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y - 2, 15, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(getSprite(look, dir, frame), Math.round(x - SPRITE_W / 2), Math.round(y - SPRITE_H + 3 - lift));
}
