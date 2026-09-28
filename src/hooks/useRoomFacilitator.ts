import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { parseTutorMessage, type FacilitatorMessage, type TutorAction, type TutorExtra } from './useFacilitator';
import { useI18n } from '../lib/i18n';

/**
 * AI tutor feed for a free-mode Private Area. Messages are tagged with the
 * pairKey (sorted uids) of the duo they were written for, so only the
 * current pair's conversation is shown. Pass pairKey = null to go idle.
 */
export function useRoomFacilitator(sessionCode: string, paId: string | null, pairKey: string | null) {
  const [all, setAll] = useState<(FacilitatorMessage & { pairKey: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const { lang } = useI18n();

  useEffect(() => {
    setAll([]);
    if (!paId || !pairKey) return;
    // The room's feed spans every duo in the session, so take the NEWEST
    // lines (desc) and flip them back into reading order.
    const q = query(
      collection(db, 'sessions', sessionCode, 'rooms', paId, 'facilitatorMessages'),
      orderBy('ts', 'desc'),
      limit(40),
    );
    return onSnapshot(q, (snap) => {
      setAll(
        [...snap.docs].reverse().map((d) => {
          const v = d.data();
          return { ...parseTutorMessage(d.id, v), pairKey: typeof v.pairKey === 'string' ? v.pairKey : '' };
        }),
      );
    });
  }, [sessionCode, paId, pairKey]);

  const messages = all.filter((m) => m.pairKey === pairKey);

  async function trigger(action: TutorAction, extra: TutorExtra = {}) {
    if (!paId || !pairKey || busy) return;
    setBusy(true);
    try {
      await httpsCallable(functions, 'roomFacilitatorTurn')({
        code: sessionCode,
        paId,
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
