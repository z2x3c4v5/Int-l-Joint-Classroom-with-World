/**
 * The classroom world: a tile grid generated in code (no external art), a
 * collision grid, the four Private Areas, and a pre-rendered pixel-art canvas.
 *
 * Coordinates: world pixels. One tile = TILE px (16 art-pixels × 3).
 * Characters are positioned by their FEET CENTRE — every distance, room check
 * and presence write uses that same point.
 */

export const PX = 3; // art-pixel scale
export const TILE = 16 * PX; // 48 world px
export const COLS = 44;
export const ROWS = 32;
export const MAP_WIDTH = COLS * TILE;
export const MAP_HEIGHT = ROWS * TILE;

enum T {
  Grass,
  Path,
  Wood,
  Wall,
  FloorPolite,
  FloorLeading,
  FloorUseful,
  FloorSmart,
}

/** A big classroom: open space inside it is proximity chat (like the hallway). */
export interface Zone {
  id: string; // pa-polite … (also the AI tutor's theme key)
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

/** A desk pod: a PRIVATE area for a 1:1 talk, with its own AI tutor. */
export interface PrivateArea {
  id: string; // pa-polite-1 …
  zoneId: string;
  n: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** Where the tutor owl sits (centre of the table). */
  npc: { x: number; y: number };
}

export interface PresentationObject {
  id: string;
  paId: string | null; // zone that can reach it; null = corridor board
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

interface RoomDef {
  id: string;
  tx: number;
  ty: number;
  tw: number;
  th: number;
  floor: T;
  color: string;
  rug: [string, string];
  /** Wall row (2 tiles tall) whose face carries this room's blackboard. */
  boardTy: number;
  /** Doors: tiles to carve out of the room walls. */
  doors: Array<[number, number]>;
  /** Which side the corridor door is on (keeps furniture out of the way). */
  doorSide: 'left' | 'right';
}

// Layout (tiles):  grass border · 2×2 classrooms · cross corridor · entrance south.
const ROOMS: RoomDef[] = [
  {
    id: 'pa-polite', tx: 3, ty: 4, tw: 16, th: 10, floor: T.FloorPolite, color: '#4f7fe8', rug: ['#9dbcf7', '#7fa5f2'],
    boardTy: 2, doors: [[19, 8], [19, 9], [15, 14], [16, 14]], doorSide: 'right',
  },
  {
    id: 'pa-leading', tx: 25, ty: 4, tw: 16, th: 10, floor: T.FloorLeading, color: '#2fae6e', rug: ['#8fdcb0', '#6ecf98'],
    boardTy: 2, doors: [[24, 8], [24, 9], [27, 14], [28, 14]], doorSide: 'left',
  },
  {
    id: 'pa-useful', tx: 3, ty: 19, tw: 16, th: 9, floor: T.FloorUseful, color: '#ec8a25', rug: ['#f9c58a', '#f5ae66'],
    boardTy: 17, doors: [[19, 22], [19, 23], [15, 17], [15, 18], [16, 17], [16, 18]], doorSide: 'right',
  },
  {
    id: 'pa-smart', tx: 25, ty: 19, tw: 16, th: 9, floor: T.FloorSmart, color: '#9358e8', rug: ['#c9a8f7', '#b48cf2'],
    boardTy: 17, doors: [[24, 22], [24, 23], [27, 17], [27, 18], [28, 17], [28, 18]], doorSide: 'left',
  },
];

export const ZONES: Zone[] = ROOMS.map((r) => ({
  id: r.id, x: r.tx * TILE, y: r.ty * TILE, w: r.tw * TILE, h: r.th * TILE, color: r.color,
}));

// Each classroom holds 4 desk pods (2×2), 6×3 tiles each: a table with one
// chair on each side, so two students sit face to face.
interface PodDef { room: RoomDef; n: number; tx: number; ty: number }
const PODS: PodDef[] = ROOMS.flatMap((r) => {
  const rows = r.th >= 10 ? [r.ty + 3, r.ty + 6] : [r.ty + 2, r.ty + 5];
  const cols = [r.tx + 1, r.tx + 9];
  return rows.flatMap((ty, ri) => cols.map((tx, ci) => ({ room: r, n: ri * 2 + ci + 1, tx, ty })));
});

export const PRIVATE_AREAS: PrivateArea[] = PODS.map((p) => ({
  id: `${p.room.id}-${p.n}`,
  zoneId: p.room.id,
  n: p.n,
  x: p.tx * TILE,
  y: p.ty * TILE,
  w: 6 * TILE,
  h: 3 * TILE,
  color: p.room.color,
  npc: { x: (p.tx + 3) * TILE, y: (p.ty + 1) * TILE + 18 },
}));

// Blackboards sit on the 2-tile wall face above each room (6 tiles wide).
const BOARD_TX: Record<string, number> = { 'pa-polite': 7, 'pa-leading': 31, 'pa-useful': 7, 'pa-smart': 31 };
export const PRESENTATION_OBJECTS: PresentationObject[] = [
  { id: 'obj-welcome', paId: null, x: 20 * TILE + 8, y: 2 * TILE + 10, w: 4 * TILE - 16, h: 2 * TILE - 26, label: 'welcome' },
  ...ROOMS.map((r) => ({
    id: `obj-${r.id.slice(3)}`,
    paId: r.id,
    x: BOARD_TX[r.id] * TILE + 10,
    y: r.boardTy * TILE + 10,
    w: 6 * TILE - 20,
    h: 2 * TILE - 26,
    label: r.id,
  })),
];

export const SPAWN = { x: 22 * TILE, y: 16 * TILE + 24 };

/* ───────────────────────────── grid ───────────────────────────── */

const tiles = new Uint8Array(COLS * ROWS);
const blocked = new Uint8Array(COLS * ROWS);
const at = (x: number, y: number) => y * COLS + x;
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const tileAt = (x: number, y: number): T => (inside(x, y) ? (tiles[at(x, y)] as T) : T.Wall);
const isWall = (x: number, y: number) => tileAt(x, y) === T.Wall;

type Deco =
  | 'podRug' | 'table' | 'chairL' | 'chairR' | 'teacherDesk' | 'bookshelf' | 'plant' | 'tree' | 'flower'
  | 'bench' | 'rug' | 'lockers' | 'window' | 'clock' | 'sofa' | 'globe' | 'fountain';
interface DecoItem { kind: Deco; tx: number; ty: number; tw: number; th: number; color?: string; color2?: string; label?: string }
const decos: DecoItem[] = [];

function fill(x0: number, y0: number, x1: number, y1: number, t: T) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) tiles[at(x, y)] = t;
}
function deco(kind: Deco, tx: number, ty: number, tw = 1, th = 1, blocks = true, extra: Partial<DecoItem> = {}) {
  decos.push({ kind, tx, ty, tw, th, ...extra });
  if (blocks) for (let y = ty; y < ty + th; y++) for (let x = tx; x < tx + tw; x++) if (inside(x, y)) blocked[at(x, y)] = 1;
}

