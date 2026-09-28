import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JoinPayload } from '../components/NicknameEntry';
import GameWorld, { audibleScope, type MyState } from '../game/GameWorld';
import { decodeLook } from '../game/sprites';
import PresentationSlot from '../components/PresentationSlot';
import VideoTile from '../components/VideoTile';
import LocalVideoTile from '../components/LocalVideoTile';
import ScreenShareTile from '../components/ScreenShareTile';
import FacilitatorPanel from '../components/FacilitatorPanel';
import Minimap from '../components/Minimap';
import {
  PRIVATE_AREAS,
  PRESENTATION_OBJECTS,
  ZONES,
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
import { LangToggle, useI18n, type StringKey } from '../lib/i18n';

// Same pacing as the 1:1 match room: kids get real talking time first.
const AUTO_LEAD_MS = 45_000;
const EMOJIS = ['👋', '😀', '👍', '❤️', '🎉', '❓', '😂', '👏'];

/**
 * ZEP-style school map.
 *  - Hallway and the open part of each classroom: proximity chat — you hear
 *    and see people near you, fading with distance (never through walls).
 *  - Desk pods (4 per classroom): PRIVATE 1:1 zones. Two students at a desk
 *    get their own call, and that desk's AI tutor (the owl) leads their talk
 *    and listens to their presentations.
 */
export default function Classroom({ info, onLeave }: { info: JoinPayload; onLeave: () => void }) {
  const { t } = useI18n();
  const { nickname, sessionCode, sessionTitle } = info;
  const lookStr = info.look ?? '';
  const myLook = useMemo(() => decodeLook(lookStr, nickname), [lookStr, nickname]);
  const { others, publish } = usePresence(sessionCode, nickname, lookStr);
  const [me, setMe] = useState<MyState>({ x: SPAWN.x, y: SPAWN.y, dir: 'down', moving: false, paId: null, zone: null });
  const [myEmo, setMyEmo] = useState<{ emo: string; ts: number } | null>(null);
  const [emoOpen, setEmoOpen] = useState(false);
  const slots = usePresentationObjects(sessionCode);

  const onState = useCallback(
    (s: MyState) => {
      setMe(s);
      publish({ x: s.x, y: s.y, paId: s.paId, zone: s.zone, dir: s.dir, mv: s.moving });
    },
    // publish only touches refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Browsers (esp. mobile Safari) only allow camera/mic after a user gesture.
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

  // Desk pod → its own private call. Otherwise one call per open area
  // (hallway or a classroom), filtered by distance.
  const atDesk = me.paId !== null;
  const lkRoomId = !avReady ? null : me.paId ?? me.zone ?? HALL_ROOM_ID;
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
  } = useLiveKitForPA(sessionCode, lkRoomId, nickname, { proximity: !atDesk });

  const myUid = auth.currentUser?.uid ?? null;
  const pod = PRIVATE_AREAS.find((p) => p.id === me.paId) ?? null;
  const zone = ZONES.find((z) => z.id === me.zone) ?? null;
  const roomName = (id: string) => t(`room.${id}` as StringKey);
  const deskName = (p: { zoneId: string; n: number }) => t('desk.name', { room: roomName(p.zoneId), n: p.n });

  /* ── proximity inside the open area I'm in ── */
  const myScope = audibleScope(me.paId, me.zone);
  const distances = useMemo(() => {
    const out: Record<string, number> = {};
    if (atDesk) return out;
    for (const [uid, p] of Object.entries(others)) {
      if (audibleScope(p.paId, p.zone) !== myScope) continue; // other area / behind a wall
      out[uid] = Math.hypot(p.x - me.x, p.y - me.y);
    }
    return out;
  }, [atDesk, others, me.x, me.y, myScope]);

  const nearbyKey = Object.keys(distances)
    .filter((uid) => distances[uid] <= SUBSCRIBE_RADIUS)
    .sort()
    .join(',');
  useEffect(() => {
    if (atDesk) return;
    setNearby(new Set(nearbyKey ? nearbyKey.split(',') : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atDesk, nearbyKey, room]);

  // Farther away → quieter (squared, like real distance), in 5% steps.
  const volumeKey = atDesk
    ? ''
    : Object.entries(distances)
        .map(([uid, d]) => `${uid}:${Math.round(proximityFade(d) ** 2 * 20)}`)
        .join(',');
  useEffect(() => {
    const v: Record<string, number> = {};
    for (const part of volumeKey ? volumeKey.split(',') : []) {
      const [uid, step] = part.split(':');
      v[uid] = Number(step) / 20;
    }
    setVolumes(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeKey, room]);

  const fadeFor = (id: string) => (atDesk ? 1 : proximityFade(distances[id] ?? Infinity));
  const tiles = Object.values(remotes)
    .map((m) => ({ m, fade: fadeFor(m.identity) }))
    .filter((x) => atDesk || x.fade > 0)
    .sort((a, b) => b.fade - a.fade);

  /* ── AI tutor: exactly two students at this desk ── */
  const deskMates = me.paId ? Object.keys(others).filter((uid) => others[uid].paId === me.paId) : [];
  const pairIds = myUid && deskMates.length === 1 ? [myUid, deskMates[0]].sort() : null;
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
    const last = tutor.messages[tutor.messages.length - 1];
    // After feedback on a talk, give them longer to discuss it.
    const wait = last.action === 'feedback' ? AUTO_LEAD_MS * 2 : AUTO_LEAD_MS;
    const id = setTimeout(() => tutor.trigger('next').catch(console.error), wait);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLead, isHost, pairKey, tutor.busy, tutor.messages.length]);

  const latestTutor = tutor.messages[tutor.messages.length - 1]?.text ?? null;
  const tutorLabel = t('tutor.title');
  const npcs = useMemo(
    () => PRIVATE_AREAS.map((p) => ({ x: p.npc.x, y: p.npc.y, active: p.id === me.paId && !!pairKey, label: tutorLabel })),
    [me.paId, pairKey, tutorLabel],
  );
  const busyPods = useMemo(() => new Set(Object.values(others).map((o) => o.paId).filter(Boolean) as string[]), [others]);
  const minimapOthers = useMemo(() => Object.values(others).map((o) => ({ x: o.x, y: o.y })), [others]);

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

  const place = pod
    ? { text: t('hud.inDesk', { desk: deskName(pod) }), bg: pod.color, fg: '#fff' }
    : zone
      ? { text: `🏫 ${t('hud.inRoom', { room: roomName(zone.id) })}`, bg: '#ffffff', fg: zone.color }
      : { text: t('hud.hallway'), bg: '#ffffff', fg: '#334155' };

  return (
    <div className="fixed inset-0 bg-[#1b1830] text-white overflow-hidden">
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
                  reachable={obj.paId === null || me.zone === obj.paId}
                  myName={nickname}
                  sessionCode={sessionCode}
                />
              </div>
            ))}
            {pod && latestTutor && <TutorBubble x={pod.npc.x} y={pod.npc.y - 64} text={latestTutor} />}
          </>
        }
      />

      {screenShare && <ScreenShareTile share={screenShare} onClose={toggleScreen} />}

      {/* ── top-left: class + where am I ── */}
      <div data-ui className="absolute top-3 left-3 flex flex-wrap items-center gap-2 z-20 max-w-[calc(100vw-120px)]">
        <div className="bg-white/95 text-slate-800 rounded-2xl shadow-lg px-3 py-2 flex items-center gap-2">
          <span className="text-lg">🏫</span>
          <div className="leading-tight">
            <div className="text-sm font-extrabold truncate max-w-[36vw]">{sessionTitle}</div>
            <div className="text-[11px] text-slate-400 font-mono">{sessionCode}</div>
          </div>
        </div>
        <div className="rounded-2xl shadow-lg px-3 py-2 text-sm font-bold" style={{ background: place.bg, color: place.fg }}>
          {place.text}
          {connecting && <span className="ml-1 opacity-70 animate-pulse">· {t('hud.connecting')}</span>}
        </div>
      </div>

      {/* ── top-right: language + controls help ── */}
      <div data-ui className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
        <LangToggle />
        <div className="hidden lg:block bg-slate-900/85 backdrop-blur rounded-2xl px-3 py-2 text-[11px] text-slate-300 leading-5 shadow-lg max-w-[260px]">
          <div><Kbd>WASD</Kbd> <Kbd>↑↓←→</Kbd> {t('hud.help1')}</div>
          <div>{t('hud.help2')}</div>
          <div className="text-amber-300">{t('hud.help3')}</div>
        </div>
      </div>

      {/* ── top-centre: cameras of the people I can hear ── */}
      {(room || tiles.length > 0) && (
        <div data-ui className="absolute top-20 sm:top-3 left-1/2 -translate-x-1/2 z-10 max-w-[min(820px,calc(100vw-24px))]">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {room && (
              <div className="w-28 sm:w-40 shrink-0">
                <LocalVideoTile room={room} name={nickname} micOn={micOn} camOn={camOn} speaking={meSpeaking} />
              </div>
            )}
            {tiles.map(({ m, fade }) => (
              <div key={m.identity} className="w-28 sm:w-40 shrink-0">
                <VideoTile media={m} fade={fade} speaking={speakers.has(m.identity)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── right: AI tutor at a desk ── */}
      {pod && (
        <div data-ui className="absolute right-3 bottom-24 lg:top-32 lg:bottom-auto z-20 w-[min(360px,calc(100vw-24px))]">
          {pairKey ? (
            tutorOpen ? (
              <div className="h-[min(460px,52vh)] rounded-2xl overflow-hidden shadow-2xl ring-4 ring-amber-300/60">
                <FacilitatorPanel
                  messages={tutor.messages}
                  busy={tutor.busy}
                  auto={autoLead}
                  onToggleAuto={() => setAutoLead((v) => !v)}
                  onNext={() => tutor.trigger('next').catch(console.error)}
                  onHelp={() => tutor.trigger('help').catch(console.error)}
                  onFeedback={(transcript) => tutor.trigger('feedback', { transcript }).catch(console.error)}
                  onClose={() => setTutorOpen(false)}
                />
              </div>
            ) : (
              <button
                onClick={() => setTutorOpen(true)}
                className="ml-auto block bg-amber-400 hover:bg-amber-300 text-amber-950 rounded-full px-4 py-2 text-sm font-extrabold shadow-lg"
              >
                {t('hud.openTutor')}
              </button>
            )
          ) : (
            <div className="bg-white/95 text-slate-700 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg">
              {deskMates.length === 0 ? t('hud.deskWait') : t('hud.deskFull')}
            </div>
          )}
        </div>
      )}

      {/* ── bottom-left: minimap ── */}
      <div data-ui className="absolute bottom-4 left-4 z-20 hidden md:block">
        <Minimap me={me} others={minimapOthers} busyPods={busyPods} />
      </div>

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
              className="h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-extrabold text-sm whitespace-nowrap"
            >
              {t('hud.camOn')}
            </button>
          ) : (
            <>
              <ToolBtn on={micOn} disabled={!room} onClick={toggleMic} label={micOn ? t('hud.mute') : t('hud.unmute')}>
                {micOn ? '🎤' : '🔇'}
              </ToolBtn>
              <ToolBtn on={camOn} disabled={!room} onClick={toggleCam} label={camOn ? t('hud.camOff') : t('hud.camOnBtn')}>
                {camOn ? '📷' : '🚫'}
              </ToolBtn>
              <ToolBtn on={screenOn} disabled={!room} onClick={toggleScreen} label={t('hud.share')} accent>
                🖥
              </ToolBtn>
            </>
          )}
          <ToolBtn on={emoOpen} onClick={() => setEmoOpen((v) => !v)} label={t('hud.emoji')}>
            😀
          </ToolBtn>
          <div className="h-11 px-3 rounded-xl bg-white/5 flex items-center gap-1 text-sm text-slate-200 whitespace-nowrap" title={t('hud.online')}>
            👥 {online}
          </div>
          <ToolBtn onClick={onLeave} label={t('hud.leave')} danger>
            🚪
          </ToolBtn>
        </div>
        {room && !canPlayAudio && (
          <button
            onClick={() => startAudio().catch(console.error)}
            className="absolute -top-14 left-1/2 -translate-x-1/2 whitespace-nowrap bg-amber-400 hover:bg-amber-300 text-amber-950 px-4 py-2 rounded-full text-sm font-extrabold shadow-lg"
          >
            {t('hud.tapAudio')}
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
  // Only the English part floats above the owl; the full text is in the panel.
  const english = text.split('\n').filter((l) => !l.trim().startsWith('💡')).join(' ');
  return (
    <div className="absolute pointer-events-none" style={{ left: x, top: y, transform: 'translate(-50%, -100%)' }}>
      <div className="relative max-w-[300px] w-max bg-white text-slate-800 text-[13px] leading-snug font-semibold rounded-2xl px-3 py-2 shadow-xl ring-2 ring-amber-300 line-clamp-4">
        {english}
      </div>
      <div className="mx-auto -mt-1.5 w-3 h-3 bg-white rotate-45 ring-2 ring-amber-300 [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
    </div>
  );
}
