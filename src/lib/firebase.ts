import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

function readConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) {
    return null;
  }
  return { apiKey, authDomain, projectId, appId };
}

const config = readConfig();

export const firebaseApp: FirebaseApp | null = config ? initializeApp(config) : null;

export function getFirebaseAuth() {
  if (!firebaseApp) {
    throw new Error('Firebase is not configured. Set VITE_FIREBASE_* environment variables.');
  }
  return getAuth(firebaseApp);
}
