import { useEffect } from 'react';
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

/**
 * The auto-matched 1:1 room. LiveKit handles A/V; Firestore handles the
 * AI coach feed. On first mount we kick the coach with the "start" action
 * so the kids never face an awkward silence.
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

  // Greet once when the pair is formed (the very first member to arrive
  // kicks the coach; subsequent calls just append messages).
  useEffect(() => {
    if (messages.length === 0 && !connecting) {
      trigger('start').catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connecting]);

  async function handleLeave(requeue: boolean) {
    try {
      await httpsCallable(functions, 'endPair')({ code: sessionCode, pairId, requeue });
    } catch (err) {
      console.error('endPair failed', err);
    }
    onLeave(requeue);
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white overflow-hidden">
      <header className="bg-slate-800 px-3 py-2 flex items-center justify-between border-b border-slate-700">
        <div className="text-sm">
          <span className="font-semibold">🤝 1:1 Match</span>
          <span className="text-slate-500 font-mono ml-2 text-xs">
            {sessionTitle} [{sessionCode}]
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleLeave(true)}
            className="bg-amber-700 hover:bg-amber-600 text-xs px-3 py-1.5 rounded"
          >
            Find another partner
          </button>
          <button
            onClick={() => handleLeave(false)}
            className="bg-red-700 hover:bg-red-600 text-xs px-3 py-1.5 rounded"
          >
            Leave
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2 p-3">
          {room && (
            <LocalVideoTile room={room} name={myName} micOn={micOn} camOn={camOn} />
          )}
          {Object.values(remotes).map((m) => (
            <VideoTile key={m.identity} media={m} />
          ))}
          {Object.keys(remotes).length === 0 && (
            <div className="flex items-center justify-center bg-slate-800 rounded text-slate-400 text-sm">
              Waiting for your partner to connect…
            </div>
          )}
        </main>

        <aside className="w-80 border-l border-slate-700 flex flex-col p-3 gap-3">
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
            className={`py-1.5 rounded text-xs ${
              screenOn ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-700 hover:bg-emerald-600'
            } disabled:opacity-40`}
          >
            {screenOn ? '🛑 Stop screen share' : '🖥 Share screen'}
          </button>
          <div className="flex-1 min-h-0">
            <FacilitatorPanel
              messages={messages}
              busy={busy}
              onNext={() => trigger('next')}
              onHelp={() => trigger('help')}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
