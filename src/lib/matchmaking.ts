import { doc, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export type Country = 'KR' | 'INTL';

export interface QueueEntry {
  uid: string;
  name: string;
  country: Country;
  topic: string | null;
  status: 'waiting' | 'paired';
  pairId?: string;
  pairRoomId?: string;
}

export async function enqueueForMatch(
  sessionCode: string,
  payload: { name: string; country: Country; topic: string },
) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  await setDoc(doc(db, 'sessions', sessionCode, 'queue', uid), {
    name: payload.name.slice(0, 16),
    country: payload.country,
    topic: payload.topic.slice(0, 40) || null,
    status: 'waiting',
    joinedAt: serverTimestamp(),
  });
}

export async function dequeue(sessionCode: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await deleteDoc(doc(db, 'sessions', sessionCode, 'queue', uid));
}
