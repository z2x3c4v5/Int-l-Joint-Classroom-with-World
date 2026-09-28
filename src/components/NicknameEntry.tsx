import { useEffect, useState } from 'react';
import { signInWithNickname } from '../lib/firebase';
import { fetchSession, isValidSessionCode, normaliseSessionCode } from '../lib/session';
import type { SessionMode } from '../lib/session';
import type { Country } from '../lib/matchmaking';

export interface JoinPayload {
  nickname: string;
  sessionCode: string;
  sessionTitle: string;
  mode: SessionMode;
  country?: Country;
  topic?: string;
}

interface Props {
  onJoined: (info: JoinPayload) => void;
}

export default function NicknameEntry({ onJoined }: Props) {
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [country, setCountry] = useState<Country>('KR');
  const [topic, setTopic] = useState('');
  const [resolvedMode, setResolvedMode] = useState<SessionMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('code');
    if (p) setCode(normaliseSessionCode(p));
  }, []);

  // Resolve mode the moment the student stops typing the code.
  useEffect(() => {
    const cleanCode = normaliseSessionCode(code);
    if (!isValidSessionCode(cleanCode)) {
      setResolvedMode(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const s = await fetchSession(cleanCode);
        if (cancelled) return;
        setResolvedMode(s?.mode ?? null);
      } catch {
        if (!cancelled) setResolvedMode(null);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [code]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleanCode = normaliseSessionCode(code);
    const cleanName = nickname.trim();
    if (!isValidSessionCode(cleanCode)) {
      setError('Class code looks wrong. Use 3–16 uppercase letters/numbers/dashes.');
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
        mode: session.mode,
        country: session.mode === 'match' ? country : undefined,
        topic: session.mode === 'match' ? topic.trim() : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join.');
      setBusy(false);
    }
  }

  const showMatchFields = resolvedMode === 'match';

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleJoin}
        className="w-full max-w-md bg-slate-800/80 backdrop-blur p-8 rounded-2xl shadow-2xl border border-slate-700 space-y-4"
      >
        <div>
          <h1 className="text-3xl font-bold mb-1">🌍 Global Classroom</h1>
          <p className="text-slate-400 text-sm">Enter the class code your teacher gave you, then your name.</p>
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
            className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-600 focus:border-blue-500 focus:outline-none text-lg tracking-wider font-mono"
            disabled={busy}
          />
          {resolvedMode && (
            <p className="text-[11px] text-slate-500 mt-1">
              Mode:{' '}
              <span className="text-emerald-400">
                {resolvedMode === 'match' ? '🤝 AI Auto-match (1:1)' : '🗺 Free movement (4 rooms)'}
              </span>
            </p>
          )}
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Your name</label>
          <input
            type="text"
            maxLength={16}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Mary, Hiroshi, 민수…"
            className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-600 focus:border-blue-500 focus:outline-none text-lg"
            disabled={busy}
          />
        </div>

        {showMatchFields && (
          <>
            <div>
              <label className="text-xs text-slate-400 block mb-1">I'm from…</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCountry('KR')}
                  className={`py-3 rounded-lg border ${
                    country === 'KR'
                      ? 'bg-blue-600 border-blue-400 text-white'
                      : 'bg-slate-900 border-slate-600'
                  }`}
                >
                  🇰🇷 Korea
                </button>
                <button
                  type="button"
                  onClick={() => setCountry('INTL')}
                  className={`py-3 rounded-lg border ${
                    country === 'INTL'
                      ? 'bg-blue-600 border-blue-400 text-white'
                      : 'bg-slate-900 border-slate-600'
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
                className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-600 focus:border-blue-500 focus:outline-none"
                disabled={busy}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                The AI tries to match you with someone who picked the same topic.
              </p>
            </div>
          </>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 py-3 rounded-lg font-semibold transition"
        >
          {busy ? 'Joining…' : showMatchFields ? 'Find me a partner' : 'Join Classroom'}
        </button>
        <p className="text-xs text-slate-500">
          By joining you allow camera and microphone access inside Private Areas only.
        </p>
      </form>
    </div>
  );
}
