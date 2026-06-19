import { useEffect, useRef, useState } from 'react';
import NicknameEntry, { type JoinPayload } from './components/NicknameEntry';
import WaitingRoom from './components/WaitingRoom';
import PairRoom from './components/PairRoom';
import { useMatchQueue } from './hooks/useMatchQueue';
import { enqueueForMatch } from './lib/matchmaking';

/**
 * The whole student app is now a single experience: the AI auto-match.
 * No free-roam map, no manual avatar movement — a student joins, the AI
 * pairs them 1:1 and an AI tutor leads the conversation.
 */
export default function App() {
  const [info, setInfo] = useState<JoinPayload | null>(null);
  if (!info) return <NicknameEntry onJoined={setInfo} />;
  return <MatchFlow info={info} onLeave={() => setInfo(null)} />;
}

function MatchFlow({ info, onLeave }: { info: JoinPayload; onLeave: () => void }) {
  const { sessionCode, sessionTitle, nickname, country, topic } = info;
  const queue = useMatchQueue(sessionCode);
  const enqueuedRef = useRef(false);

  // The very first time the student lands here, drop them into the queue.
  // The matchmaker Function does the rest — no avatar to walk anywhere.
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
