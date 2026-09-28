import { useEffect, useRef, useState } from 'react';
import NicknameEntry, { type JoinPayload } from './components/NicknameEntry';
import WaitingRoom from './components/WaitingRoom';
import PairRoom from './components/PairRoom';
import Classroom from './pages/Classroom';
import { useMatchQueue } from './hooks/useMatchQueue';
import { enqueueForMatch } from './lib/matchmaking';

export default function App() {
  const [info, setInfo] = useState<JoinPayload | null>(null);
  if (!info) return <NicknameEntry onJoined={setInfo} />;
  if (info.mode === 'match') return <MatchModeFlow info={info} onLeave={() => setInfo(null)} />;
  return <Classroom info={info} onLeave={() => setInfo(null)} />;
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
