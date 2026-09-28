import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
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
  // Storage triggers must run in the bucket's own region.
  { region: 'us-east1' },
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

/* ─────────────────────────  AI tutor (shared)  ─────────────────────────
 *
 * One GPT-4o-mini "teacher" used by both the 1:1 match rooms and the desk
 * pods of the school map. Actions:
 *   - "start"     greet a new pair with a first question
 *   - "next"      a fresh follow-up question
 *   - "help"      a student is stuck → one sentence they can copy
 *   - "feedback"  a student gave a short talk (browser speech-to-text):
 *                 praise, fix 1–2 mistakes, ask the partner a follow-up
 * lang = 'ko' adds a short Korean hint to help/feedback so beginners follow.
 */
type TutorAction = 'start' | 'next' | 'help' | 'feedback';
const TUTOR_ACTIONS: TutorAction[] = ['start', 'next', 'help', 'feedback'];

interface TutorInput {
  action: TutorAction;
  names: string;
  context: string;
  theme: string;
  lastUtterance?: string;
  transcript?: string;
  speaker?: string;
  lang: 'ko' | 'en';
  history?: string;
}

async function askTutor(input: TutorInput): Promise<string> {
  const system = [
    'You are a warm English-conversation teacher for elementary-school students (ages 10–13, A1–A2 level).',
    input.context,
    `Practice focus: ${input.theme}.`,
    'Use simple words and short sentences. Never reveal you are an AI; speak as a kind classroom teacher.',
    'Address the students by name and make them take turns.',
    input.action === 'feedback'
      ? 'For feedback: at most 70 English words.'
      : 'Keep every response under 40 English words and end with one clear, easy question.',
    input.lang === 'ko' && (input.action === 'help' || input.action === 'feedback')
      ? 'After the English, add ONE short line starting with "💡" in Korean that explains the key point for a Korean child.'
      : 'Reply in English only.',
  ].join(' ');

  let user: string;
  switch (input.action) {
    case 'start':
      user = `Greet ${input.names} in one short sentence, then ask a first easy question about the practice focus. Say who answers first.`;
      break;
    case 'next':
      user = 'Keep the conversation going with a fresh follow-up question. Let the other student answer first this time.';
      break;
    case 'help': {
      const stuck = (input.lastUtterance ?? '').slice(0, 200);
      user = stuck
        ? `A student is stuck. They were trying to say: "${stuck}". Give one short sentence they can copy, then ask them to say it.`
        : 'A student is stuck on the last question. Give one short example answer they can copy, then ask them to try.';
      break;
    }
    case 'feedback': {
      const talk = (input.transcript ?? '').slice(0, 1500);
      user = [
        `${input.speaker ?? 'A student'} just gave a short talk in English. Speech-to-text heard:`,
        `"""${talk}"""`,
        'Reply in this shape (plain text, no markdown headings):',
        '⭐ one specific praise about the content.',
        '✏️ up to two corrections as: "wrong" → "better" (skip if there are none; ignore speech-to-text noise).',
        `❓ one follow-up question for the OTHER student to ask or answer about the talk.`,
      ].join('\n');
      break;
    }
  }
  if (input.history) user += `\n\nYour previous lines to them (do not repeat):\n${input.history}`;

  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) throw new HttpsError('failed-precondition', 'OPENAI_API_KEY not set.');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      // Feedback needs room for praise + corrections; everything else stays short.
      max_tokens: input.action === 'feedback' ? 260 : 140,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new HttpsError('internal', `OpenAI failed: ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}

interface TutorRequest {
  action?: string;
  lastUtterance?: string;
  transcript?: string;
  lang?: string;
}

function parseTutorRequest(d: TutorRequest) {
  const action = d.action as TutorAction;
  if (!TUTOR_ACTIONS.includes(action)) throw new HttpsError('invalid-argument', 'Bad action.');
  const transcript = typeof d.transcript === 'string' ? d.transcript.trim().slice(0, 1500) : '';
  if (action === 'feedback' && transcript.length < 3) throw new HttpsError('invalid-argument', 'Nothing to give feedback on.');
  return {
    action,
    transcript,
    lastUtterance: typeof d.lastUtterance === 'string' ? d.lastUtterance.slice(0, 200) : '',
    lang: (d.lang === 'ko' ? 'ko' : 'en') as 'ko' | 'en',
  };
}

/* ─────────────────────────  AI tutor: match mode  ───────────────────────── */

export const facilitatorTurn = onCall(
  { secrets: [OPENAI_API_KEY], region: 'us-central1', timeoutSeconds: 30 },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    const data = req.data as TutorRequest & { code?: string; pairId?: string };
    const { code, pairId } = data;
    if (!code || !pairId) throw new HttpsError('invalid-argument', 'Bad input.');
    if (!SESSION_RE.test(code)) throw new HttpsError('invalid-argument', 'Bad code.');
    const { action, transcript, lastUtterance, lang } = parseTutorRequest(data);

    const db = getFirestore();
    const pairSnap = await db.doc(`sessions/${code}/pairs/${pairId}`).get();
    if (!pairSnap.exists) throw new HttpsError('not-found', 'Pair not found.');
    const pair = pairSnap.data()!;
    const members = pair.members as Array<{ uid: string; name: string; country: string; topic?: string | null }>;
    const me = members.find((m) => m.uid === req.auth!.uid);
    if (!me) throw new HttpsError('permission-denied', 'You are not in this pair.');

    const names = members
      .map((m) => `${m.name} (${m.country === 'KR' ? 'Korean student' : 'international student'})`)
      .join(' and ');
    const topic = pair.topic ?? members.map((m) => m.topic).find(Boolean) ?? 'school life';

    const text = await askTutor({
      action,
      names,
      context: 'A Korean student is paired 1:1 with an overseas student on video.',
      theme: String(topic),
      lastUtterance,
      transcript,
      speaker: me.name,
      lang,
    });

    await db.collection(`sessions/${code}/pairs/${pairId}/facilitatorMessages`).add({
      role: 'facilitator',
      text,
      action,
      ...(action === 'feedback' ? { heard: transcript, speaker: me.name } : {}),
      ts: FieldValue.serverTimestamp(),
    });
    return { ok: true, text };
  },
);

/* ─────────────────────  AI tutor: school-map desk pods  ─────────────────────
 *
 * When EXACTLY two students sit at the same desk pod, the tutor leads their
 * talk. Who is there is read from RTDB presence on the server (never trusted
 * from the client), and the caller must be one of the two. Messages go to
 * sessions/{code}/rooms/{paId}/facilitatorMessages tagged with a pairKey
 * (sorted uids) so a new duo at the same desk starts fresh. A per-desk state
 * doc throttles calls so both clients can't make the tutor talk twice.
 */
const PA_RE = /^pa-[a-z0-9-]+$/;
const MIN_TURN_GAP_MS = 8_000;
const MIN_FEEDBACK_GAP_MS = 3_000;

// Each classroom has a theme; its desk pods (pa-polite-1 …) inherit it.
const ROOM_THEMES: Record<string, { name: string; theme: string }> = {
  'pa-polite': { name: 'Polite Room', theme: 'polite expressions (please, thank you, excuse me, may I…)' },
  'pa-leading': { name: 'Leading Room', theme: 'taking turns leading: asking and answering questions' },
  'pa-useful': { name: 'Useful Room', theme: 'useful everyday expressions (school, food, hobbies, weather)' },
  'pa-smart': { name: 'Smart Room', theme: 'fun thinking questions (would you rather, favourite things, why)' },
};

export const roomFacilitatorTurn = onCall(
  { secrets: [OPENAI_API_KEY], region: 'us-central1', timeoutSeconds: 30 },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    const data = req.data as TutorRequest & { code?: string; paId?: string };
    const { code, paId } = data;
    if (!code || !SESSION_RE.test(code)) throw new HttpsError('invalid-argument', 'Bad code.');
    if (!paId || !PA_RE.test(paId)) throw new HttpsError('invalid-argument', 'Bad paId.');
    const { action, transcript, lastUtterance, lang } = parseTutorRequest(data);

    const db = getFirestore();
    const sessionSnap = await db.doc(`sessions/${code}`).get();
    if (!sessionSnap.exists || sessionSnap.data()?.active !== true) {
      throw new HttpsError('failed-precondition', 'Session is not open.');
    }

    // Who is actually sitting at this desk right now?
    const playersSnap = await getDatabase().ref(`rooms/${code}/players`).get();
    const players = (playersSnap.val() ?? {}) as Record<string, { name?: string; paId?: string | null }>;
    const inRoom = Object.entries(players)
      .filter(([, p]) => p?.paId === paId)
      .map(([uid, p]) => ({ uid, name: String(p.name ?? 'Student').slice(0, 16) }))
      .sort((a, b) => (a.uid < b.uid ? -1 : 1));
    const me = inRoom.find((p) => p.uid === req.auth!.uid);
    if (!me) throw new HttpsError('permission-denied', 'You are not at this desk.');
    if (inRoom.length !== 2) return { ok: false, skipped: 'not-a-pair' };
    const pairKey = inRoom.map((p) => p.uid).join('_');

    // Throttle + de-dupe inside a transaction so two clients can't both fire.
    const stateRef = db.doc(`sessions/${code}/rooms/${paId}`);
    const allowed = await db.runTransaction(async (tx) => {
      const s = (await tx.get(stateRef)).data() ?? {};
      const last = s.lastTurnAt?.toMillis?.() ?? 0;
      const samePair = s.pairKey === pairKey;
      const since = Date.now() - last;
      // A duo gets one greeting per minute (a failed greeting can be retried).
      if (action === 'start' && samePair && since < 60_000) return false;
      const gap = action === 'feedback' ? MIN_FEEDBACK_GAP_MS : MIN_TURN_GAP_MS;
      if (samePair && since < gap) return false;
      tx.set(stateRef, { pairKey, lastTurnAt: FieldValue.serverTimestamp() }, { merge: true });
      return true;
    });
    if (!allowed) return { ok: false, skipped: 'throttled' };

    const msgCol = db.collection(`sessions/${code}/rooms/${paId}/facilitatorMessages`);
    // Recent lines for THIS duo so the tutor doesn't repeat itself.
    const recent = await msgCol.orderBy('ts', 'desc').limit(10).get();
    const history = recent.docs
      .map((d) => d.data())
      .filter((m) => m.pairKey === pairKey)
      .slice(0, 4)
      .reverse()
      .map((m) => `- ${String(m.text ?? '')}`)
      .join('\n');

    const room = ROOM_THEMES[paId.replace(/-\d+$/, '')] ?? { name: 'classroom', theme: 'daily life' };
    const names = inRoom.map((p) => p.name).join(' and ');

    const text = await askTutor({
      action,
      names,
      context: `Two students, ${names}, sit face to face at a desk in the ${room.name} of a virtual school. One may be Korean and one from another country.`,
      theme: room.theme,
      lastUtterance,
      transcript,
      speaker: me.name,
      lang,
      history,
    });

    await msgCol.add({
      role: 'facilitator',
      text,
      action,
      pairKey,
      ...(action === 'feedback' ? { heard: transcript, speaker: me.name } : {}),
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
