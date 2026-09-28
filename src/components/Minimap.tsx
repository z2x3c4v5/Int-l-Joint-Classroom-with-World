import { useEffect, useRef } from 'react';
import { MAP_HEIGHT, MAP_WIDTH, PRIVATE_AREAS, getMapCanvas } from '../game/map';

const W = 176;
const H = Math.round((W * MAP_HEIGHT) / MAP_WIDTH);
const S = W / MAP_WIDTH;

interface Props {
  me: { x: number; y: number; paId: string | null };
  others: Array<{ x: number; y: number }>;
  /** Desk pods that currently have someone at them. */
  busyPods: Set<string>;
}

/** Bottom-left overview: the school, every student as a dot, occupied desks lit. */
export default function Minimap({ me, others, busyPods }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!bgRef.current) {
      const bg = document.createElement('canvas');
      bg.width = W * 2;
      bg.height = H * 2;
      const b = bg.getContext('2d')!;
      b.imageSmoothingEnabled = true;
      b.drawImage(getMapCanvas(), 0, 0, W * 2, H * 2);
      bgRef.current = bg;
    }
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bgRef.current, 0, 0, W, H);
    ctx.fillStyle = 'rgba(20,16,40,0.25)';
    ctx.fillRect(0, 0, W, H);
    for (const p of PRIVATE_AREAS) {
      if (!busyPods.has(p.id) && p.id !== me.paId) continue;
      ctx.strokeStyle = p.id === me.paId ? '#fde047' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(p.x * S, p.y * S, p.w * S, p.h * S);
    }
    ctx.fillStyle = '#ffffff';
    for (const o of others) {
      ctx.beginPath();
      ctx.arc(o.x * S, o.y * S, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fde047';
    ctx.strokeStyle = '#1e1b2e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(me.x * S, me.y * S, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, [me.x, me.y, me.paId, others, busyPods]);

  return (
    <canvas
      ref={ref}
      width={W * 2}
      height={H * 2}
      style={{ width: W, height: H }}
      className="rounded-xl ring-2 ring-white/70 shadow-2xl bg-slate-800"
    />
  );
}
