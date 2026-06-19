# Setup — make the app actually work

The AI 1:1 match app needs three external services. You create the accounts
(only you can — they're tied to your billing); then the backend gets deployed.

| Service | Used for | Cost |
|---|---|---|
| **Firebase** (Blaze plan) | login, database, server functions | Pay-as-you-go, but the free tier covers small classes. A card is required for Blaze. |
| **LiveKit Cloud** | camera / microphone | Free tier for testing; ~$50/mo at full scale |
| **OpenAI** | the AI tutor | Pay per use, ~₩1 per tutor message |

Only these Firebase services are needed: **Authentication, Firestore, Functions**
(plus **Storage** so the functions deploy cleanly). Realtime Database is **not**
used.

---

## 1. Firebase project

1. https://console.firebase.google.com → **Add project**. Give it a name.
2. **Build → Authentication → Get started → Sign-in method →** enable
   **Anonymous**.
3. **Build → Firestore Database → Create database →** Production mode → pick a
   location (e.g. `asia-northeast3` Seoul) → Enable.
4. **Build → Storage → Get started** (accept defaults). *(Needed only so the
   functions deploy; no images are uploaded yet.)*
5. **Upgrade to Blaze:** bottom-left gear / "Upgrade" → **Blaze (pay as you go)**
   and add a card. (Cloud Functions require Blaze.)
6. Get the **web config:** gear icon → **Project settings → General →** scroll to
   **Your apps →** click the **`</>` (Web)** icon → register an app (no hosting
   needed) → copy the `firebaseConfig` values into your `.env` / Vercel
   (`VITE_FB_API_KEY`, `VITE_FB_AUTH_DOMAIN`, `VITE_FB_PROJECT_ID`,
   `VITE_FB_APP_ID`).

## 2. LiveKit Cloud

1. https://cloud.livekit.io → sign up → create a project.
2. **Settings → Keys →** create an API key. Copy three things:
   - **Project URL** → `wss://...` → goes in `VITE_LIVEKIT_URL`
   - **API Key** and **API Secret** → used as Function secrets (step 5)

## 3. OpenAI key

1. https://platform.openai.com → **API keys → Create new secret key**. Copy it
   (used as a Function secret in step 5). Make sure billing is enabled.

## 4. Frontend env vars (Vercel)

In Vercel → your project → **Settings → Environment Variables**, add every
`VITE_*` value from `.env.example`. Redeploy.

## 5. Backend secrets + deploy (needs the Firebase CLI)

On a computer with Node 20+ and this repo checked out:

```bash
npm install -g firebase-tools
firebase login                      # opens a browser
firebase use --add                  # pick the project you created in step 1

# Set the four server-side secrets (you'll be prompted to paste each value):
firebase functions:secrets:set LIVEKIT_API_KEY
firebase functions:secrets:set LIVEKIT_API_SECRET
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set TEACHER_PASSCODE      # any password you choose

# Deploy rules + functions:
cd functions && npm install && cd ..
firebase deploy --only firestore:rules,storage:rules,functions
```

`TEACHER_PASSCODE` is the password you'll type to open `/teacher`.

## 6. Try it

1. Open `/teacher`, enter your passcode, **create a session** (e.g. `KR-MY-2026`)
   and set it **live**.
2. Open `/` in two browser windows. In one pick **🇰🇷 Korea**, in the other
   **🌐 Overseas**, same class code.
3. They auto-pair into a 1:1 room, cameras connect, and the AI tutor starts
   talking on its own.
