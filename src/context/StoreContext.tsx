import {
  createContext, useContext, useState, useMemo, useCallback, useEffect, useRef, type ReactNode,
} from 'react';
import type {
  AppUser, Shop, Product, Variant, Balance, Unit, StockLocation,
  Supplier, CountryRate, AuditLog, MovementAction,
  Receiving, Transfer, StockCount, CostHistory, DamageReport,
} from '../types';
import { can } from '../lib/permissions';
import {
  DEMO_USERS, DEMO_SHOPS, DEMO_PRODUCTS, DEMO_VARIANTS, DEMO_BALANCES, DEMO_UNITS,
  DEMO_LOCATIONS, DEMO_SUPPLIERS, DEMO_RATES, DEMO_AUDIT, DEMO_CATEGORIES,
  DEMO_SETTINGS, type AppSettings, loginByUid,
} from '../lib/demoData';
import { balanceId, NegativeStockError, applyMovement, applyAtomicBatch, DuplicateOperationError, ConflictError, type MovementLineSpec } from '../lib/movement';
import { suggestVariantBarcode, isBarcodeTaken } from '../lib/dataQuality';
import { firebaseConfigured, auth, db, COL } from '../lib/firebase';
import { repo, subscribe, seedIfEmpty, upsert, patch as fsPatch, remove as fsRemove, deepSanitize } from '../lib/firestoreRepo';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, runTransaction, collection } from 'firebase/firestore';

interface MoveArgs {
  variant: Variant;
  ownerShopId: string;
  qtyChanged: number;
  unit: string;
  action: MovementAction;
  remarks?: string;
  refId?: string;
  locationId?: string;
  rollDelta?: number;
}

const LIVE = firebaseConfigured;

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

interface Store {
  user: AppUser | null;
  users: AppUser[];
  demoMode: boolean;
  ready: boolean;
  login: (uid: string) => void;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => void;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;

  shops: Shop[];
  products: Product[];
  variants: Variant[];
  balances: Balance[];
  units: Unit[];
  locations: StockLocation[];
  suppliers: Supplier[];
  rates: CountryRate[];
  audit: AuditLog[];
  categories: string[];

  visibleShopIds: string[];
  canSeeShop: (shopId: string) => boolean;
  scopedBalances: Balance[];

  shopName: (id: string) => string;
  productName: (id: string) => string;
  supplierName: (id: string) => string;
  variantsOf: (productId: string) => Variant[];
  balanceOf: (variantId: string, shopId: string) => Balance | undefined;
  lastMovementOf: (variantId: string) => AuditLog | undefined;

  applyLocalMovement: (args: MoveArgs) => Promise<{ ok: boolean; error?: string; needsOverride?: boolean }>;

  addProduct: (p: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>, vs: Omit<Variant, 'id' | 'productId' | 'createdAt'>[]) => void;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  addVariant: (productId: string, v: Omit<Variant, 'id' | 'productId' | 'createdAt'>) => void;
  updateVariant: (id: string, patch: Partial<Variant>) => void;
  addSupplier: (s: Omit<Supplier, 'id' | 'createdAt'>) => void;
  updateSupplier: (id: string, patch: Partial<Supplier>) => void;
  addRate: (r: Omit<CountryRate, 'id'>) => void;
  updateRate: (id: string, patch: Partial<CountryRate>) => void;
  addUnit: (code: string) => void;
  removeUnit: (id: string) => void;
  addCategory: (c: string) => void;
  removeCategory: (c: string) => void;
  addShop: (name: string) => void;
  updateShop: (id: string, patch: Partial<Shop>) => void;
  addLocation: (l: Omit<StockLocation, 'id' | 'label'>) => void;
  removeLocation: (id: string) => void;
  updateUser: (uid: string, patch: Partial<AppUser>) => void;

  // ---- Slice 2: Receiving + Transfers ----
  receivings: Receiving[];
  transfers: Transfer[];
  nextReceivingNo: () => string;
  nextTransferNo: () => string;
  saveReceivingDraft: (r: Omit<Receiving, 'id' | 'createdAt' | 'createdBy' | 'status'> & { id?: string }) => string;
  postReceiving: (idOrPayload: string | (Omit<Receiving, 'id' | 'createdAt' | 'createdBy' | 'status'> & { id?: string })) => Promise<{ ok: boolean; error?: string }>;
  cancelReceiving: (id: string) => void;
  deleteReceivingDraft: (id: string) => Promise<{ ok: boolean; error?: string }>;
  saveTransferDraft: (t: Omit<Transfer, 'id' | 'createdAt' | 'status'> & { id?: string }) => string;
  sendTransfer: (idOrPayload: string | (Omit<Transfer, 'id' | 'createdAt' | 'status'> & { id?: string })) => Promise<{ ok: boolean; error?: string; needsOverride?: boolean }>;
  receiveTransfer: (id: string) => void;
  cancelTransfer: (id: string) => void;
  deleteTransferDraft: (id: string) => Promise<{ ok: boolean; error?: string }>;

  // ---- Stock Count + cost ----
  stockCounts: StockCount[];
  costHistory: CostHistory[];
  nextCountNo: () => string;
  saveCount: (c: Omit<StockCount, 'id' | 'createdAt' | 'status'> & { id?: string; status?: StockCount['status'] }) => string;
  submitCount: (id: string) => void;
  approveCount: (id: string) => Promise<{ ok: boolean; error?: string; conflict?: boolean }>;
  rejectCount: (id: string, note: string) => void;
  cancelCount: (id: string) => void;
  deleteCountDraft: (id: string) => Promise<{ ok: boolean; error?: string }>;

  // ---- Damage Reports ----
  damageReports: DamageReport[];
  createDamageReport: (r: Omit<DamageReport, 'id' | 'reportedAt' | 'status'>) => string;
  approveDamageReport: (id: string) => Promise<{ ok: boolean; error?: string }>;
  rejectDamageReport: (id: string, note: string) => void;
  lastFobOf: (variantId: string) => number | undefined;
  recordCost: (entry: Omit<CostHistory, 'id' | 'timestamp' | 'userId'>) => void;

  // ---- Data quality / barcode helpers ----
  allBarcodes: Set<string>;
  isBarcodeUnique: (barcode: string, exceptVariantId?: string) => boolean;
  findDuplicateProduct: (name: string, exceptId?: string) => Product | undefined;
  findDuplicateVariant: (productId: string, identity: string, exceptId?: string) => Variant | undefined;
  generateBarcodeFor: (productName: string, variant: { ourColorNumber?: string; designNumber?: string; label: string }, fallbackIndex?: number) => string;
}

const Ctx = createContext<Store | null>(null);

