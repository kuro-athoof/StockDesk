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

export type ProductType = 'fabric' | 'general';

export interface Product {
  id: string;
  type: ProductType;
  name: string;
  category?: string;
  productTypeLabel?: string;   // admin-defined product type (free, beyond the 3 base kinds)
  supplierId?: string;
  productImage?: string;
  bookletImage?: string;     // optional reference attachment (not required)
  notes?: string;
  collection?: string;        // design fabrics (e.g. ITY 2025)
  defaultUnit: string;        // unit code
  // Finalized professional fields
  width?: string;
  gsm?: string;
  composition?: string;
  quality?: string;           // quality / fabric type
  season?: string;
  sampleReference?: string;   // sample book number
  samplePage?: string;        // page number in the sample book
  referenceImage?: string;    // ONE optional reference image (URL) — not primary ID
  active?: boolean;
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
  colorName?: string;
  colorFamily?: string;
  colorCode?: string;         // HEX code, optional
  designNumber?: string;      // design code
  designImage?: string;       // optional, not required
  collection?: string;        // collection / season
  barcode?: string;
  barcodeSource?: 'generated' | 'supplier' | 'manual'; // provenance of the barcode
  active?: boolean;
  // --- Aggregate fabric stock (NO individual roll records) ---
  // The warehouse tracks roll count + quantity only, stored directly on the variant.
  rollQty?: number;          // number of rolls in the godown
  qtyPerRoll?: number;       // nominal length per roll (e.g. 25)
  uom?: string;              // stock unit (Yard, Meter…)
  totalQty?: number;         // rollQty × qtyPerRoll (or accumulated received qty)
  cost?: number;             // latest landed cost per UOM (FOB × rate)
  totalValue?: number;       // totalQty × cost
  lastReceiveDate?: number;  // last receiving timestamp
  lastTransferDate?: number; // last transfer-out timestamp
  metersPerRoll?: number;    // legacy nominal hint (kept for compatibility)
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

// ============ Simplified fabric stock model ============
//
// We do NOT track individual rolls. The warehouse only needs roll count + total
// quantity, stored as aggregate fields on the Variant (see Variant above).
// General inventory stays quantity-based on the balance.

export interface Unit {
  id: string;
  code: string;               // Meter, Yard, Muh, Piece, Roll, Box...
  custom: boolean;
  muhPerUnit?: number;        // how many Muh in 1 of this unit (e.g. Yard = 2). Muh itself = 1.
}

// Company base inventory unit. All costing is ultimately stored as Cost Per Muh.
export const BASE_UNIT = 'Muh';

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
  | 'TRANSFER_OUT'
  | 'DAMAGE'
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
  fabric: 'Fabric',
  general: 'General Inventory',
};

// ============ Damage / Issue Reports ============
// Warehouse staff create these — they do NOT reduce stock directly.
// Manager/Admin approves (reduces stock + writes DAMAGE audit) or rejects.

export type DamageStatus = 'pending' | 'approved' | 'rejected';

export interface DamageReport {
  id: string;
  shopId: string;
  productId: string;
  variantId: string;
  barcode?: string;
  reportedPcs: number;     // rolls / PCS
  reportedQty: number;     // total quantity
  uom: string;
  reason: string;          // Torn | Stained | Wet | Dirty | Defective | Other
  notes?: string;
  reportedBy: string;      // user.uid
  reportedByName: string;  // user.name
  reportedAt: number;
  status: DamageStatus;
  approvedBy?: string;
  approvedAt?: number;
  rejectedBy?: string;
  rejectedAt?: number;
  rejectionNote?: string;
}

export type CountStatus = 'open' | 'submitted' | 'approved' | 'rejected' | 'cancelled';

export interface CountLine {
  id: string;
  barcode?: string;
  productId: string;
  variantId: string;
  unit: string;
  // System (expected) quantities — sourced from stock_balances, NOT variant fields.
  expectedRolls?: number;   // balance.rollCount  (displayed as "System PCS")
  actualRolls?: number;     // entered by warehouse staff (displayed as "Physical PCS")
  expectedQuantity: number; // balance.quantity   (displayed as "System Qty")
  actualQuantity: number;   // entered by warehouse staff (displayed as "Physical Qty")
  variance: number;         // actualQuantity - expectedQuantity
  reason?: string;
}

