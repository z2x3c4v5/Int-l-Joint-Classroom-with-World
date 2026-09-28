import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useI18n } from '../lib/i18n';

export type TutorAction = 'start' | 'next' | 'help' | 'feedback';

export interface FacilitatorMessage {
  id: string;
  text: string;
  action: TutorAction;
  ts: number | null;
  /** For feedback: what speech-to-text heard, and who spoke. */
  heard?: string;
  speaker?: string;
}

export interface TutorExtra {
  lastUtterance?: string;
  transcript?: string;
}

export function parseTutorMessage(id: string, v: Record<string, unknown>): FacilitatorMessage {
  const ts = v.ts as { toMillis?: () => number } | undefined;
  return {
    id,
    text: typeof v.text === 'string' ? v.text : '',
    action: (['start', 'next', 'help', 'feedback'].includes(v.action as string) ? v.action : 'next') as TutorAction,
    ts: ts?.toMillis?.() ?? null,
    heard: typeof v.heard === 'string' ? v.heard : undefined,
    speaker: typeof v.speaker === 'string' ? v.speaker : undefined,
  };
}

/**
 * Subscribes to facilitator messages for a pair, and exposes typed helpers to
 * trigger the next "coach" turn. Designed so the UI can show a chat-style
 * panel that everyone in the pair sees identically.
 */
export function useFacilitator(sessionCode: string, pairId: string | null) {
  const [messages, setMessages] = useState<FacilitatorMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const { lang } = useI18n();

  useEffect(() => {
    if (!pairId) return;
    const q = query(
      collection(db, 'sessions', sessionCode, 'pairs', pairId, 'facilitatorMessages'),
      orderBy('ts', 'asc'),
      limit(50),
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => parseTutorMessage(d.id, d.data())));
    });
  }, [sessionCode, pairId]);

  async function trigger(action: TutorAction, extra: TutorExtra = {}) {
    if (!pairId || busy) return;
    setBusy(true);
    try {
      await httpsCallable(functions, 'facilitatorTurn')({
        code: sessionCode,
        pairId,
        action,
        lang,
        lastUtterance: extra.lastUtterance ?? '',
        transcript: extra.transcript ?? '',
      });
    } finally {
      setBusy(false);
    }
  }

  return { messages, busy, trigger };
}
