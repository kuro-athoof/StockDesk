// Demo data layer — lets StockDesk Pro run end-to-end without live Firebase keys.
// When VITE_FB_PROJECT_ID is set, the app uses real Firestore instead (see firebase.ts).
// All seed data reflects the spec: Flora + Sindhitha shops, 3 product types.

import type {
  AppUser, Shop, Product, Variant, Balance, Unit, StockLocation,
  Supplier, CountryRate, AuditLog, Role,
} from '../types';
import { balanceId } from './movement';

const now = Date.now();

export const DEMO_USERS: AppUser[] = [
  { uid: 'u_admin', name: 'Ahmed Athoof', email: 'admin@kuro.mv', role: 'admin', assignedShopIds: [], active: true, createdAt: now },
  { uid: 'u_purch', name: 'Purchase Manager', email: 'purchase@kuro.mv', role: 'purchase_manager', assignedShopIds: [], active: true, createdAt: now },
  { uid: 'u_flora', name: 'Flora Manager', email: 'flora@kuro.mv', role: 'shop_manager', assignedShopIds: ['shop_flora'], active: true, createdAt: now },
  { uid: 'u_sindhitha', name: 'Sindhitha Manager', email: 'sindhitha@kuro.mv', role: 'shop_manager', assignedShopIds: ['shop_sindhitha'], active: true, createdAt: now },
  { uid: 'u_ware', name: 'Warehouse Staff', email: 'warehouse@kuro.mv', role: 'warehouse_staff', assignedShopIds: ['shop_flora'], active: true, createdAt: now },
  { uid: 'u_audit', name: 'Auditor', email: 'audit@kuro.mv', role: 'auditor', assignedShopIds: [], active: true, createdAt: now },
];

export const DEMO_SHOPS: Shop[] = [
  { id: 'shop_flora', name: 'Flora', active: true, createdAt: now },
  { id: 'shop_sindhitha', name: 'Sindhitha', active: true, createdAt: now },
];

const MUH_PER: Record<string, number> = { Meter: 2.18, Yard: 2, Muh: 1 };
export const DEMO_UNITS: Unit[] = [
  'Meter', 'Yard', 'Muh', 'Piece', 'Roll', 'Box', 'Packet', 'Dozen',
  'Set', 'Bottle', 'Carton', 'Pair', 'Kg', 'Gram',
].map((code) => ({ id: `unit_${code.toLowerCase()}`, code, custom: false, muhPerUnit: MUH_PER[code] }));

export const DEMO_LOCATIONS: StockLocation[] = [
  { id: 'loc_a3', godown: 'Main Godown', rack: 'Rack A', shelf: 'Shelf 3', label: 'Main Godown > Rack A > Shelf 3' },
  { id: 'loc_a4', godown: 'Main Godown', rack: 'Rack A', shelf: 'Shelf 4', label: 'Main Godown > Rack A > Shelf 4' },
  { id: 'loc_b1', godown: 'Main Godown', rack: 'Rack B', shelf: 'Shelf 1', label: 'Main Godown > Rack B > Shelf 1' },
  { id: 'loc_c2', godown: 'Main Godown', rack: 'Rack C', shelf: 'Shelf 2', bin: 'Bin 5', label: 'Main Godown > Rack C > Shelf 2 > Bin 5' },
];

export const DEMO_SUPPLIERS: Supplier[] = [
  { id: 'sup_dubai', name: 'Al Noor Textiles', country: 'UAE', contact: '+971 4 555 1200', createdAt: now },
  { id: 'sup_india', name: 'Surat Mills', country: 'India', contact: '+91 261 244 8800', createdAt: now },
  { id: 'sup_bkk', name: 'Bangkok Fabrics Co', country: 'Thailand', contact: '+66 2 233 4455', createdAt: now },
];

export const DEMO_CATEGORIES: string[] = ['Crush', 'Silk', 'Chiffon', 'Perfume', 'Shawls', 'Tools', 'Packaging'];

