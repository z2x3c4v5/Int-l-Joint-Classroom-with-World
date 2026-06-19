/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FB_API_KEY: string;
  readonly VITE_FB_AUTH_DOMAIN: string;
  readonly VITE_FB_PROJECT_ID: string;
  readonly VITE_FB_STORAGE_BUCKET: string;
  readonly VITE_FB_MSG_SENDER_ID: string;
  readonly VITE_FB_APP_ID: string;
  readonly VITE_FB_DATABASE_URL: string;
  readonly VITE_FB_REGION?: string;
  readonly VITE_LIVEKIT_URL: string;
  readonly VITE_TEACHER_PASSCODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
