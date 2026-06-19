export const MAP_WIDTH = 1800;
export const MAP_HEIGHT = 1080;
export const TILE = 40;
export const AVATAR_SIZE = 36;
export const MOVE_SPEED = 4;

export interface PrivateArea {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  maxOccupants: number;
}

export interface PresentationObject {
  id: string;
  paId: string | null; // null = central / hallway board (always reachable)
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface DecorSeat {
  paId: string;
  x: number;
  y: number;
  number: number;
}

// Layout mirrors the ZEP screenshot: four classrooms in a 2×2 grid with a
// cross-shaped central corridor and a welcome board in the middle.
export const PRIVATE_AREAS: PrivateArea[] = [
  { id: 'pa-polite',  name: 'Polite Room',  x:   40, y:  80, w: 780, h: 400, color: '#1d4ed8', maxOccupants: 12 },
  { id: 'pa-leading', name: 'Leading Room', x:  980, y:  80, w: 780, h: 400, color: '#1d4ed8', maxOccupants: 12 },
  { id: 'pa-useful',  name: 'Useful Room',  x:   40, y: 600, w: 780, h: 400, color: '#1d4ed8', maxOccupants: 12 },
  { id: 'pa-smart',   name: 'Smart Room',   x:  980, y: 600, w: 780, h: 400, color: '#1d4ed8', maxOccupants: 12 },
];

// Decorative chair tiles inside each room — pure visual, no interaction.
// They give the "ZEP classroom" look from the screenshot.
export const DECOR_SEATS: DecorSeat[] = (() => {
  const out: DecorSeat[] = [];
  let n = 1;
  for (const pa of PRIVATE_AREAS) {
    const cols = 3;
    const rows = 2;
    const padX = 70;
    const padY = 90;
    const colGap = (pa.w - padX * 2) / (cols - 1);
    const rowGap = (pa.h - padY * 2) / (rows - 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out.push({
          paId: pa.id,
          x: pa.x + padX + c * colGap - 30,
          y: pa.y + padY + r * rowGap - 30,
          number: n++,
        });
      }
    }
  }
  return out;
})();

// Boards students attach images / Google Slides to.
//   - Each room has one board on the back wall (top of the room).
//   - The central welcome board is always reachable (paId: null).
export const PRESENTATION_OBJECTS: PresentationObject[] = [
  // Central welcome board (the big "DEOKCHEON ZEP ENGLISH CLASSROOM" sign).
  { id: 'obj-welcome', paId: null, x: 740, y: 500, w: 320, h: 80, label: 'Welcome Board' },
  // One presentation board per room, mounted on the inner wall toward the corridor.
  { id: 'obj-polite',  paId: 'pa-polite',  x: 320, y:  90, w: 240, h: 60, label: 'Polite Room board' },
  { id: 'obj-leading', paId: 'pa-leading', x: 1260,y:  90, w: 240, h: 60, label: 'Leading Room board' },
  { id: 'obj-useful',  paId: 'pa-useful',  x: 320, y: 610, w: 240, h: 60, label: 'Useful Room board' },
  { id: 'obj-smart',   paId: 'pa-smart',   x: 1260,y: 610, w: 240, h: 60, label: 'Smart Room board' },
];

export function findPaAt(x: number, y: number): PrivateArea | null {
  const cx = x + AVATAR_SIZE / 2;
  const cy = y + AVATAR_SIZE / 2;
  for (const pa of PRIVATE_AREAS) {
    if (cx >= pa.x && cx <= pa.x + pa.w && cy >= pa.y && cy <= pa.y + pa.h) return pa;
  }
  return null;
}

// Spawn at the center hallway in front of the welcome board.
export const SPAWN = { x: 880, y: 540 };
