# Global Classroom

Self-hosted ZEP-style virtual classroom for international K-12 English exchange
sessions. Built on **Firebase + LiveKit Cloud** so 70 simultaneous students
with camera and microphone enabled stay under ~₩50,000/month.

## Two classroom modes

The teacher picks the mode when creating a session in `/teacher`.

### 🗺 Free mode (4-room ZEP layout)
- Students walk a 2D map with arrow keys / WASD / touch joystick
- Four named rooms (Polite / Leading / Useful / Smart) act as Private Areas:
  step inside → camera + mic auto-connect to the rest of the room only
- Welcome board at the centre + a presentation board per room
- Students upload images **or paste Google Slides links** to any board; the
  whole room sees the new content within ~1 second
- Cloud Vision SafeSearch + teacher-panel moderation gate every upload
- Screen sharing inside a room (LiveKit screen-share track)

### 🤝 AI Match mode (1:1 auto-matching with an AI coach)
- Students enter, pick their country (🇰🇷 Korea / 🌐 Overseas) and a topic
- They land in a waiting room; a Firestore-triggered Cloud Function pairs the
  first Korean + first Overseas student, preferring matching topics
- Both students are auto-dropped into a private 1:1 LiveKit room
- An **AI facilitator** (GPT-4o-mini) drops short coaching prompts into a
  side panel — "Hi Mary and Hiroshi, what's your favourite food?"
- Buttons: *New question* (ask the coach for a new topic), *Help me* (paste
  what you tried, get an easy sentence), 🔊 (speech synthesis read-aloud)
- *Find another partner* puts both students back into the queue

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Frontend | Vite + React 19 + TypeScript + Tailwind v4 | DOM-based avatars |
| Realtime positions | Firebase Realtime Database | Throttled to 12 Hz |
| Realtime presentation objects + match queue + AI coach | Firestore `onSnapshot` | |
| Auth | Firebase Anonymous Auth | Nickname only |
| Storage | Firebase Storage | Auto-resize to 1280px JPEG |
| Media | LiveKit Cloud | Simulcast + Dynacast + Adaptive Stream |
| Token / pair / moderation | Firebase Functions v2 | |
| Matchmaking | Firestore `onDocumentCreated` trigger | Transaction-safe |
| AI coach | OpenAI `gpt-4o-mini` | ~$0.001 per turn |
| Image moderation | Cloud Vision SafeSearch | |
| Hosting | Vercel or Firebase Hosting | SPA, `vercel.json` included |

## Setup

```bash
# 1. Install
npm install
cd functions && npm install && cd ..

# 2. Create Firebase project (once, in the Firebase console)
#    - Enable Anonymous Authentication
#    - Create a Firestore database (production mode)
#    - Create a Realtime Database
#    - Enable Storage
#    - Upgrade to Blaze plan (free tier still applies)
#    - Enable Cloud Vision API in Google Cloud Console

# 3. Create a LiveKit Cloud project at https://cloud.livekit.io
#    Copy the WS URL, API Key, and API Secret.

# 4. Configure environment
cp .env.example .env
# fill in Firebase web config + LiveKit URL + teacher passcode

# 5. Set Function secrets
firebase use <your-project-id>
firebase functions:secrets:set LIVEKIT_API_KEY
firebase functions:secrets:set LIVEKIT_API_SECRET
firebase functions:secrets:set TEACHER_PASSCODE
firebase functions:secrets:set OPENAI_API_KEY

# 6. Deploy rules + functions
firebase deploy --only firestore:rules,storage:rules,database,functions

# 7. Run locally
npm run dev      # http://localhost:5174

# 8. Production deploy
npm run build
# Either:
#   firebase deploy --only hosting
# Or push to GitHub and let Vercel auto-deploy.
```

## URLs

* `/` — student entry (class code + nickname → classroom or waiting room)
* `/teacher` — moderation panel + session management (passcode gate)
* `/preview` — static demo of the 4-room layout (no Firebase required)

## Vercel deployment

`vercel.json` is included at the project root so React Router's client-side
routes (`/teacher`, `/preview`, etc.) work after refresh. Just import the repo
and add the env vars from `.env.example`.

## Capacity / cost (Korea + 3 overseas schools, 70 students, cams on)

* LiveKit Cloud "Build" plan ≈ **US$50/month** (global edge routing)
* Firebase free tier covers Auth + RTDB + Firestore + Storage + 2M Function
  invocations
* Vision SafeSearch: 1,000 calls/month free
* OpenAI gpt-4o-mini: ~$0.001 per coach turn; 70 students × 5 turns ≈ $0.35
  per session

## Security notes

* LiveKit tokens are minted server-side and scoped to a `{sessionCode}__{paId}`
  room. Two regexes (session, room) are validated before each issue.
* Firestore rules force `status: 'pending'` on every client image/slides
  write; only the SafeSearch Function and the teacher panel (via Admin SDK)
  set `approved`/`rejected`.
* Queue entries can only be written by the user themselves; the matchmaker
  Function is the only writer that flips `waiting → paired`.
* All teacher Callables (`createSession`, `setSessionActive`, `moderateObject`)
  validate `TEACHER_PASSCODE` server-side; the frontend gate is UX only.
* Storage path uploads cap at 8 MB image/* and require the parent session to
  be active.

## Known limitations / future work

* PowerPoint files: convert to PDF or paste a Google Slides embed link.
* No persistent transcripts of pair rooms.
* The AI coach speaks but doesn't listen — turn-taking is between the two
  human students. Voice-listening (Whisper) is a future extension.
* Mobile Safari requires a user gesture before camera/mic. The Join /
  Find-partner buttons satisfy this.
