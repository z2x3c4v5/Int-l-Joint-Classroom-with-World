import { useEffect, useRef, useState } from 'react';
import type { FacilitatorMessage } from '../hooks/useFacilitator';
import { useI18n, type StringKey } from '../lib/i18n';

interface Props {
  messages: FacilitatorMessage[];
  busy: boolean;
  auto: boolean;
  onToggleAuto: () => void;
  onNext: () => void;
  onHelp: () => void;
  /** A student finished a short talk; the tutor gives feedback on it. */
  onFeedback: (transcript: string) => void;
  onClose?: () => void;
}

/**
 * The AI tutor card. It leads the conversation on its own, answers "help",
 * and LISTENS: "My talk" turns on the browser's speech recognition, and when
 * the student stops, the transcript goes to the tutor for feedback.
 */
export default function FacilitatorPanel({ messages, busy, auto, onToggleAuto, onNext, onHelp, onFeedback, onClose }: Props) {
  const { t } = useI18n();
  const endRef = useRef<HTMLDivElement>(null);
  const talk = useSpeechToText();
  const [typed, setTyped] = useState('');

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, talk.text]);

  // Read each brand-new tutor line aloud so students hear it.
  const lastSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (latest && latest.id !== lastSpokenRef.current) {
      lastSpokenRef.current = latest.id;
      speak(latest.text);
    }
  }, [messages]);

  function finishTalk() {
    const text = talk.stop();
    if (text.trim().length >= 3) onFeedback(text.trim());
  }

  const tag = (a: FacilitatorMessage['action']) => t(`tutor.tag.${a}` as StringKey);

  return (
    <div className="flex flex-col h-full bg-white text-slate-800 rounded-2xl overflow-hidden">
      <div className="px-3 py-2.5 bg-gradient-to-r from-amber-400 to-orange-400 text-amber-950 flex items-center justify-between">
        <div className="flex items-center gap-2 font-extrabold">
          <span className="text-2xl leading-none">🦉</span> {t('tutor.title')}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleAuto}
            className={`text-[11px] px-2.5 py-1 rounded-full font-bold transition ${
              auto ? 'bg-white text-emerald-600' : 'bg-amber-900/20 text-amber-950'
            }`}
            title={t('tutor.autoTip')}
          >
            {auto ? t('tutor.auto') : t('tutor.manual')}
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="w-7 h-7 rounded-full hover:bg-white/40 font-bold" title={t('common.close')}>
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-amber-50/60">
        {messages.length === 0 && <p className="text-slate-500 text-xs">{t('tutor.ready')}</p>}
        {messages.map((m) => (
          <div key={m.id} className="bg-white border border-amber-100 rounded-2xl p-3 shadow-sm text-sm leading-relaxed">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wide font-extrabold text-orange-500">{tag(m.action)}</span>
              <button
                onClick={() => speak(m.text)}
                className="text-xs text-slate-400 hover:text-orange-500"
                type="button"
                title={t('tutor.readAloud')}
              >
                🔊
              </button>
            </div>
            {m.heard && (
              <div className="mb-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-2.5 py-1.5 italic">
                <span className="not-italic font-bold text-slate-600">
                  {t('tutor.heard')}
                  {m.speaker ? ` (${m.speaker})` : ''}:
                </span>{' '}
                “{m.heard}”
              </div>
            )}
            <div className="whitespace-pre-line">{m.text}</div>
          </div>
        ))}
        {talk.listening && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-sm">
            <div className="flex items-center gap-2 text-rose-600 font-bold text-xs mb-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" /> {t('tutor.listening')}
            </div>
            <div className="text-slate-700">{talk.text || '…'}</div>
          </div>
        )}
        {busy && <p className="text-orange-500 text-xs animate-pulse">{t('tutor.thinking')}</p>}
        <div ref={endRef} />
      </div>

      {!talk.supported && talk.tried && (
        <form
          className="p-2 border-t border-slate-100 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim().length >= 3) {
              onFeedback(typed.trim());
              setTyped('');
            }
          }}
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t('tutor.typePh')}
            className="flex-1 px-3 py-2 rounded-xl bg-slate-100 text-sm outline-none focus:ring-2 ring-orange-300"
          />
          <button className="px-3 rounded-xl bg-orange-500 text-white text-sm font-bold">{t('tutor.send')}</button>
        </form>
      )}
      {!talk.supported && talk.tried && <p className="px-3 pb-1 text-[11px] text-slate-400">{t('tutor.noSpeech')}</p>}

      <div className="p-2 border-t border-slate-100 grid grid-cols-3 gap-1.5">
        <button
          onClick={onNext}
          disabled={busy || talk.listening}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-xl"
        >
          {t('tutor.next')}
        </button>
        <button
          onClick={onHelp}
          disabled={busy || talk.listening}
          className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-xl"
        >
          {t('tutor.help')}
        </button>
        {talk.listening ? (
          <button onClick={finishTalk} className="bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold py-2.5 rounded-xl">
            {t('tutor.stop')}
          </button>
        ) : (
          <button
            onClick={talk.start}
            disabled={busy}
            className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-xl"
          >
            {t('tutor.talk')}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Browser speech-to-text (Chrome / Edge / Safari). Free, runs locally. ── */

interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function useSpeechToText() {
  const Ctor =
    typeof window !== 'undefined'
      ? ((window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec })
          .SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition)
      : undefined;
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const finalRef = useRef('');
  const wantRef = useRef(false);

  function start() {
    setTried(true);
    if (!Ctor) return;
    finalRef.current = '';
    setText('');
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += `${r[0].transcript} `;
        else interim += r[0].transcript;
      }
      setText((finalRef.current + interim).trim());
    };
    // Browsers stop after a pause; keep listening until the student presses stop.
    rec.onend = () => {
      if (wantRef.current) {
        try {
          rec.start();
        } catch {
          setListening(false);
        }
      } else setListening(false);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantRef.current = false;
        setListening(false);
      }
    };
    recRef.current = rec;
    wantRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  function stop(): string {
    wantRef.current = false;
    recRef.current?.stop();
    setListening(false);
    return text || finalRef.current;
  }

  useEffect(() => () => {
    wantRef.current = false;
    recRef.current?.stop();
  }, []);

  return { supported: !!Ctor, listening, text, tried, start, stop };
}

function speak(text: string) {
  try {
    // Read the English only: skip Korean hint lines and emoji markers.
    const english = text
      .split('\n')
      .filter((l) => !l.trim().startsWith('💡'))
      .join(' ')
      .replace(/[⭐✏️❓→]/gu, ' ');
    const u = new SpeechSynthesisUtterance(english);
    u.lang = 'en-US';
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // noop
  }
}
