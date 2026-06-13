// ============ StockDesk Pro — Core Types ============

export type Role = 'admin' | 'purchase_manager' | 'shop_manager' | 'warehouse_staff' | 'auditor';

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  role: Role;
  assignedShopIds: string[]; // for shop_manager scoping
  active: boolean;
  createdAt: number;
}

export interface Shop {
  id: string;
  name: string;
  active: boolean;
  createdAt: number;
}

export type ProductType = 'plain_fabric' | 'design_fabric' | 'general';

export interface Product {
  id: string;
  type: ProductType;
  name: string;
  category?: string;
  supplierId?: string;
  productImage?: string;
  bookletImage?: string;     // sample/design booklet reference
  notes?: string;
  collection?: string;        // design fabrics (e.g. ITY 2025)
  defaultUnit: string;        // unit code
  createdAt: number;
  updatedAt: number;
}

// A variant is a color (plain), a design (design), or the item itself (general)
export interface Variant {
  id: string;
  productId: string;
  productType: ProductType;
  label: string;              // color #, design #, or item name
  ourColorNumber?: string;
  supplierColorNumber?: string;
  designNumber?: string;
  designImage?: string;
  barcode?: string;
  // rolls<->meters reconciliation (fabrics only). metersPerRoll is a NOMINAL hint;
  // meter balance is the source of truth. rolls are informational.
  metersPerRoll?: number;
  createdAt: number;
}

// Balance is per (variant + ownerShop). Location is tracked on the balance.
export interface Balance {
  id: string;                 // `${variantId}__${ownerShopId}`
  variantId: string;
  productId: string;
  ownerShopId: string;
  quantity: number;           // source of truth (meters for fabric, qty for general)
  unit: string;
  rollCount?: number;         // informational, fabrics only
  locationId?: string;
  updatedAt: number;
}

export interface Unit {
  id: string;
  code: string;               // Meter, Yard, Muh, Piece, Roll, Box...
  custom: boolean;
}

export interface StockLocation {
  id: string;
  godown: string;
  rack?: string;
  shelf?: string;
  bin?: string;
  label: string;              // computed: "Main Godown > Rack A > Shelf 3"
}

export interface Supplier {
  id: string;
  name: string;
  country?: string;
  contact?: string;
  phone?: string;
  createdAt: number;
}

export interface CountryRate {
  id: string;
  country: string;
  currencyCode: string;
  currencyPerUsd: number;
  mvrPerUsd: number;
  cofPct: number;
  markupPct: number;
  gstPct: number;
  formulaRate: number;        // computed
  finalUsedRate: number;      // editable override
}

// ============ Movement & Audit ============

export type MovementAction =
  | 'RECEIVE'
  | 'INTERNAL_MOVEMENT'
  | 'OWNERSHIP_TRANSFER'
  | 'ADJUSTMENT'
  | 'STOCK_COUNT_CORRECTION'
  | 'NEGATIVE_OVERRIDE';

export interface AuditLog {
  id: string;
  timestamp: number;
  userId: string;
  userName: string;
  action: MovementAction;
  productId: string;
  variantId: string;
  ownerShopId: string;
  qtyBefore: number;
  qtyChanged: number;         // signed
  qtyAfter: number;
  remarks?: string;
  refId?: string;             // receiving/transfer/count doc id
  overrideBy?: string;        // set when a negative balance was allowed
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  purchase_manager: 'Purchase Manager',
  shop_manager: 'Shop Manager',
  warehouse_staff: 'Warehouse Staff',
  auditor: 'Auditor',
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  plain_fabric: 'Plain Fabric',
  design_fabric: 'Design Fabric',
  general: 'General Inventory',
};
