import { useCallback, useEffect, useRef, useState } from 'react';
import NicknameEntry, { type JoinPayload } from './components/NicknameEntry';
import Avatar from './components/Avatar';
import PresentationSlot from './components/PresentationSlot';
import VideoTile from './components/VideoTile';
import LocalVideoTile from './components/LocalVideoTile';
import ScreenShareTile from './components/ScreenShareTile';
import ClassroomBackdrop from './components/ClassroomBackdrop';
import TouchJoystick from './components/TouchJoystick';
import WaitingRoom from './components/WaitingRoom';
import PairRoom from './components/PairRoom';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PRIVATE_AREAS,
  PRESENTATION_OBJECTS,
  SPAWN,
} from './lib/mapConfig';
import { useKeyboardMovement } from './hooks/useKeyboardMovement';
import { usePresence } from './hooks/usePresence';
import { useLiveKitForPA } from './hooks/useLiveKitForPA';
import { usePresentationObjects } from './hooks/usePresentationObjects';
import { useMatchQueue } from './hooks/useMatchQueue';
import { enqueueForMatch } from './lib/matchmaking';

export default function App() {
  const [info, setInfo] = useState<JoinPayload | null>(null);
  if (!info) return <NicknameEntry onJoined={setInfo} />;
  if (info.mode === 'match') return <MatchModeFlow info={info} onLeave={() => setInfo(null)} />;
  return <Classroom info={info} />;
}

/* ──────────────  Match mode (auto 1:1 + AI coach)  ────────────── */

function MatchModeFlow({ info, onLeave }: { info: JoinPayload; onLeave: () => void }) {
  const { sessionCode, sessionTitle, nickname, country, topic } = info;
  const queue = useMatchQueue(sessionCode);
  const enqueuedRef = useRef(false);

  // The very first time the student lands here, drop them into the queue.
  useEffect(() => {
    if (enqueuedRef.current) return;
    enqueuedRef.current = true;
    enqueueForMatch(sessionCode, {
      name: nickname,
      country: country ?? 'KR',
      topic: topic ?? '',
    }).catch(console.error);
  }, [sessionCode, nickname, country, topic]);

  if (queue.status === 'paired' && queue.pairId && queue.pairRoomId) {
    return (
      <PairRoom
        sessionCode={sessionCode}
        sessionTitle={sessionTitle}
        pairId={queue.pairId}
        pairRoomId={queue.pairRoomId}
        myName={nickname}
        onLeave={(requeue) => {
          if (!requeue) onLeave();
          // If they requeued, endPair already re-inserted them into the queue,
          // so the queue hook will pull them back to the waiting screen.
        }}
      />
    );
  }

  return (
    <WaitingRoom
      sessionTitle={sessionTitle}
      sessionCode={sessionCode}
      myName={nickname}
      myCountry={country ?? 'KR'}
      myTopic={topic ?? ''}
      onCancel={onLeave}
    />
  );
}

/* ──────────────  Free mode (4-room ZEP-style)  ────────────── */

