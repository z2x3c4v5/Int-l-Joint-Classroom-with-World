import { useEffect, useState } from 'react';
import { signInWithNickname } from '../lib/firebase';
import { fetchSession, isValidSessionCode, normaliseSessionCode } from '../lib/session';
import type { Country } from '../lib/matchmaking';

export interface JoinPayload {
  nickname: string;
  sessionCode: string;
  sessionTitle: string;
  country: Country;
  topic: string;
}

interface Props {
  onJoined: (info: JoinPayload) => void;
}

/**
 * Single entry screen. There is no "mode" anymore — every session is an
 * AI auto-match, so we always collect the student's side (Korea / Overseas)
 * and an optional topic. The AI does the pairing and placement.
 */
export default function NicknameEntry({ onJoined }: Props) {
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [country, setCountry] = useState<Country>('KR');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('code');
    if (p) setCode(normaliseSessionCode(p));
  }, []);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleanCode = normaliseSessionCode(code);
    const cleanName = nickname.trim();
    if (!isValidSessionCode(cleanCode)) {
      setError('Class code looks wrong. Use 3–16 letters/numbers/dashes.');
      return;
    }
    if (cleanName.length < 2 || cleanName.length > 16) {
      setError('Please enter a 2–16 character name.');
      return;
    }
    setBusy(true);
    try {
      const session = await fetchSession(cleanCode);
      if (!session) {
        setError('That class code does not exist. Ask your teacher.');
        setBusy(false);
        return;
      }
      if (!session.active) {
        setError('Class is not open yet. Ask your teacher to start it.');
        setBusy(false);
        return;
      }
      await signInWithNickname(cleanName);
      onJoined({
        nickname: cleanName,
        sessionCode: cleanCode,
        sessionTitle: session.title,
        country,
        topic: topic.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join.');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900">
      <form
        onSubmit={handleJoin}
        className="w-full max-w-md bg-slate-800/70 backdrop-blur p-8 rounded-3xl shadow-2xl border border-slate-700 space-y-5"
      >
        <div className="text-center">
          <div className="text-4xl mb-2">🤝🌍</div>
          <h1 className="text-2xl font-bold">AI English Buddy</h1>
          <p className="text-slate-400 text-sm mt-1">
            Type your class code and name. The AI finds you a partner and a tutor — you don't move around, it brings the class to you.
          </p>
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-1">Class code</label>
          <input
            autoFocus
            type="text"
            maxLength={16}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. KR-MY-2026"
            className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-600 focus:border-indigo-500 focus:outline-none text-lg tracking-wider font-mono"
            disabled={busy}
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-1">Your name</label>
          <input
            type="text"
            maxLength={16}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Mary, Hiroshi, 민수…"
            className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-600 focus:border-indigo-500 focus:outline-none text-lg"
            disabled={busy}
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-1">I'm from…</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCountry('KR')}
              className={`py-3 rounded-xl border transition ${
                country === 'KR'
                  ? 'bg-indigo-600 border-indigo-400 text-white'
                  : 'bg-slate-900 border-slate-600 hover:border-slate-500'
              }`}
            >
              🇰🇷 Korea
            </button>
            <button
              type="button"
              onClick={() => setCountry('INTL')}
              className={`py-3 rounded-xl border transition ${
                country === 'INTL'
                  ? 'bg-indigo-600 border-indigo-400 text-white'
                  : 'bg-slate-900 border-slate-600 hover:border-slate-500'
              }`}
            >
              🌐 Overseas
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-1">
            Topic you want to talk about (optional)
          </label>
          <input
            type="text"
            maxLength={40}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="food, sports, K-pop, school…"
            className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-600 focus:border-indigo-500 focus:outline-none"
            disabled={busy}
          />
          <p className="text-[11px] text-slate-500 mt-1">
            The AI tries to match you with someone who picked the same topic.
          </p>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-600 py-3 rounded-xl font-semibold transition"
        >
          {busy ? 'Joining…' : '✨ Find my partner'}
        </button>
        <p className="text-[11px] text-slate-500 text-center">
          Camera & microphone turn on automatically once your 1:1 partner is ready.
        </p>
      </form>
    </div>
  );
}
