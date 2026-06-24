import type { Product, Variant, Balance } from '../types';

// ============ Barcode generation ============
//
// Most fabrics arrive without usable barcodes, so StockDesk generates its own
// internal codes. A variant barcode is derived from a product prefix + the
// variant's color/design number, e.g. "AUR-003". Uniqueness is enforced.

/** A short alpha prefix from a product name, e.g. "Aurora Crush" -> "AUR". */
export function productPrefix(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'PRD');
}

/** Zero-pad a number/string fragment to 3 digits where it is numeric. */
function pad3(v: string | number | undefined): string {
  if (v == null || v === '') return '000';
  const s = String(v).replace(/[^0-9a-zA-Z]/g, '');
  if (/^\d+$/.test(s)) return s.padStart(3, '0');
  return s.toUpperCase();
}

/**
 * Suggest a variant barcode from product + variant identity. Prefers the
 * color/design number; falls back to a sequential index. Always made unique
 * against the provided existing set by appending -A, -B… if needed.
 */
export function suggestVariantBarcode(
  product: Pick<Product, 'name'>,
  variant: Pick<Variant, 'ourColorNumber' | 'designNumber' | 'label'>,
  existingBarcodes: Set<string>,
  fallbackIndex = 1,
): string {
  const prefix = productPrefix(product.name);
  const num = variant.ourColorNumber ?? variant.designNumber
    ?? (variant.label.match(/\d+/)?.[0]) ?? String(fallbackIndex);
  const base = `${prefix}-${pad3(num)}`;
  if (!existingBarcodes.has(base)) return base;
  // collision — append a letter suffix until unique
  for (let i = 0; i < 26; i++) {
    const candidate = `${base}-${String.fromCharCode(65 + i)}`;
    if (!existingBarcodes.has(candidate)) return candidate;
  }
  // extreme fallback: timestamp
  return `${base}-${Date.now().toString(36).toUpperCase()}`;
}

/** True if a barcode is already used by a *different* variant. */
export function isBarcodeTaken(barcode: string, variants: Variant[], exceptVariantId?: string): boolean {
  const norm = barcode.trim().toLowerCase();
  if (!norm) return false;
  return variants.some((v) => v.id !== exceptVariantId && (v.barcode ?? '').trim().toLowerCase() === norm);
}

// ============ Roll labels ============
//
// When N rolls are received, the system can generate one printable label per
// roll: AUR003-001, AUR003-002… The label data model is defined now so a print
// implementation can be added later WITHOUT a schema change.

export interface RollLabel {
  rollNo: string;          // sequential, e.g. "001"
  code: string;            // full roll barcode, e.g. "AUR003-001"
  productName: string;
  variantLabel: string;
  ourColorNumber?: string;
  supplierColorNumber?: string;
  quantity?: number;       // optional per-roll quantity if known
  baseBarcode: string;     // the variant barcode this roll belongs to
}

/** Build roll labels for a received line. quantityEach is optional (rolls vary). */
export function generateRollLabels(
  baseBarcode: string,
  rollCount: number,
  meta: { productName: string; variantLabel: string; ourColorNumber?: string; supplierColorNumber?: string },
  quantityEach?: number,
  startAt = 1,
): RollLabel[] {
  const clean = baseBarcode.replace(/-/g, '').toUpperCase();
  const labels: RollLabel[] = [];
  for (let i = 0; i < rollCount; i++) {
    const n = startAt + i;
    const rollNo = String(n).padStart(3, '0');
    labels.push({
      rollNo,
      code: `${clean}-${rollNo}`,
      productName: meta.productName,
      variantLabel: meta.variantLabel,
      ourColorNumber: meta.ourColorNumber,
      supplierColorNumber: meta.supplierColorNumber,
      quantity: quantityEach,
      baseBarcode,
    });
  }
  return labels;
}

// ============ Master-data health checks ============

