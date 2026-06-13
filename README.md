# StockDesk Pro — by KURO

Warehouse inventory management. Vite + React + TypeScript + Tailwind + Firebase.
Light SaaS theme, KURO teal (#00c9a0) accent, DM Sans — built for 8-hour daily warehouse/office use.

## What's in this build — Slice 1 (Foundation)

The foundation every other module depends on, fully working:

- 5 roles with a permission matrix (src/lib/permissions.ts) mirrored server-side in firestore.rules: Admin, Purchase Manager, Shop Manager, Warehouse Staff, Auditor.
- Inventory movement engine (src/lib/movement.ts) — the single transactional chokepoint for every stock change. Enforces:
  - Negative-stock rule: warehouse staff hard-blocked; managers/admin override, which writes a NEGATIVE_OVERRIDE audit record naming who authorized it.
  - Roll/meter reconciliation: Plain + Design fabrics track meters (source of truth) and rolls (informational). General Inventory tracks quantity only.
  - Immutable audit log on every movement.
- Two transfer types modeled: INTERNAL_MOVEMENT (location only, owner unchanged) and OWNERSHIP_TRANSFER (owner change, requires manager approval, special audit record).
- Data model for all 3 product types (plain fabric, design fabric, general) with variants, balances per (variant + owner shop), units, locations (godown > rack > shelf > bin), suppliers, country rates.
- Costing (src/lib/costing.ts) — formula rate logic matching PurchaseDesk.
- Working screens: Dashboard, Products (operational cards, no decorative color dots), Stock (live balance table), Barcode Lookup / global search, Suppliers, Country Rates, Users & Access.
- Firestore security rules + composite indexes ready to deploy.
- A live "Adjust Stock" engine test (under any Slice 2-4 placeholder, for roles that can adjust) so you can watch the negative-stock rule fire.

### Demo mode vs live Firebase

Runs in demo mode out of the box (seeded Flora + Sindhitha data, in-memory). Sign in by picking a role to see how each role's access differs.

To go live: copy .env.example to .env, fill your Firebase keys. The data layer is structured to swap demo state for Firestore listeners with the same shape.

## Deployment (your standard step)

    npm install
    npm run build
    firebase deploy --only firestore:rules
    firebase deploy --only firestore:indexes
    firebase deploy --only hosting   # optional

## Roadmap

- Slice 2: Receiving (CSV import) + Transfers (both types) + Warehouse quick-transfer mode
- Slice 3: Stock Count (snapshot expected at start) + variance approval + Notifications
- Slice 4: 17 Reports (Excel/PDF export) + Settings (allowNegativeStock toggle, units/locations admin)

## Commands

    npm run dev      # local dev
    npm run build    # type-check + production build
    npm run preview  # preview the build
