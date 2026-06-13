import {
  createContext, useContext, useState, useMemo, useCallback, type ReactNode,
} from 'react';
import type {
  AppUser, Shop, Product, Variant, Balance, Unit, StockLocation,
  Supplier, CountryRate, AuditLog, MovementAction,
} from '../types';
import { can } from '../lib/permissions';
import {
  DEMO_USERS, DEMO_SHOPS, DEMO_PRODUCTS, DEMO_VARIANTS, DEMO_BALANCES, DEMO_UNITS,
  DEMO_LOCATIONS, DEMO_SUPPLIERS, DEMO_RATES, DEMO_AUDIT, DEMO_CATEGORIES,
  DEMO_SETTINGS, type AppSettings, loginByUid,
} from '../lib/demoData';
import { balanceId, NegativeStockError } from '../lib/movement';
import { firebaseConfigured } from '../lib/firebase';

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

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

interface Store {
  user: AppUser | null;
  users: AppUser[];
  demoMode: boolean;
  login: (uid: string) => void;
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

  // scoping
  visibleShopIds: string[];           // shop ids the current user may see
  canSeeShop: (shopId: string) => boolean;
  scopedBalances: Balance[];          // balances filtered to visibleShopIds

  // derived
  shopName: (id: string) => string;
  productName: (id: string) => string;
  supplierName: (id: string) => string;
  variantsOf: (productId: string) => Variant[];
  balanceOf: (variantId: string, shopId: string) => Balance | undefined;
  lastMovementOf: (variantId: string) => AuditLog | undefined;

  // movement
  applyLocalMovement: (args: MoveArgs) => { ok: boolean; error?: string; needsOverride?: boolean };

  // CRUD
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
}

const Ctx = createContext<Store | null>(null);