export const DEMO_RATES: CountryRate[] = [
  { id: 'rate_uae', country: 'UAE', currencyCode: 'AED', currencyPerUsd: 3.67, mvrPerUsd: 15.42, cofPct: 2, markupPct: 0, gstPct: 8, formulaRate: 4.28, finalUsedRate: 4.30 },
  { id: 'rate_india', country: 'India', currencyCode: 'INR', currencyPerUsd: 83.2, mvrPerUsd: 15.42, cofPct: 2, markupPct: 0, gstPct: 8, formulaRate: 0.189, finalUsedRate: 0.19 },
  { id: 'rate_thai', country: 'Thailand', currencyCode: 'THB', currencyPerUsd: 36.5, mvrPerUsd: 15.42, cofPct: 2, markupPct: 0, gstPct: 8, formulaRate: 0.431, finalUsedRate: 0.43 },
];

export const DEMO_PRODUCTS: Product[] = [
  { id: 'p_aurora', type: 'fabric', name: 'Aurora Crush', category: 'Crush', supplierId: 'sup_dubai', defaultUnit: 'Meter', notes: 'Best seller', createdAt: now, updatedAt: now },
  { id: 'p_silk', type: 'fabric', name: 'Silk Luxe', category: 'Silk', supplierId: 'sup_india', defaultUnit: 'Meter', createdAt: now, updatedAt: now },
  { id: 'p_ity', type: 'fabric', name: 'ITY Design', supplierId: 'sup_bkk', collection: 'ITY 2025', defaultUnit: 'Meter', createdAt: now, updatedAt: now },
  { id: 'p_perfume', type: 'general', name: 'Oud Royale Perfume', category: 'Perfume', supplierId: 'sup_dubai', defaultUnit: 'Bottle', createdAt: now, updatedAt: now },
  { id: 'p_shawl', type: 'general', name: 'Pashmina Shawl', category: 'Shawls', supplierId: 'sup_india', defaultUnit: 'Piece', createdAt: now, updatedAt: now },
];

export const DEMO_VARIANTS: Variant[] = [
  { id: 'v_aurora_1', productId: 'p_aurora', productType: 'fabric', label: 'Color #01', ourColorNumber: '1', supplierColorNumber: 'AC-1', barcode: 'AUR-C01', rollQty: 6, qtyPerRoll: 25, uom: 'Yard', totalQty: 150, cost: 19.2, totalValue: 2880, lastReceiveDate: now - 86400_000, createdAt: now },
  { id: 'v_aurora_4', productId: 'p_aurora', productType: 'fabric', label: 'Color #04', ourColorNumber: '4', supplierColorNumber: 'AC-4', barcode: 'AUR-C04', rollQty: 8, qtyPerRoll: 25, uom: 'Yard', totalQty: 200, cost: 19.2, totalValue: 3840, lastReceiveDate: now - 86400_000, createdAt: now },
  { id: 'v_aurora_7', productId: 'p_aurora', productType: 'fabric', label: 'Color #07', ourColorNumber: '7', supplierColorNumber: 'AC-7', barcode: 'AUR-C07', rollQty: 4, qtyPerRoll: 25, uom: 'Yard', totalQty: 100, cost: 19.2, totalValue: 1920, lastReceiveDate: now - 172800_000, createdAt: now },
  { id: 'v_silk_2', productId: 'p_silk', productType: 'fabric', label: 'Color #02', ourColorNumber: '2', supplierColorNumber: 'SL-2', barcode: 'SLK-C02', rollQty: 5, qtyPerRoll: 30, uom: 'Yard', totalQty: 150, cost: 14.4, totalValue: 2160, lastReceiveDate: now - 259200_000, createdAt: now },
  { id: 'v_ity_d001', productId: 'p_ity', productType: 'fabric', label: 'D001', designNumber: 'D001', barcode: 'ITY-D001', rollQty: 4, qtyPerRoll: 40, uom: 'Yard', totalQty: 160, cost: 10.8, totalValue: 1728, lastReceiveDate: now - 345600_000, createdAt: now },
  { id: 'v_ity_d002', productId: 'p_ity', productType: 'fabric', label: 'D002', designNumber: 'D002', barcode: 'ITY-D002', rollQty: 0, qtyPerRoll: 40, uom: 'Yard', totalQty: 0, cost: 10.8, totalValue: 0, createdAt: now },
  { id: 'v_perfume', productId: 'p_perfume', productType: 'general', label: 'Oud Royale 100ml', barcode: '883001', createdAt: now },
  { id: 'v_shawl', productId: 'p_shawl', productType: 'general', label: 'Pashmina Grey', barcode: '884001', createdAt: now },
];

