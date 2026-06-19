import { useEffect, useRef } from 'react';
import type { RemoteMedia } from '../hooks/useLiveKitForPA';

interface Props {
  media: RemoteMedia;
}

export default function VideoTile({ media }: Props) {
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

  return (
    <div className="relative bg-black rounded overflow-hidden aspect-video">
      <div ref={mountRef} className="absolute inset-0" />
      {!media.camOn && (
        <div className="absolute inset-0 flex items-center justify-center text-3xl">📷❌</div>
      )}
      <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
        {media.name} {media.micOn ? '🎤' : '🔇'}
      </div>
    </div>
  );
}
