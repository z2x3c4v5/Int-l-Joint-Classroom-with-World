import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, ensureSignedIn, functions } from '../lib/firebase';
import { isValidSessionCode, normaliseSessionCode } from '../lib/session';
import { LangToggle, useI18n } from '../lib/i18n';

interface SessionRow {
  id: string;
  title?: string;
  active?: boolean;
  mode?: 'free' | 'match';
  createdAt?: { toMillis(): number };
}

interface ObjectDoc {
  id: string;
  type?: 'image' | 'slides';
  imageUrl?: string;
  slidesUrl?: string;
  ownerName?: string;
  status?: 'pending' | 'approved' | 'rejected';
  updatedAt?: { toMillis(): number };
  safeSearch?: { adult?: string; violence?: string; racy?: string };
}

export default function TeacherPanel() {
  const { t } = useI18n();
  const [passcode, setPasscode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [docs, setDocs] = useState<ObjectDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // New-session form
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newMode, setNewMode] = useState<'free' | 'match'>('free');

  useEffect(() => {
    if (!unlocked) return;
    // Subscribe only after sign-in lands — the rules reject anonymous reads.
    let unsub: (() => void) | undefined;
    let cancelled = false;
    ensureSignedIn()
      .then(() => {
        if (cancelled) return;
        const q = query(collection(db, 'sessions'), orderBy('createdAt', 'desc'));
        unsub = onSnapshot(q, (snap) =>
          setSessions(snap.docs.map((d) => ({ ...(d.data() as SessionRow), id: d.id }))),
        );
      })
      .catch(console.error);
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked || !selected) {
      setDocs([]);
      return;
    }
    const q = query(collection(db, 'sessions', selected, 'objects'), orderBy('updatedAt', 'desc'));
    return onSnapshot(q, (snap) =>
      setDocs(snap.docs.map((d) => ({ ...(d.data() as ObjectDoc), id: d.id }))),
    );
  }, [unlocked, selected]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const code = normaliseSessionCode(newCode);
    if (!isValidSessionCode(code)) return setError(t('teacher.errCode'));
    setBusy(true);
    try {
      await httpsCallable(functions, 'createSession')({
        code,
        title: newTitle || code,
        mode: newMode,
        passcode,
      });
      setNewCode('');
      setNewTitle('');
      setSelected(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(code: string, active: boolean) {
    try {
      await httpsCallable(functions, 'setSessionActive')({ code, active, passcode });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  }
  async function moderate(objectId: string, status: 'approved' | 'rejected') {
    if (!selected) return;
    await httpsCallable(functions, 'moderateObject')({ code: selected, objectId, status, passcode });
  }

  function studentUrl(code: string) {
    return `${window.location.origin}/?code=${encodeURIComponent(code)}`;
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500">
        <LangToggle className="absolute top-4 right-4" />
        <form
          className="bg-white text-slate-800 p-8 rounded-[28px] shadow-2xl max-w-sm w-full"
          onSubmit={(e) => {
            e.preventDefault();
            setUnlocked(true);
          }}
        >
          <h2 className="text-2xl font-extrabold mb-4">{t('teacher.title')}</h2>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder={t('teacher.passcode')}
            className="w-full px-4 py-3 rounded-2xl bg-slate-100 border-2 border-transparent focus:border-indigo-400 focus:bg-white outline-none mb-3"
            autoFocus
          />
          <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-2xl font-bold">
            {t('teacher.unlock')}
          </button>
          <p className="text-[11px] text-slate-400 mt-3">{t('teacher.passNote')}</p>
        </form>
      </div>
    );
  }

  const current = sessions.find((s) => s.id === selected);

  return (
    <div className="min-h-screen flex bg-slate-100 text-slate-800">
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-extrabold text-lg">{t('teacher.sessions')}</h2>
            <LangToggle className="shadow-none ring-1 ring-slate-200" />
          </div>
          <form onSubmit={handleCreate} className="space-y-2">
            <input
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder={t('teacher.codePh')}
              className="w-full px-3 py-2 rounded-xl bg-slate-100 font-mono text-sm outline-none focus:ring-2 ring-indigo-300"
            />
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t('teacher.titlePh')}
              className="w-full px-3 py-2 rounded-xl bg-slate-100 text-sm outline-none focus:ring-2 ring-indigo-300"
            />
            <div className="grid grid-cols-2 gap-1.5">
              {(['free', 'match'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setNewMode(m)}
                  className={`py-2 rounded-xl text-xs font-bold transition ${
                    newMode === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {m === 'free' ? t('teacher.modeFree') : t('teacher.modeMatch')}
                </button>
              ))}
            </div>
            <button
              disabled={busy}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-bold"
            >
              {busy ? '…' : t('teacher.create')}
            </button>
          </form>
          {error && <p className="text-rose-600 text-xs mt-2">{error}</p>}
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition ${
                selected === s.id ? 'bg-indigo-50 ring-2 ring-indigo-200' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold">{s.id}</span>
                <span className={`text-[10px] font-bold ${s.active ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {s.active ? t('teacher.live') : t('teacher.closed')}
                </span>
              </div>
              <div className="text-xs text-slate-500 truncate flex items-center gap-1">
                <span className="truncate">{s.title ?? s.id}</span>
                <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded-full ml-auto shrink-0">
                  {s.mode === 'match' ? t('teacher.modeMatch') : t('teacher.modeFree')}
                </span>
              </div>
            </button>
          ))}
          {sessions.length === 0 && <p className="text-slate-400 text-xs text-center mt-6 px-3">{t('teacher.none')}</p>}
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-auto">
        {!selected ? (
          <p className="text-slate-400">{t('teacher.pick')}</p>
        ) : (
          <>
            <header className="bg-white rounded-3xl shadow-sm p-5 flex items-center justify-between mb-5 flex-wrap gap-3">
              <div className="min-w-0">
                <h2 className="text-2xl font-extrabold">
                  {current?.title ?? selected} <span className="text-slate-400 font-mono text-base">[{selected}]</span>
                </h2>
                <a href={studentUrl(selected)} target="_blank" rel="noreferrer" className="text-indigo-600 text-xs underline break-all">
                  {studentUrl(selected)}
                </a>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleActive(selected, !current?.active)}
                  className="bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl text-sm font-bold"
                >
                  {current?.active ? t('teacher.closeSession') : t('teacher.openSession')}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(studentUrl(selected)).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold"
                >
                  {copied ? t('teacher.copied') : t('teacher.copy')}
                </button>
              </div>
            </header>

            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3">{t('teacher.queue')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {docs.map((d) => (
                <div key={d.id} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                  {d.type === 'slides' && d.slidesUrl ? (
                    <iframe
                      src={d.slidesUrl}
                      title={d.id}
                      className="w-full h-40 bg-black"
                      sandbox="allow-scripts allow-same-origin allow-popups"
                      referrerPolicy="no-referrer"
                    />
                  ) : d.imageUrl ? (
                    <img src={d.imageUrl} alt="" className="w-full h-40 object-cover bg-black" />
                  ) : (
                    <div className="h-40 flex items-center justify-center text-slate-400">{t('teacher.empty')}</div>
                  )}
                  <div className="p-3 text-xs space-y-1">
                    <div className="font-mono text-slate-400 truncate">
                      {d.id} · <span className="text-slate-600">{d.type ?? 'image'}</span>
                    </div>
                    <div>{t('board.by', { name: d.ownerName ?? '?' })}</div>
                    <div>
                      {t('teacher.status')}:{' '}
                      <span
                        className={`font-bold ${
                          d.status === 'approved' ? 'text-emerald-600' : d.status === 'rejected' ? 'text-rose-600' : 'text-amber-600'
                        }`}
                      >
                        {d.status}
                      </span>
                    </div>
                    {d.safeSearch && (
                      <div className="text-slate-400">
                        adult:{d.safeSearch.adult} · violence:{d.safeSearch.violence} · racy:{d.safeSearch.racy}
                      </div>
                    )}
                    <div className="flex gap-1.5 pt-1">
                      <button onClick={() => moderate(d.id, 'approved')} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-1.5 rounded-lg">
                        {t('teacher.approve')}
                      </button>
                      <button onClick={() => moderate(d.id, 'rejected')} className="flex-1 bg-rose-500 hover:bg-rose-400 text-white font-bold py-1.5 rounded-lg">
                        {t('teacher.reject')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {docs.length === 0 && <p className="text-slate-400 text-xs">{t('teacher.noUploads')}</p>}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
