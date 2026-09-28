import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JoinPayload } from '../components/NicknameEntry';
import GameWorld, { type MyState } from '../game/GameWorld';
import { decodeLook } from '../game/sprites';
import PresentationSlot from '../components/PresentationSlot';
import VideoTile from '../components/VideoTile';
import LocalVideoTile from '../components/LocalVideoTile';
import ScreenShareTile from '../components/ScreenShareTile';
import FacilitatorPanel from '../components/FacilitatorPanel';
import {
  PRIVATE_AREAS,
  PRESENTATION_OBJECTS,
  ROOM_NPC,
  SPAWN,
  HALL_ROOM_ID,
  HEAR_RADIUS,
  SUBSCRIBE_RADIUS,
  proximityFade,
} from '../lib/mapConfig';
import { usePresence } from '../hooks/usePresence';
import { useLiveKitForPA } from '../hooks/useLiveKitForPA';
import { usePresentationObjects } from '../hooks/usePresentationObjects';
import { useRoomFacilitator } from '../hooks/useRoomFacilitator';
import { auth } from '../lib/firebase';

// Same pacing as the 1:1 match room: kids get real talking time first.
const AUTO_LEAD_MS = 45_000;
const EMOJIS = ['👋', '😀', '👍', '❤️', '🎉', '❓', '😂', '👏'];

/**
 * ZEP-style free mode: walk the pixel school, talk to whoever is near you in
 * the hallway, step into a room for a private conversation. When exactly two
 * students share a room, the AI tutor (the owl) leads their talk.
 */
