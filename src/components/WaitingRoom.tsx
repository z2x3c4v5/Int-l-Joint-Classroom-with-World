import { useEffect, useState } from 'react';
import { dequeue } from '../lib/matchmaking';
import { LangToggle, useI18n } from '../lib/i18n';

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
  const { t } = useI18n();

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function handleCancel() {
    await dequeue(sessionCode);
    onCancel();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-slate-800">
      <LangToggle className="absolute top-4 right-4" />
      <div className="max-w-md w-full bg-white p-8 rounded-[28px] shadow-2xl text-center space-y-4">
        <div className="text-6xl animate-bounce">🔎</div>
        <h2 className="text-2xl font-extrabold">{t('wait.title')}</h2>
        <p className="text-slate-500 text-sm">
          {myCountry === 'KR' ? t('wait.kr') : t('wait.intl')}
          {myTopic && <> {t('wait.topic', { topic: myTopic })}</>}
        </p>
        <div className="text-4xl font-mono font-bold text-indigo-600">{formatSeconds(seconds)}</div>
        <div className="text-xs text-slate-400">
          {sessionTitle} <span className="font-mono ml-1">[{sessionCode}]</span>
          <br />
          {myName} ({myCountry === 'KR' ? t('entry.korea') : t('entry.overseas')})
        </div>
        <button
          onClick={handleCancel}
          className="mt-2 bg-slate-100 hover:bg-slate-200 px-5 py-2.5 rounded-2xl text-sm font-bold"
        >
          {t('wait.cancel')}
        </button>
        <p className="text-[11px] text-slate-400 leading-relaxed">{t('wait.note')}</p>
      </div>
    </div>
  );
}

function formatSeconds(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}