(function build() {
  fill(0, 0, COLS - 1, ROWS - 1, T.Grass);
  // Building shell: walls, then corridor wood inside.
  fill(2, 2, 41, 28, T.Wall);
  fill(3, 4, 40, 27, T.Wood);
  // Rooms (walls between them are what's left of the shell fill).
  for (const r of ROOMS) fill(r.tx, r.ty, r.tx + r.tw - 1, r.ty + r.th - 1, r.floor);
  fill(19, 4, 19, 14, T.Wall); fill(3, 14, 19, 14, T.Wall);
  fill(24, 4, 24, 14, T.Wall); fill(24, 14, 40, 14, T.Wall);
  fill(19, 17, 19, 27, T.Wall); fill(3, 17, 19, 18, T.Wall);
  fill(24, 17, 24, 27, T.Wall); fill(24, 17, 40, 18, T.Wall);
  for (const r of ROOMS) for (const [x, y] of r.doors) tiles[at(x, y)] = T.Wood;
  // Front entrance + stone path out to the garden.
  fill(21, 28, 22, 28, T.Wood);
  fill(21, 29, 22, 31, T.Path);
  fill(14, 30, 29, 30, T.Path);

  for (let i = 0; i < tiles.length; i++) if (tiles[i] === T.Wall) blocked[i] = 1;

  for (const r of ROOMS) {
    const { tx, ty, tw, th } = r;
    deco('teacherDesk', tx + 6, ty + 1, 3, 1);
    // Keep the shelf and plants on the side away from the corridor door.
    const far = r.doorSide === 'right' ? tx : tx + tw - 1;
    deco('bookshelf', r.doorSide === 'right' ? tx + 1 : tx + tw - 3, ty, 2, 1);
    deco('plant', far, ty);
    deco('plant', far, ty + th - 1);
    deco('globe', r.doorSide === 'right' ? tx + 10 : tx + 4, ty + 1, 1, 1);
    deco('clock', tx + 2, r.boardTy, 1, 1, false);
  }
  for (const p of PODS) {
    deco('podRug', p.tx, p.ty, 6, 3, false, { color: p.room.rug[0], color2: p.room.rug[1], label: String(p.n) });
    deco('table', p.tx + 2, p.ty + 1, 2, 1, true, { color: p.room.color });
    deco('chairR', p.tx + 1, p.ty + 1, 1, 1, false, { color: p.room.color });
    deco('chairL', p.tx + 4, p.ty + 1, 1, 1, false, { color: p.room.color });
  }
  // Windows along the outer top wall (outside the blackboards).
  for (const x of [4, 14, 26, 38]) deco('window', x, 2, 2, 1, false);
  // Corridor dressing.
  deco('rug', 20, 15, 4, 2, false);
  deco('lockers', 4, 14, 5, 1, false);
  deco('lockers', 34, 14, 5, 1, false);
  deco('plant', 20, 4); deco('plant', 23, 4);
  deco('plant', 20, 27); deco('plant', 23, 27);
  deco('sofa', 20, 10, 1, 2); deco('sofa', 23, 10, 1, 2);
  // Garden.
  for (let x = 0; x < COLS; x += 3) { deco('tree', x, 0, 1, 1); if (x < 13 || x > 30) deco('tree', x, 31, 1, 1); }
  for (let y = 3; y < ROWS - 1; y += 3) { deco('tree', 0, y); deco('tree', 43, y); }
  for (const [x, y] of [[4, 29], [7, 30], [10, 29], [33, 29], [36, 30], [39, 29], [1, 2], [42, 26], [13, 31], [30, 31]]) deco('flower', x, y, 1, 1, false);
  deco('bench', 10, 29, 2, 1); deco('bench', 32, 29, 2, 1);
  deco('fountain', 17, 29, 2, 1);
  deco('fountain', 25, 29, 2, 1);
})();

