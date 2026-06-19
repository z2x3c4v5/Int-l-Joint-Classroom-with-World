import { useEffect, useState } from 'react';
import { dequeue } from '../lib/matchmaking';

interface Props {
  sessionTitle: string;
  sessionCode: string;
  myName: string;
  myCountry: 'KR' | 'INTL';
  myTopic: string;
  onCancel: () => void;
}

export default function WaitingRoom({ sessionTitle, sessionCode, myName, myCountry, myTopic, onCancel }: Props) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function handleCancel() {
    await dequeue(sessionCode);
    onCancel();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-900 text-white">
      <div className="max-w-md w-full bg-slate-800/80 backdrop-blur p-8 rounded-2xl shadow-2xl border border-slate-700 text-center space-y-4">
        <div className="text-5xl animate-pulse">🔎</div>
        <h2 className="text-2xl font-bold">Looking for your partner…</h2>
        <p className="text-slate-400 text-sm">
          The AI coach is matching {myCountry === 'KR' ? 'a friend from overseas' : 'a Korean friend'} for you.
          {myTopic && <> Topic: <strong>{myTopic}</strong></>}
        </p>
        <div className="text-3xl font-mono">{formatSeconds(seconds)}</div>
        <div className="text-xs text-slate-500">
          {sessionTitle} <span className="font-mono ml-1">[{sessionCode}]</span>
          <br />
          You: {myName} ({myCountry === 'KR' ? '🇰🇷 Korea' : '🌐 Overseas'})
        </div>
        <button
          onClick={handleCancel}
          className="mt-2 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-sm"
        >
          Cancel and go back
        </button>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Camera and mic will turn on automatically when your partner is ready.
          Only the two of you will see and hear each other.
        </p>
      </div>
    </div>
  );
}

function formatSeconds(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}