function locationLabel(l: Omit<StockLocation, 'id' | 'label'>): string {
  return [l.godown, l.rack, l.shelf, l.bin].filter(Boolean).join(' > ');
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>(LIVE ? [] : DEMO_USERS);
  const [shops, setShops] = useState<Shop[]>(LIVE ? [] : DEMO_SHOPS);
  const [products, setProducts] = useState<Product[]>(LIVE ? [] : DEMO_PRODUCTS);
  const [variants, setVariants] = useState<Variant[]>(LIVE ? [] : DEMO_VARIANTS);
  const [balances, setBalances] = useState<Balance[]>(LIVE ? [] : DEMO_BALANCES);
  const [units, setUnits] = useState<Unit[]>(LIVE ? [] : DEMO_UNITS);
  const [locations, setLocations] = useState<StockLocation[]>(LIVE ? [] : DEMO_LOCATIONS);
  const [suppliers, setSuppliers] = useState<Supplier[]>(LIVE ? [] : DEMO_SUPPLIERS);
  const [rates, setRates] = useState<CountryRate[]>(LIVE ? [] : DEMO_RATES);
  const [audit, setAudit] = useState<AuditLog[]>(LIVE ? [] : DEMO_AUDIT);
  const [categories, setCategories] = useState<string[]>(LIVE ? [] : DEMO_CATEGORIES);
  const [settings, setSettings] = useState<AppSettings>(DEMO_SETTINGS);
  const [receivings, setReceivings] = useState<Receiving[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [stockCounts, setStockCounts] = useState<StockCount[]>([]);
  const [costHistory, setCostHistory] = useState<CostHistory[]>([]);
  const [damageReports, setDamageReports] = useState<DamageReport[]>([]);
  const [ready, setReady] = useState<boolean>(!LIVE);
  // P0.1/P0.2: in-flight operation locks. Prevents a duplicate click from
  // launching a second post/send before the first finishes (client-side guard;
  // the Firestore status guard is the authoritative second layer).
  const inFlight = useRef<Set<string>>(new Set());

  // Live mode: seed once, then attach realtime subscriptions.
  // Live mode: track Firebase Auth and resolve the Firestore profile (role).
  // This runs first; the data effect below waits until `user` is set.
  useEffect(() => {
    if (!LIVE || !auth) return;
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser || !db) { setUser(null); setReady(false); return; }
      try {
        const profileSnap = await getDoc(doc(db, COL.users, fbUser.uid));
        if (profileSnap.exists()) {
          setUser({ uid: fbUser.uid, ...profileSnap.data() } as AppUser);
        } else {
          // Authenticated but no profile — cannot determine role; sign out state.
          setUser(null);
          console.warn('[StockDesk] No Firestore profile for', fbUser.uid, '— create users/{uid} doc.');
        }
      } catch (e) {
        setUser(null);
        console.error('[StockDesk] Failed to load profile:', e);
      }
    });
  }, []);

  // Live mode: once a user is authenticated, attach subscriptions.
  // PRODUCTION SAFETY: demo data is NEVER auto-seeded in production. Seeding only
  // runs in development builds (import.meta.env.DEV) AND only when explicitly
  // enabled via VITE_ALLOW_DEMO_SEED. An empty production database stays empty.
  useEffect(() => {
    if (!LIVE || !user) return;
    let unsubs: Array<() => void> = [];
    let cancelled = false;
    (async () => {
      const allowSeed = import.meta.env.DEV && import.meta.env.VITE_ALLOW_DEMO_SEED === 'true';
      if (allowSeed && (can(user.role, 'manage_products') || user.role === 'admin')) {
        try { await seedIfEmpty(); }
        catch (e) { console.warn('[StockDesk] dev seed skipped:', e); }
      }
      if (cancelled) return;
      unsubs = [
        repo.subscribeUsers(setUsers),
        repo.subscribeShops(setShops),
        repo.subscribeProducts(setProducts),
        repo.subscribeVariants(setVariants),
        repo.subscribeBalances(setBalances),
        repo.subscribeUnits(setUnits),
        repo.subscribeLocations(setLocations),
        repo.subscribeSuppliers(setSuppliers),
        repo.subscribeAudit(setAudit),
        repo.subscribeSettings((s) => s && setSettings(s)),
        repo.subscribeCategories((c) => c && setCategories(c.values)),
        repo.subscribeReceivings(setReceivings),
        repo.subscribeTransfers(setTransfers),
        repo.subscribeCounts(setStockCounts),
        subscribe<DamageReport>(COL.damageReports, setDamageReports),
      ];
      // P0.4 parity: cost_history and country_rates are denied to warehouse_staff
      // by Firestore rules. Only subscribe when the user holds view_costs, so the
      // warehouse role never triggers permission-denied console errors.
      if (can(user.role, 'view_costs')) {
        unsubs.push(repo.subscribeRates(setRates));
        unsubs.push(repo.subscribeCostHistory(setCostHistory));
      }
      setReady(true);
    })();
    return () => { cancelled = true; unsubs.forEach((u) => u()); };
  }, [user]);

  const login = useCallback((id: string) => {
    if (LIVE) return;
    setUser(loginByUid(id));
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase auth unavailable');
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const logout = useCallback(() => {
    if (LIVE && auth) signOut(auth);
    setUser(null);
  }, []);

  const updateSettings = useCallback((p: Partial<AppSettings>) => {
    if (LIVE) upsert(COL.settings, 'app', { ...settings, ...p });
    else setSettings((s) => ({ ...s, ...p }));
  }, [settings]);

  const visibleShopIds = useMemo(() => {
    if (!user) return [];
    if (user.role === 'shop_manager' || user.role === 'warehouse_staff') return user.assignedShopIds;
    return shops.map((s) => s.id);
  }, [user, shops]);

  const canSeeShop = useCallback((shopId: string) => visibleShopIds.includes(shopId), [visibleShopIds]);
  const scopedBalances = useMemo(
    () => balances.filter((b) => visibleShopIds.includes(b.ownerShopId)),
    [balances, visibleShopIds],
  );

  const shopName = useCallback((id: string) => shops.find((s) => s.id === id)?.name ?? id, [shops]);
  const productName = useCallback((id: string) => products.find((p) => p.id === id)?.name ?? id, [products]);
  const supplierName = useCallback((id: string) => suppliers.find((s) => s.id === id)?.name ?? '\u2014', [suppliers]);
  const variantsOf = useCallback((pid: string) => variants.filter((v) => v.productId === pid), [variants]);
  const balanceOf = useCallback(
    (vid: string, sid: string) => balances.find((b) => b.id === balanceId(vid, sid)),
    [balances],
  );
  const lastMovementOf = useCallback(
    (vid: string) => audit.filter((a) => a.variantId === vid).sort((a, b) => b.timestamp - a.timestamp)[0],
    [audit],
  );

  const applyLocalMovement = useCallback(async (args: MoveArgs) => {
    if (!user) return { ok: false, error: 'Not signed in' };
    const { variant, ownerShopId, qtyChanged, unit, action, remarks, refId, locationId, rollDelta } = args;
    const canOverride = can(user.role, 'override_negative') && settings.allowNegativeOverride;

    if (LIVE) {
      try {
        await applyMovement({ variant, ownerShopId, qtyChanged, unit, action, user, remarks, refId, locationId, canOverride, rollDelta });
        return { ok: true };
      } catch (e) {
        if (e instanceof NegativeStockError) return { ok: false, needsOverride: !canOverride, error: e.message };
        return { ok: false, error: (e as Error).message };
      }
    }

    const bId = balanceId(variant.id, ownerShopId);
    const existing = balances.find((b) => b.id === bId);
    const before = existing?.quantity ?? 0;
    const after = before + qtyChanged;
    let overrideBy: string | undefined;
    if (after < 0) {
      if (!canOverride) return { ok: false, needsOverride: true, error: new NegativeStockError(before, Math.abs(qtyChanged)).message };
      overrideBy = user.uid;
    }
    const beforeRolls = existing?.rollCount ?? 0;
    const newRolls = variant.productType === 'general' ? undefined : Math.max(0, beforeRolls + (rollDelta ?? 0));
    setBalances((prev) => {
      const next = prev.filter((b) => b.id !== bId);
      next.push({ id: bId, variantId: variant.id, productId: variant.productId, ownerShopId, quantity: after, unit, rollCount: newRolls, locationId: locationId ?? existing?.locationId, updatedAt: Date.now() });
      return next;
    });
    const baseLog: AuditLog = {
      id: uid('a'), timestamp: Date.now(), userId: user.uid, userName: user.name, action,
      productId: variant.productId, variantId: variant.id, ownerShopId,
      qtyBefore: before, qtyChanged, qtyAfter: after,
      ...(remarks ? { remarks } : {}), ...(refId ? { refId } : {}), ...(overrideBy ? { overrideBy } : {}),
    };
    const logs: AuditLog[] = [baseLog];
    if (overrideBy) logs.push({ ...baseLog, id: uid('a'), action: 'NEGATIVE_OVERRIDE', qtyChanged: 0, remarks: `Negative balance authorized by ${user.name}. ${remarks ?? ''}`.trim() });
    setAudit((prev) => [...logs, ...prev]);
    return { ok: true };
  }, [user, balances, settings.allowNegativeOverride]);

  // ---- Slice 2: document helpers ----
  const writeDoc = useCallback((coll: string, id: string, data: Record<string, unknown>, setLocal: () => void) => {
    if (LIVE) upsert(coll, id, data);
    else setLocal();
  }, []);

  const nextReceivingNo = useCallback(() => {
    const n = receivings.length + 1;
    return `RCV-${String(n).padStart(4, '0')}`;
  }, [receivings]);
  const nextTransferNo = useCallback(() => {
    const n = transfers.length + 1;
    return `TRF-${String(n).padStart(4, '0')}`;
  }, [transfers]);

  const saveReceivingDraft = useCallback((r: Omit<Receiving, 'id' | 'createdAt' | 'createdBy' | 'status'> & { id?: string }) => {
    const id = r.id ?? uid('rcv');
    const existing = receivings.find((x) => x.id === id);
    const doc_: Receiving = {
      ...r, id,
      status: existing?.status ?? 'draft',
      createdAt: existing?.createdAt ?? Date.now(),
      createdBy: existing?.createdBy ?? (user?.uid ?? ''),
    };
    writeDoc(COL.receivings, id, deepSanitize(doc_ as unknown as Record<string, unknown>),
      () => setReceivings((prev) => [doc_, ...prev.filter((x) => x.id !== id)]));
    return id;
  }, [receivings, user, writeDoc]);

  // ---- Cost (defined before postReceiving which uses recordCost) ----
  const allBarcodes = useMemo(() => {
    const s = new Set<string>();
    variants.forEach((v) => { if (v.barcode?.trim()) s.add(v.barcode.trim()); });
    return s;
  }, [variants]);

  const lastFobOf = useCallback((variantId: string) => {
    const hist = costHistory.filter((c) => c.variantId === variantId).sort((a, b) => b.timestamp - a.timestamp);
    return hist[0]?.cost;
  }, [costHistory]);

  const recordCost = useCallback((entry: Omit<CostHistory, 'id' | 'timestamp' | 'userId'>) => {
    const rec: CostHistory = { ...entry, id: uid('cost'), timestamp: Date.now(), userId: user?.uid ?? '' };
    if (LIVE) upsert(COL.costHistory, rec.id, rec as unknown as Record<string, unknown>);
    else setCostHistory((prev) => [rec, ...prev]);
  }, [user]);

  // Posting a receiving (simplified model — NO roll records):
  //   Cost      = FOB × Country Rate
  //   Total Qty = Roll Qty × Qty Per Roll
  //   Updates variant aggregates (rollQty, totalQty, cost, totalValue), the owner
  //   balance, cost history, and audit — atomically. General inventory is quantity-based.
  const postReceiving = useCallback(async (idOrPayload: string | Omit<Receiving, 'id' | 'createdAt' | 'createdBy' | 'status'> & { id?: string }) => {
    // Resolve the receiving record — either from an id lookup or a directly passed payload.
    // Passing a payload avoids the "Receiving not found" race where setState hasn't
    // flushed yet when postReceiving is called right after saveReceivingDraft.
    let rcv: Receiving | undefined;
    if (typeof idOrPayload === 'string') {
      rcv = receivings.find((x) => x.id === idOrPayload);
    } else {
      const id = idOrPayload.id ?? uid('rcv');
      const existing = receivings.find((x) => x.id === id);
      rcv = {
        ...idOrPayload, id,
        status: existing?.status ?? 'draft',
        createdAt: existing?.createdAt ?? Date.now(),
        createdBy: existing?.createdBy ?? (user?.uid ?? ''),
      } as Receiving;
    }
    if (!rcv) return { ok: false, error: 'Receiving not found' };
    // P0.2: idempotency guards against duplicate posting.
    //  (a) status must still be draft, and postedAt must be absent;
    //  (b) an in-flight lock blocks a second click before the first resolves.
    if (rcv.status === 'posted' || rcv.postedAt != null) return { ok: false, error: 'Already posted' };
    if (rcv.status !== 'draft') return { ok: false, error: 'Only draft receivings can be posted' };
    if (rcv.lines.length === 0) return { ok: false, error: 'No line items to post' };
    if (!user) return { ok: false, error: 'Not signed in' };
    const lockKey = `rcv:${rcv.id}`;
    if (inFlight.current.has(lockKey)) return { ok: false, error: 'Posting already in progress' };
    inFlight.current.add(lockKey);

    try {
    // Country rate is header-level — derive it here, never from stale line.exchangeRate.
    const headerRate = rates.find((r) => r.country.toLowerCase() === (rcv.country ?? '').toLowerCase())?.finalUsedRate ?? 0;
    if (headerRate <= 0) return { ok: false, error: 'Country rate is missing or invalid. Set a rate in Administration → Country Rates.' };

    const ts = Date.now();
    // P1: Pre-compute everything that does NOT depend on current balance values.
    // Balance quantities are computed INSIDE the Firestore transaction after
    // re-reading from Firestore, so concurrent operations cannot be overwritten.
    const costWrites: CostHistory[] = [];
    const auditWrites: AuditLog[] = [];
    const newVariants: Variant[] = [];
    const variantPatches = new Map<string, Partial<Variant>>();

    type LineResolved = {
      variant: Variant;
      isGeneral: boolean;
      cost: number;
      pcs: number;
      stockUom: string;
      bId: string;
      lineQty: number;
    };
    const resolvedLines: LineResolved[] = [];

    for (const line of rcv.lines) {
      const product = products.find((p) => p.id === line.productId);
      const isGeneral = product?.type === 'general';
      let variant = variants.find((v) => v.id === line.variantId)
        ?? [...newVariants].find((v) => v.productId === line.productId);
      if (!variant && isGeneral && product) {
        variant = variants.find((v) => v.productId === product.id)
          ?? { id: uid('var'), productId: product.id, productType: 'general', label: product.name, active: true, createdAt: ts };
        if (!variants.some((v) => v.id === variant!.id) && !newVariants.some((v) => v.id === variant!.id)) newVariants.push(variant);
      }
      if (!variant) return { ok: false, error: 'Variant missing for a line' };
      const stockUom = line.stockUom || 'Pcs';

      const cost = (line.fobValue != null && (line.fobValue ?? 0) > 0)
        ? Math.round((line.fobValue / Math.max(line.fobUomUnit ?? 1, 0.001)) * headerRate * 100) / 100
        : (line.cost ?? variant.cost ?? 0);
      const pcs = isGeneral ? 0 : (line.rollQty ?? 0);

      if (!isGeneral && !variant.barcode?.trim()) {
        const prefix = suggestVariantBarcode({ name: product?.name ?? 'PRD' },
          { ourColorNumber: variant.ourColorNumber, designNumber: variant.designNumber, label: variant.label }, allBarcodes);
        const np = newVariants.find((v) => v.id === variant!.id);
        if (np) np.barcode = prefix;
        else variantPatches.set(variant.id, { ...(variantPatches.get(variant.id) ?? {}), barcode: prefix, barcodeSource: 'generated' });
        variant = { ...variant, barcode: prefix };
      }

      const bId = balanceId(variant.id, rcv.ownerShopId);
      resolvedLines.push({ variant, isGeneral, cost, pcs, stockUom, bId, lineQty: line.quantity });

      if (line.fobValue != null && (line.fobValue ?? 0) > 0) {
        costWrites.push({
          id: uid('cost'), variantId: variant.id, ownerShopId: rcv.ownerShopId,
          fobValue: line.fobValue, fobUnit: line.fobUnit ?? stockUom, exchangeRate: headerRate,
          stockUom, cost, receivingNo: rcv.receivingNo, timestamp: ts, userId: user.uid,
        });
      }
    }

    const posted: Receiving = { ...rcv, status: 'posted', postedAt: ts, postedBy: user.uid };

    if (LIVE && db) {
      try {
        const database = db;
        // P1: All balance reads AND writes happen inside this single transaction.
        // Re-reading from Firestore means we apply deltas on top of the true live
        // value, not the stale React-state value computed before the transaction.
        await runTransaction(database, async (tx) => {
          // Status guard: abort if already posted (duplicate-click protection).
          const rcvRef = doc(database, COL.receivings, rcv.id);
          const rcvSnap = await tx.get(rcvRef);
          if (rcvSnap.exists()) {
            const cur = rcvSnap.data() as Receiving;
            if (cur.status === 'posted' || cur.postedAt != null) {
              throw new DuplicateOperationError('Receiving already posted');
            }
          }

          // Read each unique balance doc exactly once.
          const uniqueBalIds = [...new Set(resolvedLines.map((r) => r.bId))];
          const balSnaps = new Map<string, import('firebase/firestore').DocumentSnapshot>();
          await Promise.all(uniqueBalIds.map(async (bId) => {
            balSnaps.set(bId, await tx.get(doc(database, COL.balances, bId)));
          }));

          // Aggregate deltas per balance key (multiple lines → same balance).
          const balDelta = new Map<string, { qtyDelta: number; rollDelta: number; unit: string; variantId: string; productId: string }>();
          for (const r of resolvedLines) {
            const existing = balDelta.get(r.bId);
            if (existing) { existing.qtyDelta += r.lineQty; existing.rollDelta += r.pcs; }
            else balDelta.set(r.bId, { qtyDelta: r.lineQty, rollDelta: r.pcs, unit: r.stockUom, variantId: r.variant.id, productId: r.variant.productId });
          }

          // Write one balance doc per unique key using live (transaction-read) values.
          for (const [bId, delta] of balDelta) {
            const snap = balSnaps.get(bId);
            const exQty    = snap?.exists() ? (snap.data() as Balance).quantity : 0;
            const exRolls  = snap?.exists() ? ((snap.data() as Balance).rollCount ?? 0) : 0;
            const newQty   = Math.round((exQty + delta.qtyDelta) * 100) / 100;
            const newRolls = exRolls + delta.rollDelta;
            const locId    = snap?.exists() ? (snap.data() as Balance).locationId : undefined;
            const balData: Record<string, unknown> = {
              id: bId, variantId: delta.variantId, productId: delta.productId,
              ownerShopId: rcv.ownerShopId, quantity: newQty, unit: delta.unit, updatedAt: ts,
              ...(delta.rollDelta > 0 || exRolls > 0 ? { rollCount: newRolls } : {}),
              ...(locId ? { locationId: locId } : {}),
            };
            tx.set(doc(database, COL.balances, bId), balData);
          }

          // Audit logs — derive qtyBefore/qtyAfter from transaction-read balances.
          for (const r of resolvedLines) {
            const snap     = balSnaps.get(r.bId);
            const qtyBefore = snap?.exists() ? (snap.data() as Balance).quantity : 0;
            const qtyAfter  = Math.round((qtyBefore + r.lineQty) * 100) / 100;
            const auditRef  = doc(collection(database, COL.audit));
            tx.set(auditRef, {
              id: uid('aud'), timestamp: ts, userId: user.uid, userName: user.name,
              action: 'RECEIVE', productId: r.variant.productId, variantId: r.variant.id, ownerShopId: rcv.ownerShopId,
              qtyBefore, qtyChanged: r.lineQty, qtyAfter,
              remarks: `Receiving ${rcv.receivingNo}: +${r.lineQty} ${r.stockUom}${r.pcs ? `, ${r.pcs} pcs` : ''}`,
              refId: rcv.receivingNo,
            });
          }

          // Variant metadata (display aggregates) derived from live transaction values.
          newVariants.forEach((v) => tx.set(doc(database, COL.variants, v.id), deepSanitize(v as unknown as Record<string, unknown>)));
          variantPatches.forEach((p, vid) => tx.update(doc(database, COL.variants, vid), deepSanitize(p as Record<string, unknown>)));
          costWrites.forEach((c) => tx.set(doc(database, COL.costHistory, c.id), deepSanitize(c as unknown as Record<string, unknown>)));
          for (const r of resolvedLines) {
            if (!r.isGeneral) {
              const snap    = balSnaps.get(r.bId);
              const exQty   = snap?.exists() ? (snap.data() as Balance).quantity : 0;
              const exRolls = snap?.exists() ? ((snap.data() as Balance).rollCount ?? 0) : 0;
              const nQty    = Math.round((exQty + r.lineQty) * 100) / 100;
              const nRolls  = exRolls + r.pcs;
              tx.update(doc(database, COL.variants, r.variant.id), deepSanitize({
                rollQty: nRolls, uom: r.stockUom, totalQty: nQty,
                cost: r.cost, totalValue: Math.round(nQty * r.cost * 100) / 100, lastReceiveDate: ts,
              } as Record<string, unknown>));
            }
          }
          tx.set(doc(database, COL.receivings, rcv.id), deepSanitize(posted as unknown as Record<string, unknown>));
        });
      } catch (e) {
        if (e instanceof DuplicateOperationError) return { ok: false, error: e.message };
        return { ok: false, error: `Atomic post failed: ${(e as Error).message}` };
      }
    } else {
      // Demo mode: compute from React state (no real transactions).
      const balAccDemo = new Map<string, number>();
      const balWritesDemo: Balance[] = [];
      for (const r of resolvedLines) {
        const exQty   = balAccDemo.get(r.bId) ?? balanceOf(r.variant.id, rcv.ownerShopId)?.quantity ?? 0;
        const exRolls = balances.find((b) => b.id === r.bId)?.rollCount ?? 0;
        const newQty  = Math.round((exQty + r.lineQty) * 100) / 100;
        const newRolls = exRolls + r.pcs;
        balAccDemo.set(r.bId, newQty);
        const entry: Balance = { id: r.bId, variantId: r.variant.id, productId: r.variant.productId, ownerShopId: rcv.ownerShopId, quantity: newQty, unit: r.stockUom, updatedAt: ts };
        if (!r.isGeneral) entry.rollCount = newRolls;
        balWritesDemo.push(entry);
        auditWrites.push({
          id: uid('aud'), timestamp: ts, userId: user.uid, userName: user.name,
          action: 'RECEIVE', productId: r.variant.productId, variantId: r.variant.id, ownerShopId: rcv.ownerShopId,
          qtyBefore: exQty, qtyChanged: r.lineQty, qtyAfter: newQty,
          remarks: `Receiving ${rcv.receivingNo}: +${r.lineQty} ${r.stockUom}${r.pcs ? `, ${r.pcs} pcs` : ''}`,
          refId: rcv.receivingNo,
        });
        if (!r.isGeneral) {
          variantPatches.set(r.variant.id, { ...(variantPatches.get(r.variant.id) ?? {}), rollQty: newRolls, uom: r.stockUom, totalQty: newQty, cost: r.cost, totalValue: Math.round(newQty * r.cost * 100) / 100, lastReceiveDate: ts });
        }
      }
      setVariants((prev) => {
        let next = newVariants.length ? [...prev, ...newVariants] : prev;
        if (variantPatches.size) next = next.map((v) => variantPatches.has(v.id) ? { ...v, ...variantPatches.get(v.id) } : v);
        return next;
      });
      setBalances((prev) => {
        const map = new Map(prev.map((b) => [b.id, b]));
        balWritesDemo.forEach((b) => map.set(b.id, b));
        return [...map.values()];
      });
      if (costWrites.length) setCostHistory((prev) => [...costWrites, ...prev]);
      if (auditWrites.length) setAudit((prev) => [...auditWrites, ...prev]);
      setReceivings((prev) => {
        const exists = prev.some((x) => x.id === rcv.id);
        return exists ? prev.map((x) => (x.id === rcv.id ? posted : x)) : [posted, ...prev];
      });
    }
    return { ok: true };
    } finally {
      inFlight.current.delete(lockKey);
    }
  }, [receivings, variants, products, balances, rates, allBarcodes, user, balanceOf]);

  const cancelReceiving = useCallback((id: string) => {
    const rcv = receivings.find((x) => x.id === id);
    if (!rcv || rcv.status === 'posted') return; // posted history is preserved
    const cancelled: Receiving = { ...rcv, status: 'cancelled' };
    writeDoc(COL.receivings, id, cancelled as unknown as Record<string, unknown>,
      () => setReceivings((prev) => prev.map((x) => (x.id === id ? cancelled : x))));
  }, [receivings, writeDoc]);

  const deleteReceivingDraft = useCallback(async (id: string): Promise<{ ok: boolean; error?: string }> => {
    const rcv = receivings.find((x) => x.id === id);
    if (!rcv || rcv.status !== 'draft') return { ok: false, error: 'Only drafts can be deleted' };
    if (LIVE) {
      try { await fsRemove(COL.receivings, id); }
      catch (e) { return { ok: false, error: (e as Error).message }; }
    }
    setReceivings((prev) => prev.filter((x) => x.id !== id));
    return { ok: true };
  }, [receivings]);

  const saveTransferDraft = useCallback((t: Omit<Transfer, 'id' | 'createdAt' | 'status'> & { id?: string }) => {
    const id = t.id ?? uid('trf');
    const existing = transfers.find((x) => x.id === id);
    const doc_: Transfer = {
      ...t, id,
      status: existing?.status ?? 'draft',
      createdAt: existing?.createdAt ?? Date.now(),
    };
    writeDoc(COL.transfers, id, deepSanitize(doc_ as unknown as Record<string, unknown>),
      () => setTransfers((prev) => [doc_, ...prev.filter((x) => x.id !== id)]));
    return id;
  }, [transfers, writeDoc]);

  // Sending a transfer deducts/moves stock. Accepts either an id (to look up from state)
  // OR a full Transfer payload — the payload path avoids the React-state-not-flushed race
  // that caused "Transfer not found" when called immediately after saveTransferDraft.
  const sendTransfer = useCallback(async (idOrPayload: string | (Omit<Transfer, 'id' | 'createdAt' | 'status'> & { id?: string })) => {
    let trf: Transfer | undefined;
    if (typeof idOrPayload === 'string') {
      trf = transfers.find((x) => x.id === idOrPayload);
    } else {
      const id = idOrPayload.id ?? uid('trf');
      const existing = transfers.find((x) => x.id === id);
      trf = {
        ...idOrPayload, id,
        status: existing?.status ?? 'draft',
        createdAt: existing?.createdAt ?? Date.now(),
      } as Transfer;
    }
    if (!trf) return { ok: false, error: 'Transfer not found' };
    if (trf.status !== 'draft') return { ok: false, error: 'Only drafts can be sent' };
    if (trf.lines.length === 0) return { ok: false, error: 'No line items' };
    if (trf.type === 'ownership' && !trf.approvedBy) {
      return { ok: false, error: 'Ownership transfer requires manager approval' };
    }
    // P0.1: in-flight lock blocks a duplicate send click before the first resolves.
    const sendLockKey = `trf:${trf.id}`;
    if (inFlight.current.has(sendLockKey)) return { ok: false, error: 'Send already in progress' };
    inFlight.current.add(sendLockKey);
    try {

    // Phase 4 (Production Safety): apply ALL lines atomically. In LIVE mode the
    // balance changes, audit logs, and the transfer status flip happen in ONE
    // Firestore transaction guarded by expectStatus 'draft' — so a duplicate send
    // click is rejected (DuplicateOperationError) and a mid-line failure rolls back
    // everything. Internal moves (location-only) keep the per-line path since they
    // do not change quantities.
    if (LIVE && trf.type !== 'internal') {
      const lines: MovementLineSpec[] = [];
      for (const line of trf.lines) {
        const variant = variants.find((v) => v.id === line.variantId);
        if (!variant) return { ok: false, error: 'Variant missing for a line' };
        const isGeneral = variant.productType === 'general';
        if (trf.type === 'ownership') {
          lines.push({
            variant, ownerShopId: trf.fromShopId, qtyChanged: -line.quantity, unit: line.unit,
            rollDelta: isGeneral ? undefined : -(line.rollQty ?? 0),
            remarks: `Move ${trf.transferNo}: godown ownership → ${shopName(trf.toShopId)}${line.rollQty ? `, ${line.rollQty} PCS` : ''}`,
          });
          lines.push({
            variant, ownerShopId: trf.toShopId, qtyChanged: line.quantity, unit: line.unit,
            rollDelta: isGeneral ? undefined : (line.rollQty ?? 0),
            remarks: `Move ${trf.transferNo}: godown ownership ← ${shopName(trf.fromShopId)}${line.rollQty ? `, ${line.rollQty} PCS` : ''}`,
          });
        } else {
          lines.push({
            variant, ownerShopId: trf.fromShopId, qtyChanged: -line.quantity, unit: line.unit,
            rollDelta: isGeneral ? undefined : -(line.rollQty ?? 0),
            remarks: `Move ${trf.transferNo}: transferred out of godown${line.remarks ? ' — ' + line.remarks : ''}`,
          });
        }
      }
      const canOverride = !!user && can(user.role, 'override_negative');
      try {
        // Ensure the draft exists in Firestore so the in-transaction status guard
        // can read it. upsert() is async and resolves when the write completes —
        // the previous writeDoc()-wrapped Promise never resolved in live mode and
        // caused sendTransfer to hang (P0.1).
        await upsert(COL.transfers, trf.id, deepSanitize(trf as unknown as Record<string, unknown>));
        await applyAtomicBatch({
          lines, action: trf.type === 'ownership' ? 'OWNERSHIP_TRANSFER' : 'TRANSFER_OUT',
          user: user!, refId: trf.transferNo, canOverride,
          statusDoc: { collection: COL.transfers, id: trf.id, expectStatus: 'draft', newFields: { status: 'sent', sentAt: Date.now() } },
        });
      } catch (e) {
        if (e instanceof DuplicateOperationError) return { ok: false, error: e.message };
        if (e instanceof NegativeStockError) return { ok: false, error: e.message, needsOverride: true };
        return { ok: false, error: (e as Error).message };
      }
      // Sync local state + variant aggregate (display metadata only).
      const sentTrf: Transfer = { ...trf, status: 'sent', sentAt: Date.now() };
      setTransfers((prev) => {
        const exists = prev.some((x) => x.id === trf!.id);
        return exists ? prev.map((x) => (x.id === trf!.id ? sentTrf : x)) : [sentTrf, ...prev];
      });
      if (trf.type === 'transfer_out') {
        for (const line of trf.lines) {
          const variant = variants.find((v) => v.id === line.variantId);
          if (variant && variant.productType !== 'general') {
            const nextTotalQty = Math.max(0, Math.round(((variant.totalQty ?? 0) - line.quantity) * 100) / 100);
            const safe = Object.fromEntries(Object.entries({
              rollQty: Math.max(0, (variant.rollQty ?? 0) - (line.rollQty ?? 0)),
              totalQty: nextTotalQty,
              totalValue: Math.round(nextTotalQty * (variant.cost ?? 0) * 100) / 100,
              lastTransferDate: Date.now(),
            }).filter(([, v]) => v !== undefined));
            fsPatch(COL.variants, variant.id, safe as Partial<Variant>);
          }
        }
      }
      return { ok: true };
    }

    for (const line of trf.lines) {
      const variant = variants.find((v) => v.id === line.variantId);
      if (!variant) return { ok: false, error: 'Variant missing for a line' };

      if (trf.type === 'internal') {
        // Owner unchanged; godown location move only.
        const res = await applyLocalMovement({
          variant, ownerShopId: trf.fromShopId, qtyChanged: 0, unit: line.unit,
          action: 'INTERNAL_MOVEMENT',
          remarks: `Move ${trf.transferNo}: godown location move${line.remarks ? ' — ' + line.remarks : ''}`,
          refId: trf.transferNo, locationId: trf.toLocationId,
        });
        if (!res.ok) return { ok: false, error: `Line failed: ${res.error}`, needsOverride: res.needsOverride };
      } else if (trf.type === 'ownership') {
        // Ownership change between owners — both still in the godown. Deduct from
        // the source owner's godown stock, credit the destination owner's godown stock.
        // Fix P1.3: include rollDelta so PCS/rollCount also transfers correctly.
        const rollsOut = variant.productType === 'general' ? undefined : -(line.rollQty ?? 0);
        const rollsIn  = variant.productType === 'general' ? undefined : (line.rollQty ?? 0);
        const outRes = await applyLocalMovement({
          variant, ownerShopId: trf.fromShopId, qtyChanged: -line.quantity, unit: line.unit,
          action: 'OWNERSHIP_TRANSFER',
          remarks: `Move ${trf.transferNo}: godown ownership → ${shopName(trf.toShopId)}${line.rollQty ? `, ${line.rollQty} PCS` : ''}`,
          refId: trf.transferNo, rollDelta: rollsOut,
        });
        if (!outRes.ok) return { ok: false, error: `Line failed: ${outRes.error}`, needsOverride: outRes.needsOverride };
        const inRes = await applyLocalMovement({
          variant, ownerShopId: trf.toShopId, qtyChanged: line.quantity, unit: line.unit,
          action: 'OWNERSHIP_TRANSFER',
          remarks: `Move ${trf.transferNo}: godown ownership ← ${shopName(trf.fromShopId)}${line.rollQty ? `, ${line.rollQty} PCS` : ''}`,
          refId: trf.transferNo, locationId: trf.toLocationId, rollDelta: rollsIn,
        });
        if (!inRes.ok) return { ok: false, error: `Destination credit failed: ${inRes.error}` };
      } else {
        // TRANSFER OUT: stock LEAVES the godown to the owner's shop. Deduct only —
        // StockDesk does NOT track shop stock, so there is no destination balance.
        const res = await applyLocalMovement({
          variant, ownerShopId: trf.fromShopId, qtyChanged: -line.quantity, unit: line.unit,
          action: 'TRANSFER_OUT',
          remarks: `Move ${trf.transferNo}: transferred out of godown${line.remarks ? ' — ' + line.remarks : ''}`,
          refId: trf.transferNo,
          rollDelta: variant.productType === 'general' ? undefined : -(line.rollQty ?? 0),
        });
        if (!res.ok) return { ok: false, error: `Line failed: ${res.error}`, needsOverride: res.needsOverride };
        // Sync variant DISPLAY aggregate (not operational source). Phase 7: derive
        // from the post-move balance so the display field can't drift from truth.
        if (variant.productType !== 'general') {
          const postBal = balanceOf(variant.id, trf.fromShopId);
          const nextTotalQty = Math.max(0, Math.round(((postBal?.quantity ?? 0)) * 100) / 100);
          const patch: Partial<Variant> = {
            rollQty: Math.max(0, postBal?.rollCount ?? 0),
            totalQty: nextTotalQty,
            totalValue: Math.round(nextTotalQty * (variant.cost ?? 0) * 100) / 100,
            lastTransferDate: Date.now(),
          };
          // Strip undefined before writing to Firestore.
          if (LIVE) {
            const safe = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
            fsPatch(COL.variants, variant.id, safe as Partial<Variant>);
          } else setVariants((prev) => prev.map((v) => (v.id === variant.id ? { ...v, ...patch } : v)));
        }
      }
    }
    const sent: Transfer = { ...trf, status: 'sent', sentAt: Date.now() };
    writeDoc(COL.transfers, trf.id, deepSanitize(sent as unknown as Record<string, unknown>), () => {
      setTransfers((prev) => {
        const exists = prev.some((x) => x.id === trf.id);
        return exists ? prev.map((x) => (x.id === trf.id ? sent : x)) : [sent, ...prev];
      });
    });
    return { ok: true };
    } finally {
      inFlight.current.delete(sendLockKey);
    }
  }, [transfers, variants, applyLocalMovement, writeDoc, shopName, user, balanceOf]);

  const receiveTransfer = useCallback((id: string) => {
    const trf = transfers.find((x) => x.id === id);
    if (!trf || trf.status !== 'sent') return;
    const received: Transfer = { ...trf, status: 'received', receivedAt: Date.now(), receivedBy: user?.uid };
    writeDoc(COL.transfers, id, deepSanitize(received as unknown as Record<string, unknown>),
      () => setTransfers((prev) => prev.map((x) => (x.id === id ? received : x))));
  }, [transfers, user, writeDoc]);

  const cancelTransfer = useCallback((id: string) => {
    const trf = transfers.find((x) => x.id === id);
    if (!trf || trf.status === 'received') return; // completed transfers preserved
    const cancelled: Transfer = { ...trf, status: 'cancelled' };
    writeDoc(COL.transfers, id, deepSanitize(cancelled as unknown as Record<string, unknown>),
      () => setTransfers((prev) => prev.map((x) => (x.id === id ? cancelled : x))));
  }, [transfers, writeDoc]);

  const deleteTransferDraft = useCallback(async (id: string): Promise<{ ok: boolean; error?: string }> => {
    const trf = transfers.find((x) => x.id === id);
    if (!trf || trf.status !== 'draft') return { ok: false, error: 'Only drafts can be deleted' };
    if (LIVE) {
      try { await fsRemove(COL.transfers, id); }
      catch (e) { return { ok: false, error: (e as Error).message }; }
    }
    setTransfers((prev) => prev.filter((x) => x.id !== id));
    return { ok: true };
  }, [transfers]);

  // ---- Stock Count ----
  const nextCountNo = useCallback(() => `CNT-${String(stockCounts.length + 1).padStart(4, '0')}`, [stockCounts]);

  const saveCount = useCallback((c: Omit<StockCount, 'id' | 'createdAt' | 'status'> & { id?: string; status?: StockCount['status'] }) => {
    const id = c.id ?? uid('cnt');
    const existing = stockCounts.find((x) => x.id === id);
    const doc_: StockCount = {
      ...c, id,
      status: c.status ?? existing?.status ?? 'open',
      createdAt: existing?.createdAt ?? Date.now(),
    };
    writeDoc(COL.counts, id, deepSanitize(doc_ as unknown as Record<string, unknown>),
      () => setStockCounts((prev) => [doc_, ...prev.filter((x) => x.id !== id)]));
    return id;
  }, [stockCounts, writeDoc]);

  const submitCount = useCallback((id: string) => {
    const c = stockCounts.find((x) => x.id === id);
    // Allow resubmission from rejected status as well as initial open submit.
    if (!c || (c.status !== 'open' && c.status !== 'rejected')) return;
    const submitted: StockCount = {
      ...c,
      status: 'submitted',
      submittedAt: Date.now(),
      // Clear rejection state on resubmit so it doesn't confuse the approver.
      rejectedAt: undefined,
      rejectedBy: undefined,
      // Keep rejectionNote in history for audit trail — do not clear it.
    };
    writeDoc(COL.counts, id, deepSanitize(submitted as unknown as Record<string, unknown>),
      () => setStockCounts((prev) => prev.map((x) => (x.id === id ? submitted : x))));
  }, [stockCounts, writeDoc]);

  // Approving a count sets stock_balances to the submitted physical values absolutely
  // (not just adding the old variance delta). This prevents drift if stock moved
  // between submission and approval.
  //
  // Conflict detection: if the current balance differs from what was expected at
  // submit time, block approval with a clear error.
  //
  // Structured audit: every COUNT_ADJUSTMENT entry carries countNo, barcode,
  // oldPcs, newPcs, pcsDelta, oldQty, newQty, qtyDelta, reason, approvedBy.
  const approveCount = useCallback(async (id: string) => {
    const c = stockCounts.find((x) => x.id === id);
    if (!c) return { ok: false, error: 'Count not found' };
    if (c.status !== 'submitted') return { ok: false, error: 'Only submitted counts can be approved' };
    if (!can(user?.role, 'approve_adjustment')) return { ok: false, error: 'Not authorized to approve' };
    if (!user) return { ok: false, error: 'Not signed in' };

    const ts = Date.now();

    // P2: Build conflict checks to run INSIDE the atomic transaction.
    // This eliminates the TOCTOU window between the old pre-transaction check
    // and the commit — the comparison now runs on transaction-read (authoritative)
    // balance values, so any concurrent stock change between submission and approval
    // is detected and the transaction aborts cleanly.
    const conflictChecks = c.lines.map((line) => {
      const v = variants.find((x) => x.id === line.variantId);
      return {
        variantId: line.variantId,
        ownerShopId: c.shopId,
        expectedQty: line.expectedQuantity ?? 0,
        expectedRolls: line.expectedRolls,
        label: v?.barcode ?? line.variantId,
      };
    });

    // Build batch lines — delta = (actualQty - expectedQty), so balance reaches actualQty absolutely.
    // In-transaction conflict check ensures expectedQty still matches current balance before applying.
    const batchLines: MovementLineSpec[] = [];
    for (const line of c.lines) {
      const variant = variants.find((v) => v.id === line.variantId);
      if (!variant) continue;
      const oldQty = line.expectedQuantity ?? 0; // expected = what balance was at submit
      const oldPcs = line.expectedRolls ?? 0;
      const newQty = Math.max(0, Math.round((line.actualQuantity ?? 0) * 100) / 100);
      const newPcs = Math.max(0, line.actualRolls ?? 0);
      const qtyDelta = Math.round((newQty - oldQty) * 100) / 100;
      const pcsDelta = newPcs - oldPcs;
      if (qtyDelta === 0 && pcsDelta === 0) continue;
      batchLines.push({
        variant, ownerShopId: c.shopId, qtyChanged: qtyDelta, unit: line.unit,
        rollDelta: variant.productType === 'general' ? undefined : pcsDelta,
        remarks: JSON.stringify({
          countNo: c.countNo, variantId: variant.id, barcode: variant.barcode ?? '',
          oldPcs, newPcs, pcsDelta, oldQty, newQty, qtyDelta,
          reason: line.reason ?? '', approvedBy: user.uid, approvedAt: ts,
        }),
      });
    }

    if (LIVE) {
      try {
        await applyAtomicBatch({
          lines: batchLines, action: 'STOCK_COUNT_CORRECTION', user, refId: c.countNo,
          canOverride: true,
          statusDoc: { collection: COL.counts, id, expectStatus: 'submitted', newFields: { status: 'approved', approvedAt: ts, approvedBy: user.uid } },
          conflictChecks,  // P2: conflict check runs inside the transaction
        });
      } catch (e) {
        if (e instanceof DuplicateOperationError) return { ok: false, error: e.message };
        if (e instanceof ConflictError) return { ok: false, error: e.message, conflict: true };
        return { ok: false, error: (e as Error).message };
      }
      // Sync local state + variant aggregates (display metadata only).
      setStockCounts((prev) => prev.map((x) => (x.id === id ? { ...c, status: 'approved', approvedAt: ts, approvedBy: user.uid } : x)));
      for (const line of c.lines) {
        const variant = variants.find((v) => v.id === line.variantId);
        if (variant && variant.productType !== 'general') {
          const newQty = Math.max(0, Math.round((line.actualQuantity ?? 0) * 100) / 100);
          const newPcs = Math.max(0, line.actualRolls ?? 0);
          const safe = Object.fromEntries(Object.entries({
            rollQty: newPcs, totalQty: newQty,
            totalValue: Math.round(newQty * (variant.cost ?? 0) * 100) / 100,
          }).filter(([, v]) => v !== undefined));
          fsPatch(COL.variants, variant.id, safe as Partial<Variant>);
        }
      }
      return { ok: true };
    }

    // Demo mode: sequential apply (no real transactions).
    for (const line of c.lines) {
      const variant = variants.find((v) => v.id === line.variantId);
      if (!variant) continue;

      const bal = balances.find((b) => b.variantId === line.variantId && b.ownerShopId === c.shopId);
      const oldQty = Math.round((bal?.quantity ?? 0) * 100) / 100;
      const oldPcs = bal?.rollCount ?? 0;

      // Absolute target (what warehouse physically counted).
      const newQty = Math.max(0, Math.round((line.actualQuantity ?? 0) * 100) / 100);
      const newPcs = Math.max(0, line.actualRolls ?? 0);
      const qtyDelta = Math.round((newQty - oldQty) * 100) / 100;
      const pcsDelta = newPcs - oldPcs;

      if (qtyDelta === 0 && pcsDelta === 0) continue; // nothing to change

      // Write new balance directly (absolute set, not delta).
      const newBal: import('../types').Balance = {
        ...(bal ?? {
          id: balanceId(variant.id, c.shopId),
          variantId: variant.id,
          productId: variant.productId,
          ownerShopId: c.shopId,
          unit: line.unit,
        }),
        quantity:  newQty,
        rollCount: variant.productType === 'general' ? undefined : newPcs,
        updatedAt: ts,
      };
      const bId = balanceId(variant.id, c.shopId);

      // Structured audit entry with all required fields.
      const auditEntry: import('../types').AuditLog = {
        id: uid('aud'), timestamp: ts, userId: user.uid, userName: user.name,
        action: 'STOCK_COUNT_CORRECTION',
        productId: variant.productId, variantId: variant.id, ownerShopId: c.shopId,
        qtyBefore: oldQty, qtyChanged: qtyDelta, qtyAfter: newQty,
        refId: c.countNo,
        remarks: JSON.stringify({
          countNo:    c.countNo,
          variantId:  variant.id,
          barcode:    variant.barcode ?? '',
          oldPcs,     newPcs,     pcsDelta,
          oldQty,     newQty,     qtyDelta,
          reason:     line.reason ?? '',
          approvedBy: user.uid,
          approvedAt: ts,
        }),
      };

      setBalances((prev) => {
        const map = new Map(prev.map((b) => [b.id, b]));
        map.set(bId, newBal);
        return [...map.values()];
      });
      setAudit((prev) => [auditEntry, ...prev]);

      // Keep variant metadata in sync.
      if (variant.productType !== 'general') {
        const patch: Partial<Variant> = {
          rollQty:    newPcs,
          totalQty:   newQty,
          totalValue: Math.round(newQty * (variant.cost ?? 0) * 100) / 100,
        };
        setVariants((prev) => prev.map((v) => (v.id === variant.id ? { ...v, ...patch } : v)));
      }
    }

    const approved: StockCount = { ...c, status: 'approved', approvedAt: ts, approvedBy: user.uid };
    writeDoc(COL.counts, id, deepSanitize(approved as unknown as Record<string, unknown>),
      () => setStockCounts((prev) => prev.map((x) => (x.id === id ? approved : x))));
    return { ok: true };
  }, [stockCounts, variants, balances, user, writeDoc]);

  const rejectCount = useCallback((id: string, note: string) => {
    const c = stockCounts.find((x) => x.id === id);
    if (!c || c.status !== 'submitted') return;
    if (!user) return;
    // Rejection sends the count back to open so warehouse staff can re-count.
    const rejected: StockCount = {
      ...c, status: 'rejected' as const,
      rejectedAt: Date.now(), rejectedBy: user.uid,
      rejectionNote: note.trim() || 'Rejected — please recount',
    };
    writeDoc(COL.counts, id, deepSanitize(rejected as unknown as Record<string, unknown>),
      () => setStockCounts((prev) => prev.map((x) => (x.id === id ? rejected : x))));
  }, [stockCounts, user, writeDoc]);

  const cancelCount = useCallback((id: string) => {
    const c = stockCounts.find((x) => x.id === id);
    if (!c || c.status === 'approved') return;
    const cancelled: StockCount = { ...c, status: 'cancelled' };
    writeDoc(COL.counts, id, deepSanitize(cancelled as unknown as Record<string, unknown>),
      () => setStockCounts((prev) => prev.map((x) => (x.id === id ? cancelled : x))));
  }, [stockCounts, writeDoc]);

  const deleteCountDraft = useCallback(async (id: string): Promise<{ ok: boolean; error?: string }> => {
    const c = stockCounts.find((x) => x.id === id);
    if (!c || c.status !== 'open') return { ok: false, error: 'Only open counts can be deleted' };
    if (LIVE) {
      try { await fsRemove(COL.counts, id); }
      catch (e) { return { ok: false, error: (e as Error).message }; }
    }
    setStockCounts((prev) => prev.filter((x) => x.id !== id));
    return { ok: true };
  }, [stockCounts]);

  // ---- Damage Reports -------------------------------------------------------
  // Staff create reports (no stock change). Manager/Admin approve (reduces stock) or reject.

  const createDamageReport = useCallback((r: Omit<DamageReport, 'id' | 'reportedAt' | 'status'>) => {
    const id = uid('dmg');
    const report: DamageReport = { ...r, id, reportedAt: Date.now(), status: 'pending' };
    writeDoc(COL.damageReports, id, deepSanitize(report as unknown as Record<string, unknown>),
      () => setDamageReports((prev) => [report, ...prev]));
    return id;
  }, [writeDoc]);

  const approveDamageReport = useCallback(async (id: string): Promise<{ ok: boolean; error?: string }> => {
    const r = damageReports.find((x) => x.id === id);
    if (!r) return { ok: false, error: 'Report not found' };
    if (r.status !== 'pending') return { ok: false, error: 'Only pending reports can be approved' };
    if (!can(user?.role, 'approve_adjustment')) return { ok: false, error: 'Not authorized' };
    if (!user) return { ok: false, error: 'Not signed in' };
    const variant = variants.find((v) => v.id === r.variantId);
    if (!variant) return { ok: false, error: 'Variant not found' };

    const canOverride = can(user.role, 'override_negative') && settings.allowNegativeOverride;
    const approvedFields = { status: 'approved', approvedBy: user.uid, approvedAt: Date.now() };

    if (LIVE) {
      // Atomic: balance + audit + report status flip in ONE transaction.
      // The status guard (expectStatus 'pending') makes this idempotent — a
      // duplicate approve click throws DuplicateOperationError, nothing deducts.
      try {
        await applyAtomicBatch({
          action: 'DAMAGE', user, refId: id, canOverride,
          lines: [{
            variant, ownerShopId: r.shopId, qtyChanged: -r.reportedQty, unit: r.uom,
            rollDelta: variant.productType === 'general' ? undefined : -r.reportedPcs,
            remarks: `Damage write-off approved: ${r.reason}${r.notes ? ' — ' + r.notes : ''}`,
          }],
          statusDoc: { collection: COL.damageReports, id, expectStatus: 'pending', newFields: approvedFields },
        });
        return { ok: true };
      } catch (e) {
        if (e instanceof DuplicateOperationError) return { ok: false, error: e.message };
        if (e instanceof NegativeStockError) return { ok: false, error: e.message };
        return { ok: false, error: (e as Error).message };
      }
    }

    // Demo mode: sequential (no real transactions available).
    const res = await applyLocalMovement({
      variant, ownerShopId: r.shopId, qtyChanged: -r.reportedQty, unit: r.uom,
      action: 'DAMAGE', rollDelta: variant.productType === 'general' ? undefined : -r.reportedPcs,
      remarks: `Damage write-off approved: ${r.reason}${r.notes ? ' — ' + r.notes : ''}`, refId: id,
    });
    if (!res.ok) return { ok: false, error: res.error };
    const approved: DamageReport = { ...r, ...approvedFields } as DamageReport;
    setDamageReports((prev) => prev.map((x) => (x.id === id ? approved : x)));
    return { ok: true };
  }, [damageReports, variants, user, settings.allowNegativeOverride, applyLocalMovement]);

  const rejectDamageReport = useCallback((id: string, note: string) => {
    const r = damageReports.find((x) => x.id === id);
    if (!r || r.status !== 'pending') return;
    if (!user) return;
    const rejected: DamageReport = { ...r, status: 'rejected', rejectedBy: user.uid, rejectedAt: Date.now(), rejectionNote: note.trim() || 'Rejected' };
    writeDoc(COL.damageReports, id, deepSanitize(rejected as unknown as Record<string, unknown>),
      () => setDamageReports((prev) => prev.map((x) => (x.id === id ? rejected : x))));
  }, [damageReports, user, writeDoc]);

  const addProduct = useCallback((p: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>, vs: Omit<Variant, 'id' | 'productId' | 'createdAt'>[]) => {
    const pid = uid('p'); const ts = Date.now();
    const product: Product = { ...p, id: pid, createdAt: ts, updatedAt: ts };
    const newVariants: Variant[] = vs.map((v) => ({ ...v, id: uid('v'), productId: pid, createdAt: ts }));
    if (LIVE) {
      upsert(COL.products, pid, product as unknown as Record<string, unknown>);
      newVariants.forEach((v) => upsert(COL.variants, v.id, v as unknown as Record<string, unknown>));
    } else {
      setProducts((prev) => [...prev, product]);
      setVariants((prev) => [...prev, ...newVariants]);
    }
  }, []);
  const updateProduct = useCallback((id: string, p: Partial<Product>) => {
    if (LIVE) fsPatch(COL.products, id, { ...p, updatedAt: Date.now() });
    else setProducts((prev) => prev.map((x) => (x.id === id ? { ...x, ...p, updatedAt: Date.now() } : x)));
  }, []);
  const addVariant = useCallback((productId: string, v: Omit<Variant, 'id' | 'productId' | 'createdAt'>) => {
    const nv: Variant = { ...v, id: uid('v'), productId, createdAt: Date.now() };
    if (LIVE) upsert(COL.variants, nv.id, nv as unknown as Record<string, unknown>);
    else setVariants((prev) => [...prev, nv]);
  }, []);
  const updateVariant = useCallback((id: string, p: Partial<Variant>) => {
    if (LIVE) fsPatch(COL.variants, id, p);
    else setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...p } : v)));
  }, []);

  // ---- Data quality / barcode helpers ----
  const isBarcodeUnique = useCallback(
    (barcode: string, exceptVariantId?: string) => !isBarcodeTaken(barcode, variants, exceptVariantId),
    [variants],
  );

  const findDuplicateProduct = useCallback((name: string, exceptId?: string) => {
    const norm = name.trim().toLowerCase();
    return products.find((p) => p.id !== exceptId && p.name.trim().toLowerCase() === norm);
  }, [products]);

  const findDuplicateVariant = useCallback((productId: string, identity: string, exceptId?: string) => {
    const norm = identity.trim().toLowerCase();
    if (!norm) return undefined;
    return variants.find((v) => v.id !== exceptId && v.productId === productId
      && (v.ourColorNumber ?? v.designNumber ?? v.label).trim().toLowerCase() === norm);
  }, [variants]);

  const generateBarcodeFor = useCallback((productName: string, variant: { ourColorNumber?: string; designNumber?: string; label: string }, fallbackIndex = 1) => {
    return suggestVariantBarcode({ name: productName }, variant, allBarcodes, fallbackIndex);
  }, [allBarcodes]);

  const addSupplier = useCallback((s: Omit<Supplier, 'id' | 'createdAt'>) => {
    const ns: Supplier = { ...s, id: uid('sup'), createdAt: Date.now() };
    if (LIVE) upsert(COL.suppliers, ns.id, ns as unknown as Record<string, unknown>);
    else setSuppliers((prev) => [...prev, ns]);
  }, []);
  const updateSupplier = useCallback((id: string, p: Partial<Supplier>) => {
    if (LIVE) fsPatch(COL.suppliers, id, p);
    else setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, ...p } : s)));
  }, []);

  const addRate = useCallback((r: Omit<CountryRate, 'id'>) => {
    const nr: CountryRate = { ...r, id: uid('rate') };
    if (LIVE) upsert(COL.countryRates, nr.id, nr as unknown as Record<string, unknown>);
    else setRates((prev) => [...prev, nr]);
  }, []);
  const updateRate = useCallback((id: string, p: Partial<CountryRate>) => {
    if (LIVE) fsPatch(COL.countryRates, id, p);
    else setRates((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }, []);

  const addUnit = useCallback((code: string) => {
    if (units.some((u) => u.code.toLowerCase() === code.toLowerCase())) return;
    const nu: Unit = { id: uid('unit'), code, custom: true };
    if (LIVE) upsert(COL.units, nu.id, nu as unknown as Record<string, unknown>);
    else setUnits((prev) => [...prev, nu]);
  }, [units]);
  const removeUnit = useCallback((id: string) => {
    if (LIVE) fsRemove(COL.units, id);
    else setUnits((prev) => prev.filter((u) => u.id !== id));
  }, []);
  const addCategory = useCallback((c: string) => {
    if (categories.includes(c)) return;
    const next = [...categories, c];
    if (LIVE) upsert(COL.settings, 'categories', { values: next });
    else setCategories(next);
  }, [categories]);
  const removeCategory = useCallback((c: string) => {
    const next = categories.filter((x) => x !== c);
    if (LIVE) upsert(COL.settings, 'categories', { values: next });
    else setCategories(next);
  }, [categories]);
  const addShop = useCallback((name: string) => {
    const ns: Shop = { id: uid('shop'), name, active: true, createdAt: Date.now() };
    if (LIVE) upsert(COL.shops, ns.id, ns as unknown as Record<string, unknown>);
    else setShops((prev) => [...prev, ns]);
  }, []);
  const updateShop = useCallback((id: string, p: Partial<Shop>) => {
    if (LIVE) fsPatch(COL.shops, id, p);
    else setShops((prev) => prev.map((s) => (s.id === id ? { ...s, ...p } : s)));
  }, []);
  const addLocation = useCallback((l: Omit<StockLocation, 'id' | 'label'>) => {
    const nl: StockLocation = { ...l, id: uid('loc'), label: locationLabel(l) };
    if (LIVE) upsert(COL.locations, nl.id, nl as unknown as Record<string, unknown>);
    else setLocations((prev) => [...prev, nl]);
  }, []);
  const removeLocation = useCallback((id: string) => {
    if (LIVE) fsRemove(COL.locations, id);
    else setLocations((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const updateUser = useCallback((id: string, p: Partial<AppUser>) => {
    if (LIVE) fsPatch(COL.users, id, p);
    else {
      setUsers((prev) => prev.map((u) => (u.uid === id ? { ...u, ...p } : u)));
      setUser((cur) => (cur && cur.uid === id ? { ...cur, ...p } : cur));
    }
  }, []);

  const value = useMemo<Store>(() => ({
    user, users, demoMode: !LIVE, ready, login, loginWithEmail, logout, settings, updateSettings,
    shops, products, variants, balances, units, locations, suppliers, rates, audit, categories,
    visibleShopIds, canSeeShop, scopedBalances,
    shopName, productName, supplierName, variantsOf, balanceOf, lastMovementOf,
    applyLocalMovement,
    addProduct, updateProduct, addVariant, updateVariant,
    addSupplier, updateSupplier, addRate, updateRate,
    addUnit, removeUnit, addCategory, removeCategory, addShop, updateShop, addLocation, removeLocation,
    updateUser,
    receivings, transfers, nextReceivingNo, nextTransferNo,
    saveReceivingDraft, postReceiving, cancelReceiving, deleteReceivingDraft,
    saveTransferDraft, sendTransfer, receiveTransfer, cancelTransfer, deleteTransferDraft,
    stockCounts, costHistory, nextCountNo, saveCount, submitCount, approveCount, rejectCount, cancelCount, deleteCountDraft, damageReports, createDamageReport, approveDamageReport, rejectDamageReport,
    lastFobOf, recordCost,
    allBarcodes, isBarcodeUnique, findDuplicateProduct, findDuplicateVariant, generateBarcodeFor,
  }), [
    user, users, ready, login, loginWithEmail, logout, settings, updateSettings,
    shops, products, variants, balances, units, locations, suppliers, rates, audit, categories,
    visibleShopIds, canSeeShop, scopedBalances,
    shopName, productName, supplierName, variantsOf, balanceOf, lastMovementOf,
    applyLocalMovement,
    addProduct, updateProduct, addVariant, updateVariant,
    addSupplier, updateSupplier, addRate, updateRate,
    addUnit, removeUnit, addCategory, removeCategory, addShop, updateShop, addLocation, removeLocation,
    updateUser,
    receivings, transfers, nextReceivingNo, nextTransferNo,
    saveReceivingDraft, postReceiving, cancelReceiving, deleteReceivingDraft,
    saveTransferDraft, sendTransfer, receiveTransfer, cancelTransfer, deleteTransferDraft,
    stockCounts, costHistory, nextCountNo, saveCount, submitCount, approveCount, rejectCount, cancelCount, deleteCountDraft, damageReports, createDamageReport, approveDamageReport, rejectDamageReport,
    lastFobOf, recordCost,
    allBarcodes, isBarcodeUnique, findDuplicateProduct, findDuplicateVariant, generateBarcodeFor,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
