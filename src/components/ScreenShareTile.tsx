import { useEffect, useRef } from 'react';
import type { ActiveScreenShare } from '../hooks/useLiveKitForPA';
import { useI18n } from '../lib/i18n';

interface Props {
  share: ActiveScreenShare;
  onClose?: () => void;
}

export default function ScreenShareTile({ share, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

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
    <div data-ui className="absolute inset-0 z-40 bg-black/90 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 text-xs text-white">
        <span className="font-semibold">
          {t('hud.screenSharing', { name: share.name })} {share.isLocal && `(${t('common.you')})`}
        </span>
        {share.isLocal && onClose && (
          <button onClick={onClose} className="bg-red-600 hover:bg-red-500 px-3 py-1 rounded">
            {t('hud.stopShare')}
          </button>
        )}
      </div>
      <div ref={mountRef} className="flex-1 relative" />
    </div>
  );
}