/* ─────────────────────────── queries ─────────────────────────── */

/** Feet hit-box half-width / height (world px). */
const HIT_W = 12;
const HIT_H = 10;

export function canStand(x: number, y: number): boolean {
  const x0 = Math.floor((x - HIT_W) / TILE);
  const x1 = Math.floor((x + HIT_W) / TILE);
  const y0 = Math.floor((y - HIT_H) / TILE);
  const y1 = Math.floor(y / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!inside(tx, ty) || blocked[at(tx, ty)]) return false;
    }
  }
  return true;
}

/** The private desk pod at a point (feet), if any. */
export function findPaAt(x: number, y: number): PrivateArea | null {
  for (const pa of PRIVATE_AREAS) {
    if (x >= pa.x && x < pa.x + pa.w && y >= pa.y && y < pa.y + pa.h) return pa;
  }
  return null;
}

/** The big classroom at a point, if any (null = corridor / garden). */
export function findZoneAt(x: number, y: number): Zone | null {
  for (const z of ZONES) {
    if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) return z;
  }
  return null;
}

/* ─────────────────────────── rendering ─────────────────────────── */

let baseCanvas: HTMLCanvasElement | null = null;

/** The whole static world, drawn once and blitted every frame. */
export function getMapCanvas(): HTMLCanvasElement {
  if (baseCanvas) return baseCanvas;
  const c = document.createElement('canvas');
  c.width = MAP_WIDTH;
  c.height = MAP_HEIGHT;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) drawTile(ctx, x, y);
  // Draw decorations top-to-bottom so lower items overlap upper ones.
  for (const d of [...decos].sort((a, b) => a.ty - b.ty)) drawDeco(ctx, d);
  drawBoardFrames(ctx);
  baseCanvas = c;
  return c;
}

