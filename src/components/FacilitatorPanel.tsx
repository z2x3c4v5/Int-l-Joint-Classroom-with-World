import { useEffect, useRef } from 'react';
import type { FacilitatorMessage } from '../hooks/useFacilitator';

interface Props {
  messages: FacilitatorMessage[];
  busy: boolean;
  onNext: () => void;
  onHelp: () => void;
}

/**
 * Renders the AI facilitator messages and the student-facing action buttons.
 * Auto-scrolls to the latest message so the kids always see the prompt.
 */
export default function FacilitatorPanel({ messages, busy, onNext, onHelp }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="flex flex-col h-full bg-amber-50 text-slate-900 rounded-lg shadow-inner overflow-hidden">
      <div className="px-3 py-2 bg-amber-200 border-b border-amber-300 text-sm font-semibold">
        🦊 AI Coach
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-slate-500 text-xs">Coach is getting ready…</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className="bg-white border border-amber-200 rounded-lg p-2 shadow-sm text-sm leading-snug"
          >
            <div className="text-[10px] text-amber-700 uppercase tracking-wide mb-1">
              {m.action === 'help' ? 'Help' : m.action === 'start' ? 'Welcome' : 'New question'}
            </div>
            {m.text}
            <button
              onClick={() => speak(m.text)}
              className="ml-2 text-xs text-blue-700 underline"
              type="button"
            >
              🔊
            </button>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="p-2 bg-amber-100 border-t border-amber-300 flex gap-2">
        <button
          onClick={onNext}
          disabled={busy}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm py-1.5 rounded"
        >
          {busy ? '…' : '💬 New question'}
        </button>
        <button
          onClick={onHelp}
          disabled={busy}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm py-1.5 rounded"
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
