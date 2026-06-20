// Firestore data-access layer. Only used when firebaseConfigured === true.
// Pages never import this directly — the StoreProvider wires it in, so demo
// mode and live mode present the exact same interface to the UI.

import {
  collection, doc, getDocs, onSnapshot, setDoc, updateDoc,
  deleteDoc, writeBatch, query, type Firestore,
} from 'firebase/firestore';
import { db, COL } from './firebase';
import type {
  AppUser, Shop, Product, Variant, Balance, Unit, StockLocation,
  Supplier, CountryRate, AuditLog, Receiving, Transfer, StockCount, CostHistory,
} from '../types';
import type { AppSettings } from './demoData';
import {
  DEMO_SHOPS, DEMO_PRODUCTS, DEMO_VARIANTS, DEMO_BALANCES,
  DEMO_UNITS, DEMO_LOCATIONS, DEMO_SUPPLIERS, DEMO_RATES,
  DEMO_CATEGORIES, DEMO_SETTINGS,
} from './demoData';

function reqDb(): Firestore {
  if (!db) throw new Error('Firestore not initialized');
  return db;
}

// ---- Generic realtime subscription. Returns an unsubscribe fn. ----
export function subscribe<T>(
  collName: string,
  onData: (rows: T[]) => void,
  onError?: (e: Error) => void,
): () => void {
  const q = query(collection(reqDb(), collName));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
    (err) => { console.error(`[StockDesk] subscribe ${collName} failed:`, err); onError?.(err); },
  );
}

// settings + categories live as single docs under the settings collection.
export function subscribeDoc<T>(
  collName: string,
  docId: string,
  onData: (row: T | null) => void,
): () => void {
  return onSnapshot(doc(reqDb(), collName, docId), (snap) => {
    onData(snap.exists() ? (snap.data() as T) : null);
  });
}

// ---- Writes (upsert by id) ----
export async function upsert(collName: string, id: string, data: Record<string, unknown>) {
  await setDoc(doc(reqDb(), collName, id), stripUndefined(data), { merge: true });
}
export async function patch(collName: string, id: string, data: Record<string, unknown>) {
  await updateDoc(doc(reqDb(), collName, id), stripUndefined(data));
}
export async function remove(collName: string, id: string) {
  await deleteDoc(doc(reqDb(), collName, id));
}

/** Recursively strip undefined (and optionally null) from any object before Firestore writes.
 *  Firestore rejects undefined values anywhere in the tree — including inside arrays. */
export function deepSanitize<T>(val: T): T {
  if (Array.isArray(val)) return val.map(deepSanitize) as unknown as T;
  if (val !== null && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) out[k] = deepSanitize(v);
    }
    return out as T;
  }
  return val;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return deepSanitize(obj);
}

// ---- One-time seed. Idempotent: only writes if `users` is empty. ----
export async function seedIfEmpty(): Promise<boolean> {
  const fdb = reqDb();
  // Gate on SHOPS, not users — real user profiles are created out-of-band by
  // scripts/seedUsers.mjs and must never be overwritten by demo seeding.
  const shopsSnap = await getDocs(collection(fdb, COL.shops));
  if (!shopsSnap.empty) return false; // reference data already seeded

  const batch = writeBatch(fdb);
  // NOTE: users are intentionally NOT seeded here (managed by seedUsers.mjs).
  // audit_logs are NOT seeded — real history accrues from movements.
  DEMO_SHOPS.forEach((s) => batch.set(doc(fdb, COL.shops, s.id), s));
  DEMO_PRODUCTS.forEach((p) => batch.set(doc(fdb, COL.products, p.id), p));
  DEMO_VARIANTS.forEach((v) => batch.set(doc(fdb, COL.variants, v.id), v));
  DEMO_BALANCES.forEach((b) => batch.set(doc(fdb, COL.balances, b.id), b));
  DEMO_UNITS.forEach((u) => batch.set(doc(fdb, COL.units, u.id), u));
  DEMO_LOCATIONS.forEach((l) => batch.set(doc(fdb, COL.locations, l.id), l));
  DEMO_SUPPLIERS.forEach((s) => batch.set(doc(fdb, COL.suppliers, s.id), s));
  DEMO_RATES.forEach((r) => batch.set(doc(fdb, COL.countryRates, r.id), r));
  batch.set(doc(fdb, COL.settings, 'app'), DEMO_SETTINGS as unknown as Record<string, unknown>);
  batch.set(doc(fdb, COL.settings, 'categories'), { values: DEMO_CATEGORIES });
  await batch.commit();
  return true;
}

// Type-safe wrappers used by the store
export const repo = {
  subscribeUsers: (cb: (r: AppUser[]) => void) => subscribe<AppUser>(COL.users, cb),
  subscribeShops: (cb: (r: Shop[]) => void) => subscribe<Shop>(COL.shops, cb),
  subscribeProducts: (cb: (r: Product[]) => void) => subscribe<Product>(COL.products, cb),
  subscribeVariants: (cb: (r: Variant[]) => void) => subscribe<Variant>(COL.variants, cb),
  subscribeBalances: (cb: (r: Balance[]) => void) => subscribe<Balance>(COL.balances, cb),
  subscribeUnits: (cb: (r: Unit[]) => void) => subscribe<Unit>(COL.units, cb),
  subscribeLocations: (cb: (r: StockLocation[]) => void) => subscribe<StockLocation>(COL.locations, cb),
  subscribeSuppliers: (cb: (r: Supplier[]) => void) => subscribe<Supplier>(COL.suppliers, cb),
  subscribeRates: (cb: (r: CountryRate[]) => void) => subscribe<CountryRate>(COL.countryRates, cb),
  subscribeAudit: (cb: (r: AuditLog[]) => void) => subscribe<AuditLog>(COL.audit, cb),
  subscribeSettings: (cb: (r: AppSettings | null) => void) => subscribeDoc<AppSettings>(COL.settings, 'app', cb),
  subscribeCategories: (cb: (r: { values: string[] } | null) => void) => subscribeDoc<{ values: string[] }>(COL.settings, 'categories', cb),
  subscribeReceivings: (cb: (r: Receiving[]) => void) => subscribe<Receiving>(COL.receivings, cb),
  subscribeTransfers: (cb: (r: Transfer[]) => void) => subscribe<Transfer>(COL.transfers, cb),
  subscribeCounts: (cb: (r: StockCount[]) => void) => subscribe<StockCount>(COL.counts, cb),
  subscribeCostHistory: (cb: (r: CostHistory[]) => void) => subscribe<CostHistory>(COL.costHistory, cb),
};
