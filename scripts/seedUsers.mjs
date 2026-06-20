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
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(readFileSync(new URL('./serviceAccountKey.json', import.meta.url)));
initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

// Edit emails/passwords as needed. assignedShopIds: [] = all shops.
const USERS = [
  { email: 'admin@kuro.mv',      password: 'ChangeMe!1', name: 'Ahmed Athoof',      role: 'admin',            assignedShopIds: [] },
  { email: 'purchase@kuro.mv',   password: 'ChangeMe!1', name: 'Purchase Manager',  role: 'purchase_manager', assignedShopIds: [] },
  { email: 'flora@kuro.mv',      password: 'ChangeMe!1', name: 'Flora Manager',     role: 'shop_manager',     assignedShopIds: ['shop_flora'] },
  { email: 'sindhitha@kuro.mv',  password: 'ChangeMe!1', name: 'Sindhitha Manager', role: 'shop_manager',     assignedShopIds: ['shop_sindhitha'] },
  { email: 'warehouse@kuro.mv',  password: 'ChangeMe!1', name: 'Warehouse Staff',   role: 'warehouse_staff',  assignedShopIds: ['shop_flora'] },
  { email: 'audit@kuro.mv',      password: 'ChangeMe!1', name: 'Auditor',           role: 'auditor',          assignedShopIds: [] },
];

async function ensureUser(u) {
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
    assignedShopIds: u.assignedShopIds, active: true, createdAt: Date.now(),
  }, { merge: true });
  console.log(`  → profile written: role=${u.role} shops=${u.assignedShopIds.join(',') || 'ALL'}`);
}

for (const u of USERS) {
  // eslint-disable-next-line no-await-in-loop
  await ensureUser(u);
}
console.log('\nDone. Sign in with these emails. Change the default passwords.');
process.exit(0);
