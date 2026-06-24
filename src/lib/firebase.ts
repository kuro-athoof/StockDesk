import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const cfg = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  // Accept either name — the Firebase console snippet uses MESSAGING_SENDER_ID.
  messagingSenderId:
    import.meta.env.VITE_FB_MESSAGING_SENDER_ID ?? import.meta.env.VITE_FB_MSG_SENDER_ID,
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

// P0.6 — PRODUCTION FAILS CLOSED.
// Demo mode is only permitted in a development build, and only when explicitly
// opted in via VITE_ALLOW_DEMO_MODE=true. In a production build with missing or
// invalid Firebase config, we must NOT silently enter demo mode — instead we
// surface a fatal setup error so the deployment is visibly broken rather than
// quietly serving an in-memory demo to real users.
const demoAllowed = import.meta.env.DEV && import.meta.env.VITE_ALLOW_DEMO_MODE === 'true';

// True when the app cannot run safely: a production build without valid config.
export const fatalConfigError: string | null =
  (!firebaseConfigured && import.meta.env.PROD)
    ? 'StockDesk is misconfigured: Firebase environment variables are missing or invalid. '
      + 'Set VITE_FB_API_KEY, VITE_FB_AUTH_DOMAIN, VITE_FB_PROJECT_ID, VITE_FB_STORAGE_BUCKET, '
      + 'VITE_FB_MESSAGING_SENDER_ID and VITE_FB_APP_ID for this deployment.'
    : null;

// Demo mode is active ONLY when config is absent AND we are allowed to demo
// (dev + explicit opt-in). In production this is always false.
export const demoMode = !firebaseConfigured && demoAllowed;

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;

if (firebaseConfigured) {
  try {
    _app = initializeApp(cfg as Record<string, string>);
    _auth = getAuth(_app);
    _db = getFirestore(_app);
    _storage = getStorage(_app);
  } catch (err) {
    // In production, a Firebase init failure is fatal — do not fall back to demo.
    // In development we may fall back so the UI is still inspectable.
    console.error('[StockDesk] Firebase init failed:', err);
    _app = null; _auth = null; _db = null; _storage = null;
  }
}

export const app = _app;
export const auth = _auth;
export const db = _db;
export const storage = _storage;

// Collection names — single source of truth. Snake_case matches the documented
// Firestore schema (stock_balances, audit_logs, country_rates).
export const COL = {
  users: 'users',
  shops: 'shops',
  products: 'products',
  variants: 'variants',
  balances: 'stock_balances',
  units: 'units',
  locations: 'locations',
  suppliers: 'suppliers',
  countryRates: 'country_rates',
  audit: 'audit_logs',
  receivings: 'receivings',
  transfers: 'transfers',
  counts: 'stock_counts',
  notifications: 'notifications',
  settings: 'settings',
  costHistory: 'cost_history',
  activity: 'activity_logs',
  damageReports: 'damage_reports',
} as const;