/** Fill in art-pixel units relative to a tile's top-left. */
function px(ctx: CanvasRenderingContext2D, tx: number, ty: number, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(tx * TILE + x * PX, ty * TILE + y * PX, w * PX, h * PX);
}

// Deterministic per-tile noise so the textures don't look tiled.
const noise = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

const FLOORS: Partial<Record<T, [string, string]>> = {
  [T.FloorPolite]: ['#dbe7ff', '#c9dafb'],
  [T.FloorLeading]: ['#d9f5e3', '#c4ebd2'],
  [T.FloorUseful]: ['#ffe9cf', '#fbdcb6'],
  [T.FloorSmart]: ['#ece0ff', '#ddccfb'],
};

function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const t = tileAt(x, y);
  const n = noise(x, y);
  if (t === T.Grass) {
    px(ctx, x, y, 0, 0, 16, 16, '#7ccf6a');
    // Grass tufts.
    for (let i = 0; i < 4; i++) {
      const gx = Math.floor(noise(x + i, y * 3) * 14);
      const gy = Math.floor(noise(x * 5, y + i) * 14);
      px(ctx, x, y, gx, gy, 1, 2, i % 2 ? '#68b957' : '#90dc7c');
    }
  } else if (t === T.Path) {
    px(ctx, x, y, 0, 0, 16, 16, '#d8cfc0');
    px(ctx, x, y, 1, 1, 6, 6, '#e6dfd2'); px(ctx, x, y, 9, 2, 6, 5, '#e2dacb');
    px(ctx, x, y, 2, 9, 5, 6, '#e2dacb'); px(ctx, x, y, 8, 9, 7, 6, '#e6dfd2');
  } else if (t === T.Wood) {
    px(ctx, x, y, 0, 0, 16, 16, '#e0b884');
    // Planks: horizontal boards with staggered seams.
    for (let r = 0; r < 4; r++) {
      px(ctx, x, y, 0, r * 4 + 3, 16, 1, '#c99b64');
      const seam = (Math.floor(n * 16) + r * 7 + (x % 2) * 5) % 16;
      px(ctx, x, y, seam, r * 4, 1, 3, '#cfa36c');
    }
  } else if (t === T.Wall) {
    drawWall(ctx, x, y);
  } else {
    const [a, b] = FLOORS[t]!;
    // Soft checker tiles.
    px(ctx, x, y, 0, 0, 16, 16, (x + y) % 2 ? a : b);
    px(ctx, x, y, 0, 0, 16, 1, 'rgba(255,255,255,0.35)');
    px(ctx, x, y, 0, 0, 1, 16, 'rgba(255,255,255,0.35)');
  }
}

