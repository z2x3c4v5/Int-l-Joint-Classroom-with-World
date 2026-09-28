import { useEffect, useRef, type ReactNode } from 'react';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PRIVATE_AREAS,
  ZONES,
  canStand,
  findPaAt,
  findZoneAt,
  getMapCanvas,
} from './map';
import { drawCharacter, SPRITE_H, type Dir, type Look } from './sprites';
import TouchJoystick from '../components/TouchJoystick';

export interface WorldPlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  look: Look;
  /** Private desk pod, if sitting at one. */
  paId: string | null;
  /** Big classroom they're in (null = corridor/garden). */
  zone: string | null;
  emo?: string;
  emoTs?: number;
}

export interface MyState {
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  paId: string | null;
  zone: string | null;
}

/** Who can hear whom: same desk pod, or same open area (room / hallway). */
export function audibleScope(paId: string | null, zone: string | null) {
  return paId ?? zone ?? 'hall';
}

interface Props {
  myName: string;
  myLook: Look;
  spawn: { x: number; y: number };
  others: Record<string, WorldPlayer>;
  /** Identities currently talking (green name tag). */
  speaking?: Set<string>;
  meSpeaking?: boolean;
  myEmo?: { emo: string; ts: number } | null;
  /** Hallway hearing radius (world px); drawn around me when outside rooms. */
  hearRadius?: number;
  /** AI tutor owls to draw (one per desk pod); `active` ones glow and are labelled. */
  npcs?: Array<{ x: number; y: number; active?: boolean; label?: string }>;
  onState: (s: MyState) => void;
  /** DOM laid out in world coordinates (boards, speech bubbles). */
  worldLayer?: ReactNode;
}

const SPEED = 220; // world px / s
const STEP_TIME = 0.14; // s per walk frame
const WALK_FRAMES = [1, 0, 2, 0];
const EMO_MS = 4000;

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

/**
 * The ZEP-style world: one canvas, a requestAnimationFrame loop, camera that
 * follows you, walls you can't walk through. Everything that changes every
 * frame lives in refs — React only re-renders when the parent's props change.
 */
