import { AVATAR_SIZE } from '../lib/mapConfig';

interface Props {
  name: string;
  x: number;
  y: number;
  isMe?: boolean;
  inPa?: boolean;
}

const COLORS = ['#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export default function Avatar({ name, x, y, isMe, inPa }: Props) {
  return (
    <div
      className="absolute pointer-events-none transition-transform"
      style={{
        transform: `translate3d(${x}px, ${y}px, 0)`,
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
      }}
    >
      <div
        className="rounded-full border-2 flex items-center justify-center text-xs font-bold shadow-lg"
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          background: colorFor(name),
          borderColor: isMe ? '#ffffff' : 'rgba(0,0,0,0.4)',
          boxShadow: inPa ? '0 0 0 3px rgba(34,197,94,0.6)' : undefined,
        }}
      >
        {name.slice(0, 2).toUpperCase()}
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 rounded bg-black/70 text-[10px] whitespace-nowrap">
        {name}
        {isMe && ' (you)'}
      </div>
    </div>
  );
}
