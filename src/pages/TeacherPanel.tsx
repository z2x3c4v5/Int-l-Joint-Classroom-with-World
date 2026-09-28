import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../lib/firebase';
import { isValidSessionCode, normaliseSessionCode } from '../lib/session';

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
  const [passcode, setPasscode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [docs, setDocs] = useState<ObjectDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New-session form
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newMode, setNewMode] = useState<'free' | 'match'>('free');

  useEffect(() => {
    if (!unlocked) return;
    if (!auth.currentUser) signInAnonymously(auth).catch(console.error);
    const q = query(collection(db, 'sessions'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) =>
      setSessions(snap.docs.map((d) => ({ ...(d.data() as SessionRow), id: d.id }))),
    );
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
    if (!isValidSessionCode(code)) return setError('Code: 3–16 of A–Z 0–9 -');
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
      setNewMode('free');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(code: string, active: boolean) {
    await httpsCallable(functions, 'setSessionActive')({ code, active, passcode });
  }
  async function moderate(objectId: string, status: 'approved' | 'rejected') {
    if (!selected) return;
    await httpsCallable(functions, 'moderateObject')({
      code: selected,
      objectId,
      status,
      passcode,
    });
  }

  function studentUrl(code: string) {
    return `${window.location.origin}/?code=${encodeURIComponent(code)}`;
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <form
          className="bg-slate-800 p-6 rounded-2xl border border-slate-700 max-w-sm w-full"
          onSubmit={(e) => {
            e.preventDefault();
            setUnlocked(true);
          }}
        >
          <h2 className="text-xl font-bold mb-4">👩‍🏫 Teacher Panel</h2>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Teacher passcode"
            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-600 mb-3"
            autoFocus
          />
          <button className="w-full bg-blue-600 hover:bg-blue-500 py-2 rounded">Unlock</button>
          <p className="text-[11px] text-slate-500 mt-2">
            The passcode is checked server-side on every action.
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-72 bg-slate-900 border-r border-slate-700 flex flex-col">
        <div className="p-3 border-b border-slate-700">
          <h2 className="font-bold mb-3">📚 Sessions</h2>
          <form onSubmit={handleCreate} className="space-y-2">
            <input
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="Code (e.g. KR-MY-2026)"
              className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700 font-mono text-sm"
            />
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title (optional)"
              className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-sm"
            />
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setNewMode('free')}
                className={`py-1.5 rounded text-xs ${newMode === 'free' ? 'bg-blue-600' : 'bg-slate-800 border border-slate-700'}`}
              >
                🗺 Free (4-rooms)
              </button>
              <button
                type="button"
                onClick={() => setNewMode('match')}
                className={`py-1.5 rounded text-xs ${newMode === 'match' ? 'bg-blue-600' : 'bg-slate-800 border border-slate-700'}`}
              >
                🤝 AI Match (1:1)
              </button>
            </div>
            <button
              disabled={busy}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 py-1.5 rounded text-sm"
            >
              {busy ? '…' : '+ Create session'}
            </button>
          </form>
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </div>
        <div className="flex-1 overflow-auto">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              className={`w-full text-left px-3 py-2 border-b border-slate-800 hover:bg-slate-800 ${
                selected === s.id ? 'bg-slate-800' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm">{s.id}</span>
                <span className={`text-[10px] ${s.active ? 'text-green-400' : 'text-slate-500'}`}>
                  {s.active ? '● live' : '○ closed'}
                </span>
              </div>
              <div className="text-xs text-slate-400 truncate flex items-center gap-1">
                <span>{s.title ?? s.id}</span>
                <span className="text-[9px] uppercase bg-slate-700 px-1 rounded ml-auto">
                  {s.mode === 'match' ? 'AI Match' : 'Free'}
                </span>
              </div>
            </button>
          ))}
          {sessions.length === 0 && (
            <p className="text-slate-500 text-xs text-center mt-6 px-3">
              No sessions yet. Create one above.
            </p>
          )}
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-auto">
        {!selected ? (
          <p className="text-slate-500">Pick a session on the left.</p>
        ) : (
          <>
            <header className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h2 className="text-2xl font-bold">
                  {sessions.find((s) => s.id === selected)?.title ?? selected}{' '}
                  <span className="text-slate-500 font-mono text-base">[{selected}]</span>
                </h2>
                <a
                  href={studentUrl(selected)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 text-xs underline break-all"
                >
                  {studentUrl(selected)}
                </a>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleActive(selected, !sessions.find((s) => s.id === selected)?.active)}
                  className="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-sm"
                >
                  {sessions.find((s) => s.id === selected)?.active ? 'Close session' : 'Open session'}
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(studentUrl(selected))}
                  className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-sm"
                >
                  Copy student URL
                </button>
              </div>
            </header>

            <h3 className="text-sm uppercase text-slate-400 mb-2">Moderation queue</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {docs.map((d) => (
                <div key={d.id} className="bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
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
                    <div className="h-40 flex items-center justify-center text-slate-500">empty</div>
                  )}
                  <div className="p-2 text-xs">
                    <div className="font-mono text-slate-400 truncate">
                      {d.id} · <span className="text-slate-300">{d.type ?? 'image'}</span>
                    </div>
                    <div>by {d.ownerName ?? '?'}</div>
                    <div>
                      Status:{' '}
                      <span
                        className={
                          d.status === 'approved'
                            ? 'text-green-400'
                            : d.status === 'rejected'
                              ? 'text-red-400'
                              : 'text-yellow-400'
                        }
                      >
                        {d.status}
                      </span>
                    </div>
                    {d.safeSearch && (
                      <div className="text-slate-500 mt-1">
                        adult:{d.safeSearch.adult} · violence:{d.safeSearch.violence} · racy:
                        {d.safeSearch.racy}
                      </div>
                    )}
                    <div className="flex gap-1 mt-2">
                      <button
                        onClick={() => moderate(d.id, 'approved')}
                        className="flex-1 bg-green-700 hover:bg-green-600 py-1 rounded"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => moderate(d.id, 'rejected')}
                        className="flex-1 bg-red-700 hover:bg-red-600 py-1 rounded"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {docs.length === 0 && (
                <p className="text-slate-500 text-xs">No uploads yet in this session.</p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
