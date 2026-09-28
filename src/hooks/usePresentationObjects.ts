import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface SlotState {
  type: 'image' | 'slides';
  imageUrl: string | null;
  slidesUrl: string | null;
  ownerName: string | null;
  status: 'empty' | 'pending' | 'approved' | 'rejected';
  updatedAt: number | null;
}

/**
 * Streams every presentation object's current state for the given session.
 * Firestore listener pushes updates the moment any student finishes uploading
 * — every other student in the room sees the new image without refresh.
 */
export function usePresentationObjects(sessionCode: string) {
  const [slots, setSlots] = useState<Record<string, SlotState>>({});

  useEffect(() => {
    const q = query(
      collection(db, 'sessions', sessionCode, 'objects'),
      where('status', 'in', ['pending', 'approved', 'rejected']),
    );
    const unsub = onSnapshot(q, (snap) => {
      const next: Record<string, SlotState> = {};
      snap.forEach((doc) => {
        const d = doc.data();
        next[doc.id] = {
          type: d.type === 'slides' ? 'slides' : 'image',
          imageUrl: d.imageUrl ?? null,
          slidesUrl: d.slidesUrl ?? null,
          ownerName: d.ownerName ?? null,
          status: d.status ?? 'empty',
          updatedAt: d.updatedAt?.toMillis?.() ?? null,
        };
      });
      setSlots(next);
    });
    return unsub;
  }, [sessionCode]);

  return slots;
}
