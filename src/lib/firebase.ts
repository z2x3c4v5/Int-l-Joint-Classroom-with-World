import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, updateProfile, type User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// The AI-match app uses only Auth + Firestore + Functions. (Realtime Database
// and Storage were for the old free-roam map / image boards and are no longer
// required, which keeps the Firebase setup smaller.)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, import.meta.env.VITE_FB_REGION ?? 'us-central1');

export async function signInWithNickname(nickname: string): Promise<User> {
  const cred = await signInAnonymously(auth);
  await updateProfile(cred.user, { displayName: nickname });
  return cred.user;
}