export default function GameWorld(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const me = useRef({
    x: props.spawn.x,
    y: props.spawn.y,
    dir: 'down' as Dir,
    moving: false,
    paId: findPaAt(props.spawn.x, props.spawn.y)?.id ?? null,
    zone: findZoneAt(props.spawn.x, props.spawn.y)?.id ?? null,
    stepT: 0,
    jumpT: -1,
  });
  const keys = useRef(new Set<string>());
  const analog = useRef({ x: 0, y: 0 });
  const target = useRef<{ x: number; y: number } | null>(null);
  const cam = useRef({ x: 0, y: 0, init: false });
  const view = useRef({ w: 800, h: 600, dpr: 1 });
  const remote = useRef(new Map<string, { x: number; y: number; stepT: number }>());
  const lastSent = useRef({ t: 0, key: '' });
  const drawRef = useRef<(dt: number) => void>(() => {});
  // Dev-only handle for automated testing (stripped from production builds).
  if (import.meta.env.DEV) (window as unknown as { __gcMe?: unknown }).__gcMe = me.current;

  /* ── input ── */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      // e.code is layout-independent: WASD works even with the Korean IME on.
      if (MOVE_KEYS[e.code]) {
        keys.current.add(e.code);
        target.current = null;
        e.preventDefault();
      } else if (e.code === 'Space') {
        if (me.current.jumpT < 0) me.current.jumpT = 0;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  /* ── canvas sizing ── */
  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      view.current = { w: wrap.clientWidth, h: wrap.clientHeight, dpr };
      canvas.width = Math.round(wrap.clientWidth * dpr);
      canvas.height = Math.round(wrap.clientHeight * dpr);
      canvas.style.width = `${wrap.clientWidth}px`;
      canvas.style.height = `${wrap.clientHeight}px`;
      drawRef.current(0);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  /* ── game loop ── */
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const map = getMapCanvas();

    function update(dt: number) {
      const m = me.current;
      let dx = 0;
      let dy = 0;
      for (const k of keys.current) {
        const v = MOVE_KEYS[k];
        if (v) { dx += v[0]; dy += v[1]; }
      }
      if (analog.current.x || analog.current.y) {
        dx = analog.current.x;
        dy = analog.current.y;
        target.current = null;
      }
      if (!dx && !dy && target.current) {
        dx = target.current.x - m.x;
        dy = target.current.y - m.y;
        if (Math.hypot(dx, dy) < 6) { target.current = null; dx = dy = 0; }
      }
      const mag = Math.hypot(dx, dy);
      const wasMoving = m.moving;
      if (mag > 0.05 && dt > 0) {
        const s = (SPEED * Math.min(1, mag > 1.5 ? 1 : mag) * dt) / mag;
        const nx = m.x + dx * s;
        const ny = m.y + dy * s;
        // Slide along walls: resolve each axis on its own.
        let moved = false;
        if (canStand(nx, m.y)) { m.x = nx; moved = true; }
        if (canStand(m.x, ny)) { m.y = ny; moved = true; }
        if (!moved) target.current = null;
        m.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
        m.moving = moved;
        m.stepT += dt;
      } else {
        m.moving = false;
        m.stepT = 0;
      }
      if (m.jumpT >= 0) {
        m.jumpT += dt;
        if (m.jumpT > 0.45) m.jumpT = -1;
      }
      const paId = findPaAt(m.x, m.y)?.id ?? null;
      const zone = findZoneAt(m.x, m.y)?.id ?? null;
      const roomChanged = paId !== m.paId || zone !== m.zone;
      m.paId = paId;
      m.zone = zone;

      // Report to the parent (presence + A/V) at ≤ 11 Hz, instantly on room
      // change or when stopping.
      const now = performance.now();
      const key = `${Math.round(m.x)},${Math.round(m.y)},${m.dir},${m.moving}`;
      if (key !== lastSent.current.key && (roomChanged || wasMoving !== m.moving || now - lastSent.current.t > 90)) {
        lastSent.current = { t: now, key };
        propsRef.current.onState({ x: Math.round(m.x), y: Math.round(m.y), dir: m.dir, moving: m.moving, paId, zone });
      }

      // Remote players glide toward their last reported position.
      const k = 1 - Math.exp(-dt * 12);
      const others = propsRef.current.others;
      for (const [id, p] of Object.entries(others)) {
        const r = remote.current.get(id);
        if (!r || Math.hypot(r.x - p.x, r.y - p.y) > 400) {
          remote.current.set(id, { x: p.x, y: p.y, stepT: 0 });
        } else {
          r.x += (p.x - r.x) * k;
          r.y += (p.y - r.y) * k;
          r.stepT = p.moving ? r.stepT + dt : 0;
        }
      }
      for (const id of remote.current.keys()) if (!others[id]) remote.current.delete(id);
    }

    function draw() {
      const { w, h, dpr } = view.current;
      const m = me.current;
      const p = propsRef.current;
      // Camera: follow me, clamp to the map, centre the map if the screen is bigger.
      const tx = MAP_WIDTH <= w ? (MAP_WIDTH - w) / 2 : Math.min(Math.max(m.x - w / 2, 0), MAP_WIDTH - w);
      const ty = MAP_HEIGHT <= h ? (MAP_HEIGHT - h) / 2 : Math.min(Math.max(m.y - h / 2, 0), MAP_HEIGHT - h);
      if (!cam.current.init) cam.current = { x: tx, y: ty, init: true };
      cam.current.x += (tx - cam.current.x) * 0.2;
      cam.current.y += (ty - cam.current.y) * 0.2;
      const cx = Math.round(cam.current.x);
      const cy = Math.round(cam.current.y);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#5fae55';
      ctx.fillRect(0, 0, w, h);
      ctx.translate(-cx, -cy);
      const sx = Math.max(0, cx);
      const sy = Math.max(0, cy);
      const sw = Math.min(MAP_WIDTH - sx, w);
      const sh = Math.min(MAP_HEIGHT - sy, h);
      if (sw > 0 && sh > 0) ctx.drawImage(map, sx, sy, sw, sh, sx, sy, sw, sh);

      // Hearing range in the hallway.
      if (p.hearRadius && !m.paId) {
        const g = ctx.createRadialGradient(m.x, m.y - 20, 10, m.x, m.y - 20, p.hearRadius);
        g.addColorStop(0, 'rgba(90,230,160,0.20)');
        g.addColorStop(1, 'rgba(90,230,160,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(m.x, m.y - 20, p.hearRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.setLineDash([8, 8]);
        ctx.strokeStyle = 'rgba(40,170,110,0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Click-to-move marker.
      if (target.current) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(target.current.x, target.current.y, 12, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      const t = performance.now() / 1000;
      for (const n of p.npcs ?? []) {
        const bob = Math.sin(t * 2 + n.x) * 2;
        if (n.active) {
          ctx.fillStyle = 'rgba(253,224,71,0.35)';
          ctx.beginPath();
          ctx.arc(n.x, n.y - 12, 26 + Math.sin(t * 3) * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.font = `${n.active ? 34 : 26}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('🦉', n.x, n.y + bob);
        if (n.active && n.label) nameTag(ctx, n.label, n.x, n.y - 44 + bob, '#fde047', '#3b2a00');
      }

      // Characters, back-to-front.
      type Ent = { id: string; name: string; look: Look; dir: Dir; frame: number; x: number; y: number; lift: number; isMe: boolean; emo?: string; emoTs?: number };
      const ents: Ent[] = [];
      const now = Date.now();
      for (const [id, o] of Object.entries(p.others)) {
        const r = remote.current.get(id) ?? { x: o.x, y: o.y, stepT: 0 };
        const frame = o.moving ? WALK_FRAMES[Math.floor(r.stepT / STEP_TIME) % 4] : 0;
        ents.push({ id, name: o.name, look: o.look, dir: o.dir, frame, x: r.x, y: r.y, lift: 0, isMe: false, emo: o.emo, emoTs: o.emoTs });
      }
      const myFrame = m.moving ? WALK_FRAMES[Math.floor(m.stepT / STEP_TIME) % 4] : 0;
      const lift = m.jumpT >= 0 ? Math.sin((m.jumpT / 0.45) * Math.PI) * 22 : 0;
      ents.push({ id: '__me', name: p.myName, look: p.myLook, dir: m.dir, frame: myFrame, x: m.x, y: m.y, lift, isMe: true, emo: p.myEmo?.emo, emoTs: p.myEmo?.ts });
      ents.sort((a, b) => a.y - b.y);

      for (const e of ents) {
        // People behind a room wall are only drawn faintly — you can't reach them.
        const theirScope = audibleScope(findPaAt(e.x, e.y)?.id ?? null, findZoneAt(e.x, e.y)?.id ?? null);
        const otherRoom = !e.isMe && theirScope !== audibleScope(m.paId, m.zone);
        ctx.globalAlpha = otherRoom ? 0.55 : 1;
        drawCharacter(ctx, e.look, e.dir, e.frame, e.x, e.y, e.lift);
        const talking = e.isMe ? p.meSpeaking : p.speaking?.has(e.id);
        const tagY = e.y - SPRITE_H - 4 - e.lift;
        nameTag(ctx, e.name, e.x, tagY, talking ? '#22c55e' : e.isMe ? '#ffffff' : 'rgba(20,20,35,0.72)', talking || !e.isMe ? '#ffffff' : '#1e1b2e', talking ? '🎤 ' : '');
        if (e.emo && e.emoTs && now - e.emoTs < EMO_MS) emoBubble(ctx, e.emo, e.x, tagY - 26, (now - e.emoTs) / EMO_MS);
        ctx.globalAlpha = 1;
      }

      // Focus: at a desk pod, dim everything else; in a classroom, dim the rest lightly.
      const focus = m.paId
        ? { r: PRIVATE_AREAS.find((a) => a.id === m.paId)!, a: 0.5 }
        : m.zone
          ? { r: ZONES.find((z) => z.id === m.zone)!, a: 0.28 }
          : null;
      if (focus) {
        ctx.fillStyle = `rgba(15,12,35,${focus.a})`;
        ctx.beginPath();
        ctx.rect(cx, cy, w, h);
        ctx.rect(focus.r.x, focus.r.y, focus.r.w, focus.r.h);
        ctx.fill('evenodd');
        if (m.paId) {
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 6]);
          ctx.strokeRect(focus.r.x + 2, focus.r.y + 2, focus.r.w - 4, focus.r.h - 4);
          ctx.setLineDash([]);
        }
      }

      if (layerRef.current) layerRef.current.style.transform = `translate(${-cx}px, ${-cy}px)`;
    }

    let last = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      // Schedule first: one bad frame must never stop the game loop.
      raf = requestAnimationFrame(frame);
      try {
        update(dt);
        draw();
      } catch (err) {
        console.error('frame failed', err);
      }
    };
    drawRef.current = (dt: number) => { update(dt); draw(); };
    // Draw once right away so a hidden tab (no rAF) still shows the world.
    drawRef.current(0);
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keep a static frame fresh while the tab is hidden (rAF is paused there).
  useEffect(() => {
    if (document.hidden) drawRef.current(0);
  }, [props.others, props.npcs, props.myEmo]);

  function handlePointer(e: React.PointerEvent) {
    if (e.pointerType === 'touch') return; // touch uses the joystick
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left + cam.current.x;
    const y = e.clientY - rect.top + cam.current.y;
    target.current = { x, y };
  }

  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden select-none" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="absolute inset-0 block" onPointerDown={handlePointer} style={{ imageRendering: 'pixelated' }} />
      <div
        ref={layerRef}
        className="absolute left-0 top-0 pointer-events-none"
        style={{ width: MAP_WIDTH, height: MAP_HEIGHT, transformOrigin: '0 0' }}
      >
        {props.worldLayer}
      </div>
      {coarse && (
        <TouchJoystick
          onMove={(dx, dy) => { analog.current = { x: dx, y: dy }; }}
          onRelease={() => { analog.current = { x: 0, y: 0 }; }}
        />
      )}
    </div>
  );
}

function nameTag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg: string, prefix = '') {
  const label = prefix + text;
  ctx.font = '700 13px Pretendard, "Noto Sans KR", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(label).width + 14;
  ctx.fillStyle = bg;
  roundRect(ctx, x - w / 2, y - 10, w, 20, 10);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.fillText(label, x, y + 1);
}

function emoBubble(ctx: CanvasRenderingContext2D, emo: string, x: number, y: number, t: number) {
  const pop = t < 0.08 ? t / 0.08 : 1;
  ctx.globalAlpha *= t > 0.85 ? (1 - t) / 0.15 : 1;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x - 20 * pop, y - 18 * pop, 40 * pop, 34 * pop, 12);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 6, y + 15);
  ctx.lineTo(x, y + 22);
  ctx.lineTo(x + 6, y + 15);
  ctx.fill();
  ctx.font = `${Math.round(22 * pop)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emo, x, y);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