function mkBal(variantId: string, productId: string, shop: string, qty: number, unit: string, rolls: number | undefined, loc: string): Balance {
  return { id: balanceId(variantId, shop), variantId, productId, ownerShopId: shop, quantity: qty, unit, rollCount: rolls, locationId: loc, updatedAt: now };
}

export const DEMO_BALANCES: Balance[] = [
  mkBal('v_aurora_1', 'p_aurora', 'shop_flora', 540, 'Meter', 12, 'loc_a3'),
  mkBal('v_aurora_4', 'p_aurora', 'shop_flora', 320, 'Meter', 7, 'loc_a3'),
  mkBal('v_aurora_7', 'p_aurora', 'shop_flora', 210, 'Meter', 5, 'loc_a4'),
  mkBal('v_aurora_1', 'p_aurora', 'shop_sindhitha', 280, 'Meter', 6, 'loc_b1'),
  mkBal('v_silk_2', 'p_silk', 'shop_flora', 8, 'Meter', 1, 'loc_a4'),     // low stock
  mkBal('v_ity_d001', 'p_ity', 'shop_flora', 160, 'Meter', 4, 'loc_b1'),
  mkBal('v_ity_d002', 'p_ity', 'shop_sindhitha', 0, 'Meter', 0, 'loc_b1'), // out of stock
  mkBal('v_perfume', 'p_perfume', 'shop_flora', 24, 'Bottle', undefined, 'loc_c2'),
  mkBal('v_shawl', 'p_shawl', 'shop_sindhitha', 3, 'Piece', undefined, 'loc_c2'), // low stock
];


export const DEMO_AUDIT: AuditLog[] = [
  { id: 'a1', timestamp: now - 3600_000, userId: 'u_purch', userName: 'Purchase Manager', action: 'RECEIVE', productId: 'p_aurora', variantId: 'v_aurora_1', ownerShopId: 'shop_flora', qtyBefore: 0, qtyChanged: 540, qtyAfter: 540, remarks: 'Invoice INV-2025-088' },
  { id: 'a2', timestamp: now - 1800_000, userId: 'u_ware', userName: 'Warehouse Staff', action: 'INTERNAL_MOVEMENT', productId: 'p_aurora', variantId: 'v_aurora_1', ownerShopId: 'shop_flora', qtyBefore: 540, qtyChanged: 0, qtyAfter: 540, remarks: 'Rack A3 → A3 (relabel)' },
  { id: 'a3', timestamp: now - 5400_000, userId: 'u_purch', userName: 'Purchase Manager', action: 'RECEIVE', productId: 'p_ity', variantId: 'v_ity_d001', ownerShopId: 'shop_flora', qtyBefore: 0, qtyChanged: 160, qtyAfter: 160, remarks: 'Invoice INV-2025-090' },
  { id: 'a4', timestamp: now - 7200_000, userId: 'u_admin', userName: 'Ahmed Athoof', action: 'OWNERSHIP_TRANSFER', productId: 'p_aurora', variantId: 'v_aurora_1', ownerShopId: 'shop_sindhitha', qtyBefore: 0, qtyChanged: 280, qtyAfter: 280, remarks: 'In ← shop_flora' },
  { id: 'a5', timestamp: now - 9000_000, userId: 'u_purch', userName: 'Purchase Manager', action: 'ADJUSTMENT', productId: 'p_silk', variantId: 'v_silk_2', ownerShopId: 'shop_flora', qtyBefore: 30, qtyChanged: -22, qtyAfter: 8, remarks: 'Damaged stock written off' },
  { id: 'a6', timestamp: now - 10800_000, userId: 'u_purch', userName: 'Purchase Manager', action: 'RECEIVE', productId: 'p_perfume', variantId: 'v_perfume', ownerShopId: 'shop_flora', qtyBefore: 0, qtyChanged: 24, qtyAfter: 24, remarks: 'Invoice INV-2025-085' },
  // Aged entries so non-moving / dead-stock detection has data to work with.
  { id: 'a7', timestamp: now - 75 * 86_400_000, userId: 'u_purch', userName: 'Purchase Manager', action: 'RECEIVE', productId: 'p_aurora', variantId: 'v_aurora_4', ownerShopId: 'shop_flora', qtyBefore: 0, qtyChanged: 320, qtyAfter: 320, remarks: 'Invoice INV-2025-040 (non-moving)' },
  { id: 'a8', timestamp: now - 210 * 86_400_000, userId: 'u_purch', userName: 'Purchase Manager', action: 'RECEIVE', productId: 'p_aurora', variantId: 'v_aurora_7', ownerShopId: 'shop_flora', qtyBefore: 0, qtyChanged: 210, qtyAfter: 210, remarks: 'Invoice INV-2024-310 (dead stock)' },
  { id: 'a9', timestamp: now - 200 * 86_400_000, userId: 'u_admin', userName: 'Ahmed Athoof', action: 'RECEIVE', productId: 'p_shawl', variantId: 'v_shawl', ownerShopId: 'shop_sindhitha', qtyBefore: 0, qtyChanged: 3, qtyAfter: 3, remarks: 'Invoice INV-2024-320 (dead stock)' },
];

