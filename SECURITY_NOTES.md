# StockDesk Pro – Security & Residual Risk Notes

## Cost Data – Residual Backend Exposure

### What is gated
All UI surfaces that display financial data (cost, FOB, total value, estimated loss,
inventory value) are gated behind `can(user.role, 'view_costs')`. This covers:

- Dashboard: Godown Value card, Largest Stock Value card, summary row
- Products: variant Cost + Value columns, costing panel, summary value
- Stock Count: Variance (MVR) column, Est. value diff summary cell
- Damaged / Issues: Est. Loss Value KPI
- Reports: Total Cost Value KPI, loss value, owner cost column
- Universal Search: Cost and Value mini-cards
- Receiving CSV export: fob / cost / totalCost columns omitted
- Audit log remarks: financial phrases stripped via `sanitizeRemarks()` helper

### What is NOT gated (residual risk – documented for post-pilot remediation)

**`variants` Firestore collection:**
- Contains `cost` and `totalValue` fields on every variant document.
- Firestore rules allow all authenticated users to read the `variants` collection
  (required for product display, barcode scan, stock count, etc.).
- A technically sophisticated `warehouse_staff` user could query Firestore directly
  and read these fields, bypassing all UI gating.
- **Risk level:** Low for pilot. Warehouse staff use a mobile tablet with no
  browser console access in normal operations.
- **Post-pilot remediation:** Move `cost`, `totalValue`, and costing metadata
  to a separate `variant_costs/{variantId}` subcollection with a Firestore rule
  restricting reads to `isAdmin() || isPurchaseMgr() || isShopMgr() || isAuditor()`.
  This requires a one-time migration script and updates to receiving/cost-history writes.
  Do NOT perform this migration during the pilot.

**Historical audit log `remarks` field:**
- Audit entries written before the P4 patch (receiving cost privacy sprint) may
  contain `cost X/unit, value Y MVR` in the remarks string.
- These are stored in `audit_logs` which is readable by all scoped users.
- Mitigation: `sanitizeRemarks()` strips these phrases at render time for users
  without `view_costs`. The Firestore records are unchanged (audit integrity preserved).
- **Post-pilot remediation:** None required. The display sanitizer is the correct fix.

## Receivings Collection

- `receivings` Firestore rules now restrict reads to `isAdmin || isPurchaseMgr ||
  isShopMgr || isAuditor`.
- `warehouse_staff` are not subscribed to `receivings` in the client.
- Warehouse staff cannot open the Receiving page (route guarded by `receive_stock`
  capability which was removed from `warehouse_staff` in the P1 cost privacy sprint).

## Cost History / Country Rates

- Both collections are Firestore-restricted to `view_costs` roles.
- Client does not subscribe `warehouse_staff` to either collection.
- No UI path for warehouse staff reaches these collections.