// 3/4 view: a wall shows its FACE on the two tiles above open floor, and its
// TOP (roof cap) everywhere else.
function drawWall(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const below1 = isWall(x, y + 1);
  const below2 = isWall(x, y + 2);
  const cap = '#6f6485';
  const capHi = '#8a7fa3';
  if (!below1) {
    // Lower face: wainscot + baseboard.
    px(ctx, x, y, 0, 0, 16, 16, '#f6eee0');
    px(ctx, x, y, 0, 6, 16, 8, '#d9bf98');
    px(ctx, x, y, 0, 6, 16, 1, '#c7a77a');
    px(ctx, x, y, 0, 14, 16, 2, '#8b6b4a');
    if (!isWall(x, y - 1)) px(ctx, x, y, 0, 0, 16, 3, cap); // 1-tile-high wall: tiny cap
    return;
  }
  if (!below2 && isWall(x, y + 1)) {
    // Upper face.
    px(ctx, x, y, 0, 0, 16, 16, '#f6eee0');
    px(ctx, x, y, 0, 0, 16, 4, cap);
    px(ctx, x, y, 0, 4, 16, 1, capHi);
    return;
  }
  px(ctx, x, y, 0, 0, 16, 16, cap);
  px(ctx, x, y, 0, 0, 16, 1, capHi);
  if (!isWall(x - 1, y)) px(ctx, x, y, 0, 0, 1, 16, capHi);
  if (!isWall(x + 1, y)) px(ctx, x, y, 15, 0, 1, 16, '#574d6c');
}

