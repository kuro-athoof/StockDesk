/**
 * StockDesk Pro — one-time user + profile seeder (run LOCALLY, not in the app).
 *
 * Creates the 6 initial Firebase Auth users and their matching Firestore
 * `users/{uid}` profiles with roles + shop scoping. Idempotent: skips users
 * that already exist.
 *
 * SETUP (on your machine, where network reaches Firebase):
 *   1. Firebase Console → Project Settings → Service accounts →
 *      "Generate new private key" → save as serviceAccountKey.json in /scripts
 *      (this file is git-ignored — never commit it).
 *   2. npm install firebase-admin
 *   3. node scripts/seedUsers.mjs
 *
 * Change the passwords below before running, or pass your own.
 *
 * SHOP ID RESOLUTION (important):
 *   This script does NOT hardcode shop document IDs. assignedShopIds must
 *   always be real Firestore document IDs from the `shops` collection, never
 *   placeholder strings or shop names. Below, USER_SHOP_NAMES maps each
 *   shop-scoped user to the shop's display NAME — the script looks up the
 *   live document ID for that name in Firestore at run time and uses that.
 *   This means the script self-corrects even if shop document IDs change
 *   (e.g. after a Firestore export/import or manual recreation).
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(readFileSync(new URL('./serviceAccountKey.json', import.meta.url)));
initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

// Edit emails/passwords as needed. shopNames: [] = all shops (admin/office/purchase/auditor).
// For shop_manager / warehouse_staff, list the shop NAME(s) as they appear in
// the `shops` collection `name` field — the script resolves the real document
// ID for you. Never put a document ID guess here.
const USERS = [
  { email: 'admin@kuro.mv',      password: 'ChangeMe!1', name: 'Ahmed Athoof',      role: 'admin',            shopNames: [] },
  { email: 'purchase@kuro.mv',   password: 'ChangeMe!1', name: 'Purchase Manager',  role: 'purchase_manager', shopNames: [] },
  { email: 'flora@kuro.mv',      password: 'ChangeMe!1', name: 'Flora Manager',     role: 'shop_manager',     shopNames: ['Flora'] },
  { email: 'sindhitha@kuro.mv',  password: 'ChangeMe!1', name: 'Sindhitha Manager', role: 'shop_manager',     shopNames: ['Sindhitha'] },
  { email: 'warehouse@kuro.mv',  password: 'ChangeMe!1', name: 'Warehouse Staff',   role: 'warehouse_staff',  shopNames: ['Flora'] },
  { email: 'audit@kuro.mv',      password: 'ChangeMe!1', name: 'Auditor',           role: 'auditor',          shopNames: [] },
];

/**
 * Build a name → Firestore document ID map from the live `shops` collection.
 * This is the ONLY source of truth for shop IDs in this script — no
 * placeholder strings, no assumptions about document ID format.
 */
async function loadShopIdsByName() {
  const snap = await db.collection('shops').get();
  if (snap.empty) {
    throw new Error(
      'No documents found in the `shops` collection. Create your shops in ' +
      'Firestore (or via the app\'s Administration page) before running this ' +
      'script, so shop-scoped users can be assigned real document IDs.',
    );
  }
  const map = new Map();
  snap.forEach((doc) => {
    const name = doc.data().name;
    if (typeof name === 'string' && name.trim()) map.set(name.trim(), doc.id);
  });
  return map;
}

/** Resolve a list of shop names to real Firestore document IDs. Throws on any unknown name. */
function resolveShopIds(shopNames, shopIdsByName) {
  if (!shopNames || shopNames.length === 0) return []; // [] = all shops, by design
  return shopNames.map((name) => {
    const id = shopIdsByName.get(name);
    if (!id) {
      const known = [...shopIdsByName.keys()].join(', ') || '(none found)';
      throw new Error(
        `Shop name "${name}" was not found in the live \`shops\` collection. ` +
        `Known shop names: ${known}. Fix the shopNames list above and re-run.`,
      );
    }
    return id;
  });
}

async function ensureUser(u, shopIdsByName) {
  // assignedShopIds is ALWAYS resolved from real Firestore document IDs here —
  // never a hardcoded placeholder like "shop_flora". If the shop name can't be
  // found, this throws instead of silently writing a broken assignment.
  const assignedShopIds = resolveShopIds(u.shopNames, shopIdsByName);

  let uid;
  try {
    const existing = await auth.getUserByEmail(u.email);
    uid = existing.uid;
    console.log(`• exists: ${u.email} (${uid})`);
  } catch {
    const created = await auth.createUser({ email: u.email, password: u.password, displayName: u.name });
    uid = created.uid;
    console.log(`✓ created auth user: ${u.email} (${uid})`);
  }
  await db.collection('users').doc(uid).set({
    uid, name: u.name, email: u.email, role: u.role,
    // assignedShopIds is always written as an array of real document IDs.
    // The app's normalizeAppUser() also tolerates legacy malformed data on
    // read, but this script never writes malformed data in the first place.
    assignedShopIds, active: true, createdAt: Date.now(),
  }, { merge: true });
  console.log(`  → profile written: role=${u.role} shops=${assignedShopIds.join(',') || 'ALL'}`);
}

const shopIdsByName = await loadShopIdsByName();
console.log(`Found ${shopIdsByName.size} shop(s) in Firestore:`, [...shopIdsByName.entries()].map(([n, id]) => `${n}=${id}`).join(', '));
console.log('');

for (const u of USERS) {
  await ensureUser(u, shopIdsByName);
}
console.log('\nDone. Sign in with these emails. Change the default passwords.');
process.exit(0);
