import { useEffect, useState } from 'react';
import Avatar from '../components/Avatar';
import ClassroomBackdrop from '../components/ClassroomBackdrop';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PRESENTATION_OBJECTS,
  PRIVATE_AREAS,
  SPAWN,
} from '../lib/mapConfig';

/**
 * Static demo of the classroom layout — no Firebase, no LiveKit. Useful for
 * design reviews and screenshots. Reachable at /preview.
 */
export default function Preview() {
  const [me] = useState({ x: SPAWN.x, y: SPAWN.y, paId: null as string | null });
  const isMobile = useIsMobile();
  const [panelOpen, setPanelOpen] = useState(false);

  // Sprinkle mock students across the four rooms.
  const others = [
    { uid: '1', name: 'Hiroshi', x: 200, y: 220, paId: 'pa-polite' },
    { uid: '2', name: 'Mei', x: 400, y: 380, paId: 'pa-polite' },
    { uid: '3', name: 'Lin', x: 1100, y: 240, paId: 'pa-leading' },
    { uid: '4', name: 'James', x: 1500, y: 380, paId: 'pa-leading' },
    { uid: '5', name: '민수', x: 250, y: 800, paId: 'pa-useful' },
    { uid: '6', name: 'Aisha', x: 600, y: 900, paId: 'pa-useful' },
    { uid: '7', name: 'Pim', x: 1200, y: 800, paId: 'pa-smart' },
    { uid: '8', name: 'Wei', x: 1600, y: 900, paId: 'pa-smart' },
    { uid: '9', name: 'Mr.Park', x: 900, y: 530, paId: null },
  ];

  // Mock board content: a Google Slides on one room, an image on another.
  const slots: Record<string, { type: 'image' | 'slides'; imageUrl: string | null; slidesUrl: string | null; ownerName: string; status: 'approved' }> = {
    'obj-leading': {
      type: 'image',
      imageUrl:
        'data:image/svg+xml;utf8,' +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60"><rect width="240" height="60" fill="%23fde68a"/><text x="120" y="36" text-anchor="middle" font-family="Arial" font-size="14" fill="%23713f12">My Trip to Busan 🌊</text></svg>`,
        ),
      slidesUrl: null,
      ownerName: 'James',
      status: 'approved',
    },
    'obj-useful': {
      type: 'image',
      imageUrl:
        'data:image/svg+xml;utf8,' +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60"><rect width="240" height="60" fill="%23bae6fd"/><text x="120" y="36" text-anchor="middle" font-family="Arial" font-size="14" fill="%230c4a6e">Korean Food I Like 🍜</text></svg>`,
        ),
      slidesUrl: null,
      ownerName: '민수',
      status: 'approved',
    },
  };

  const currentPa = PRIVATE_AREAS.find((p) => p.id === me.paId) ?? null;

  return (
    <div className="h-screen flex flex-col bg-slate-900 overflow-hidden">
      <header className="bg-slate-800 px-3 py-1.5 flex items-center justify-between text-sm border-b border-slate-700 shrink-0">
        <div className="font-semibold">
          🌍 Global Classroom — Preview <span className="text-slate-500 font-mono ml-2">[KR-MY-2026]</span>
        </div>
        <div className="text-slate-400 hidden sm:block">
          {currentPa ? `In ${currentPa.name}` : 'Walk into a room · Arrow keys / WASD / touch'}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400">{1 + others.length} online</span>
          {isMobile && (
            <button onClick={() => setPanelOpen((v) => !v)} className="bg-slate-700 px-2 py-1 rounded text-xs">
              {panelOpen ? 'Hide cams' : 'Show cams'}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 overflow-auto bg-sky-200 relative">
          <div
            className="relative"
            style={{
              width: MAP_WIDTH,
              height: MAP_HEIGHT,
              background: 'linear-gradient(180deg, #cfe7f8 0 70px, #f5e6c8 70px)',
            }}
          >
            <ClassroomBackdrop />

            {PRESENTATION_OBJECTS.map((obj) => {
              const s = slots[obj.id];
              return (
                <div
                  key={obj.id}
                  className="absolute bg-slate-100 border-2 border-slate-700 rounded shadow-lg overflow-hidden"
                  style={{ left: obj.x, top: obj.y, width: obj.w, height: obj.h }}
                >
                  {s?.imageUrl ? (
                    <img src={s.imageUrl} alt={obj.label} className="w-full h-full object-cover bg-black" />
                  ) : obj.id === 'obj-welcome' ? (
                    <div className="w-full h-full bg-sky-300 flex flex-col items-center justify-center text-center text-slate-800 px-2 leading-tight">
                      <div className="text-xs font-extrabold">🌐 GLOBAL ENGLISH CLASSROOM</div>
                      <div className="text-[10px] font-semibold opacity-80">
                        Korea · Malaysia · Taiwan · Thailand
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                      📺 {obj.label}
                    </div>
                  )}
                  {s?.ownerName && (
                    <div className="absolute top-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">
                      by {s.ownerName}
                    </div>
                  )}
                </div>
              );
            })}

            {others.map((p) => (
              <Avatar key={p.uid} name={p.name} x={p.x} y={p.y} inPa={false} />
            ))}
            <Avatar name="You" x={me.x} y={me.y} isMe inPa={!!me.paId} />
          </div>
        </main>

        <aside
          className={`bg-slate-900 border-l border-slate-700 flex flex-col transition-all
            ${isMobile
              ? `absolute right-0 top-0 bottom-0 z-20 shadow-2xl ${panelOpen ? 'w-72' : 'w-0 overflow-hidden border-l-0'}`
              : 'w-80'}`}
        >
          <div className="p-3 border-b border-slate-700">
            <div className="text-xs text-slate-400 mb-2">No private area</div>
            <div className="flex gap-2">
              <button disabled className="flex-1 bg-slate-700 opacity-40 py-1.5 rounded text-xs">🎤 Mute</button>
              <button disabled className="flex-1 bg-slate-700 opacity-40 py-1.5 rounded text-xs">📷 Off</button>
            </div>
            <button disabled className="mt-2 w-full py-1.5 rounded text-xs bg-emerald-700 opacity-40">
              🖥 Share screen
            </button>
          </div>
          <div className="flex-1 overflow-auto p-3">
            <div className="text-slate-500 text-xs text-center py-8">
              Walk into a coloured room to start your camera and microphone.
              Only people inside the same room can see and hear you.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(max-width: 768px)').matches,
  );
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return mobile;
}
