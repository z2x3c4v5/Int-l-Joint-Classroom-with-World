import { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useLiveKitForPA } from '../hooks/useLiveKitForPA';
import { useFacilitator } from '../hooks/useFacilitator';
import { functions } from '../lib/firebase';
import LocalVideoTile from './LocalVideoTile';
import VideoTile from './VideoTile';
import FacilitatorPanel from './FacilitatorPanel';

interface Props {
  sessionCode: string;
  sessionTitle: string;
  pairId: string;
  pairRoomId: string;
  myName: string;
  onLeave: (requeue: boolean) => void;
}

// How long the AI tutor waits before it nudges the conversation forward on
// its own. Kept long enough that the kids get real talking time first.
const AUTO_LEAD_MS = 45_000;

/**
 * The auto-matched 1:1 room. LiveKit handles A/V; Firestore carries the AI
 * tutor feed. The tutor now LEADS on its own: one client (the "host", chosen
 * deterministically so the two peers never double-fire) kicks off the first
 * prompt and then drips a new question every AUTO_LEAD_MS while auto-lead is on.
 */
export default function PairRoom({
  sessionCode,
  sessionTitle,
  pairId,
  pairRoomId,
  myName,
  onLeave,
}: Props) {
  const { room, remotes, micOn, camOn, screenOn, connecting, toggleMic, toggleCam, toggleScreen } =
    useLiveKitForPA(sessionCode, pairRoomId, myName);
  const { messages, busy, trigger } = useFacilitator(sessionCode, pairId);
  const [auto, setAuto] = useState(true);

  const partnerPresent = Object.keys(remotes).length > 0;

  // Only one of the two peers should drive the AI, or every prompt would be
  // requested twice. Elect the host as the lexicographically-smallest identity
  // among everyone currently in the room (stable once both have connected).
  const isHost = useMemo(() => {
    const localId = room?.localParticipant.identity;
    if (!localId) return false;
    const ids = [localId, ...Object.keys(remotes)].sort();
    return ids[0] === localId;
  }, [room, remotes]);

  // First prompt: the host greets the pair as soon as it is connected.
  useEffect(() => {
    if (isHost && messages.length === 0 && !connecting) {
      trigger('start').catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, connecting]);

  // Auto-lead: after each tutor message, the host schedules the next one so the
  // conversation keeps flowing without anyone pressing a button. Re-arms every
  // time messages change; cancels the moment auto-lead is switched off.
  useEffect(() => {
    if (!auto || !isHost || busy || connecting || messages.length === 0) return;
    const id = setTimeout(() => {
      trigger('next').catch(console.error);
    }, AUTO_LEAD_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, isHost, busy, connecting, messages.length]);

  async function handleLeave(requeue: boolean) {
    try {
      await httpsCallable(functions, 'endPair')({ code: sessionCode, pairId, requeue });
    } catch (err) {
      console.error('endPair failed', err);
    }
    onLeave(requeue);
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-white overflow-hidden">
      <header className="bg-slate-900/90 px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
        <div className="text-sm flex items-center gap-2">
          <span className="font-semibold">🤝 1:1 English Room</span>
          <span className="text-slate-500 font-mono text-xs hidden sm:inline">
            {sessionTitle} [{sessionCode}]
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleLeave(true)}
            className="bg-amber-600 hover:bg-amber-500 text-xs px-3 py-1.5 rounded-lg"
          >
            🔄 New partner
          </button>
          <button
            onClick={() => handleLeave(false)}
            className="bg-rose-700 hover:bg-rose-600 text-xs px-3 py-1.5 rounded-lg"
          >
            Leave
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 min-h-0">
          {room ? (
            <LocalVideoTile room={room} name={myName} micOn={micOn} camOn={camOn} />
          ) : (
            <Placeholder label={connecting ? 'Connecting your camera…' : 'Getting ready…'} />
          )}
          {Object.values(remotes).map((m) => (
            <VideoTile key={m.identity} media={m} />
          ))}
          {!partnerPresent && (
            <Placeholder label="Waiting for your partner to connect…" pulse />
          )}
        </main>

        <aside className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col p-3 gap-3 min-h-0">
          <div className="flex gap-2">
            <button
              disabled={!room}
              onClick={toggleMic}
              className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 py-2 rounded-lg text-xs"
            >
              {micOn ? '🎤 Mute' : '🔇 Unmute'}
            </button>
            <button
              disabled={!room}
              onClick={toggleCam}
              className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 py-2 rounded-lg text-xs"
            >
              {camOn ? '📷 Camera off' : '📷 Camera on'}
            </button>
          </div>
          <button
            disabled={!room}
            onClick={toggleScreen}
            className={`py-2 rounded-lg text-xs ${
              screenOn ? 'bg-rose-600 hover:bg-rose-500' : 'bg-slate-800 hover:bg-slate-700'
            } disabled:opacity-40`}
          >
            {screenOn ? '🛑 Stop sharing' : '🖥 Share my screen'}
          </button>
          <div className="flex-1 min-h-0">
            <FacilitatorPanel
              messages={messages}
              busy={busy}
              auto={auto}
              onToggleAuto={() => setAuto((v) => !v)}
              onNext={() => trigger('next')}
              onHelp={() => trigger('help')}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Placeholder({ label, pulse }: { label: string; pulse?: boolean }) {
  return (
    <div className="flex items-center justify-center bg-slate-900 rounded-xl border border-slate-800 text-slate-400 text-sm">
      <span className={pulse ? 'animate-pulse' : ''}>{label}</span>
    </div>
  );
}