// ── Label / barcode printing ──────────────────────────────────────────────────

export interface LabelProfile {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  unit: 'mm' | 'in';
  barcodeHeightMm: number;
  barcodeWidthScale: number;   // 1.0–3.0, JsBarcode width option
  fontSizePt: number;          // product name
  variantFontSizePt: number;
  barcodeFontSizePt: number;
  priceFontSizePt: number;
  topMarginMm: number;
  leftMarginMm: number;
  xOffsetMm: number;
  yOffsetMm: number;
  hGapMm: number;
  vGapMm: number;
  rotation: 0 | 90 | 180 | 270;
  showBorder: boolean;
  showProductName: boolean;
  showVariant: boolean;
  showBarcode: boolean;
  showBarcodeText: boolean;
  showQtyUom: boolean;
  showPrice: boolean;          // double-gated with view_costs in UI
  copiesDefault: number;
}

export interface LabelSettings {
  activeProfileId: string;
  profiles: LabelProfile[];
}

export const BUILT_IN_PROFILES: LabelProfile[] = [
  {
    id: 'zebra-50x30',    name: 'Zebra 50×30 mm',
    widthMm: 50,          heightMm: 30,           unit: 'mm',
    barcodeHeightMm: 12,  barcodeWidthScale: 2,
    fontSizePt: 9,        variantFontSizePt: 8,   barcodeFontSizePt: 7,  priceFontSizePt: 8,
    topMarginMm: 2,       leftMarginMm: 2,
    xOffsetMm: 0,         yOffsetMm: 0,
    hGapMm: 2,            vGapMm: 2,
    rotation: 0,          showBorder: false,
    showProductName: true, showVariant: true, showBarcode: true, showBarcodeText: true,
    showQtyUom: false,    showPrice: false,   copiesDefault: 1,
  },
  {
    id: 'zebra-40x20',    name: 'Zebra 40×20 mm',
    widthMm: 40,          heightMm: 20,           unit: 'mm',
    barcodeHeightMm: 8,   barcodeWidthScale: 1.5,
    fontSizePt: 7,        variantFontSizePt: 6,   barcodeFontSizePt: 6,  priceFontSizePt: 7,
    topMarginMm: 1,       leftMarginMm: 1,
    xOffsetMm: 0,         yOffsetMm: 0,
    hGapMm: 1,            vGapMm: 1,
    rotation: 0,          showBorder: false,
    showProductName: true, showVariant: true, showBarcode: true, showBarcodeText: true,
    showQtyUom: false,    showPrice: false,   copiesDefault: 1,
  },
  {
    id: 'zebra-60x40',    name: 'Zebra 60×40 mm',
    widthMm: 60,          heightMm: 40,           unit: 'mm',
    barcodeHeightMm: 16,  barcodeWidthScale: 2,
    fontSizePt: 10,       variantFontSizePt: 9,   barcodeFontSizePt: 8,  priceFontSizePt: 9,
    topMarginMm: 3,       leftMarginMm: 3,
    xOffsetMm: 0,         yOffsetMm: 0,
    hGapMm: 2,            vGapMm: 2,
    rotation: 0,          showBorder: false,
    showProductName: true, showVariant: true, showBarcode: true, showBarcodeText: true,
    showQtyUom: false,    showPrice: false,   copiesDefault: 1,
  },
  {
    id: 'a4-sheet',       name: 'A4 Sheet Label',
    widthMm: 63.5,        heightMm: 38.1,         unit: 'mm',
    barcodeHeightMm: 14,  barcodeWidthScale: 2,
    fontSizePt: 9,        variantFontSizePt: 8,   barcodeFontSizePt: 7,  priceFontSizePt: 8,
    topMarginMm: 3,       leftMarginMm: 3,
    xOffsetMm: 0,         yOffsetMm: 0,
    hGapMm: 2.5,          vGapMm: 0,
    rotation: 0,          showBorder: true,
    showProductName: true, showVariant: true, showBarcode: true, showBarcodeText: true,
    showQtyUom: false,    showPrice: false,   copiesDefault: 1,
  },
  {
    id: 'custom',         name: 'Custom',
    widthMm: 50,          heightMm: 30,           unit: 'mm',
    barcodeHeightMm: 12,  barcodeWidthScale: 2,
    fontSizePt: 9,        variantFontSizePt: 8,   barcodeFontSizePt: 7,  priceFontSizePt: 8,
    topMarginMm: 2,       leftMarginMm: 2,
    xOffsetMm: 0,         yOffsetMm: 0,
    hGapMm: 2,            vGapMm: 2,
    rotation: 0,          showBorder: false,
    showProductName: true, showVariant: true, showBarcode: true, showBarcodeText: true,
    showQtyUom: false,    showPrice: false,   copiesDefault: 1,
  },
];

