import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export type SessionMode = 'free' | 'match';

export interface SessionDoc {
  code: string;
  title: string;
  active: boolean;
  mode: SessionMode;
  createdAt: number | null;
}

const CODE_RE = /^[A-Z0-9-]{3,16}$/;

export function isValidSessionCode(code: string): boolean {
  return CODE_RE.test(code);
}

export function normaliseSessionCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '-');
}

export async function fetchSession(code: string): Promise<SessionDoc | null> {
  const snap = await getDoc(doc(db, 'sessions', code));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    code,
    title: data.title ?? code,
    active: data.active === true,
    mode: data.mode === 'match' ? 'match' : 'free',
    createdAt: data.createdAt?.toMillis?.() ?? null,
  };
}
