import { useEffect, useRef } from 'react';
import {
  HAIR_COLORS,
  HAIR_STYLES,
  PANTS,
  SHIRTS,
  SKINS,
  SPRITE_H,
  SPRITE_W,
  getSprite,
  randomLook,
  type Dir,
  type Look,
} from '../game/sprites';

interface Props {
  look: Look;
  onChange: (l: Look) => void;
  name: string;
}

const DIRS: Dir[] = ['down', 'left', 'up', 'right'];

/** ZEP-style character customiser with a walking preview. */
export default function AvatarPicker({ look, onChange, name }: Props) {
  const set = (patch: Partial<Look>) => onChange({ ...look, ...patch });
  return (
    <div className="mt-3 flex flex-col items-center gap-4">
      <WalkingPreview look={look} name={name} />
      <div className="w-full space-y-3">
        <Row label="Skin">
          {SKINS.map((c, i) => (
            <Swatch key={c} color={c} active={look.skin === i} onClick={() => set({ skin: i })} />
          ))}
        </Row>
        <Row label="Hair">
          <div className="flex items-center gap-1 bg-white/15 rounded-full p-0.5">
            <Arrow onClick={() => set({ hair: (look.hair + HAIR_STYLES.length - 1) % HAIR_STYLES.length })}>‹</Arrow>
            <span className="text-xs font-bold w-12 text-center">{HAIR_STYLES[look.hair]}</span>
            <Arrow onClick={() => set({ hair: (look.hair + 1) % HAIR_STYLES.length })}>›</Arrow>
          </div>
        </Row>
        <Row label="Color">
          {HAIR_COLORS.map((c, i) => (
            <Swatch key={c} color={c} active={look.hairColor === i} onClick={() => set({ hairColor: i })} />
          ))}
        </Row>
        <Row label="Top">
          {SHIRTS.map((c, i) => (
            <Swatch key={c} color={c} active={look.shirt === i} onClick={() => set({ shirt: i })} />
          ))}
        </Row>
        <Row label="Pants">
          {PANTS.map((c, i) => (
            <Swatch key={c} color={c} active={look.pants === i} onClick={() => set({ pants: i })} />
          ))}
        </Row>
        <button
          type="button"
          onClick={() => onChange(randomLook())}
          className="w-full bg-white/15 hover:bg-white/25 rounded-xl py-2 text-sm font-bold transition"
        >
          🎲 Random
        </button>
      </div>
    </div>
  );
}

function WalkingPreview({ look, name }: { look: Look; name: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    let t = 0;
    let raf = 0;
    let last = performance.now();
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      const dir = DIRS[Math.floor(t / 1.6) % 4];
      const frame = [1, 0, 2, 0][Math.floor(t / 0.16) % 4];
      const s = getSprite(look, dir, frame);
      const scale = 2;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(c.width / 2, c.height - 16, 34, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(s, (c.width - SPRITE_W * scale) / 2, c.height - SPRITE_H * scale - 10, SPRITE_W * scale, SPRITE_H * scale);
    };
    const loop = (now: number) => {
      t += (now - last) / 1000;
      last = now;
      draw();
      raf = requestAnimationFrame(loop);
    };
    draw();
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [look]);

  return (
    <div className="relative">
      <div className="absolute inset-x-0 bottom-2 mx-auto w-40 h-10 rounded-[50%] bg-white/20" />
      <canvas ref={ref} width={160} height={150} className="relative" style={{ imageRendering: 'pixelated' }} />
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-slate-900/70 text-white text-xs font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap max-w-[150px] truncate">
        {name}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-[11px] font-bold opacity-80">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Swatch({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={color}
      className={`w-6 h-6 rounded-full transition ${active ? 'ring-[3px] ring-white scale-110' : 'ring-1 ring-black/20 hover:scale-110'}`}
      style={{ background: color }}
    />
  );
}

function Arrow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="w-6 h-6 rounded-full hover:bg-white/20 font-bold">
      {children}
    </button>
  );
}