export default function Classroom({ info, onLeave }: { info: JoinPayload; onLeave: () => void }) {
  const { nickname, sessionCode, sessionTitle } = info;
  const lookStr = info.look ?? '';
  const myLook = useMemo(() => decodeLook(lookStr, nickname), [lookStr, nickname]);
  const { others, publish } = usePresence(sessionCode, nickname, lookStr);
  const [me, setMe] = useState<MyState>({ x: SPAWN.x, y: SPAWN.y, dir: 'down', moving: false, paId: null });
  const [myEmo, setMyEmo] = useState<{ emo: string; ts: number } | null>(null);
  const [emoOpen, setEmoOpen] = useState(false);
  const slots = usePresentationObjects(sessionCode);

  const onState = useCallback(
    (s: MyState) => {
      setMe(s);
      publish({ x: s.x, y: s.y, paId: s.paId, dir: s.dir, mv: s.moving });
    },
    // publish only closes over refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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

  // In a private room you're connected to that room only; in the hallway you
  // share one room but hear/see only people near you.
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
    speakers,
  } = useLiveKitForPA(sessionCode, lkRoomId, nickname, { proximity: inHall });

  const myUid = auth.currentUser?.uid ?? null;
  const currentPa = PRIVATE_AREAS.find((p) => p.id === me.paId) ?? null;

  /* ── hallway proximity ── */
  const hallDistances = useMemo(() => {
    const out: Record<string, number> = {};
    if (!inHall) return out;
    for (const [uid, p] of Object.entries(others)) {
      if (p.paId) continue; // behind a private-room wall
      out[uid] = Math.hypot(p.x - me.x, p.y - me.y);
    }
    return out;
  }, [inHall, others, me.x, me.y]);

  const nearbyKey = Object.keys(hallDistances)
    .filter((uid) => hallDistances[uid] <= SUBSCRIBE_RADIUS)
    .sort()
    .join(',');
  useEffect(() => {
    if (!inHall) return;
    setNearby(new Set(nearbyKey ? nearbyKey.split(',') : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inHall, nearbyKey, room]);

  // Farther away → quieter (squared, like real distance), in 5% steps.
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
    setVolumes(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeKey, room]);

  const fadeFor = (id: string) => (inHall ? proximityFade(hallDistances[id] ?? Infinity) : 1);
  const tiles = Object.values(remotes)
    .map((m) => ({ m, fade: fadeFor(m.identity) }))
    .filter((t) => !inHall || t.fade > 0)
    .sort((a, b) => b.fade - a.fade);

  /* ── AI tutor: exactly two students in this room ── */
  const roomMateIds = me.paId ? Object.keys(others).filter((uid) => others[uid].paId === me.paId) : [];
  const pairIds = myUid && roomMateIds.length === 1 ? [myUid, roomMateIds[0]].sort() : null;
  const pairKey = pairIds ? pairIds.join('_') : null;
  const isHost = pairIds !== null && pairIds[0] === myUid;
  const tutor = useRoomFacilitator(sessionCode, me.paId, pairKey);
  const [autoLead, setAutoLead] = useState(true);
  const [tutorOpen, setTutorOpen] = useState(true);

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

  useEffect(() => {
    if (!autoLead || !isHost || !pairKey || tutor.busy || tutor.messages.length === 0) return;
    const id = setTimeout(() => tutor.trigger('next').catch(console.error), AUTO_LEAD_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLead, isHost, pairKey, tutor.busy, tutor.messages.length]);

  const latestTutor = tutor.messages[tutor.messages.length - 1]?.text ?? null;
  const npcs = useMemo(() => Object.values(ROOM_NPC), []);

  function sendEmo(emo: string) {
    const ts = Date.now();
    setMyEmo({ emo, ts });
    publish({ emo, emoTs: ts }, true);
    setEmoOpen(false);
  }

  const speakingOthers = useMemo(() => {
    const s = new Set(speakers);
    if (myUid) s.delete(myUid);
    return s;
  }, [speakers, myUid]);
  const meSpeaking = !!myUid && speakers.has(myUid) && micOn;
  const online = 1 + Object.keys(others).length;

  return (
    <div className="fixed inset-0 bg-[#1b1830] text-white overflow-hidden font-[Pretendard,system-ui,sans-serif]">
      <GameWorld
        myName={nickname}
        myLook={myLook}
        spawn={SPAWN}
        others={others}
        speaking={speakingOthers}
        meSpeaking={meSpeaking}
        myEmo={myEmo}
        hearRadius={avReady ? HEAR_RADIUS : undefined}
        npcs={npcs}
        onState={onState}
        worldLayer={
          <>
            {PRESENTATION_OBJECTS.map((obj) => (
              <div key={obj.id} className="pointer-events-auto">
                <PresentationSlot
                  object={obj}
                  state={slots[obj.id]}
                  reachable={obj.paId === null || me.paId === obj.paId}
                  myName={nickname}
                  sessionCode={sessionCode}
                />
              </div>
            ))}
            {me.paId && latestTutor && (
              <TutorBubble x={ROOM_NPC[me.paId].x} y={ROOM_NPC[me.paId].y - 58} text={latestTutor} />
            )}
          </>
        }
      />

      {screenShare && <ScreenShareTile share={screenShare} onClose={toggleScreen} />}

      {/* ── top-left: where am I ── */}
      <div data-ui className="absolute top-3 left-3 flex items-center gap-2 z-20">
        <div className="bg-white/95 text-slate-800 rounded-2xl shadow-lg px-3 py-2 flex items-center gap-2">
          <span className="text-lg">🏫</span>
          <div className="leading-tight">
            <div className="text-sm font-bold truncate max-w-[40vw]">{sessionTitle}</div>
            <div className="text-[11px] text-slate-500 font-mono">{sessionCode}</div>
          </div>
        </div>
        <div
          className="rounded-2xl shadow-lg px-3 py-2 text-sm font-semibold"
          style={{ background: currentPa ? currentPa.color : 'rgba(255,255,255,0.95)', color: currentPa ? '#fff' : '#334155' }}
        >
          {currentPa ? `🔒 ${currentPa.name}` : '🚶 Hallway'}
          {connecting && <span className="ml-1 opacity-80 animate-pulse">· connecting</span>}
        </div>
      </div>

      {/* ── top-centre: cameras of the people I can hear ── */}
      <div data-ui className="absolute top-3 left-1/2 -translate-x-1/2 z-10 max-w-[min(900px,calc(100vw-24px))] hidden sm:block">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {room && (
            <div className="w-40 shrink-0">
              <LocalVideoTile room={room} name={nickname} micOn={micOn} camOn={camOn} speaking={meSpeaking} />
            </div>
          )}
          {tiles.map(({ m, fade }) => (
            <div key={m.identity} className="w-40 shrink-0">
              <VideoTile media={m} fade={fade} speaking={speakers.has(m.identity)} />
            </div>
          ))}
        </div>
      </div>
      {/* Phones: small strip under the chips */}
      <div data-ui className="absolute top-16 left-3 right-3 z-10 sm:hidden flex gap-2 overflow-x-auto">
        {room && (
          <div className="w-28 shrink-0">
            <LocalVideoTile room={room} name={nickname} micOn={micOn} camOn={camOn} speaking={meSpeaking} />
          </div>
        )}
        {tiles.map(({ m, fade }) => (
          <div key={m.identity} className="w-28 shrink-0">
            <VideoTile media={m} fade={fade} speaking={speakers.has(m.identity)} />
          </div>
        ))}
      </div>

      {/* ── top-right: controls help ── */}
      <div data-ui className="absolute top-3 right-3 z-20 hidden md:block">
        <div className="bg-slate-900/80 backdrop-blur rounded-2xl px-3 py-2 text-[11px] text-slate-300 leading-5 shadow-lg">
          <div><Kbd>W A S D</Kbd> / <Kbd>↑↓←→</Kbd> move</div>
          <div><Kbd>Click</Kbd> walk there · <Kbd>Space</Kbd> jump</div>
        </div>
      </div>

      {/* ── right: AI tutor (in a room) ── */}
      {currentPa && (
        <div data-ui className="absolute right-3 bottom-24 sm:top-24 z-20 w-[min(340px,calc(100vw-24px))]">
          {pairKey ? (
            tutorOpen ? (
              <div className="h-[min(420px,50vh)] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/20">
                <FacilitatorPanel
                  messages={tutor.messages}
                  busy={tutor.busy}
                  auto={autoLead}
                  onToggleAuto={() => setAutoLead((v) => !v)}
                  onNext={() => tutor.trigger('next').catch(console.error)}
                  onHelp={() => tutor.trigger('help').catch(console.error)}
                  onClose={() => setTutorOpen(false)}
                />
              </div>
            ) : (
              <button
                onClick={() => setTutorOpen(true)}
                className="ml-auto block bg-indigo-600 hover:bg-indigo-500 rounded-full px-4 py-2 text-sm font-semibold shadow-lg"
              >
                🦉 Open AI Tutor
              </button>
            )
          ) : (
            <div className="bg-white/95 text-slate-700 rounded-2xl px-4 py-3 text-sm shadow-lg">
              🦉{' '}
              {roomMateIds.length === 0
                ? 'The AI tutor starts when one more student joins this room.'
                : 'The AI tutor leads when exactly 2 students are in the room.'}
            </div>
          )}
        </div>
      )}

      {/* ── bottom: toolbar ── */}
      <div data-ui className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
        {emoOpen && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-2xl p-2 flex gap-1">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => sendEmo(e)} className="text-2xl w-10 h-10 rounded-xl hover:bg-slate-100">
                {e}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur rounded-2xl p-1.5 shadow-2xl ring-1 ring-white/10">
          {!avReady ? (
            <button
              onClick={() => setAvReady(true)}
              className="h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold text-sm"
            >
              🎥 Camera & mic on
            </button>
          ) : (
            <>
              <ToolBtn on={micOn} disabled={!room} onClick={toggleMic} label={micOn ? 'Mute' : 'Unmute'}>
                {micOn ? '🎤' : '🔇'}
              </ToolBtn>
              <ToolBtn on={camOn} disabled={!room} onClick={toggleCam} label={camOn ? 'Camera off' : 'Camera on'}>
                {camOn ? '📷' : '🚫'}
              </ToolBtn>
              <ToolBtn on={screenOn} disabled={!room} onClick={toggleScreen} label="Share screen" accent>
                🖥
              </ToolBtn>
            </>
          )}
          <ToolBtn on={emoOpen} onClick={() => setEmoOpen((v) => !v)} label="Emoji">
            😀
          </ToolBtn>
          <div className="h-11 px-3 rounded-xl bg-white/5 flex items-center gap-1 text-sm text-slate-200" title="Online">
            👥 {online}
          </div>
          <ToolBtn onClick={onLeave} label="Leave" danger>
            🚪
          </ToolBtn>
        </div>
        {room && !canPlayAudio && (
          <button
            onClick={() => startAudio().catch(console.error)}
            className="absolute -top-14 left-1/2 -translate-x-1/2 whitespace-nowrap bg-amber-400 hover:bg-amber-300 text-amber-950 px-4 py-2 rounded-full text-sm font-bold shadow-lg"
          >
            🔊 Tap to hear others
          </button>
        )}
      </div>
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  label,
  on,
  disabled,
  accent,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  on?: boolean;
  disabled?: boolean;
  accent?: boolean;
  danger?: boolean;
}) {
  const base = danger
    ? 'bg-rose-500/90 hover:bg-rose-400'
    : on
      ? accent
        ? 'bg-emerald-500 hover:bg-emerald-400'
        : 'bg-white/15 hover:bg-white/25'
      : 'bg-white/5 hover:bg-white/15';
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`h-11 w-11 rounded-xl text-xl flex items-center justify-center transition disabled:opacity-40 ${base}`}
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">{children}</kbd>;
}

function TutorBubble({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <div className="absolute pointer-events-none" style={{ left: x, top: y, transform: 'translate(-50%, -100%)' }}>
      <div className="relative max-w-[280px] w-max bg-white text-slate-800 text-[13px] leading-snug font-medium rounded-2xl px-3 py-2 shadow-xl ring-2 ring-amber-300">
        {text}
        <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-4 h-4 bg-white rotate-45 ring-2 ring-amber-300 -z-10" />
      </div>
    </div>
  );
}
