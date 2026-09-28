import { useEffect, useRef } from 'react';
import type { RemoteMedia } from '../hooks/useLiveKitForPA';

interface Props {
  media: RemoteMedia;
  /** 0–1 closeness in the hallway (visual only; volume is set in the LiveKit hook). */
  fade?: number;
}

export default function VideoTile({ media, fade = 1 }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = mountRef.current;
    if (!node || !media.videoEl) return;
    media.videoEl.className = 'w-full h-full object-cover';
    node.appendChild(media.videoEl);
    return () => {
      if (media.videoEl?.parentNode === node) node.removeChild(media.videoEl);
    };
  }, [media.videoEl]);

  const faint = fade < 1;
  return (
    <div
      className="relative bg-black rounded overflow-hidden aspect-video transition-[opacity,filter] duration-300"
      style={{
        opacity: 0.15 + 0.85 * fade,
        filter: faint ? `blur(${((1 - fade) * 4).toFixed(1)}px) grayscale(${Math.round((1 - fade) * 80)}%)` : undefined,
      }}
    >
      <div ref={mountRef} className="absolute inset-0" />
      {!media.camOn && (
        <div className="absolute inset-0 flex items-center justify-center text-3xl">📷❌</div>
      )}
      <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
        {media.name} {media.micOn ? '🎤' : '🔇'}
        {faint && <span className="text-slate-400"> · {fade === 0 ? 'too far' : 'far'}</span>}
      </div>
    </div>
  );
}
