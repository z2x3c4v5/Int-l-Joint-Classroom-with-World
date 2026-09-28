import { useEffect, useRef, useState } from 'react';
import { ensureSignedIn, signInWithNickname } from '../lib/firebase';
import { fetchSession, isValidSessionCode, normaliseSessionCode } from '../lib/session';
import type { SessionMode } from '../lib/session';
import type { Country } from '../lib/matchmaking';
import AvatarPicker from './AvatarPicker';
import MapBackdrop from './MapBackdrop';
import { decodeLook, encodeLook, randomLook, type Look } from '../game/sprites';
import { LangToggle, useI18n } from '../lib/i18n';

export interface JoinPayload {
  nickname: string;
  sessionCode: string;
  sessionTitle: string;
  mode: SessionMode;
  /** Encoded avatar look (see game/sprites encodeLook). */
  look?: string;
  country?: Country;
  topic?: string;
}

interface Props {
  onJoined: (info: JoinPayload) => void;
}

const LOOK_KEY = 'gc.look';
const NAME_KEY = 'gc.name';

function loadLook(): Look {
  try {
    const s = localStorage.getItem(LOOK_KEY);
    if (s) return decodeLook(s);
  } catch {
    /* storage blocked */
  }
  return randomLook();
}

export default function NicknameEntry({ onJoined }: Props) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [look, setLook] = useState<Look>(loadLook);
  const [country, setCountry] = useState<Country>('KR');
  const [topic, setTopic] = useState('');
  const [resolvedMode, setResolvedMode] = useState<SessionMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p = new URLSearchParams(location.search).get('code');
    if (p) setCode(normaliseSessionCode(p));
  }, []);

  // Resolve the session's mode as soon as the code looks valid.
  useEffect(() => {
    const cleanCode = normaliseSessionCode(code);
    if (!isValidSessionCode(cleanCode)) {
      setResolvedMode(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        await ensureSignedIn();
        const s = await fetchSession(cleanCode);
        if (!cancelled) setResolvedMode(s?.mode ?? null);
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
      setError(t('entry.errCode'));
      return;
    }
    if (cleanName.length < 2 || cleanName.length > 16) {
      setError(t('entry.errName'));
      nameRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await ensureSignedIn();
      const session = await fetchSession(cleanCode);
      if (!session) {
        setError(t('entry.errNoClass'));
        setBusy(false);
        return;
      }
      if (!session.active) {
        setError(t('entry.errClosed'));
        setBusy(false);
        return;
      }
      await signInWithNickname(cleanName);
      try {
        localStorage.setItem(LOOK_KEY, encodeLook(look));
        localStorage.setItem(NAME_KEY, cleanName);
      } catch {
        /* storage blocked */
      }
      onJoined({
        nickname: cleanName,
        sessionCode: cleanCode,
        sessionTitle: session.title,
        mode: session.mode,
        look: encodeLook(look),
        country: session.mode === 'match' ? country : undefined,
        topic: session.mode === 'match' ? topic.trim() : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join.');
      setBusy(false);
    }
  }

  const isMatch = resolvedMode === 'match';

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-8 overflow-hidden bg-[#2a2442]">
      <MapBackdrop />
      <LangToggle className="absolute top-4 right-4 z-10" />
      <form
        onSubmit={handleJoin}
        className="relative w-full max-w-3xl bg-white text-slate-800 rounded-[28px] shadow-2xl overflow-hidden grid md:grid-cols-[1fr_1.1fr]"
      >
        {/* Character */}
        <div className="bg-gradient-to-b from-indigo-500 to-violet-600 p-6 text-white">
          <div className="text-xs font-bold tracking-widest opacity-80">{t('avatar.title')}</div>
          <AvatarPicker look={look} onChange={setLook} name={nickname.trim() || 'Me'} />
        </div>

        {/* Details */}
        <div className="p-6 sm:p-8 flex flex-col gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-600 text-[11px] font-bold px-2.5 py-1 rounded-full">
              {t('entry.badge')}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-2 leading-tight">{t('entry.title')}</h1>
            <p className="text-slate-500 text-sm mt-1">{t('entry.sub')}</p>
          </div>

          <label className="block">
            <span className="text-xs font-bold text-slate-500">{t('entry.code')}</span>
            <input
              type="text"
              autoFocus={!code}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. DEOKCHEON-1"
              className="mt-1 w-full px-4 py-3 rounded-2xl bg-slate-100 border-2 border-transparent focus:border-indigo-400 focus:bg-white outline-none text-lg tracking-wider font-mono"
              disabled={busy}
            />
            {resolvedMode && (
              <span className="mt-1 inline-block text-[11px] font-semibold text-emerald-600">
                {isMatch ? t('entry.foundMatch') : t('entry.foundMap')}
              </span>
            )}
          </label>

          <label className="block">
            <span className="text-xs font-bold text-slate-500">{t('entry.name')}</span>
            <input
              ref={nameRef}
              type="text"
              maxLength={16}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t('entry.namePh')}
              className="mt-1 w-full px-4 py-3 rounded-2xl bg-slate-100 border-2 border-transparent focus:border-indigo-400 focus:bg-white outline-none text-lg"
              disabled={busy}
            />
          </label>

          {isMatch && (
            <>
              <div>
                <span className="text-xs font-bold text-slate-500">{t('entry.from')}</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(['KR', 'INTL'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCountry(c)}
                      className={`py-3 rounded-2xl font-semibold border-2 transition ${
                        country === c ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {c === 'KR' ? t('entry.korea') : t('entry.overseas')}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">{t('entry.topic')}</span>
                <input
                  type="text"
                  maxLength={40}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={t('entry.topicPh')}
                  className="mt-1 w-full px-4 py-2.5 rounded-2xl bg-slate-100 border-2 border-transparent focus:border-indigo-400 focus:bg-white outline-none"
                  disabled={busy}
                />
              </label>
            </>
          )}

          {error && <p className="text-rose-600 text-sm font-medium">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-auto w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] disabled:bg-slate-300 text-white py-3.5 rounded-2xl font-bold text-lg shadow-lg shadow-indigo-600/30 transition"
          >
            {busy ? t('entry.joining') : isMatch ? t('entry.findPartner') : t('entry.enter')}
          </button>
          <p className="text-[11px] text-slate-400 text-center">
            {t('entry.note')}
          </p>
        </div>
      </form>
    </div>
  );
}
