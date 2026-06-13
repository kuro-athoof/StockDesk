import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const cfg = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MSG_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

// A value counts as "real" only if it's a non-empty string that isn't a
// placeholder (e.g. blank, "your-...", "xxx", "changeme").
function isReal(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  if (lower.startsWith('your') || lower.startsWith('xxx') || lower === 'changeme') return false;
  return true;
}

// All six keys must be real for live mode. Otherwise we stay in demo mode and
// never touch Firebase — this prevents getAuth() throwing auth/invalid-api-key.
export const firebaseConfigured =
  isReal(cfg.apiKey) &&
  isReal(cfg.authDomain) &&
  isReal(cfg.projectId) &&
  isReal(cfg.storageBucket) &&
  isReal(cfg.messagingSenderId) &&
  isReal(cfg.appId);

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

if (firebaseConfigured) {
  try {
    _app = initializeApp(cfg as Record<string, string>);
    _auth = getAuth(_app);
    _db = getFirestore(_app);
  } catch (err) {
    // Never let a Firebase init failure blank the screen — fall back to demo.
    console.warn('[StockDesk] Firebase init failed, using demo mode:', err);
    _app = null; _auth = null; _db = null;
  }
}

export const app = _app;
export const auth = _auth;
export const db = _db;

// Collection names (single source of truth)
export const COL = {
  users: 'users',
  shops: 'shops',
  products: 'products',
  variants: 'variants',
  balances: 'balances',
  units: 'units',
  locations: 'locations',
  suppliers: 'suppliers',
  countryRates: 'countryRates',
  audit: 'auditLogs',
  receivings: 'receivings',
  transfers: 'transfers',
  counts: 'stockCounts',
  notifications: 'notifications',
  settings: 'settings',
} as const;
