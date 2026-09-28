import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  AVATAR_SIZE,
  HALL_ROOM_ID,
  HEAR_RADIUS,
  SUBSCRIBE_RADIUS,
  proximityFade,
} from './lib/mapConfig';
import { useKeyboardMovement } from './hooks/useKeyboardMovement';
import { usePresence } from './hooks/usePresence';
import { useLiveKitForPA } from './hooks/useLiveKitForPA';
import { usePresentationObjects } from './hooks/usePresentationObjects';
import { useMatchQueue } from './hooks/useMatchQueue';
import { useRoomFacilitator } from './hooks/useRoomFacilitator';
import FacilitatorPanel from './components/FacilitatorPanel';
import { enqueueForMatch } from './lib/matchmaking';
import { auth } from './lib/firebase';

// Same pacing as the 1:1 match room: kids get real talking time first.
const AUTO_LEAD_MS = 45_000;

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

  // Browsers (esp. mobile Safari) only allow camera/mic after a user gesture,
  // so A/V starts on the first key press / tap, or the explicit button.
  const [avReady, setAvReady] = useState(false);
  useEffect(() => {
    if (avReady) return;
    const go = () => setAvReady(true);
    window.addEventListener('keydown', go, { once: true });
    window.addEventListener('pointerdown', go, { once: true });
    return () => {
      window.removeEventListener('keydown', go);
      window.removeEventListener('pointerdown', go);
    };
  }, [avReady]);

  // ZEP-style: in a private room you're connected to that room only; in the
  // hallway you share one room but hear/see only people near you.
  const inHall = me.paId === null;
  const lkRoomId = !avReady ? null : me.paId ?? HALL_ROOM_ID;
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
    setNearby,
    setVolumes,
    canPlayAudio,
    startAudio,
  } = useLiveKitForPA(sessionCode, lkRoomId, nickname, { proximity: inHall });

  // Distance from me to every other hallway student (avatar centre to centre).
  const hallDistances = useMemo(() => {
    const out: Record<string, number> = {};
    if (!inHall) return out;
    for (const [uid, p] of Object.entries(others)) {
      if (p.paId) continue; // they're behind a private-room wall
      out[uid] = Math.hypot(p.x - me.x, p.y - me.y);
    }
    return out;
  }, [inHall, others, me.x, me.y]);

  // Subscribe only to people inside SUBSCRIBE_RADIUS. Keyed so we only touch
  // LiveKit when the set of nearby people actually changes.
  const nearbyKey = Object.keys(hallDistances)
    .filter((uid) => hallDistances[uid] <= SUBSCRIBE_RADIUS)
    .sort()
    .join(',');
  useEffect(() => {
    if (!inHall) return;
    setNearby(new Set(nearbyKey ? nearbyKey.split(',') : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inHall, nearbyKey, room]);

  // Farther away → quieter. Squared so it drops off like real distance.
  // Quantised to 5% steps so we don't touch audio on every 1px move.
  const volumeKey = inHall
    ? Object.entries(hallDistances)
        .map(([uid, d]) => `${uid}:${Math.round(proximityFade(d) ** 2 * 20)}`)
        .join(',')
    : '';
  useEffect(() => {
    const v: Record<string, number> = {};
    for (const part of volumeKey ? volumeKey.split(',') : []) {
      const [uid, step] = part.split(':');
      v[uid] = Number(step) / 20;
    }
    setVolumes(v); // empty in private rooms → everyone at full volume
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeKey, room]);

  const fadeFor = (identity: string) =>
    inHall ? proximityFade(hallDistances[identity] ?? Infinity) : 1;
  const visibleRemotes = Object.values(remotes)
    .map((m) => ({ m, fade: fadeFor(m.identity) }))
    .sort((a, b) => b.fade - a.fade);
  const hearingCount = visibleRemotes.filter((r) => r.fade > 0).length;
  const slots = usePresentationObjects(sessionCode);

  const currentPa = PRIVATE_AREAS.find((p) => p.id === me.paId) ?? null;
  const [panelOpen, setPanelOpen] = useState(true);

  // AI tutor: active only while exactly two students share this room.
  // Presence (RTDB) decides who is here — the same source the server checks.
  const myUid = auth.currentUser?.uid ?? null;
  const roomMateIds = me.paId
    ? Object.keys(others).filter((uid) => others[uid].paId === me.paId)
    : [];
  const pairIds = myUid && roomMateIds.length === 1 ? [myUid, roomMateIds[0]].sort() : null;
  const pairKey = pairIds ? pairIds.join('_') : null;
  // One client drives the tutor so prompts aren't requested twice.
  const isHost = pairIds !== null && pairIds[0] === myUid;
  const tutor = useRoomFacilitator(sessionCode, me.paId, pairKey);
  const [autoLead, setAutoLead] = useState(true);

  // Greet a newly formed pair. Short delay lets both presence writes land
  // before the server checks who is in the room; retries until a line shows
  // up (the server throttles, so retries never double-post).
  useEffect(() => {
    if (!isHost || !pairKey || tutor.messages.length > 0) return;
    const fire = () => tutor.trigger('start').catch(console.error);
    const first = setTimeout(fire, 1500);
    const retry = setInterval(fire, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, pairKey, tutor.messages.length]);

  // Keep the conversation moving while auto-lead is on.
  useEffect(() => {
    if (!autoLead || !isHost || !pairKey || tutor.busy || tutor.messages.length === 0) return;
    const id = setTimeout(() => tutor.trigger('next').catch(console.error), AUTO_LEAD_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLead, isHost, pairKey, tutor.busy, tutor.messages.length]);
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
            <span>
              Hallway · {hearingCount} nearby · walk close to talk, or into a room for privacy
            </span>
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

            {/* Hearing range: people inside this circle can hear and see you. */}
            {inHall && avReady && (
              <div
                className="absolute rounded-full pointer-events-none border-2 border-dashed border-emerald-500/60"
                style={{
                  left: me.x + AVATAR_SIZE / 2 - HEAR_RADIUS,
                  top: me.y + AVATAR_SIZE / 2 - HEAR_RADIUS,
                  width: HEAR_RADIUS * 2,
                  height: HEAR_RADIUS * 2,
                  background: 'radial-gradient(circle, rgba(16,185,129,0.14) 0%, rgba(16,185,129,0.06) 40%, transparent 70%)',
                }}
              />
            )}

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
              <Avatar
                key={p.uid}
                name={p.name}
                x={p.x}
                y={p.y}
                inPa={
                  me.paId !== null
                    ? p.paId === me.paId
                    : !p.paId && proximityFade(hallDistances[p.uid] ?? Infinity) > 0
                }
              />
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
                ? `🔒 Private: talking with ${Object.keys(remotes).length} other(s) in ${currentPa.name}`
                : `🚶 Hallway: ${hearingCount} people close enough to hear you`}
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
          {currentPa && (
            <div className="p-3 border-b border-slate-700">
              {pairKey ? (
                <div className="h-72">
                  <FacilitatorPanel
                    messages={tutor.messages}
                    busy={tutor.busy}
                    auto={autoLead}
                    onToggleAuto={() => setAutoLead((v) => !v)}
                    onNext={() => tutor.trigger('next').catch(console.error)}
                    onHelp={() => tutor.trigger('help').catch(console.error)}
                  />
                </div>
              ) : (
                <div className="text-xs text-slate-400 bg-slate-800 rounded-lg p-3">
                  🦉{' '}
                  {roomMateIds.length === 0
                    ? 'The AI tutor starts when one more student joins this room.'
                    : 'The AI tutor leads only when exactly 2 students are in the room.'}
                </div>
              )}
            </div>
          )}
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {room && <LocalVideoTile room={room} name={nickname} micOn={micOn} camOn={camOn} />}
            {visibleRemotes.map(({ m, fade }) => (
              <VideoTile key={m.identity} media={m} fade={fade} />
            ))}
            {room && !canPlayAudio && (
              <button
                onClick={() => startAudio().catch(console.error)}
                className="w-full bg-amber-500 hover:bg-amber-400 text-amber-950 py-2 rounded-lg text-sm font-semibold"
              >
                🔊 Tap to hear others
              </button>
            )}
            {room && inHall && visibleRemotes.length === 0 && (
              <div className="text-slate-500 text-xs text-center py-4">
                Nobody nearby. Walk up to someone to see and hear them —
                the closer you are, the clearer they get.
              </div>
            )}
            {!room && !avReady && (
              <button
                onClick={() => setAvReady(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 py-3 rounded-lg text-sm font-semibold"
              >
                🎥 Turn on camera & mic
              </button>
            )}
            {!room && avReady && (
              <div className="text-slate-500 text-xs text-center py-8 animate-pulse">
                {connecting ? 'Connecting camera & mic…' : 'Getting ready…'}
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