export type HealthSeverity = 'high' | 'medium' | 'low';
export type HealthKind =
  | 'missing_barcode' | 'missing_supplier_color' | 'missing_color_name'
  | 'duplicate_barcode' | 'duplicate_variant' | 'inactive_with_stock'
  | 'product_missing_supplier' | 'product_missing_category';

export interface HealthIssue {
  id: string;
  kind: HealthKind;
  severity: HealthSeverity;
  message: string;
  productId?: string;
  variantId?: string;
}

/**
 * Scans products + variants + balances for master-data risks. Scoped balances
 * should be passed in so warnings respect shop visibility.
 */
export function runHealthChecks(
  products: Product[],
  variants: Variant[],
  balances: Balance[],
  productNameFn: (id: string) => string,
): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const push = (i: Omit<HealthIssue, 'id'>) => issues.push({ ...i, id: `${i.kind}_${i.variantId ?? i.productId ?? Math.random()}` });

  // Barcode duplicates (across all variants)
  const byBarcode = new Map<string, Variant[]>();
  for (const v of variants) {
    const code = (v.barcode ?? '').trim().toLowerCase();
    if (!code) continue;
    (byBarcode.get(code) ?? byBarcode.set(code, []).get(code)!).push(v);
  }
  for (const [code, vs] of byBarcode) {
    if (vs.length > 1) {
      push({ kind: 'duplicate_barcode', severity: 'high', variantId: vs[0].id,
        message: `Barcode "${code}" is assigned to ${vs.length} variants (${vs.map((v) => productNameFn(v.productId)).join(', ')})` });
    }
  }

  // Duplicate variants (same product + same color/design number)
  const byIdentity = new Map<string, Variant[]>();
  for (const v of variants) {
    const ident = `${v.productId}::${(v.ourColorNumber ?? v.designNumber ?? v.label).trim().toLowerCase()}`;
    (byIdentity.get(ident) ?? byIdentity.set(ident, []).get(ident)!).push(v);
  }
  for (const [, vs] of byIdentity) {
    if (vs.length > 1) {
      push({ kind: 'duplicate_variant', severity: 'high', variantId: vs[0].id,
        message: `${productNameFn(vs[0].productId)} has ${vs.length} variants with the same identity (${vs[0].label})` });
    }
  }

  // Per-variant field gaps
  for (const v of variants) {
    if (!v.barcode?.trim()) {
      push({ kind: 'missing_barcode', severity: 'medium', variantId: v.id,
        message: `${productNameFn(v.productId)} · ${v.label} has no barcode` });
    }
    if (v.productType !== 'general' && !v.supplierColorNumber?.trim()) {
      push({ kind: 'missing_supplier_color', severity: 'low', variantId: v.id,
        message: `${productNameFn(v.productId)} · ${v.label} missing supplier color #` });
    }
    if (v.productType !== 'general' && !v.colorName?.trim()) {
      push({ kind: 'missing_color_name', severity: 'low', variantId: v.id,
        message: `${productNameFn(v.productId)} · ${v.label} missing color name` });
    }
  }

  // Product-level gaps
  for (const p of products) {
    if (!p.supplierId) push({ kind: 'product_missing_supplier', severity: 'low', productId: p.id, message: `${p.name} has no supplier` });
    if (!p.category?.trim()) push({ kind: 'product_missing_category', severity: 'low', productId: p.id, message: `${p.name} has no category` });
  }

  // Inactive products/variants still holding godown stock
  const stockByVariant = new Map<string, number>();
  for (const b of balances) stockByVariant.set(b.variantId, (stockByVariant.get(b.variantId) ?? 0) + b.quantity);
  for (const v of variants) {
    const qty = stockByVariant.get(v.id) ?? 0;
    const product = products.find((p) => p.id === v.productId);
    const inactive = v.active === false || product?.active === false;
    if (inactive && qty > 0) {
      push({ kind: 'inactive_with_stock', severity: 'high', variantId: v.id,
        message: `${productNameFn(v.productId)} · ${v.label} is inactive but holds ${qty} in godown` });
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