export interface StockCount {
  id: string;
  countNo: string;           // CNT-0001
  shopId: string;
  countType: 'full' | 'partial' | 'spot'; // Full Count / Partial Count / Spot Check
  reference?: string;        // optional reference text
  notes?: string;            // optional notes
  countedBy: string;
  date: string;
  status: CountStatus;
  lines: CountLine[];
  createdAt: number;
  submittedAt?: number;
  approvedAt?: number;
  approvedBy?: string;
  rejectedAt?: number;
  rejectedBy?: string;
  rejectionNote?: string;
  varianceValueMvr?: number; // computed at submit: Σ |variance × cost|
}

// ============ Cost history (kept permanently) ============

export interface CostHistory {
  id: string;
  variantId: string;
  ownerShopId: string;
  fobValue: number;           // FOB amount in supplier currency
  fobUnit: string;            // unit FOB is quoted in
  exchangeRate: number;       // country rate (supplier currency → MVR)
  stockUom: string;           // unit inventory is held in
  cost: number;               // FOB × rate = landed cost per UOM
  receivingNo: string;
  timestamp: number;
  userId: string;
}

export const MOVE_REASON_LABELS: Record<MoveReason, string> = {
  shop_refill: 'Shop Refill',
  customer_order: 'Customer Order',
  stock_transfer: 'Stock Transfer To Another Shop',
  damaged_goods: 'Damaged Goods',
};

// ============ Receiving ============

export type ReceivingStatus = 'draft' | 'posted' | 'cancelled';

export interface ReceivingLine {
  id: string;
  barcode?: string;        // variant barcode (e.g. AUR-C01)
  productId: string;
  variantId: string;
  category?: string;
  // Aggregate quantities (NO individual roll records)
  rollQty?: number;        // number of rolls received (fabric)
  qtyPerRoll?: number;     // length per roll (fabric)
  quantity: number;        // total qty in stock UOM
  stockUom: string;        // unit inventory is held in (Yard, Meter, PCS…)
  // Costing: Cost = (FOB ÷ FOB Unit) × Country Rate
  fobValue?: number;       // FOB amount in supplier currency
  fobUomUnit?: number;     // how many stock UOM this FOB covers (e.g. 10 → "30 AED per 10 Yards")
  fobUnit?: string;        // FOB UOM dropdown (Yard, Meter, Dozen, PCS…)
  exchangeRate?: number;   // country rate (from header)
  cost?: number;           // (FOB ÷ FOB Unit) × header rate
  totalCost?: number;      // quantity × cost
  remarks?: string;
  costChanged?: boolean;   // true if cost differs from last receiving of this variant
  // Note: prevCost and exchangeRate are NOT stored — rate comes from header.country only.
}

export interface Receiving {
  id: string;
  receivingNo: string;     // auto, e.g. RCV-0001
  ownerShopId: string;
  supplierId?: string;
  country?: string;
  invoiceDate?: string;
  invoiceNumber?: string;
  notes?: string;          // receive location removed — everything enters the godown
  status: ReceivingStatus;
  lines: ReceivingLine[];
  createdAt: number;
  createdBy: string;
  postedAt?: number;
  postedBy?: string;
}

// ============ Transfers ============

export type TransferType = 'internal' | 'ownership' | 'transfer_out';
export type TransferStatus = 'draft' | 'sent' | 'received' | 'cancelled';

// Roll movement reasons (only these four).
export type MoveReason =
  | 'shop_refill' | 'customer_order' | 'stock_transfer' | 'damaged_goods';

export interface TransferLine {
  id: string;
  barcode?: string;        // variant barcode
  productId: string;
  variantId: string;
  unit: string;
  rollQty?: number;        // rolls transferred out (fabric)
  quantity: number;        // total quantity transferred
  cost?: number;           // cost snapshot per UOM
  totalCostValue?: number; // quantity × cost
  remarks?: string;
}

export interface Transfer {
  id: string;
  transferNo: string;      // auto, e.g. MOV-0001
  type: TransferType;
  reason?: MoveReason;
  fromShopId: string;
  toShopId: string;        // == fromShopId for internal movements
  fromLocationId?: string;
  toLocationId?: string;
  preparedBy: string;
  receivedBy?: string;
  notes?: string;
  status: TransferStatus;
  lines: TransferLine[];
  totalCostValue?: number; // sum for ownership transfers
  createdAt: number;
  sentAt?: number;
  receivedAt?: number;
  approvedBy?: string;     // ownership transfers require manager approval
  overrideReason?: string; // mandatory when a manager overrides negative stock
}
