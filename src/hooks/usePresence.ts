import { useEffect, useRef, useState } from 'react';
import {
  ref,
  onValue,
  onDisconnect,
  set,
  serverTimestamp,
  off,
} from 'firebase/database';
import { rtdb, auth } from '../lib/firebase';
import { SPAWN } from '../lib/mapConfig';

export interface RemotePresence {
  uid: string;
  name: string;
  x: number;
  y: number;
  paId: string | null;
  ts: number;
}

/**
 * Streams every avatar's position for a given session. Local writes are
 * throttled so RTDB doesn't get hammered — 12 Hz is smooth enough for 70
 * students and well inside the free tier.
 */
export function usePresence(sessionCode: string, myName: string) {
  const [others, setOthers] = useState<Record<string, RemotePresence>>({});
  const lastWriteRef = useRef(0);
  const localRef = useRef<{ x: number; y: number; paId: string | null }>({
    x: SPAWN.x,
    y: SPAWN.y,
    paId: null,
  });

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const myRef = ref(rtdb, `rooms/${sessionCode}/players/${uid}`);
    onDisconnect(myRef).remove();
    set(myRef, {
      uid,
      name: myName,
      x: localRef.current.x,
      y: localRef.current.y,
      paId: null,
      ts: serverTimestamp(),
    });

    const allRef = ref(rtdb, `rooms/${sessionCode}/players`);
    const unsub = onValue(allRef, (snap) => {
      const data = (snap.val() ?? {}) as Record<string, RemotePresence>;
      delete data[uid];
      setOthers(data);
    });

    return () => {
      off(allRef);
      unsub();
      set(myRef, null);
    };
  }, [sessionCode, myName]);

  function publishPosition(x: number, y: number, paId: string | null) {
    localRef.current = { x, y, paId };
    const now = performance.now();
    if (now - lastWriteRef.current < 80) return;
    lastWriteRef.current = now;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    set(ref(rtdb, `rooms/${sessionCode}/players/${uid}`), {
      uid,
      name: myName,
      x,
      y,
      paId,
      ts: serverTimestamp(),
    });
  }

  return { others, publishPosition };
}
