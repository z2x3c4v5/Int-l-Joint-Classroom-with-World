import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export interface QueueState {
  status: 'idle' | 'waiting' | 'paired';
  pairId: string | null;
  pairRoomId: string | null;
}

/**
 * Listens to the current user's queue document. As soon as the matchmaker
 * Function flips status to "paired" and writes pairId, the client component
 * gets the signal and can jump into the LiveKit pair room.
 */
export function useMatchQueue(sessionCode: string): QueueState {
  const [state, setState] = useState<QueueState>({ status: 'idle', pairId: null, pairRoomId: null });

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const ref = doc(db, 'sessions', sessionCode, 'queue', uid);
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setState({ status: 'idle', pairId: null, pairRoomId: null });
        return;
      }
      const d = snap.data();
      setState({
        status: d.status === 'paired' ? 'paired' : 'waiting',
        pairId: d.pairId ?? null,
        pairRoomId: d.pairRoomId ?? null,
      });
    });
  }, [sessionCode]);

  return state;
}
