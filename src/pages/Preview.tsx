import { useEffect, useMemo, useRef, useState } from 'react';
import GameWorld, { type MyState, type WorldPlayer } from '../game/GameWorld';
import { canStand, findPaAt, findZoneAt, PRIVATE_AREAS, SPAWN, TILE, ZONES } from '../game/map';
import { lookFromName, randomLook, type Dir } from '../game/sprites';
import Minimap from '../components/Minimap';
import { LangToggle, useI18n, type StringKey } from '../lib/i18n';

/**
 * Offline demo of the school — no Firebase, no LiveKit, no login.
 * You walk around for real; bot students wander the halls and sit at desks.
 * Reachable at /preview for design reviews.
 */

const BOT_NAMES = ['Hiroshi', '민수', 'Mary', 'Somchai', 'Mei', '지우', 'Ali', '서연'];
const HALL_POINTS: Array<[number, number]> = [
  [22, 16], [10, 16], [34, 16], [22, 7], [22, 25], [21.5, 30], [8, 12.5], [33, 12.5], [9, 19.6], [32, 19.6], [17, 30], [27, 30],
];
// Chair spots at every desk pod (left and right of the table).
const CHAIR_POINTS: Array<[number, number]> = PRIVATE_AREAS.flatMap((p) => {
  const tx = p.x / TILE;
  const ty = p.y / TILE;
  return [[tx + 1.5, ty + 1.85], [tx + 4.5, ty + 1.85]] as Array<[number, number]>;
});
const EMOS = ['👋', '😀', '👍', '🎉', '❓'];

interface Bot extends WorldPlayer {
  tx: number;
  ty: number;
  wait: number;
}

function pickTarget(): [number, number] {
  const pool = Math.random() < 0.5 ? CHAIR_POINTS : HALL_POINTS;
  const [x, y] = pool[Math.floor(Math.random() * pool.length)];
  return [x * TILE, y * TILE];
}

export default function Preview() {
  const { t } = useI18n();
  const myLook = useMemo(() => randomLook(), []);
  const botsRef = useRef<Bot[]>(
    BOT_NAMES.map((name, i) => {
      const [x, y] = HALL_POINTS[(i + 1) % HALL_POINTS.length];
      const [tx, ty] = pickTarget();
      return {
        id: `bot-${i}`, name, x: x * TILE, y: y * TILE, dir: 'down', moving: false,
        look: lookFromName(name + i), paId: null, zone: null, tx, ty, wait: Math.random() * 2,
      };
    }),
  );
  const [others, setOthers] = useState<Record<string, WorldPlayer>>({});
  const [me, setMe] = useState<MyState>({ ...SPAWN, dir: 'down', moving: false, paId: null, zone: null });

  // Simple bot brain: walk to a spot, pause (longer at desks), maybe emote.
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
          b.wait = b.paId ? 6 + Math.random() * 8 : 1.5 + Math.random() * 3;
          if (b.paId) b.dir = b.x % (6 * TILE) < 3 * TILE ? 'right' : 'left';
          if (Math.random() < 0.4) { b.emo = EMOS[Math.floor(Math.random() * EMOS.length)]; b.emoTs = Date.now(); }
          continue;
        }
        const step = (150 * dt) / d;
        const nx = b.x + dx * step;
        const ny = b.y + dy * step;
        let moved = false;
        if (canStand(nx, b.y)) { b.x = nx; moved = true; }
        if (canStand(b.x, ny)) { b.y = ny; moved = true; }
        if (!moved) [b.tx, b.ty] = pickTarget();
        b.moving = moved;
        b.dir = (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down') as Dir;
        b.paId = findPaAt(b.x, b.y)?.id ?? null;
        b.zone = findZoneAt(b.x, b.y)?.id ?? null;
      }
      setOthers(Object.fromEntries(botsRef.current.map((b) => [b.id, { ...b }])));
    }, 80);
    return () => clearInterval(id);
  }, []);

  const pod = PRIVATE_AREAS.find((p) => p.id === me.paId) ?? null;
  const zone = ZONES.find((z) => z.id === me.zone) ?? null;
  const roomName = (id: string) => t(`room.${id}` as StringKey);
  const tutorLabel = t('tutor.title');
  const npcs = useMemo(
    () => PRIVATE_AREAS.map((p) => ({ x: p.npc.x, y: p.npc.y, active: p.id === me.paId, label: tutorLabel })),
    [me.paId, tutorLabel],
  );
  const busyPods = useMemo(() => new Set(Object.values(others).map((o) => o.paId).filter(Boolean) as string[]), [others]);
  const dots = useMemo(() => Object.values(others).map((o) => ({ x: o.x, y: o.y })), [others]);

  return (
    <div className="fixed inset-0 bg-[#1b1830] text-white overflow-hidden">
      <GameWorld
        myName={t('common.you')}
        myLook={myLook}
        spawn={SPAWN}
        others={others}
        hearRadius={pod ? undefined : 300}
        npcs={npcs}
        onState={setMe}
        worldLayer={
          pod && (
            <div className="absolute" style={{ left: pod.npc.x, top: pod.npc.y - 64, transform: 'translate(-50%, -100%)' }}>
              <div className="max-w-[300px] w-max bg-white text-slate-800 text-[13px] leading-snug font-semibold rounded-2xl px-3 py-2 shadow-xl ring-2 ring-amber-300">
                Hi! Welcome to Desk {pod.n}. When a friend sits with you, I'll ask you both questions and listen to your talks!
              </div>
            </div>
          )
        }
      />
      <div className="absolute top-3 left-3 flex flex-wrap gap-2">
        <div className="bg-white/95 text-slate-800 rounded-2xl shadow-lg px-3 py-2 text-sm font-extrabold">🏫 Preview · Global Classroom</div>
        <div
          className="rounded-2xl shadow-lg px-3 py-2 text-sm font-bold"
          style={{ background: pod ? pod.color : '#fff', color: pod ? '#fff' : zone ? zone.color : '#334155' }}
        >
          {pod
            ? t('hud.inDesk', { desk: t('desk.name', { room: roomName(pod.zoneId), n: pod.n }) })
            : zone
              ? `🏫 ${t('hud.inRoom', { room: roomName(zone.id) })}`
              : t('hud.hallway')}
        </div>
      </div>
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        <LangToggle />
        <div className="hidden lg:block bg-slate-900/85 rounded-2xl px-3 py-2 text-[11px] text-slate-300 leading-5 max-w-[260px]">
          <div>WASD / ↑↓←→ · {t('hud.help2')}</div>
          <div className="text-amber-300">{t('hud.help3')}</div>
        </div>
      </div>
      <div className="absolute bottom-4 left-4 hidden md:block">
        <Minimap me={me} others={dots} busyPods={busyPods} />
      </div>
    </div>
  );
}