function Classroom({ info }: { info: JoinPayload }) {
  const { nickname, sessionCode, sessionTitle } = info;
  const { others, publishPosition } = usePresence(sessionCode, nickname);
  const onMove = useCallback(
    (s: { x: number; y: number; paId: string | null }) => publishPosition(s.x, s.y, s.paId),
    [publishPosition],
  );
  const { pos: me, setAnalog, clearAnalog } = useKeyboardMovement(SPAWN, onMove);
  const {
    room,
    remotes,
    screenShare,
    micOn,
    camOn,
    screenOn,
    connecting,
    toggleMic,
    toggleCam,
    toggleScreen,
  } = useLiveKitForPA(sessionCode, me.paId, nickname);
  const slots = usePresentationObjects(sessionCode);

  const currentPa = PRIVATE_AREAS.find((p) => p.id === me.paId) ?? null;
  const [panelOpen, setPanelOpen] = useState(true);
  const isMobile = useIsMobile();

  const viewportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const targetLeft = me.x - node.clientWidth / 2;
    const targetTop = me.y - node.clientHeight / 2;
    node.scrollTo({ left: targetLeft, top: targetTop, behavior: 'auto' });
  }, [me.x, me.y]);

  return (
    <div className="h-screen flex flex-col bg-slate-900 overflow-hidden">
      <header className="bg-slate-800 px-3 py-1.5 flex items-center justify-between text-xs sm:text-sm border-b border-slate-700 shrink-0">
        <div className="font-semibold truncate">
          🌍 {sessionTitle} <span className="text-slate-500 font-mono ml-2">[{sessionCode}]</span>
        </div>
        <div className="text-slate-400 hidden sm:block">
          {currentPa ? (
            <span>
              In <span className="text-green-400">{currentPa.name}</span> · {connecting ? 'connecting…' : 'live'}
            </span>
          ) : (
            <span>Walk into a room · Arrow keys / WASD / touch</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400">{1 + Object.keys(others).length} online</span>
          {isMobile && (
            <button onClick={() => setPanelOpen((v) => !v)} className="bg-slate-700 px-2 py-1 rounded text-xs">
              {panelOpen ? 'Hide cams' : 'Show cams'}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {screenShare && <ScreenShareTile share={screenShare} onClose={toggleScreen} />}

        <main ref={viewportRef} className="flex-1 overflow-auto bg-sky-200 relative">
          <div
            className="relative"
            style={{
              width: MAP_WIDTH,
              height: MAP_HEIGHT,
              background: 'linear-gradient(180deg, #cfe7f8 0 70px, #f5e6c8 70px)',
            }}
          >
            <ClassroomBackdrop />

            {PRESENTATION_OBJECTS.map((obj) => (
              <PresentationSlot
                key={obj.id}
                object={obj}
                state={slots[obj.id]}
                reachable={obj.paId === null || me.paId === obj.paId}
                myName={nickname}
                sessionCode={sessionCode}
              />
            ))}

            {Object.values(others).map((p) => (
              <Avatar key={p.uid} name={p.name} x={p.x} y={p.y} inPa={p.paId === me.paId && me.paId !== null} />
            ))}
            <Avatar name={nickname} x={me.x} y={me.y} isMe inPa={!!me.paId} />
          </div>
        </main>

        <aside
          className={`bg-slate-900 border-l border-slate-700 flex flex-col transition-all
            ${isMobile
              ? `absolute right-0 top-0 bottom-0 z-20 shadow-2xl ${panelOpen ? 'w-72' : 'w-0 overflow-hidden border-l-0'}`
              : 'w-80'}`}
        >
          <div className="p-3 border-b border-slate-700">
            <div className="text-xs text-slate-400 mb-2">
              {currentPa
                ? `Talking with ${Object.keys(remotes).length} other(s) in ${currentPa.name}`
                : 'No private area'}
            </div>
            <div className="flex gap-2">
              <button
                disabled={!room}
                onClick={toggleMic}
                className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 py-1.5 rounded text-xs"
              >
                {micOn ? '🎤 Mute' : '🔇 Unmute'}
              </button>
              <button
                disabled={!room}
                onClick={toggleCam}
                className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 py-1.5 rounded text-xs"
              >
                {camOn ? '📷 Off' : '📷 On'}
              </button>
            </div>
            <button
              disabled={!room}
              onClick={toggleScreen}
              className={`mt-2 w-full py-1.5 rounded text-xs ${
                screenOn ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-700 hover:bg-emerald-600'
              } disabled:opacity-40`}
            >
              {screenOn ? '🛑 Stop screen share' : '🖥 Share screen'}
            </button>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {room && <LocalVideoTile room={room} name={nickname} micOn={micOn} camOn={camOn} />}
            {Object.values(remotes).map((m) => (
              <VideoTile key={m.identity} media={m} />
            ))}
            {!room && (
              <div className="text-slate-500 text-xs text-center py-8">
                Walk into a coloured room to start your camera and microphone.
                Only people inside the same room can see and hear you.
              </div>
            )}
          </div>
        </aside>

        {isMobile && <TouchJoystick onMove={(dx, dy) => setAnalog(dx, dy)} onRelease={clearAnalog} />}
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
