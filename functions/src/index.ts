import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { AccessToken } from 'livekit-server-sdk';
import { ImageAnnotatorClient } from '@google-cloud/vision';

initializeApp();

const LIVEKIT_API_KEY = defineSecret('LIVEKIT_API_KEY');
const LIVEKIT_API_SECRET = defineSecret('LIVEKIT_API_SECRET');
const TEACHER_PASSCODE = defineSecret('TEACHER_PASSCODE');
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

const SESSION_RE = /^[A-Z0-9-]{3,16}$/;
// Both classic Private Areas (pa-*) and auto-matched 1:1 pair rooms (pair-*)
// share the same token issuer. Each prefix is its own privacy boundary.
const ROOM_RE = /^(pa|pair)-[a-z0-9-]+$/;

/* ─────────────────────────  LiveKit token  ───────────────────────── */

export const mintLiveKitToken = onCall(
  { secrets: [LIVEKIT_API_KEY, LIVEKIT_API_SECRET], region: 'us-central1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    const { sessionCode, paId, identity, name } = req.data as {
      sessionCode?: string;
      paId?: string;
      identity?: string;
      name?: string;
    };
    if (!sessionCode || !paId || !identity) {
      throw new HttpsError('invalid-argument', 'sessionCode + paId + identity required.');
    }
    if (!SESSION_RE.test(sessionCode)) throw new HttpsError('invalid-argument', 'Bad sessionCode.');
    if (!ROOM_RE.test(paId)) throw new HttpsError('invalid-argument', 'Bad paId.');

    const snap = await getFirestore().doc(`sessions/${sessionCode}`).get();
    if (!snap.exists || snap.data()?.active !== true) {
      throw new HttpsError('failed-precondition', 'Session is not open.');
    }

    const roomName = `${sessionCode}__${paId}`;
    const at = new AccessToken(LIVEKIT_API_KEY.value(), LIVEKIT_API_SECRET.value(), {
      identity,
      name: name?.slice(0, 32) ?? identity,
      ttl: 60 * 60,
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return { token: await at.toJwt() };
  },
);

/* ─────────────────────────  Image moderation  ───────────────────────── */

export const moderateUploadedImage = onObjectFinalized(
  { region: 'us-central1' },
  async (event) => {
    const { bucket, name, contentType } = event.data;
    if (!name?.startsWith('presentations/')) return;
    if (!contentType?.startsWith('image/')) return;

    const parts = name.split('/');
    if (parts.length < 4) return;
    const [, sessionCode, objectId] = parts;
    if (!SESSION_RE.test(sessionCode)) return;

    const vision = new ImageAnnotatorClient();
    const [result] = await vision.safeSearchDetection(`gs://${bucket}/${name}`);
    const ss = result.safeSearchAnnotation ?? {};
    const blockLevels = new Set(['LIKELY', 'VERY_LIKELY']);
    const rejected =
      blockLevels.has(String(ss.adult)) ||
      blockLevels.has(String(ss.violence)) ||
      blockLevels.has(String(ss.racy));

    await getFirestore()
      .doc(`sessions/${sessionCode}/objects/${objectId}`)
      .set(
        {
          status: rejected ? 'rejected' : 'approved',
          safeSearch: {
            adult: ss.adult ?? 'UNKNOWN',
            violence: ss.violence ?? 'UNKNOWN',
            racy: ss.racy ?? 'UNKNOWN',
          },
          moderatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  },
);

/* ─────────────────────────  Teacher admin  ───────────────────────── */

function checkTeacher(passcode: string | undefined) {
  const expected = TEACHER_PASSCODE.value();
  if (!expected) throw new HttpsError('failed-precondition', 'Teacher passcode not configured.');
  if (passcode !== expected) throw new HttpsError('permission-denied', 'Wrong teacher passcode.');
}

export const createSession = onCall(
  { secrets: [TEACHER_PASSCODE], region: 'us-central1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    const { code, title, mode, passcode } = req.data as {
      code?: string;
      title?: string;
      mode?: 'free' | 'match';
      passcode?: string;
    };
    checkTeacher(passcode);
    if (!code || !SESSION_RE.test(code)) {
      throw new HttpsError('invalid-argument', 'Bad code (use 3–16 of A–Z 0–9 -).');
    }
    const m = mode === 'match' ? 'match' : 'free';
    const ref = getFirestore().doc(`sessions/${code}`);
    const existing = await ref.get();
    if (existing.exists) throw new HttpsError('already-exists', 'Code is already in use.');
    await ref.set({
      title: (title ?? code).slice(0, 80),
      active: true,
      mode: m,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: req.auth.uid,
    });
    return { ok: true };
  },
);

export const setSessionActive = onCall(
  { secrets: [TEACHER_PASSCODE], region: 'us-central1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    const { code, active, passcode } = req.data as {
      code?: string;
      active?: boolean;
      passcode?: string;
    };
    checkTeacher(passcode);
    if (!code || !SESSION_RE.test(code)) throw new HttpsError('invalid-argument', 'Bad code.');
    await getFirestore().doc(`sessions/${code}`).update({ active: !!active });
    return { ok: true };
  },
);

export const moderateObject = onCall(
  { secrets: [TEACHER_PASSCODE], region: 'us-central1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    const { code, objectId, status, passcode } = req.data as {
      code?: string;
      objectId?: string;
      status?: 'approved' | 'rejected';
      passcode?: string;
    };
    checkTeacher(passcode);
    if (!code || !SESSION_RE.test(code) || !objectId) {
      throw new HttpsError('invalid-argument', 'Bad input.');
    }
    if (status !== 'approved' && status !== 'rejected') {
      throw new HttpsError('invalid-argument', 'Bad status.');
    }
    await getFirestore().doc(`sessions/${code}/objects/${objectId}`).set(
      { status, moderatedAt: FieldValue.serverTimestamp(), moderatedBy: req.auth.uid },
      { merge: true },
    );
    return { ok: true };
  },
);

