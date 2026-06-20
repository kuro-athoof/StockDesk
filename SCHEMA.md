# StockDesk Pro — Firestore Schema

All collections are top-level. Document IDs are deterministic where it matters
(balances, users) so seeding and the movement engine target the same docs.

## `users`
Doc ID = Firebase Auth UID. Drives roles and shop scoping.
```
{
  uid: string,            // == doc id
  name: string,
  email: string,
  role: 'admin' | 'purchase_manager' | 'shop_manager' | 'warehouse_staff' | 'auditor',
  assignedShopIds: string[],   // empty = all shops (admin/purchase/auditor)
  active: boolean,
  createdAt: number
}
```

## `shops`
```
{ id, name, active: boolean, createdAt: number }
```

## `products`
```
{
  id, type: 'plain_fabric' | 'design_fabric' | 'general',
  name, category?, supplierId?,
  productImage?, bookletImage?,   // Storage download URLs
  notes?, collection?,            // collection e.g. "ITY 2025" (design fabrics)
  defaultUnit: string, createdAt, updatedAt
}
```

## `variants`
A color (plain), a design (design), or the item itself (general).
```
{
  id, productId, productType,
  label,                          // "Color #4", "D001", item name
  ourColorNumber?, supplierColorNumber?, designNumber?,
  designImage?,                   // Storage URL
  barcode?,
  metersPerRoll?,                 // fabrics only; nominal roll length
  createdAt
}
```

## `stock_balances`
Doc ID = `${variantId}__${ownerShopId}` (deterministic). One balance per
variant per owner shop. **Meters are the source of truth; rolls are informational.**
```
{
  id,                             // == doc id
  variantId, productId, ownerShopId,
  quantity: number,               // meters (fabric) or qty (general)
  unit: string,
  rollCount?: number,             // fabrics only
  locationId?: string,
  updatedAt: number
}
```

## `audit_logs`
Append-only. One row per stock change; `NEGATIVE_OVERRIDE` adds a second row.
**Never updated or deleted.**
```
{
  id, timestamp: number, userId, userName,
  action: 'RECEIVE' | 'INTERNAL_MOVEMENT' | 'OWNERSHIP_TRANSFER'
        | 'ADJUSTMENT' | 'STOCK_COUNT_CORRECTION' | 'NEGATIVE_OVERRIDE',
  productId, variantId, ownerShopId,
  qtyBefore, qtyChanged, qtyAfter,    // signed qtyChanged
  remarks?, refId?, overrideBy?
}
```

## `suppliers`
```
{ id, name, country?, contact?, phone?, createdAt }
```

## `locations`
```
{ id, godown, rack?, shelf?, bin?, label }   // label = "Main Godown > Rack A > Shelf 3"
```

## `country_rates`
Costing, mirrors PurchaseDesk logic.
```
{
  id, country, currencyCode,
  currencyPerUsd, mvrPerUsd,
  cofPct, markupPct, gstPct,
  formulaRate,                    // computed
  finalUsedRate                   // editable override
}
```

## `notifications`
Currently generated client-side from balances + audit. Collection reserved for
future server-side/persisted alerts.

## `settings`
Two fixed docs:
- `settings/app` → `{ allowNegativeOverride, deadStockDays, nonMovingDays, lowStockThreshold }`
- `settings/categories` → `{ values: string[] }`

## `units`
```
{ id, code, custom: boolean }
```

## Reserved for Slice 2/3 (rules already present)
- `receivings` — receiving headers + line items
- `transfers` — internal & ownership transfers (Draft/Sent/Received)
- `stock_counts` — physical count sessions with expected snapshot

## Relationships
```
shops 1───* stock_balances *───1 variants *───1 products *───1 suppliers
users.assignedShopIds ──▶ shops (scoping)
audit_logs *───1 variants, *───1 shops (ownerShopId)
products.supplierId ──▶ suppliers ; country_rates.country ──▶ suppliers.country (costing)
```

## Movement integrity
Every balance change runs through `applyMovement()` (a Firestore `runTransaction`)
which atomically: reads balance → enforces negative-stock rule (block unless
manager override) → writes balance → appends audit log(s). This is the only
write path for `stock_balances` and `audit_logs` in the app.
