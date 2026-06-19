import { useEffect, useRef } from 'react';
import type { FacilitatorMessage } from '../hooks/useFacilitator';

interface Props {
  messages: FacilitatorMessage[];
  busy: boolean;
  auto: boolean;
  onToggleAuto: () => void;
  onNext: () => void;
  onHelp: () => void;
}

/**
 * The AI tutor feed. It auto-leads the conversation, but the kids can still
 * ask for a new question or for help, and replay any line as speech.
 * Auto-scrolls so the latest prompt is always visible.
 */
export default function FacilitatorPanel({ messages, busy, auto, onToggleAuto, onNext, onHelp }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Read each brand-new tutor line aloud automatically so students hear it.
  const lastSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (latest && latest.id !== lastSpokenRef.current) {
      lastSpokenRef.current = latest.id;
      speak(latest.text);
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-indigo-50 text-slate-900 rounded-xl shadow-inner overflow-hidden">
      <div className="px-3 py-2.5 bg-indigo-600 text-white flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-lg">🦉</span> AI Tutor
        </div>
        <button
          type="button"
          onClick={onToggleAuto}
          className={`text-[11px] px-2 py-1 rounded-full font-medium transition ${
            auto ? 'bg-emerald-400 text-emerald-950' : 'bg-indigo-800 text-indigo-200'
          }`}
          title="When on, the tutor leads the conversation on its own."
        >
          {auto ? '● Auto-leading' : '○ Manual'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-slate-500 text-xs">The tutor is getting ready to say hello…</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className="bg-white border border-indigo-100 rounded-xl p-2.5 shadow-sm text-sm leading-snug"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-indigo-600 uppercase tracking-wide font-semibold">
                {m.action === 'help' ? '🆘 Help' : m.action === 'start' ? '👋 Welcome' : '💬 Question'}
              </span>
              <button
                onClick={() => speak(m.text)}
                className="text-xs text-indigo-600 hover:text-indigo-800"
                type="button"
                title="Read aloud"
              >
                🔊
              </button>
            </div>
            {m.text}
          </div>
        ))}
        {busy && <p className="text-indigo-500 text-xs animate-pulse">Tutor is thinking…</p>}
        <div ref={endRef} />
      </div>

      <div className="p-2 bg-indigo-100 border-t border-indigo-200 flex gap-2">
        <button
          onClick={onNext}
          disabled={busy}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm py-2 rounded-lg"
        >
          💬 New question
        </button>
        <button
          onClick={onHelp}
          disabled={busy}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm py-2 rounded-lg"
        >
          🆘 Help me
        </button>
      </div>
    </div>
  );
}

function speak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // noop
  }
}
