import { useEffect, useMemo, useRef, useState } from 'react';
import GameWorld, { type MyState, type WorldPlayer } from '../game/GameWorld';
import { canStand, findPaAt, PRIVATE_AREAS, ROOM_NPC, SPAWN, TILE } from '../game/map';
import { lookFromName, randomLook, type Dir } from '../game/sprites';

/**
 * Offline demo of the ZEP-style school — no Firebase, no LiveKit.
 * You walk around for real; a few bot students wander the halls and rooms.
 * Reachable at /preview for design reviews.
 */

const BOT_NAMES = ['Hiroshi', '민수', 'Mary', 'Somchai', 'Mei', '지우'];
const WAYPOINTS: Array<[number, number]> = [
  [22, 16], [10, 16], [34, 16], [22, 7], [22, 25], [21.5, 30], [15.5, 12], [27.5, 12], [8, 10], [33, 9], [9, 24], [32, 24], [17, 30], [28, 30],
];
const EMOS = ['👋', '😀', '👍', '🎉', '❓'];

interface Bot extends WorldPlayer {
  tx: number;
  ty: number;
  wait: number;
}

function pickTarget(): [number, number] {
  const [x, y] = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
  return [x * TILE, y * TILE];
}

export default function Preview() {
  const myLook = useMemo(() => randomLook(), []);
  const botsRef = useRef<Bot[]>(
    BOT_NAMES.map((name, i) => {
      const [x, y] = WAYPOINTS[i + 1];
      const [tx, ty] = pickTarget();
      return {
        id: `bot-${i}`, name, x: x * TILE, y: y * TILE, dir: 'down', moving: false,
        look: lookFromName(name + i), paId: null, tx, ty, wait: Math.random() * 2,
      };
    }),
  );
  const [others, setOthers] = useState<Record<string, WorldPlayer>>({});
  const [me, setMe] = useState<MyState>({ ...SPAWN, dir: 'down', moving: false, paId: null });

  // Simple bot brain: walk to a waypoint, pause, maybe emote, pick another.
  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      for (const b of botsRef.current) {
        if (b.wait > 0) {
          b.wait -= dt;
          b.moving = false;
          if (b.wait <= 0) [b.tx, b.ty] = pickTarget();
          continue;
        }
        const dx = b.tx - b.x;
        const dy = b.ty - b.y;
        const d = Math.hypot(dx, dy);
        if (d < 8) {
          b.wait = 1.5 + Math.random() * 3;
          if (Math.random() < 0.4) { b.emo = EMOS[Math.floor(Math.random() * EMOS.length)]; b.emoTs = Date.now(); }
          continue;
        }
        const step = (150 * dt) / d;
        const nx = b.x + dx * step;
        const ny = b.y + dy * step;
        let moved = false;
        if (canStand(nx, b.y)) { b.x = nx; moved = true; }
        if (canStand(b.x, ny)) { b.y = ny; moved = true; }
        if (!moved) { [b.tx, b.ty] = pickTarget(); }
        b.moving = moved;
        b.dir = (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down') as Dir;
        b.paId = findPaAt(b.x, b.y)?.id ?? null;
      }
      setOthers(Object.fromEntries(botsRef.current.map((b) => [b.id, { ...b }])));
    }, 80);
    return () => clearInterval(id);
  }, []);

  const pa = PRIVATE_AREAS.find((p) => p.id === me.paId) ?? null;
  const npcs = useMemo(() => Object.values(ROOM_NPC), []);

  return (
    <div className="fixed inset-0 bg-[#1b1830] text-white overflow-hidden">
      <GameWorld
        myName="You"
        myLook={myLook}
        spawn={SPAWN}
        others={others}
        hearRadius={300}
        npcs={npcs}
        onState={setMe}
        worldLayer={
          pa && (
            <div
              className="absolute"
              style={{ left: ROOM_NPC[pa.id].x, top: ROOM_NPC[pa.id].y - 58, transform: 'translate(-50%, -100%)' }}
            >
              <div className="max-w-[280px] w-max bg-white text-slate-800 text-[13px] leading-snug font-medium rounded-2xl px-3 py-2 shadow-xl ring-2 ring-amber-300">
                Hi! Welcome to the {pa.name}. When a friend joins you here, I'll ask you both fun questions!
              </div>
            </div>
          )
        }
      />
      <div className="absolute top-3 left-3 flex gap-2">
        <div className="bg-white/95 text-slate-800 rounded-2xl shadow-lg px-3 py-2 text-sm font-bold">🏫 Preview · Global Classroom</div>
        <div
          className="rounded-2xl shadow-lg px-3 py-2 text-sm font-semibold"
          style={{ background: pa ? pa.color : 'rgba(255,255,255,0.95)', color: pa ? '#fff' : '#334155' }}
        >
          {pa ? `🔒 ${pa.name}` : '🚶 Hallway'}
        </div>
      </div>
      <div className="absolute top-3 right-3 bg-slate-900/80 rounded-2xl px-3 py-2 text-[11px] text-slate-300 leading-5 hidden md:block">
        <div>WASD / ↑↓←→ move · Click to walk · Space jump</div>
        <div>Demo only — no camera, no login.</div>
      </div>
    </div>
  );
}