/* ─────────────────────────  Auto matchmaker  ─────────────────────────
 *
 * Trigger on every new queue entry. Inside a transaction we look at the
 * other waiting entry from the opposite country group and (if found)
 * mark both as `paired` with a shared pairId. The client listener on the
 * queue doc kicks the student into the LiveKit pair room as soon as the
 * status flips.
 *
 * Why server-side: makes the "first KR pairs with first INTL" guarantee
 * race-free, prevents two students stealing the same partner.
 */
export const matchPlayers = onDocumentCreated(
  { document: 'sessions/{code}/queue/{uid}', region: 'us-central1' },
  async (event) => {
    const code = event.params.code as string;
    const newUid = event.params.uid as string;
    const newSnap = event.data;
    if (!newSnap) return;
    const newData = newSnap.data();
    if (newData.status !== 'waiting') return;

    const db = getFirestore();
    const myCountry = newData.country as 'KR' | 'INTL';
    const otherCountry = myCountry === 'KR' ? 'INTL' : 'KR';

    const otherQuery = await db
      .collection(`sessions/${code}/queue`)
      .where('country', '==', otherCountry)
      .where('status', '==', 'waiting')
      .orderBy('joinedAt', 'asc')
      .limit(5)
      .get();

    if (otherQuery.empty) return;

    // Prefer the partner whose topic matches mine; otherwise oldest waiter.
    const mine = newData.topic ?? '';
    const sorted = otherQuery.docs.sort((a, b) => {
      const at = (a.data().topic ?? '') === mine ? 0 : 1;
      const bt = (b.data().topic ?? '') === mine ? 0 : 1;
      return at - bt;
    });
    const partner = sorted[0];
    const partnerUid = partner.id;

    const pairId = db.collection('_ids').doc().id.slice(0, 10).toLowerCase();
    const pairRoomId = `pair-${pairId}`;
    const pairRef = db.doc(`sessions/${code}/pairs/${pairId}`);
    const myRef = db.doc(`sessions/${code}/queue/${newUid}`);
    const partnerRef = db.doc(`sessions/${code}/queue/${partnerUid}`);

    await db.runTransaction(async (tx) => {
      const mySnap = await tx.get(myRef);
      const pSnap = await tx.get(partnerRef);
      if (!mySnap.exists || !pSnap.exists) return;
      if (mySnap.data()?.status !== 'waiting' || pSnap.data()?.status !== 'waiting') return;

      tx.set(pairRef, {
        roomId: pairRoomId,
        members: [
          { uid: newUid, name: newData.name, country: myCountry, topic: newData.topic ?? null },
          {
            uid: partnerUid,
            name: partner.data().name,
            country: otherCountry,
            topic: partner.data().topic ?? null,
          },
        ],
        topic: newData.topic ?? partner.data().topic ?? null,
        status: 'active',
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(myRef, { status: 'paired', pairId, pairRoomId });
      tx.update(partnerRef, { status: 'paired', pairId, pairRoomId });
    });
  },
);

/* ─────────────────────────  AI facilitator  ─────────────────────────
 *
 * The facilitator is a GPT-4o-mini bot that drops short coaching prompts
 * into a pair room. Each call appends one new message to
 * sessions/{code}/pairs/{pairId}/facilitatorMessages so every member sees
 * it instantly through onSnapshot.
 *
 * Action types:
 *   - "start"   first prompt right after the pair forms
 *   - "next"    student presses "Give us a new topic"
 *   - "help"    student presses "I'm stuck — help me say it"
 */
export const facilitatorTurn = onCall(
  { secrets: [OPENAI_API_KEY], region: 'us-central1', timeoutSeconds: 30 },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    const { code, pairId, action, lastUtterance } = req.data as {
      code?: string;
      pairId?: string;
      action?: 'start' | 'next' | 'help';
      lastUtterance?: string;
    };
    if (!code || !pairId || !action) throw new HttpsError('invalid-argument', 'Bad input.');
    if (!SESSION_RE.test(code)) throw new HttpsError('invalid-argument', 'Bad code.');

    const db = getFirestore();
    const pairSnap = await db.doc(`sessions/${code}/pairs/${pairId}`).get();
    if (!pairSnap.exists) throw new HttpsError('not-found', 'Pair not found.');
    const pair = pairSnap.data()!;
    const members = pair.members as Array<{ name: string; country: string; topic?: string | null }>;

    const memberLine = members
      .map((m) => `${m.name} (${m.country === 'KR' ? 'Korean student' : 'International student'})`)
      .join(' and ');

    const sharedTopic =
      pair.topic ?? members.map((m) => m.topic).find(Boolean) ?? 'school life';

    const system = [
      'You are a friendly English-conversation facilitator for elementary-school students (ages 10–13).',
      'You are speaking to a Korean student paired with an overseas student.',
      'Keep every response under 35 English words, simple A2-level vocabulary, encouraging tone.',
      'Never reveal you are an AI. Speak as a kind classroom teacher.',
      'Always end with one clear, easy question that BOTH students can answer in turn.',
    ].join(' ');

    let userPrompt = '';
    if (action === 'start') {
      userPrompt = `Introduce yourself in one short sentence, then give ${memberLine} a friendly opening question about "${sharedTopic}".`;
    } else if (action === 'next') {
      userPrompt = `Give ${memberLine} a fresh, fun follow-up question about "${sharedTopic}" or a related daily-life topic. Vary from previous questions.`;
    } else {
      const stuck = (lastUtterance ?? '').slice(0, 200);
      userPrompt = `A student is stuck. They were trying to say: "${stuck}". Help them with one short English sentence they can copy, then ask them to repeat it together.`;
    }

    const apiKey = OPENAI_API_KEY.value();
    if (!apiKey) throw new HttpsError('failed-precondition', 'OPENAI_API_KEY not set.');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.8,
        max_tokens: 120,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new HttpsError('internal', `OpenAI failed: ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? '';

    await db
      .collection(`sessions/${code}/pairs/${pairId}/facilitatorMessages`)
      .add({
        role: 'facilitator',
        text,
        action,
        ts: FieldValue.serverTimestamp(),
      });
    return { ok: true, text };
  },
);

/* ─────────────────────────  Pair lifecycle  ───────────────────────── */

export const endPair = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { code, pairId, requeue } = req.data as {
    code?: string;
    pairId?: string;
    requeue?: boolean;
  };
  if (!code || !pairId) throw new HttpsError('invalid-argument', 'Bad input.');
  if (!SESSION_RE.test(code)) throw new HttpsError('invalid-argument', 'Bad code.');

  const db = getFirestore();
  const pairRef = db.doc(`sessions/${code}/pairs/${pairId}`);
  const pairSnap = await pairRef.get();
  if (!pairSnap.exists) return { ok: true };
  const members = (pairSnap.data()?.members ?? []) as Array<{ uid: string; name: string; country: string; topic?: string | null }>;

  await pairRef.update({ status: 'ended', endedAt: FieldValue.serverTimestamp() });

  if (requeue) {
    // Put both students back in the queue so the matchmaker pairs them with
    // someone new on the next pass.
    for (const m of members) {
      await db.doc(`sessions/${code}/queue/${m.uid}`).set(
        {
          name: m.name,
          country: m.country,
          topic: m.topic ?? null,
          status: 'waiting',
          pairId: FieldValue.delete(),
          pairRoomId: FieldValue.delete(),
          joinedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  } else {
    for (const m of members) {
      await db.doc(`sessions/${code}/queue/${m.uid}`).delete();
    }
  }
  return { ok: true };
});
