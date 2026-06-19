import { useEffect, useRef, useState } from 'react';

/**
 * Static demo of the new 1:1 AI-tutor room — no Firebase, no LiveKit.
 * Shows the experience: two paired students on camera, an AI tutor that
 * leads the conversation, and shared material instead of a free-roam map.
 * Reachable at /preview, used for design reviews and screenshots.
 */

interface DemoMsg {
  id: string;
  action: 'start' | 'next' | 'help';
  text: string;
}

const SCRIPT: DemoMsg[] = [
  { id: 'm1', action: 'start', text: "Hi Hiroshi and 민수! I'm your tutor. Let's talk about food. What did you eat for breakfast today?" },
  { id: 'm2', action: 'next', text: 'Nice! Hiroshi, is rice popular in Japan too? 민수, do you like rice or bread more?' },
  { id: 'm3', action: 'help', text: 'You can say: "I had eggs and toast." Now you both try it together!' },
];

export default function Preview() {
  // Reveal the scripted tutor messages one by one so the demo feels alive.
  const [shown, setShown] = useState(1);
  useEffect(() => {
    if (shown >= SCRIPT.length) return;
    const id = setTimeout(() => setShown((n) => n + 1), 2600);
    return () => clearTimeout(id);
  }, [shown]);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [shown]);

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-white overflow-hidden">
      <header className="bg-slate-900/90 px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
        <div className="text-sm flex items-center gap-2">
          <span className="font-semibold">🤝 1:1 English Room</span>
          <span className="text-slate-500 font-mono text-xs hidden sm:inline">Demo · KR-MY-2026</span>
          <span className="ml-1 text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
            PREVIEW
          </span>
        </div>
        <div className="flex gap-2">
          <span className="bg-amber-600/70 text-xs px-3 py-1.5 rounded-lg">🔄 New partner</span>
          <span className="bg-rose-700/70 text-xs px-3 py-1.5 rounded-lg">Leave</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 min-h-0">
          <VideoCard name="민수 (you)" sub="🇰🇷 Korea" from="from-sky-500 to-indigo-600" you />
          <VideoCard name="Hiroshi" sub="🌐 Overseas" from="from-emerald-500 to-teal-600" />
        </main>

        <aside className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col p-3 gap-3 min-h-0">
          <div className="flex gap-2">
            <span className="flex-1 bg-slate-800 py-2 rounded-lg text-xs text-center">🎤 Mute</span>
            <span className="flex-1 bg-slate-800 py-2 rounded-lg text-xs text-center">📷 Camera off</span>
          </div>
          <span className="bg-slate-800 py-2 rounded-lg text-xs text-center">🖥 Share my screen</span>

          <div className="flex-1 min-h-0">
            <div className="flex flex-col h-full bg-indigo-50 text-slate-900 rounded-xl shadow-inner overflow-hidden">
              <div className="px-3 py-2.5 bg-indigo-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="text-lg">🦉</span> AI Tutor
                </div>
                <span className="text-[11px] px-2 py-1 rounded-full font-medium bg-emerald-400 text-emerald-950">
                  ● Auto-leading
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {SCRIPT.slice(0, shown).map((m) => (
                  <div
                    key={m.id}
                    className="bg-white border border-indigo-100 rounded-xl p-2.5 shadow-sm text-sm leading-snug"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-indigo-600 uppercase tracking-wide font-semibold">
                        {m.action === 'help' ? '🆘 Help' : m.action === 'start' ? '👋 Welcome' : '💬 Question'}
                      </span>
                      <span className="text-xs text-indigo-600">🔊</span>
                    </div>
                    {m.text}
                  </div>
                ))}
                {shown < SCRIPT.length && (
                  <p className="text-indigo-500 text-xs animate-pulse">Tutor is thinking…</p>
                )}
                <div ref={endRef} />
              </div>
              <div className="p-2 bg-indigo-100 border-t border-indigo-200 flex gap-2">
                <span className="flex-1 bg-emerald-600 text-white text-sm py-2 rounded-lg text-center">
                  💬 New question
                </span>
                <span className="flex-1 bg-indigo-600 text-white text-sm py-2 rounded-lg text-center">
                  🆘 Help me
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function VideoCard({
  name,
  sub,
  from,
  you,
}: {
  name: string;
  sub: string;
  from: string;
  you?: boolean;
}) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900 flex items-center justify-center">
      <div className={`absolute inset-0 bg-gradient-to-br ${from} opacity-90`} />
      <div className="relative w-24 h-24 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-4xl font-bold">
        {initial}
      </div>
      <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-black/40 backdrop-blur px-2.5 py-1 rounded-lg text-xs">
        <span className="font-semibold">{name}</span>
        <span className="text-white/70">{sub}</span>
        {you && <span className="text-emerald-300">🎤</span>}
      </div>
    </div>
  );
}
