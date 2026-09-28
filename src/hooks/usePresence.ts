import { useEffect, useRef, useState } from 'react';
import { ref, onValue, onDisconnect, set, serverTimestamp, off } from 'firebase/database';
import { rtdb, auth } from '../lib/firebase';
import { SPAWN } from '../lib/mapConfig';
import { decodeLook } from '../game/sprites';
import type { WorldPlayer } from '../game/GameWorld';
import type { Dir } from '../game/sprites';

export interface MyPresence {
  x: number;
  y: number;
  paId: string | null;
  dir: Dir;
  mv: boolean;
  emo?: string | null;
  emoTs?: number | null;
}

const DIRS: Dir[] = ['down', 'up', 'left', 'right'];
const EMOJIS = new Set(['👋', '😀', '👍', '❤️', '🎉', '❓', '😂', '👏']);

/** Other players' data is untrusted: whitelist and clamp every field. */
function sanitize(uid: string, raw: unknown): WorldPlayer | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(5000, n)) : null);
  const x = num(v.x);
  const y = num(v.y);
  if (x === null || y === null) return null;
  const name = typeof v.name === 'string' ? v.name.slice(0, 16) : 'Student';
  return {
    id: uid,
    name,
    x,
    y,
    dir: DIRS.includes(v.dir as Dir) ? (v.dir as Dir) : 'down',
    moving: v.mv === true,
    look: decodeLook(v.look, name),
    paId: typeof v.paId === 'string' && /^pa-[a-z0-9-]+$/.test(v.paId) ? v.paId : null,
    emo: typeof v.emo === 'string' && EMOJIS.has(v.emo) ? v.emo : undefined,
    emoTs: typeof v.emoTs === 'number' ? v.emoTs : undefined,
  };
}

/**
 * Streams every avatar for a session through RTDB. Local writes are
 * throttled (≈12 Hz) with a trailing flush so the final position — which the
 * room AI tutor relies on — always lands.
 */
export function usePresence(sessionCode: string, myName: string, myLook: string) {
  const [others, setOthers] = useState<Record<string, WorldPlayer>>({});
  const lastWriteRef = useRef(0);
  const trailingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localRef = useRef<MyPresence>({ x: SPAWN.x, y: SPAWN.y, paId: null, dir: 'down', mv: false });

  function flush() {
    trailingRef.current = null;
    lastWriteRef.current = performance.now();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const l = localRef.current;
    set(ref(rtdb, `rooms/${sessionCode}/players/${uid}`), {
      uid,
      name: myName,
      look: myLook,
      x: l.x,
      y: l.y,
      paId: l.paId,
      dir: l.dir,
      mv: l.mv,
      emo: l.emo ?? null,
      emoTs: l.emoTs ?? null,
      ts: serverTimestamp(),
    }).catch(console.error);
  }

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const myRef = ref(rtdb, `rooms/${sessionCode}/players/${uid}`);
    onDisconnect(myRef).remove();
    flush();

    const allRef = ref(rtdb, `rooms/${sessionCode}/players`);
    const unsub = onValue(allRef, (snap) => {
      const data = (snap.val() ?? {}) as Record<string, unknown>;
      const next: Record<string, WorldPlayer> = {};
      for (const [id, raw] of Object.entries(data)) {
        if (id === uid) continue;
        const p = sanitize(id, raw);
        if (p) next[id] = p;
      }
      setOthers(next);
    });

    return () => {
      if (trailingRef.current) clearTimeout(trailingRef.current);
      off(allRef);
      unsub();
      set(myRef, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCode, myName, myLook]);

  /** Merge a change into my presence and publish it (throttled). */
  function publish(patch: Partial<MyPresence>, immediate = false) {
    localRef.current = { ...localRef.current, ...patch };
    if (trailingRef.current) clearTimeout(trailingRef.current);
    const wait = 80 - (performance.now() - lastWriteRef.current);
    if (wait > 0 && !immediate) {
      trailingRef.current = setTimeout(flush, wait);
      return;
    }
    flush();
  }

  return { others, publish };
}
