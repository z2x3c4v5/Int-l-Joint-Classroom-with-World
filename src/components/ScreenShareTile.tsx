import { useEffect, useRef } from 'react';
import type { ActiveScreenShare } from '../hooks/useLiveKitForPA';

interface Props {
  share: ActiveScreenShare;
  onClose?: () => void;
}

export default function ScreenShareTile({ share, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = mountRef.current;
    if (!node) return;
    share.videoEl.className = 'w-full h-full object-contain bg-black';
    node.appendChild(share.videoEl);
    return () => {
      if (share.videoEl.parentNode === node) node.removeChild(share.videoEl);
    };
  }, [share.videoEl]);

  return (
    <div className="absolute inset-0 z-30 bg-black/90 flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 text-xs text-white">
        <span>
          🖥 Screen sharing — <strong>{share.name}</strong> {share.isLocal && '(you)'}
        </span>
        {share.isLocal && onClose && (
          <button onClick={onClose} className="bg-red-600 hover:bg-red-500 px-3 py-1 rounded">
            Stop sharing
          </button>
        )}
      </div>
      <div ref={mountRef} className="flex-1 relative" />
    </div>
  );
}
