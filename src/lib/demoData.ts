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

export const DEMO_UNITS: Unit[] = [
  'Meter', 'Yard', 'Muh', 'Piece', 'Roll', 'Box', 'Packet', 'Dozen',
  'Set', 'Bottle', 'Carton', 'Pair', 'Kg', 'Gram',
].map((code) => ({ id: `unit_${code.toLowerCase()}`, code, custom: false }));

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
  { id: 'p_aurora', type: 'plain_fabric', name: 'Aurora Crush', category: 'Crush', supplierId: 'sup_dubai', defaultUnit: 'Meter', notes: 'Best seller', createdAt: now, updatedAt: now },
  { id: 'p_silk', type: 'plain_fabric', name: 'Silk Luxe', category: 'Silk', supplierId: 'sup_india', defaultUnit: 'Meter', createdAt: now, updatedAt: now },
  { id: 'p_ity', type: 'design_fabric', name: 'ITY Design', supplierId: 'sup_bkk', collection: 'ITY 2025', defaultUnit: 'Meter', createdAt: now, updatedAt: now },
  { id: 'p_perfume', type: 'general', name: 'Oud Royale Perfume', category: 'Perfume', supplierId: 'sup_dubai', defaultUnit: 'Bottle', createdAt: now, updatedAt: now },
  { id: 'p_shawl', type: 'general', name: 'Pashmina Shawl', category: 'Shawls', supplierId: 'sup_india', defaultUnit: 'Piece', createdAt: now, updatedAt: now },
];

export const DEMO_VARIANTS: Variant[] = [
  { id: 'v_aurora_1', productId: 'p_aurora', productType: 'plain_fabric', label: 'Color #1', ourColorNumber: '1', supplierColorNumber: 'AC-1', barcode: '880001', metersPerRoll: 45, createdAt: now },
  { id: 'v_aurora_4', productId: 'p_aurora', productType: 'plain_fabric', label: 'Color #4', ourColorNumber: '4', supplierColorNumber: 'AC-4', barcode: '880004', metersPerRoll: 45, createdAt: now },
  { id: 'v_aurora_7', productId: 'p_aurora', productType: 'plain_fabric', label: 'Color #7', ourColorNumber: '7', supplierColorNumber: 'AC-7', barcode: '880007', metersPerRoll: 45, createdAt: now },
  { id: 'v_silk_2', productId: 'p_silk', productType: 'plain_fabric', label: 'Color #2', ourColorNumber: '2', supplierColorNumber: 'SL-2', barcode: '881002', metersPerRoll: 50, createdAt: now },
  { id: 'v_ity_d001', productId: 'p_ity', productType: 'design_fabric', label: 'D001', designNumber: 'D001', barcode: '882001', metersPerRoll: 40, createdAt: now },
  { id: 'v_ity_d002', productId: 'p_ity', productType: 'design_fabric', label: 'D002', designNumber: 'D002', barcode: '882002', metersPerRoll: 40, createdAt: now },
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