function drawDeco(ctx: CanvasRenderingContext2D, d: DecoItem) {
  const { tx, ty, tw } = d;
  switch (d.kind) {
    case 'podRug': {
      // Private desk zone: rounded rug with a stitched border and a number plate.
      const w = tw * 16;
      const h = d.th * 16;
      px(ctx, tx, ty, 2, 1, w - 4, h - 2, d.color2 ?? '#999');
      px(ctx, tx, ty, 1, 2, w - 2, h - 4, d.color2 ?? '#999');
      px(ctx, tx, ty, 3, 2, w - 6, h - 4, d.color ?? '#ccc');
      px(ctx, tx, ty, 2, 3, w - 4, h - 6, d.color ?? '#ccc');
      for (let i = 5; i < w - 5; i += 4) {
        px(ctx, tx, ty, i, 3, 2, 1, 'rgba(255,255,255,0.7)');
        px(ctx, tx, ty, i, h - 4, 2, 1, 'rgba(255,255,255,0.7)');
      }
      // Number plate.
      px(ctx, tx, ty, 3, 3, 9, 7, '#ffffff');
      px(ctx, tx, ty, 3, 10, 9, 1, 'rgba(0,0,0,0.15)');
      ctx.fillStyle = d.color2 ? shadeHex(d.color2, -70) : '#333';
      ctx.font = `bold ${6 * PX}px Pretendard, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.label ?? '', tx * TILE + 7.5 * PX, ty * TILE + 6.8 * PX);
      break;
    }
    case 'table': {
      const w = tw * 16;
      px(ctx, tx, ty, 0, 12, w, 3, 'rgba(0,0,0,0.12)'); // shadow
      px(ctx, tx, ty, 0, 1, w, 11, '#f7f1e6');
      px(ctx, tx, ty, 0, 1, w, 2, '#ffffff');
      px(ctx, tx, ty, 0, 10, w, 3, '#d8cdb8');
      px(ctx, tx, ty, 1, 12, 2, 3, '#8a7a66'); px(ctx, tx, ty, w - 3, 12, 2, 3, '#8a7a66');
      // Two notebooks facing each other + a pencil cup.
      px(ctx, tx, ty, 3, 4, 7, 5, '#ffffff'); px(ctx, tx, ty, 3, 4, 7, 1, d.color ?? '#5b8def');
      px(ctx, tx, ty, w - 10, 4, 7, 5, '#ffffff'); px(ctx, tx, ty, w - 10, 4, 7, 1, d.color ?? '#5b8def');
      px(ctx, tx, ty, w / 2 - 1, 3, 3, 4, '#e0708c'); px(ctx, tx, ty, w / 2 - 1, 1, 1, 2, '#f7d64a'); px(ctx, tx, ty, w / 2 + 1, 1, 1, 2, '#4cc38a');
      break;
    }
    case 'chairR':
    case 'chairL': {
      // Side-view chair; back rest on the outside so the two sit face to face.
      const back = d.kind === 'chairR' ? 3 : 11;
      px(ctx, tx, ty, 4, 7, 8, 4, '#b07a4a');
      px(ctx, tx, ty, 4, 7, 8, 1, '#c99160');
      px(ctx, tx, ty, back, 0, 2, 11, d.color ?? '#5b8def');
      px(ctx, tx, ty, back, 0, 2, 1, 'rgba(255,255,255,0.5)');
      px(ctx, tx, ty, 5, 11, 1, 4, '#6d4526'); px(ctx, tx, ty, 10, 11, 1, 4, '#6d4526');
      break;
    }
    case 'globe':
      px(ctx, tx, ty, 6, 12, 4, 3, '#7a4f2d');
      px(ctx, tx, ty, 7, 9, 2, 3, '#b8a07a');
      px(ctx, tx, ty, 4, 1, 8, 8, '#4fa3e0');
      px(ctx, tx, ty, 5, 0, 6, 10, '#4fa3e0');
      px(ctx, tx, ty, 5, 2, 3, 3, '#5cc473'); px(ctx, tx, ty, 9, 5, 2, 3, '#5cc473');
      px(ctx, tx, ty, 6, 1, 2, 1, '#bfe3ff');
      break;
    case 'fountain': {
      const w = tw * 16;
      px(ctx, tx, ty, 1, 4, w - 2, 11, '#b9b2a6');
      px(ctx, tx, ty, 3, 6, w - 6, 7, '#6cc4f0');
      px(ctx, tx, ty, 5, 8, w - 10, 2, '#a8e2fb');
      px(ctx, tx, ty, w / 2 - 1, 0, 2, 8, '#d7d0c4');
      px(ctx, tx, ty, w / 2 - 2, -2, 4, 2, '#a8e2fb');
      break;
    }
    case 'teacherDesk': {
      const w = tw * 16;
      px(ctx, tx, ty, 0, 3, w, 10, '#7a4f2d');
      px(ctx, tx, ty, 0, 3, w, 2, '#96643b');
      px(ctx, tx, ty, 3, 7, w - 6, 5, '#6a4225');
      px(ctx, tx, ty, 6, 0, 6, 4, '#2f3547'); px(ctx, tx, ty, 7, 1, 4, 2, '#7fd1ff'); // monitor
      px(ctx, tx, ty, w - 12, 1, 4, 3, '#f25f5c'); // apple
      px(ctx, tx, ty, w - 11, 0, 1, 1, '#3b7a3b');
      break;
    }
    case 'bookshelf': {
      const w = tw * 16;
      px(ctx, tx, ty, 0, -6, w, 22, '#7a4f2d');
      const colors = ['#e05b5b', '#4c8fe0', '#f2c14e', '#5cc48a', '#a36cf0', '#f08a4b'];
      for (let shelf = 0; shelf < 3; shelf++) {
        const sy = -4 + shelf * 7;
        px(ctx, tx, ty, 1, sy, w - 2, 6, '#5a3a1f');
        for (let b = 0; b < (w - 4) / 3; b++) {
          const h = 4 + ((b + shelf) % 2);
          px(ctx, tx, ty, 2 + b * 3, sy + 6 - h, 2, h, colors[(b + shelf * 2) % colors.length]);
        }
      }
      break;
    }
    case 'plant':
      px(ctx, tx, ty, 4, 10, 8, 6, '#c2703d'); px(ctx, tx, ty, 4, 10, 8, 1, '#d98952');
      px(ctx, tx, ty, 3, 3, 10, 7, '#3f9d4f'); px(ctx, tx, ty, 5, 0, 6, 5, '#4cb85e');
      px(ctx, tx, ty, 2, 5, 3, 3, '#4cb85e'); px(ctx, tx, ty, 11, 4, 3, 3, '#358a44');
      px(ctx, tx, ty, 6, 1, 2, 2, '#7fd98b');
      break;
    case 'tree':
      px(ctx, tx, ty, 6, 10, 4, 6, '#7a4f2d');
      px(ctx, tx, ty, 1, 1, 14, 10, '#2f8a4a'); px(ctx, tx, ty, 3, -2, 10, 5, '#3aa257');
      px(ctx, tx, ty, 4, 0, 4, 3, '#5cc473'); px(ctx, tx, ty, 10, 5, 3, 3, '#277a3e');
      break;
    case 'flower':
      for (const [fx, fy, c] of [[3, 4, '#ff7aa8'], [9, 3, '#ffd84d'], [6, 9, '#ffffff'], [11, 10, '#ff7aa8']] as const) {
        px(ctx, tx, ty, fx, fy + 2, 1, 3, '#3f8f3f');
        px(ctx, tx, ty, fx - 1, fy, 3, 2, c);
      }
      break;
    case 'bench':
      px(ctx, tx, ty, 0, 5, tw * 16, 3, '#b07a4a'); px(ctx, tx, ty, 0, 9, tw * 16, 3, '#9a6a3e');
      px(ctx, tx, ty, 2, 12, 2, 4, '#4a4a4a'); px(ctx, tx, ty, tw * 16 - 4, 12, 2, 4, '#4a4a4a');
      break;
    case 'rug':
      px(ctx, tx, ty, 1, 2, tw * 16 - 2, d.th * 16 - 4, '#c94f6d');
      px(ctx, tx, ty, 3, 4, tw * 16 - 6, d.th * 16 - 8, '#e0708c');
      px(ctx, tx, ty, 6, 7, tw * 16 - 12, d.th * 16 - 14, '#f4b6c5');
      break;
    case 'lockers':
      for (let i = 0; i < tw; i++) {
        px(ctx, tx + i, ty, 1, 1, 14, 12, i % 2 ? '#6fa8dc' : '#5b95cc');
        px(ctx, tx + i, ty, 11, 5, 2, 1, '#2d4d6d');
        px(ctx, tx + i, ty, 3, 2, 8, 1, '#3f73a8'); px(ctx, tx + i, ty, 3, 4, 8, 1, '#3f73a8');
      }
      break;
    case 'window':
      px(ctx, tx, ty, 2, 6, tw * 16 - 4, 12, '#ffffff');
      px(ctx, tx, ty, 3, 7, tw * 16 - 6, 10, '#9fdcff');
      px(ctx, tx, ty, 3, 7, tw * 8 - 4, 4, '#c9ecff');
      px(ctx, tx, ty, tw * 8 - 1, 6, 2, 12, '#ffffff');
      break;
    case 'clock':
      px(ctx, tx, ty, 4, 7, 8, 8, '#ffffff'); px(ctx, tx, ty, 4, 7, 8, 1, '#555');
      px(ctx, tx, ty, 7, 9, 1, 3, '#333'); px(ctx, tx, ty, 8, 11, 2, 1, '#333');
      break;
    case 'sofa':
      px(ctx, tx, ty, 2, 0, 12, d.th * 16, '#e0708c');
      px(ctx, tx, ty, 4, 2, 8, d.th * 16 - 4, '#f29bb0');
      break;
  }
}

function shadeHex(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// Blackboard frames are part of the static art; their content is DOM (boards).
export function drawBoardFrames(ctx: CanvasRenderingContext2D) {
  for (const b of PRESENTATION_OBJECTS) {
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
    ctx.fillStyle = b.paId ? '#2f6b4f' : '#3b82c4';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#c9a36b';
    ctx.fillRect(b.x - 6, b.y + b.h + 2, b.w + 12, 6); // chalk tray
  }
}
