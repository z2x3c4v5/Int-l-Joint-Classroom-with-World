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

export interface FacilitatorMessage {
  id: string;
  text: string;
  action: 'start' | 'next' | 'help';
  ts: number | null;
}

/**
 * Subscribes to facilitator messages for a pair, and exposes typed helpers to
 * trigger the next "coach" turn. Designed so the UI can show a chat-style
 * panel that everyone in the pair sees identically.
 */
export function useFacilitator(sessionCode: string, pairId: string | null) {
  const [messages, setMessages] = useState<FacilitatorMessage[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pairId) return;
    const q = query(
      collection(db, 'sessions', sessionCode, 'pairs', pairId, 'facilitatorMessages'),
      orderBy('ts', 'asc'),
      limit(50),
    );
    return onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            text: v.text ?? '',
            action: (v.action ?? 'next') as FacilitatorMessage['action'],
            ts: v.ts?.toMillis?.() ?? null,
          };
        }),
      );
    });
  }, [sessionCode, pairId]);

  async function trigger(action: 'start' | 'next' | 'help', lastUtterance?: string) {
    if (!pairId || busy) return;
    setBusy(true);
    try {
      await httpsCallable(functions, 'facilitatorTurn')({
        code: sessionCode,
        pairId,
        action,
        lastUtterance: lastUtterance ?? '',
      });
    } finally {
      setBusy(false);
    }
  }

  return { messages, busy, trigger };
}