export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  activeProfileId: 'zebra-50x30',
  profiles: BUILT_IN_PROFILES,
};

/** Migrate a legacy single-setting doc (v1) to the new profile-based structure. */
export function migrateLegacyLabelSettings(raw: Record<string, unknown>): LabelSettings {
  // If it already has profiles, it's v2 — return as-is.
  if (raw.profiles && Array.isArray(raw.profiles)) return raw as unknown as LabelSettings;
  // v1 flat object → inject into the Custom profile and activate it.
  const custom = { ...BUILT_IN_PROFILES[4] };
  if (typeof raw.widthMm === 'number')           custom.widthMm           = raw.widthMm;
  if (typeof raw.heightMm === 'number')          custom.heightMm          = raw.heightMm;
  if (typeof raw.barcodeHeightMm === 'number')   custom.barcodeHeightMm   = raw.barcodeHeightMm;
  if (typeof raw.fontSizePt === 'number')        custom.fontSizePt        = raw.fontSizePt;
  if (typeof raw.topMarginMm === 'number')       custom.topMarginMm       = raw.topMarginMm;
  if (typeof raw.leftMarginMm === 'number')      custom.leftMarginMm      = raw.leftMarginMm;
  if (typeof raw.copiesDefault === 'number')     custom.copiesDefault     = raw.copiesDefault;
  if (typeof raw.showProductName === 'boolean')  custom.showProductName   = raw.showProductName;
  if (typeof raw.showVariant === 'boolean')      custom.showVariant       = raw.showVariant;
  if (typeof raw.showBarcode === 'boolean')      custom.showBarcode       = raw.showBarcode;
  if (typeof raw.showBarcodeText === 'boolean')  custom.showBarcodeText   = raw.showBarcodeText;
  if (typeof raw.showPrice === 'boolean')        custom.showPrice         = raw.showPrice;
  const profiles = [...BUILT_IN_PROFILES];
  profiles[4] = custom;
  return { activeProfileId: 'custom', profiles };
}

export interface AppSettings {
  allowNegativeOverride: boolean;   // managers may override negative stock
  deadStockDays: number;            // no movement beyond this = dead stock
  nonMovingDays: number;            // no movement beyond this = non-moving
  lowStockThreshold: number;
}

export const DEMO_SETTINGS: AppSettings = {
  allowNegativeOverride: true,
  deadStockDays: 180,
  nonMovingDays: 60,
  lowStockThreshold: 10,
};

export const LOW_STOCK_THRESHOLD = 10;

export function loginByUid(uid: string): AppUser {
  return DEMO_USERS.find((u) => u.uid === uid) ?? DEMO_USERS[0];
}

export function roleLogin(role: Role): AppUser {
  return DEMO_USERS.find((u) => u.role === role)!;
}
