// The world itself (tiles, rooms, boards, collision, art) lives in src/game/map.ts.
export {
  MAP_WIDTH,
  MAP_HEIGHT,
  TILE,
  PRIVATE_AREAS,
  PRESENTATION_OBJECTS,
  ZONES,
  SPAWN,
  findPaAt,
  findZoneAt,
  type Zone,
  type PrivateArea,
  type PresentationObject,
} from '../game/map';

// ── Hallway proximity A/V (ZEP-style) ──────────────────────────────
// Outside the private rooms everyone shares one LiveKit room, but you only
// receive people near you. Within NEAR_RADIUS they're at full volume/opacity;
// they fade out until HEAR_RADIUS, where they go silent. Tracks are
// unsubscribed beyond SUBSCRIBE_RADIUS (a bit wider, so walking along the
// edge doesn't flap the connection). Units: world px (1 tile = 48 px).
export const HALL_ROOM_ID = 'pa-hall';
export const NEAR_RADIUS = 120; // 2.5 tiles
export const HEAR_RADIUS = 300; // ~6 tiles
export const SUBSCRIBE_RADIUS = 360;

export function proximityFade(distance: number): number {
  if (distance <= NEAR_RADIUS) return 1;
  if (distance >= HEAR_RADIUS) return 0;
  return 1 - (distance - NEAR_RADIUS) / (HEAR_RADIUS - NEAR_RADIUS);
}