function locationLabel(l: Omit<StockLocation, 'id' | 'label'>): string {
  return [l.godown, l.rack, l.shelf, l.bin].filter(Boolean).join(' > ');
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>(DEMO_USERS);
  const [shops, setShops] = useState<Shop[]>(DEMO_SHOPS);
  const [products, setProducts] = useState<Product[]>(DEMO_PRODUCTS);
  const [variants, setVariants] = useState<Variant[]>(DEMO_VARIANTS);
  const [balances, setBalances] = useState<Balance[]>(DEMO_BALANCES);
  const [units, setUnits] = useState<Unit[]>(DEMO_UNITS);
  const [locations, setLocations] = useState<StockLocation[]>(DEMO_LOCATIONS);
  const [suppliers, setSuppliers] = useState<Supplier[]>(DEMO_SUPPLIERS);
  const [rates, setRates] = useState<CountryRate[]>(DEMO_RATES);
  const [audit, setAudit] = useState<AuditLog[]>(DEMO_AUDIT);
  const [categories, setCategories] = useState<string[]>(DEMO_CATEGORIES);
  const [settings, setSettings] = useState<AppSettings>(DEMO_SETTINGS);

  const login = useCallback((id: string) => setUser(loginByUid(id)), []);
  const logout = useCallback(() => setUser(null), []);
  const updateSettings = useCallback((patch: Partial<AppSettings>) => setSettings((s) => ({ ...s, ...patch })), []);

  // ---- Scoping: shop_manager + warehouse_staff see only assigned shops ----
  const visibleShopIds = useMemo(() => {
    if (!user) return [];
    if (user.role === 'shop_manager' || user.role === 'warehouse_staff') {
      return user.assignedShopIds;
    }
    return shops.map((s) => s.id); // admin, purchase_manager, auditor see all
  }, [user, shops]);

  const canSeeShop = useCallback((shopId: string) => visibleShopIds.includes(shopId), [visibleShopIds]);
  const scopedBalances = useMemo(
    () => balances.filter((b) => visibleShopIds.includes(b.ownerShopId)),
    [balances, visibleShopIds],
  );

  const shopName = useCallback((id: string) => shops.find((s) => s.id === id)?.name ?? id, [shops]);
  const productName = useCallback((id: string) => products.find((p) => p.id === id)?.name ?? id, [products]);
  const supplierName = useCallback((id: string) => suppliers.find((s) => s.id === id)?.name ?? '—', [suppliers]);
  const variantsOf = useCallback((pid: string) => variants.filter((v) => v.productId === pid), [variants]);
  const balanceOf = useCallback(
    (vid: string, sid: string) => balances.find((b) => b.id === balanceId(vid, sid)),
    [balances],
  );
  const lastMovementOf = useCallback(
    (vid: string) => audit.filter((a) => a.variantId === vid).sort((a, b) => b.timestamp - a.timestamp)[0],
    [audit],
  );

  // Mirrors applyMovement() rules locally for demo mode (negative-stock gate + audit).
  const applyLocalMovement = useCallback((args: MoveArgs) => {
    if (!user) return { ok: false, error: 'Not signed in' };
    const { variant, ownerShopId, qtyChanged, unit, action, remarks, refId, locationId, rollDelta } = args;
    const bId = balanceId(variant.id, ownerShopId);
    const existing = balances.find((b) => b.id === bId);
    const before = existing?.quantity ?? 0;
    const after = before + qtyChanged;

    // Negative override honors both the role capability AND the settings toggle.
    const canOverride = can(user.role, 'override_negative') && settings.allowNegativeOverride;
    let overrideBy: string | undefined;
    if (after < 0) {
      if (!canOverride) {
        return { ok: false, needsOverride: true, error: new NegativeStockError(before, Math.abs(qtyChanged)).message };
      }
      overrideBy = user.uid;
    }

    const beforeRolls = existing?.rollCount ?? 0;
    const newRolls = variant.productType === 'general' ? undefined : Math.max(0, beforeRolls + (rollDelta ?? 0));

    setBalances((prev) => {
      const next = prev.filter((b) => b.id !== bId);
      next.push({
        id: bId, variantId: variant.id, productId: variant.productId, ownerShopId,
        quantity: after, unit, rollCount: newRolls,
        locationId: locationId ?? existing?.locationId, updatedAt: Date.now(),
      });
      return next;
    });

    const baseLog: AuditLog = {
      id: uid('a'),
      timestamp: Date.now(), userId: user.uid, userName: user.name, action,
      productId: variant.productId, variantId: variant.id, ownerShopId,
      qtyBefore: before, qtyChanged, qtyAfter: after,
      ...(remarks ? { remarks } : {}), ...(refId ? { refId } : {}), ...(overrideBy ? { overrideBy } : {}),
    };
    const logs: AuditLog[] = [baseLog];
    if (overrideBy) {
      logs.push({
        ...baseLog, id: uid('a'), action: 'NEGATIVE_OVERRIDE', qtyChanged: 0,
        remarks: `Negative balance authorized by ${user.name}. ${remarks ?? ''}`.trim(),
      });
    }
    setAudit((prev) => [...logs, ...prev]);
    return { ok: true };
  }, [user, balances, settings.allowNegativeOverride]);

  // ---- CRUD ----
  const addProduct = useCallback((p: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>, vs: Omit<Variant, 'id' | 'productId' | 'createdAt'>[]) => {
    const pid = uid('p');
    const ts = Date.now();
    setProducts((prev) => [...prev, { ...p, id: pid, createdAt: ts, updatedAt: ts }]);
    setVariants((prev) => [...prev, ...vs.map((v) => ({ ...v, id: uid('v'), productId: pid, createdAt: ts }))]);
  }, []);
  const updateProduct = useCallback((id: string, patch: Partial<Product>) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)));
  }, []);
  const addVariant = useCallback((productId: string, v: Omit<Variant, 'id' | 'productId' | 'createdAt'>) => {
    setVariants((prev) => [...prev, { ...v, id: uid('v'), productId, createdAt: Date.now() }]);
  }, []);
  const updateVariant = useCallback((id: string, patch: Partial<Variant>) => {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }, []);

  const addSupplier = useCallback((s: Omit<Supplier, 'id' | 'createdAt'>) => {
    setSuppliers((prev) => [...prev, { ...s, id: uid('sup'), createdAt: Date.now() }]);
  }, []);
  const updateSupplier = useCallback((id: string, patch: Partial<Supplier>) => {
    setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const addRate = useCallback((r: Omit<CountryRate, 'id'>) => {
    setRates((prev) => [...prev, { ...r, id: uid('rate') }]);
  }, []);
  const updateRate = useCallback((id: string, patch: Partial<CountryRate>) => {
    setRates((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const addUnit = useCallback((code: string) => {
    setUnits((prev) => prev.some((u) => u.code.toLowerCase() === code.toLowerCase())
      ? prev : [...prev, { id: uid('unit'), code, custom: true }]);
  }, []);
  const removeUnit = useCallback((id: string) => setUnits((prev) => prev.filter((u) => u.id !== id)), []);
  const addCategory = useCallback((c: string) => {
    setCategories((prev) => prev.includes(c) ? prev : [...prev, c]);
  }, []);
  const removeCategory = useCallback((c: string) => setCategories((prev) => prev.filter((x) => x !== c)), []);
  const addShop = useCallback((name: string) => {
    setShops((prev) => [...prev, { id: uid('shop'), name, active: true, createdAt: Date.now() }]);
  }, []);
  const updateShop = useCallback((id: string, patch: Partial<Shop>) => {
    setShops((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);
  const addLocation = useCallback((l: Omit<StockLocation, 'id' | 'label'>) => {
    setLocations((prev) => [...prev, { ...l, id: uid('loc'), label: locationLabel(l) }]);
  }, []);
  const removeLocation = useCallback((id: string) => setLocations((prev) => prev.filter((l) => l.id !== id)), []);

  const updateUser = useCallback((id: string, patch: Partial<AppUser>) => {
    setUsers((prev) => prev.map((u) => (u.uid === id ? { ...u, ...patch } : u)));
    setUser((cur) => (cur && cur.uid === id ? { ...cur, ...patch } : cur));
  }, []);

  const value = useMemo<Store>(() => ({
    user, users, demoMode: !firebaseConfigured, login, logout, settings, updateSettings,
    shops, products, variants, balances, units, locations, suppliers, rates, audit, categories,
    visibleShopIds, canSeeShop, scopedBalances,
    shopName, productName, supplierName, variantsOf, balanceOf, lastMovementOf,
    applyLocalMovement,
    addProduct, updateProduct, addVariant, updateVariant,
    addSupplier, updateSupplier, addRate, updateRate,
    addUnit, removeUnit, addCategory, removeCategory, addShop, updateShop, addLocation, removeLocation,
    updateUser,
  }), [
    user, users, login, logout, settings, updateSettings,
    shops, products, variants, balances, units, locations, suppliers, rates, audit, categories,
    visibleShopIds, canSeeShop, scopedBalances,
    shopName, productName, supplierName, variantsOf, balanceOf, lastMovementOf,
    applyLocalMovement,
    addProduct, updateProduct, addVariant, updateVariant,
    addSupplier, updateSupplier, addRate, updateRate,
    addUnit, removeUnit, addCategory, removeCategory, addShop, updateShop, addLocation, removeLocation,
    updateUser,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
